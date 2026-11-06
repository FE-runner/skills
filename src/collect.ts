/**
 * 安装响应中的采集配置判定。
 *
 * Market 契约：可观测 Skill 返回 `collect = { config, meta: { blueai_signature } }`；
 * `reason` 不再参与安装降级判定，用户是否统计只看 lock 的 collectConsent。
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
