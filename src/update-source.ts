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
 * 团队单 Skill 必须重新走 resolver；只有普通 Market entry 才调用 /api/skill/check。
 */
export async function checkMarketLockEntry(
  skillName: string,
  entry: MarketLockUpdateEntry
): Promise<MarketLockUpdateResult> {
  if (entry.skillTeamId) {
    const result = await marketProvider.resolveTeamSkillInstallTarget(
      entry.skillTeamId,
      entry.teamSkillName || skillName
    );
    if (!result.ok) {
      return { hasUpdate: false, error: result.message };
    }
    return {
      hasUpdate:
        result.data.releaseId !== entry.releaseId || result.data.installVersion !== entry.version,
    };
  }

  const skillId = entry.skillPath || entry.skillId;
  if (!skillId) {
    return { hasUpdate: false, error: 'Market lock entry 缺少 skillId' };
  }

  try {
    const checkResult = await marketProvider.check(skillId, entry.authorId);
    if (!checkResult) {
      return { hasUpdate: false, error: 'Could not fetch from Skills Market' };
    }
    return { hasUpdate: checkResult.currentVersion !== entry.version };
  } catch (error) {
    return {
      hasUpdate: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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
