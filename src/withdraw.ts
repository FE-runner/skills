import { marketProvider } from './providers/market.ts';
import { getApiKey } from './auth.ts';
import { reportApiFailure } from './api-error.ts';
import { BIN_NAME } from './branding.ts';

export interface WithdrawOptions {
  name?: string;
  /** 遇到的第一个未声明选项（`--` 开头），命中时应直接报错，不静默忽略 */
  unknownOption?: string;
}

/**
 * 解析 `withdraw` 命令参数：仅接受一个位置参数 `name`。
 * 遇到任何 `--` 开头的选项（包括但不限于 `--team`）即记录为 unknownOption，
 * 不继续解析、不静默忽略。
 */
export function parseWithdrawOptions(args: string[]): WithdrawOptions {
  let name: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--')) {
      return { name, unknownOption: arg };
    }
    if (name === undefined) {
      name = arg;
    }
  }

  return { name };
}

/**
 * `skills withdraw <name>` 命令：撤回处于 PENDING 状态的公开 Skill 审核。
 * 先通过带鉴权的名称解析（`resolveMine`）拿到 `skillId`，再调用 `withdraw`。
 * 命令本身不判断具体撤回场景（draft 更新 / 私有发布到市场 / 首次公开创建），
 * 由服务端按既有逻辑自动处理。
 */
export async function runWithdraw(args: string[]): Promise<void> {
  const { name, unknownOption } = parseWithdrawOptions(args);

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

  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(`请先运行 \`${BIN_NAME} login <api-key>\` 或设置 SKILLS_API_KEY 环境变量`);
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
