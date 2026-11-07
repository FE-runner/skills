import { marketProvider } from './providers/market.ts';

export interface UpdateSourceEntry {
  source: string;
  sourceUrl: string;
  ref?: string;
  skillPath?: string;
}

export interface MarketLockUpdateEntry {
  source: string;
  skillPath?: string;
  skillId?: string;
  sourceType?: string;
  version?: string;
  releaseSeq?: number;
  authorId?: string;
  teamId?: string;
  skillTeamId?: string;
  releaseId?: string;
  teamSkillName?: string;
}

export interface MarketLockUpdateResult {
  hasUpdate: boolean;
  error?: string;
}

/**
 * 检查 Market lock entry 是否有更新。
 * 所有 Market entry 统一调用批量构建检测；团队目标只发送身份字段。
 */
export async function checkMarketLockEntry(
  skillName: string,
  entry: MarketLockUpdateEntry
): Promise<MarketLockUpdateResult> {
  const skillId = entry.skillPath || entry.skillId;
  if (!skillId) {
    return { hasUpdate: false, error: 'Market lock entry 缺少 skillId' };
  }
  if (entry.skillTeamId && (!entry.teamId || !entry.releaseId)) {
    return {
      hasUpdate: false,
      error: '团队 lock 缺少 teamId/releaseId，请重新 add 后再检查',
    };
  }

  const target = entry.skillTeamId
    ? {
        scope: 'TEAM' as const,
        skillId,
        teamId: entry.teamId!,
        releaseId: entry.releaseId!,
      }
    : {
        scope: entry.authorId ? ('PRIVATE' as const) : ('PUBLIC' as const),
        skillId,
        ...(entry.authorId ? { authorId: entry.authorId } : {}),
      };
  const checked = await marketProvider.checkBuildBatch([target]);
  if (!checked.ok) {
    return { hasUpdate: false, error: checked.message || '构建检测失败' };
  }
  const item = checked.data.items[0];
  if (!item?.ok) {
    return { hasUpdate: false, error: item?.error?.message ?? '构建检测失败' };
  }

  if (item.observabilityEnabled === true) {
    if (item.releaseSeq === undefined) {
      return { hasUpdate: false, error: '观测构建响应缺少 releaseSeq' };
    }
    return {
      hasUpdate: item.version !== entry.version || item.releaseSeq !== entry.releaseSeq,
    };
  }
  return { hasUpdate: item.version !== entry.version };
}

/**
 * 把 market lock entry 还原成 `skills add` 的输入。
 * `ts_` entry 重新走团队 resolver；普通 market entry 保持既有 source 解析。
 */
export function buildMarketUpdateInstallSource(
  skillName: string,
  entry: MarketLockUpdateEntry
): string {
  if (entry.skillTeamId) {
    return `ts_${entry.skillTeamId}/${entry.teamSkillName || skillName}`;
  }
  return entry.source.replace(/^market\//, '');
}

export function formatSourceInput(sourceUrl: string, ref?: string): string {
  if (!ref) {
    return sourceUrl;
  }
  return `${sourceUrl}#${ref}`;
}

/**
 * Build the source argument for `skills add` during update.
 * Uses shorthand form for path-targeted updates to avoid branch/path ambiguity.
 */
export function buildUpdateInstallSource(entry: UpdateSourceEntry): string {
  if (!entry.skillPath) {
    return formatSourceInput(entry.sourceUrl, entry.ref);
  }

  // Extract skill folder from skillPath (remove /SKILL.md suffix).
  let skillFolder = entry.skillPath;
  if (skillFolder.endsWith('/SKILL.md')) {
    skillFolder = skillFolder.slice(0, -9);
  } else if (skillFolder.endsWith('SKILL.md')) {
    skillFolder = skillFolder.slice(0, -8);
  }
  if (skillFolder.endsWith('/')) {
    skillFolder = skillFolder.slice(0, -1);
  }

  let installSource = skillFolder ? `${entry.source}/${skillFolder}` : entry.source;
  if (entry.ref) {
    installSource = `${installSource}#${entry.ref}`;
  }
  return installSource;
}
