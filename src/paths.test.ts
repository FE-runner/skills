import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';

const ENV_KEYS = [
  'BLUEAI_SKILLS_DEV_BUILD',
  'BLUEAI_SKILLS_DEV',
  'BLUEAI_SKILLS_HOME',
  'XDG_STATE_HOME',
] as const;

const originalEnv: Record<string, string | undefined> = {};

/** 按给定环境变量重新加载 paths 模块（模块在加载期计算隔离模式）。 */
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

describe('paths 开发隔离模式判定', () => {
  it('正式构建在未设置/0/1 下都不启用隔离，且忽略 BLUEAI_SKILLS_HOME', async () => {
    for (const devFlag of [undefined, '0', '1']) {
      const paths = await loadPaths({
        BLUEAI_SKILLS_DEV_BUILD: '',
        ...(devFlag === undefined ? {} : { BLUEAI_SKILLS_DEV: devFlag }),
        BLUEAI_SKILLS_HOME: '/tmp/dev-root',
      });

      expect(paths.IS_DEV_ISOLATION).toBe(false);
      expect(paths.getGlobalBaseDir()).toBe(home);
      expect(paths.getCredentialDir()).toBe(join(home, '.blueai'));
      expect(paths.getGlobalSkillLockPath()).toBe(join(home, '.agents', '.skill-lock.json'));
    }
  });

  it('正式构建保留 XDG_STATE_HOME 的全局锁优先行为', async () => {
    const paths = await loadPaths({
      BLUEAI_SKILLS_DEV_BUILD: '',
      XDG_STATE_HOME: '/custom/state',
    });

    expect(paths.getGlobalSkillLockPath()).toBe(
      join('/custom/state', 'skills', '.skill-lock.json')
    );
  });

  it('开发构建默认开启隔离并使用默认状态根', async () => {
    const paths = await loadPaths({ BLUEAI_SKILLS_DEV_BUILD: '1' });
    const stateRoot = join(home, '.blueai-skills-dev');

    expect(paths.IS_DEV_ISOLATION).toBe(true);
    expect(paths.getGlobalBaseDir()).toBe(stateRoot);
    expect(paths.getCredentialDir()).toBe(stateRoot);
    expect(paths.getGlobalSkillLockPath()).toBe(join(stateRoot, '.agents', '.skill-lock.json'));
  });

  it('开发构建在 0/false 下关闭隔离并忽略 BLUEAI_SKILLS_HOME', async () => {
    for (const devFlag of ['0', 'false', 'FALSE']) {
      const paths = await loadPaths({
        BLUEAI_SKILLS_DEV_BUILD: '1',
        BLUEAI_SKILLS_DEV: devFlag,
        BLUEAI_SKILLS_HOME: '/tmp/dev-root',
      });

      expect(paths.IS_DEV_ISOLATION).toBe(false);
      expect(paths.getGlobalBaseDir()).toBe(home);
      expect(paths.getCredentialDir()).toBe(join(home, '.blueai'));
    }
  });

  it('开发构建在 1/true/其它非空值下保持开启', async () => {
    for (const devFlag of ['1', 'true', 'yes']) {
      const paths = await loadPaths({
        BLUEAI_SKILLS_DEV_BUILD: '1',
        BLUEAI_SKILLS_DEV: devFlag,
      });

      expect(paths.IS_DEV_ISOLATION).toBe(true);
    }
  });

  it('开发构建可用 BLUEAI_SKILLS_HOME 覆盖状态根', async () => {
    const paths = await loadPaths({
      BLUEAI_SKILLS_DEV_BUILD: '1',
      BLUEAI_SKILLS_HOME: '/tmp/dev-root',
    });

    expect(paths.getGlobalBaseDir()).toBe('/tmp/dev-root');
    expect(paths.getCredentialDir()).toBe('/tmp/dev-root');
  });

  it('隔离模式忽略 XDG_STATE_HOME，锁固定落状态根', async () => {
    const paths = await loadPaths({
      BLUEAI_SKILLS_DEV_BUILD: '1',
      BLUEAI_SKILLS_HOME: '/tmp/dev-root',
      XDG_STATE_HOME: '/custom/state',
    });

    expect(paths.getGlobalSkillLockPath()).toBe(
      join('/tmp/dev-root', '.agents', '.skill-lock.json')
    );
  });
});
