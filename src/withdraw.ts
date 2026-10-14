import { marketProvider } from './providers/market.ts';
import { getApiKey, API_KEY_MISSING_HINT } from './auth.ts';
import { reportApiFailure } from './api-error.ts';
import { BIN_NAME } from './branding.ts';

export interface WithdrawOptions {
  name?: string;
  /** `--api-key` flag：单次调用临时覆盖凭证，不落盘 */
  apiKey?: string;
  /** 遇到的第一个未声明选项（`--` 开头），命中时应直接报错，不静默忽略 */
  unknownOption?: string;
}

/**
 * 解析 `withdraw` 命令参数：接受一个位置参数 `name` 与 `--api-key <key>`。
 * 遇到 `--api-key` 之外的任何 `--` 开头选项（包括但不限于 `--team`）即记录为
 * unknownOption，不继续解析、不静默忽略。
 */
export function parseWithdrawOptions(args: string[]): WithdrawOptions {
  let name: string | undefined;
  let apiKey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--api-key') {
      apiKey = args[++i];
      continue;
    }
    if (arg && arg.startsWith('--')) {
      return { name, apiKey, unknownOption: arg };
    }
    if (name === undefined) {
      name = arg;
    }
  }

  return { name, apiKey };
}

/**
 * `skills withdraw <name>` 命令：撤回处于 PENDING 状态的公开 Skill 审核。
 * 先通过带鉴权的名称解析（`resolveMine`）拿到 `skillId`，再调用 `withdraw`。
 * 命令本身不判断具体撤回场景（draft 更新 / 私有发布到市场 / 首次公开创建），
 * 由服务端按既有逻辑自动处理。
 */
export async function runWithdraw(args: string[]): Promise<void> {
  const { name, unknownOption, apiKey: flagApiKey } = parseWithdrawOptions(args);

  if (unknownOption) {
    console.error(`错误: withdraw 命令不支持选项 ${unknownOption}`);
    process.exitCode = 1;
    return;
  }

  if (!name) {
    console.error(`用法: ${BIN_NAME} withdraw <name>`);
    process.exitCode = 1;
    return;
  }

  const apiKey = getApiKey({ flagKey: flagApiKey });
  if (!apiKey) {
    console.error(API_KEY_MISSING_HINT);
    process.exitCode = 1;
    return;
  }

  const resolveResult = await marketProvider.resolveMine(name, apiKey);
  if (!resolveResult.ok) {
    if (resolveResult.status === 401) {
      reportApiFailure(resolveResult);
    } else if (resolveResult.status === 0) {
      console.error(`网络异常: ${resolveResult.message}`);
      process.exitCode = 1;
    } else if (resolveResult.status === 503) {
      // 中央身份解析不可用（重试已耗尽）：既不是"鉴权失败"，也不能误判为"技能不存在"
      reportApiFailure(resolveResult);
    } else {
      console.error(`错误: 未找到名为 "${name}" 的技能（${resolveResult.message}）`);
      process.exitCode = 1;
    }
    return;
  }

  const withdrawResult = await marketProvider.withdraw(resolveResult.data.id, apiKey);
  if (!withdrawResult.ok) {
    reportApiFailure(withdrawResult);
    return;
  }

  const { data } = withdrawResult;
  console.log(`✓ 已撤回`);
  console.log(`  当前状态: ${data.visibility} / ${data.status}`);
}
