import type { ApiResult } from './types.ts';
import { BIN_NAME } from './branding.ts';

type ApiFailure = Extract<ApiResult<unknown>, { ok: false }>;

/**
 * 统一处理 `ApiResult` 失败分支的输出与退出码，供 `publish`/`withdraw` 命令共用：
 * 输出 `HTTP <status>: <message>`（若存在 `issues` 一并输出），`status === 401` 时
 * 追加登录提示，最终设置 `process.exitCode = 1`（不使用 `process.exit()` 硬退出）。
 */
export function reportApiFailure(result: ApiFailure): void {
  console.error(`错误 (HTTP ${result.status}): ${result.message}`);
  if (result.issues) {
    console.error(JSON.stringify(result.issues, null, 2));
  }
  if (result.status === 401) {
    console.error(`请运行 \`${BIN_NAME} login <api-key>\` 重新登录`);
  }
  process.exitCode = 1;
}
