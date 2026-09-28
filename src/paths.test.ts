import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';

const ENV_KEYS = ['BLUEAI_SKILLS_HOME', 'BLUEAI_SKILLS_DEV', 'XDG_STATE_HOME'] as const;
const originalEnv: Record<string, string | undefined> = {};

/** 按给定环境变量重新加载 paths 模块。 */
async function loadPaths(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
  return import('./paths.ts');
}

const home = homedir();

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.resetModules();
});

describe('paths 全局路径', () => {
  it('凭证目录固定为 ~/.blueai', async () => {
    const paths = await loadPaths({});

    expect(paths.getCredentialDir()).toBe(join(home, '.blueai'));
  });

  it('全局锁默认 ~/.agents/.skill-lock.json，XDG_STATE_HOME 优先', async () => {
    const withoutXdg = await loadPaths({});
    expect(withoutXdg.getGlobalSkillLockPath()).toBe(join(home, '.agents', '.skill-lock.json'));

    const withXdg = await loadPaths({ XDG_STATE_HOME: '/custom/state' });
    expect(withXdg.getGlobalSkillLockPath()).toBe(
      join('/custom/state', 'skills', '.skill-lock.json')
    );
  });

  it('已移除的隔离开关不再影响任何路径', async () => {
    const paths = await loadPaths({
      BLUEAI_SKILLS_HOME: '/tmp/dev-root',
      BLUEAI_SKILLS_DEV: '1',
    });

    expect(paths.getCredentialDir()).toBe(join(home, '.blueai'));
    expect(paths.getGlobalSkillLockPath()).toBe(join(home, '.agents', '.skill-lock.json'));
  });
});
