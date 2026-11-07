import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getAgentBaseDir, installWellKnownSkillForAgents } from './installer.ts';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('installWellKnownSkillForAgents', () => {
  it('copy 模式一次安装到多个 Agent', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'skills-installer-'));
    tempDirs.push(cwd);
    const results = await installWellKnownSkillForAgents(
      {
        installName: 'demo',
        files: new Map([
          ['SKILL.md', '# demo\n'],
          ['scripts/run.sh', '#!/bin/sh\necho ok\n'],
        ]),
      },
      ['claude-code', 'cursor'],
      { cwd, global: false, mode: 'copy' }
    );
    expect(results.every((result) => result.success)).toBe(true);
    for (const agent of ['claude-code', 'cursor'] as const) {
      const target = join(getAgentBaseDir(agent, false, cwd), 'demo');
      await expect(readFile(join(target, 'SKILL.md'), 'utf-8')).resolves.toBe('# demo\n');
      await expect(readFile(join(target, 'scripts/run.sh'), 'utf-8')).resolves.toContain('echo ok');
    }
  });

  it('backup-only 状态先恢复旧目录再完成安装', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'skills-installer-recover-'));
    tempDirs.push(cwd);
    const target = join(getAgentBaseDir('claude-code', false, cwd), 'demo');
    const backup = `${target}.install-backup-stale`;
    await mkdir(backup, { recursive: true });
    await writeFile(join(backup, 'SKILL.md'), '# old\n');

    const [result] = await installWellKnownSkillForAgents(
      {
        installName: 'demo',
        files: new Map([['SKILL.md', '# new\n']]),
      },
      ['claude-code'],
      { cwd, global: false, mode: 'copy' }
    );
    expect(result?.success).toBe(true);
    await expect(readFile(join(target, 'SKILL.md'), 'utf-8')).resolves.toBe('# new\n');
  });

  it('不同 Agent 目标顺序可并发收敛', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'skills-installer-concurrent-'));
    tempDirs.push(cwd);
    const skill = {
      installName: 'demo',
      files: new Map([['SKILL.md', '# concurrent\n']]),
    };
    const [first, second] = await Promise.all([
      installWellKnownSkillForAgents(skill, ['claude-code', 'cursor'], {
        cwd,
        global: false,
        mode: 'copy',
      }),
      installWellKnownSkillForAgents(skill, ['cursor', 'claude-code'], {
        cwd,
        global: false,
        mode: 'copy',
      }),
    ]);
    expect(first.every((result) => result.success)).toBe(true);
    expect(second.every((result) => result.success)).toBe(true);
  });
});
