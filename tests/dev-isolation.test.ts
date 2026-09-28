import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// installer / remove / paths 都通过 `os` 的 homedir 定位全局路径；
// 把 homedir 指向临时目录以验证开发隔离模式。
const mockHome = { current: '' as string };
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => mockHome.current || actual.homedir() };
});

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ENV_KEYS = ['BLUEAI_SKILLS_DEV_BUILD', 'BLUEAI_SKILLS_DEV', 'BLUEAI_SKILLS_HOME'] as const;
const originalEnv: Record<string, string | undefined> = {};

function writeSkillFixture(dir: string, name: string, body: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: fixture\n---\n\n${body}\n`
  );
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
  vi.resetModules();
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
  mockHome.current = '';
  vi.resetModules();
});

describe('开发隔离模式的全局安装 / 列表 / 卸载边界', () => {
  it('全局安装只写状态根，remove -g 不影响真实 agent 目录', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dev-iso-'));
    try {
      mockHome.current = home;
      process.env.BLUEAI_SKILLS_DEV_BUILD = '1';
      process.env.BLUEAI_SKILLS_HOME = join(home, 'state');
      delete process.env.BLUEAI_SKILLS_DEV;

      const { installSkillForAgent } = await import('../src/installer.ts');
      const { removeCommand } = await import('../src/remove.ts');

      const fixtureDir = join(home, 'fixture', 'probe-skill');
      writeSkillFixture(fixtureDir, 'probe-skill', '# probe-skill');

      // 预置真实 agent 目录中的同名技能，卸载时不应被触碰
      const realAgentSkill = join(home, '.claude', 'skills', 'probe-skill');
      writeSkillFixture(realAgentSkill, 'probe-skill', 'REAL');

      const installResult = await installSkillForAgent(
        {
          name: 'probe-skill',
          description: 'fixture',
          content: '',
          path: fixtureDir,
          files: new Map(),
        } as never,
        'claude-code',
        { global: true, mode: 'copy' }
      );
      expect(installResult.success).toBe(true);

      const stateRootSkill = join(home, 'state', '.agents', 'skills', 'probe-skill');
      expect(existsSync(join(stateRootSkill, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(realAgentSkill, 'SKILL.md'))).toBe(true);

      await removeCommand(['probe-skill'], { global: true, yes: true });

      expect(existsSync(stateRootSkill)).toBe(false);
      expect(existsSync(join(realAgentSkill, 'SKILL.md'))).toBe(true);
      expect(readFileSync(join(realAgentSkill, 'SKILL.md'), 'utf-8')).toContain('REAL');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
