import { getAllLockedSkills, getSkillFromLock, setSkillCollectConsent } from './skill-lock.ts';
import * as p from '@clack/prompts';
import pc from 'picocolors';

function printHelp(): void {
  console.log();
  console.log('Usage:');
  console.log('  track list            List global skills and their collection status');
  console.log('  track on  <skill>     Record collection consent=true (no reinstall)');
  console.log('  track off <skill>     Record collection consent=false (no reinstall)');
}

async function runTrackList(): Promise<void> {
  const entries = await getAllLockedSkills();
  const rows: { name: string; status: string }[] = [];

  for (const [name, entry] of Object.entries(entries)) {
    const consent = entry.collectConsent;
    const status =
      consent === true ? '同意统计' : consent === false ? '拒绝统计' : '未定夺（首次未询问）';
    rows.push({
      name: entry.skillTeamId
        ? `ts_${entry.skillTeamId}/${entry.teamSkillName || name}`
        : entry.teamId
          ? `t_${entry.teamId}/${name}`
          : name,
      status,
    });
  }

  if (rows.length === 0) {
    console.log();
    p.log.info('No global skills found in ~/.agents/.skill-lock.json');
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
    pc.dim('track 只展示全局安装；项目级采集状态记录在当前目录 skills-lock.json，不在本列表展示。')
  );
}

interface ResolvedTarget {
  lockKey: string;
  name: string;
}

async function resolveTarget(skillName: string): Promise<ResolvedTarget | null> {
  let lockKey = skillName;
  let entry = await getSkillFromLock(skillName);
  if (!entry) {
    const entries = await getAllLockedSkills();
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
    p.log.error(`未在全局 lock 中找到 market skill「${skillName}」`);
    return null;
  }
  return {
    lockKey,
    name: lockKey,
  };
}

async function runTrackToggle(skillName: string, collectConsent: boolean): Promise<void> {
  if (!skillName) {
    p.log.error('缺少 skill 名称，用法：track on <skill> / track off <skill>');
    printHelp();
    return;
  }

  const target = await resolveTarget(skillName);
  if (!target) return;

  const updated = await setSkillCollectConsent(target.lockKey, collectConsent);
  if (!updated) {
    p.log.error(`未在全局 lock 中找到「${target.name}」`);
    return;
  }

  p.log.success(
    collectConsent
      ? `「${skillName}」已记录同意统计；安装文件与版本未改变`
      : `「${skillName}」已记录拒绝统计；安装文件与版本未改变`
  );
}

export async function runTrack(args: string[]): Promise<void> {
  const [sub, skillName] = args;

  if (sub === 'list') {
    await runTrackList();
    return;
  }
  if (sub === 'on' && skillName) {
    await runTrackToggle(skillName, true);
    return;
  }
  if (sub === 'off' && skillName) {
    await runTrackToggle(skillName, false);
    return;
  }

  printHelp();
}
