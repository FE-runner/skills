/**
 * 安装响应中的采集配置判定。
 *
 * Market 契约：成功时返回 `collect = { config, meta: { blueai_signature } }`；
 * 改造失败降级时返回 `collect = { reason }`。只有前者代表可安装的监测版。
 */
export interface CollectCarrier {
  collect?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** 判断安装响应是否携带有效采集配置（config + 非空 blueai_signature）。 */
export function hasValidCollect(skill: CollectCarrier | null | undefined): boolean {
  const collect = asRecord(skill?.collect);
  if (!collect) return false;

  const config = asRecord(collect.config);
  const meta = asRecord(collect.meta);
  if (!config || !meta) return false;

  const signature = meta.blueai_signature;
  return typeof signature === 'string' && signature.length > 0;
}

/** 提取改造失败降级原因；非降级响应返回 undefined。 */
export function getCollectFailureReason(
  skill: CollectCarrier | null | undefined
): string | undefined {
  const collect = asRecord(skill?.collect);
  const reason = collect?.reason;
  return typeof reason === 'string' && reason.length > 0 ? reason : undefined;
}
