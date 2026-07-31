import { marketProvider } from './providers/market.ts';
import { getApiKey } from './auth.ts';
import { reportApiFailure } from './api-error.ts';
import { BIN_NAME } from './branding.ts';

/**
 * `skills whoami` 命令：查询当前 API Key 对应的用户身份，不修改任何本地/远端状态。
 */
export async function runWhoami(): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(`请先运行 \`${BIN_NAME} login <api-key>\` 或设置 SKILLS_API_KEY 环境变量`);
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
