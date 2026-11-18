import {
  getAllLockedSkills,
  getSkillLockPath,
  setSkillCollectConsent as setGlobalSkillCollectConsent,
} from './skill-lock.ts';
import { getLocalLockPath, readLocalLock, setLocalSkillCollectConsent } from './local-lock.ts';
import * as p from '@clack/prompts';
import pc from 'picocolors';

type TrackScope = 'global' | 'project';

interface TrackSkillEntry {
  sourceType: string;
  collectConsent?: boolean;
  teamId?: string;
  skillTeamId?: string;
  teamSkillName?: string;
}

function printHelp(): void {
  console.log();
  console.log('Usage:');
  console.log('  track list [-g]            List skills and their collection status');
  console.log('  track on  <skill> [-g]     Record collection consent=true (no reinstall)');
  console.log('  track off <skill> [-g]     Record collection consent=false (no reinstall)');
  console.log();
  console.log('Defaults to the project skills-lock.json; -g/--global uses the global lock.');
}

async function getScopeEntries(
  scope: TrackScope,
  cwd: string
): Promise<Record<string, TrackSkillEntry>> {
  return scope === 'global' ? getAllLockedSkills() : (await readLocalLock(cwd)).skills;
}

function formatSkillName(name: string, entry: TrackSkillEntry): string {
  return entry.skillTeamId
    ? `ts_${entry.skillTeamId}/${entry.teamSkillName || name}`
    : entry.teamId
      ? `t_${entry.teamId}/${name}`
      : name;
}

async function runTrackList(scope: TrackScope, cwd: string): Promise<void> {
  const entries = await getScopeEntries(scope, cwd);
  const rows: { name: string; status: string }[] = [];

  for (const [name, entry] of Object.entries(entries)) {
    const consent = entry.collectConsent;
    const status =
      consent === true ? '同意统计' : consent === false ? '拒绝统计' : '未定夺（首次未询问）';
    rows.push({
      name: formatSkillName(name, entry),
      status,
    });
  }

  if (rows.length === 0) {
    console.log();
    p.log.info(
      scope === 'global'
        ? `No global skills found in ${getSkillLockPath()}`
        : `No project skills found in ${getLocalLockPath(cwd)}`
    );
    return;
  }

  console.log();
  const colored: Record<string, (s: string) => string> = {
    同意统计: pc.green,
    拒绝统计: pc.dim,
    '未定夺（首次未询问）': pc.yellow,
  };
  for (const r of rows) {
    const color = colored[r.status] ?? ((s: string): string => s);
    console.log(`  ${color(r.status)}  ${pc.cyan(r.name)}`);
  }
  console.log();
  p.log.message(
    pc.dim(
      scope === 'global'
        ? `当前范围: 全局安装 (${getSkillLockPath()})`
        : `当前范围: 项目级安装 (${getLocalLockPath(cwd)})`
    )
  );
}

interface ResolvedTarget {
  lockKey: string;
  name: string;
}

function resolveTarget(
  skillName: string,
  entries: Record<string, TrackSkillEntry>,
  scope: TrackScope
): ResolvedTarget | null {
  let lockKey = skillName;
  let entry = entries[skillName];
  if (!entry) {
    const matched = Object.entries(entries).find(
      ([key, candidate]) =>
        (candidate.skillTeamId && `ts_${candidate.skillTeamId}/${key}` === skillName) ||
        (candidate.skillTeamId &&
          `ts_${candidate.skillTeamId}/${candidate.teamSkillName}` === skillName) ||
        (candidate.teamId && `t_${candidate.teamId}/${key}` === skillName)
    );
    if (matched) {
      lockKey = matched[0];
      entry = matched[1];
    }
  }
  if (!entry || entry.sourceType !== 'market') {
    p.log.error(
      `未在${scope === 'global' ? '全局' : '项目'} lock 中找到 market skill「${skillName}」`
    );
    return null;
  }
  return {
    lockKey,
    name: lockKey,
  };
}

async function runTrackToggle(
  skillName: string,
  collectConsent: boolean,
  scope: TrackScope,
  cwd: string
): Promise<void> {
  if (!skillName) {
    p.log.error('缺少 skill 名称，用法：track on <skill> / track off <skill>');
    printHelp();
    return;
  }

  const entries = await getScopeEntries(scope, cwd);
  const target = resolveTarget(skillName, entries, scope);
  if (!target) return;

  const updated =
    scope === 'global'
      ? await setGlobalSkillCollectConsent(target.lockKey, collectConsent)
      : await setLocalSkillCollectConsent(target.lockKey, collectConsent, cwd);
  if (!updated) {
    p.log.error(`未在${scope === 'global' ? '全局' : '项目'} lock 中找到「${target.name}」`);
    return;
  }

  p.log.success(
    collectConsent
      ? `「${skillName}」已记录同意统计；${scope === 'global' ? '全局' : '项目级'}安装文件与版本未改变`
      : `「${skillName}」已记录拒绝统计；${scope === 'global' ? '全局' : '项目级'}安装文件与版本未改变`
  );
}

export async function runTrack(args: string[], cwd = process.cwd()): Promise<void> {
  const scope: TrackScope = args.includes('-g') || args.includes('--global') ? 'global' : 'project';
  const positionals = args.filter((arg) => arg !== '-g' && arg !== '--global');
  const [sub, skillName] = positionals;

  if (sub === 'list') {
    await runTrackList(scope, cwd);
    return;
  }
  if (sub === 'on' && skillName) {
    await runTrackToggle(skillName, true, scope, cwd);
    return;
  }
  if (sub === 'off' && skillName) {
    await runTrackToggle(skillName, false, scope, cwd);
    return;
  }

  printHelp();
}
