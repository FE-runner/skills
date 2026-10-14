import type { ApiResult } from './types.ts';
import { BIN_NAME } from './branding.ts';

type ApiFailure = Extract<ApiResult<unknown>, { ok: false }>;

/**
 * 统一处理 `ApiResult` 失败分支的输出与退出码，供 `publish`/`withdraw` 命令共用：
 * 输出 `HTTP <status>: <message>`（若存在 `issues` 一并输出），最终设置
 * `process.exitCode = 1`（不使用 `process.exit()` 硬退出）。
 *
 * 按鉴权守卫失败分级：
 * - `503`：中央身份解析不可用/限流（有界重试已在上游耗尽）→ 提示"服务暂不可用"，不提示重新登录。
 * - `401`：鉴权失败 → 追加登录提示。
 * - `500`：服务端自身异常 → 标注与 Key 有效性无关。
 */
export function reportApiFailure(result: ApiFailure): void {
  if (result.status === 503) {
    const retryHint =
      result.retryAfterSeconds !== undefined ? `，建议 ${result.retryAfterSeconds} 秒后重试` : '';
    console.error(`服务暂不可用，请稍后重试${retryHint}`);
    if (result.message && result.message !== `HTTP ${result.status}`) {
      console.error(`详情: ${result.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.error(`错误 (HTTP ${result.status}): ${result.message}`);
  if (result.issues) {
    console.error(JSON.stringify(result.issues, null, 2));
  }
  if (result.status === 401) {
    console.error(`请运行 \`${BIN_NAME} login <api-key>\` 重新登录`);
  } else if (result.status === 500) {
    console.error('服务端错误，请稍后重试（该错误与 API Key 是否有效无关）');
  }
  process.exitCode = 1;
}
