import { marketProvider } from './providers/market.ts';
import { getApiKey, API_KEY_MISSING_HINT } from './auth.ts';
import { reportApiFailure } from './api-error.ts';

/**
 * 解析 `whoami` 命令参数：接受 `--api-key <key>`（单次调用临时覆盖凭证）。
 * 其余参数沿用既有行为，忽略不解析。
 */
export function parseWhoamiOptions(args: string[]): { apiKey?: string; error?: string } {
  let apiKey: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-key') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        return { error: '--api-key 需要一个非空的值' };
      }
      apiKey = value;
    }
  }
  return { apiKey };
}

/**
 * `skills whoami [--api-key <key>]` 命令：查询当前 API Key 对应的用户身份，
 * 不修改任何本地/远端状态。
 */
export async function runWhoami(args: string[] = []): Promise<void> {
  const { apiKey: flagApiKey, error: optionsError } = parseWhoamiOptions(args);

  if (optionsError) {
    console.error(`错误: ${optionsError}`);
    process.exitCode = 1;
    return;
  }

  const apiKey = getApiKey({ flagKey: flagApiKey });
  if (!apiKey) {
    console.error(API_KEY_MISSING_HINT);
    process.exitCode = 1;
    return;
  }

  const result = await marketProvider.whoami(apiKey);
  if (!result.ok) {
    reportApiFailure(result);
    return;
  }

  const { data } = result;
  console.log(`名称: ${data.name}`);
  console.log(`邮箱: ${data.email ?? '（未设置）'}`);
  console.log(`角色: ${data.role}`);
  if (data.isSuperAdmin) {
    console.log(`超级管理员`);
  }
}
