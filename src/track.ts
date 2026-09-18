import { marketProvider } from './providers/market.ts';
import { getAllLockedSkills, getSkillFromLock, addSkillToLock } from './skill-lock.ts';
import { installWellKnownSkillForAgent } from './installer.ts';
import { agents } from './agents.ts';
import type { AgentType } from './types.ts';
import { getCollectFailureReason, hasValidCollect } from './collect.ts';
import * as p from '@clack/prompts';
import pc from 'picocolors';

function printHelp(): void {
  console.log();
  console.log('Usage:');
  console.log('  track list            List global skills and their collection status');
  console.log(
    '  track on  <skill>     Install the collection-enabled build (global) + consent=true'
  );
  console.log('  track off <skill>     Revert to the original build (global) + consent=false');
}

async function runTrackList(): Promise<void> {
  const entries = await getAllLockedSkills();
  const rows: { name: string; status: string }[] = [];

  for (const [name, entry] of Object.entries(entries)) {
    const consent = entry.collectConsent;
    const status = consent === true ? 'on' : consent === false ? 'off' : '未定夺（首次未询问）';
    rows.push({ name, status });
  }

  if (rows.length === 0) {
    console.log();
    p.log.info('No global skills found in ~/.agents/.skill-lock.json');
    return;
  }

  console.log();
  const colored: Record<string, (s: string) => string> = {
    on: pc.green,
    off: pc.dim,
    '未定夺（首次未询问）': pc.yellow,
  };
  for (const r of rows) {
    const color = colored[r.status] ?? ((s: string): string => s);
    console.log(`  ${color(r.status)}  ${pc.cyan(r.name)}`);
  }
  console.log();
  p.log.message(pc.dim('只有全局安装（--global）的技能在此展示；项目级安装不参与采集记录。'));
}

interface ResolvedTarget {
  skillId: string;
  name: string;
  version?: string;
  authorId?: string;
}

async function resolveTarget(skillName: string): Promise<ResolvedTarget | null> {
  const entry = await getSkillFromLock(skillName);
  if (!entry || entry.sourceType !== 'market') {
    p.log.error(`未在全局 lock 中找到 market skill「${skillName}」`);
    return null;
  }
  // add 落全局 lock 时把 market skillId 存入 skillPath、authorId 存入 authorId
  if (!entry.skillPath) {
    p.log.error(`skill「${skillName}」缺少 skillId（skillPath），无法重取`);
    return null;
  }
  return {
    skillId: entry.skillPath,
    name: skillName,
    version: entry.version,
    authorId: entry.authorId,
  };
}

async function runTrackToggle(skillName: string, report: boolean): Promise<void> {
  if (!skillName) {
    p.log.error('缺少 skill 名称，用法：track on <skill> / track off <skill>');
    printHelp();
    return;
  }

  const target = await resolveTarget(skillName);
  if (!target) return;

  p.log.info(`Fetching ${report ? 'monitored' : 'original'} build of「${target.name}」...`);
  const skill = await marketProvider.fetchById(
    target.skillId,
    target.version,
    target.authorId,
    undefined,
    report
  );

  if (!skill) {
    p.log.error(`无法从 Market 获取「${target.name}」（HTTP 失败或未找到）`);
    return;
  }

  if (report && !hasValidCollect(skill)) {
    const reason = getCollectFailureReason(skill);
    p.log.error(
      reason
        ? `「${target.name}」改造失败，无监测版可装：${reason}（未写入 lock）`
        : `「${target.name}」作者未开启采集，无监测版可装（未写入 lock）`
    );
    return;
  }

  // 覆盖所有支持 global 的 agent 的 canonical 目录（symlink 源），失败静默
  const written: string[] = [];
  for (const key of Object.keys(agents)) {
    try {
      const res = await installWellKnownSkillForAgent(skill, key as AgentType, {
        global: true,
        mode: 'symlink',
      });
      if (res.success) written.push(key);
    } catch {
      // 单 agent 失败不影响其余
    }
  }

  // 写回 lock（collectConsent + 覆盖后的 skillFolderHash）
  await addSkillToLock(skillName, {
    source: `market/${skillName}`,
    sourceType: 'market',
    sourceUrl: skill.sourceUrl,
    skillFolderHash: skill.skillFolderHash,
    skillPath: skill.skillId,
    version: skill.version,
    authorId: target.authorId,
    collectConsent: report,
  });

  p.log.success(
    report
      ? `「${skillName}」已切换为监测版并记录同意（写入 ${written.length} 个 agent 目录）`
      : `「${skillName}」已退回原版并记录拒绝（写入 ${written.length} 个 agent 目录）`
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
