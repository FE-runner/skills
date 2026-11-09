import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];
const originalXdg = process.env.XDG_STATE_HOME;

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skills-lock-file-'));
  tempDirs.push(dir);
  process.env.XDG_STATE_HOME = dir;
});

afterEach(async () => {
  if (originalXdg === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalXdg;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function entry(name: string, releaseSeq: number) {
  return {
    source: `market/${name}`,
    sourceType: 'market',
    sourceUrl: 'https://market.test',
    skillFolderHash: `hash-${name}`,
    skillPath: `skill-${name}`,
    version: '1.0.0',
    releaseSeq,
  };
}

describe('skill lock 字段合并', () => {
  it('不同 Skill 依次写回保留 releaseSeq', async () => {
    const { addSkillToLock, readSkillLock } = await import('./skill-lock.ts');
    await addSkillToLock('one', entry('one', 1));
    await addSkillToLock('two', entry('two', 2));
    const lock = await readSkillLock();
    expect(lock.skills.one?.releaseSeq).toBe(1);
    expect(lock.skills.two?.releaseSeq).toBe(2);
  });
});
