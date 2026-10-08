import { join } from 'path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { describe, it, expect, afterEach } from 'vitest';
import {
  agents,
  getWorkbuddyConfigDir,
  getWorkbuddyGlobalSkillsDir,
  isUniversalAgent,
} from '../src/agents.ts';
import { discoverSkills } from '../src/skills.ts';

const HOME = '/tmp/workbuddy-home';

describe('workbuddy 配置目录解析', () => {
  it('未设置环境变量时回退到 <home>/.workbuddy', () => {
    expect(getWorkbuddyConfigDir(HOME, {})).toBe(join(HOME, '.workbuddy'));
  });

  it('WORKBUDDY_CONFIG_DIR 覆盖默认配置目录', () => {
    expect(getWorkbuddyConfigDir(HOME, { WORKBUDDY_CONFIG_DIR: '/custom/wb' })).toBe('/custom/wb');
  });

  it('空字符串与纯空白视为未设置', () => {
    expect(getWorkbuddyConfigDir(HOME, { WORKBUDDY_CONFIG_DIR: '' })).toBe(
      join(HOME, '.workbuddy')
    );
    expect(getWorkbuddyConfigDir(HOME, { WORKBUDDY_CONFIG_DIR: '   ' })).toBe(
      join(HOME, '.workbuddy')
    );
  });

  it('全局技能目录 = <配置目录>/skills', () => {
    expect(getWorkbuddyGlobalSkillsDir(HOME, {})).toBe(join(HOME, '.workbuddy', 'skills'));
    expect(getWorkbuddyGlobalSkillsDir(HOME, { WORKBUDDY_CONFIG_DIR: '/custom/wb' })).toBe(
      join('/custom/wb', 'skills')
    );
  });
});

describe('workbuddy agent 注册', () => {
  it('使用独立的项目级目录，且不归入通用 .agents 列表', () => {
    expect(agents.workbuddy.displayName).toBe('WorkBuddy');
    expect(agents.workbuddy.skillsDir).toBe('.workbuddy/skills');
    expect(agents.workbuddy.globalSkillsDir).toBe(getWorkbuddyGlobalSkillsDir());
    expect(isUniversalAgent('workbuddy')).toBe(false);
  });

  it('detectInstalled 依据配置目录是否存在，且受 WORKBUDDY_CONFIG_DIR 影响', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'workbuddy-detect-'));
    const missing = join(dir, 'does-not-exist');
    const original = process.env.WORKBUDDY_CONFIG_DIR;

    try {
      process.env.WORKBUDDY_CONFIG_DIR = dir;
      await expect(agents.workbuddy.detectInstalled()).resolves.toBe(true);

      process.env.WORKBUDDY_CONFIG_DIR = missing;
      await expect(agents.workbuddy.detectInstalled()).resolves.toBe(false);
    } finally {
      if (original === undefined) {
        delete process.env.WORKBUDDY_CONFIG_DIR;
      } else {
        process.env.WORKBUDDY_CONFIG_DIR = original;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('workbuddy 技能发现路径', () => {
  let testDir: string | undefined;

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
      testDir = undefined;
    }
  });

  it('发现 .workbuddy/skills 下的技能，且不把散落非技能文件当作技能', async () => {
    testDir = mkdtempSync(join(tmpdir(), 'workbuddy-discover-'));

    const skillsDir = join(testDir, '.workbuddy', 'skills');
    const skillDir = join(skillsDir, 'web-access');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---
name: web-access
description: WorkBuddy skill discovery demo
---

# Web Access
`
    );

    // WorkBuddy 用户技能目录里常见的非技能散落文件，不应产生技能条目
    writeFileSync(join(skillsDir, '_bm_skillid_migration.json'), '{"version":2}');

    const skills = await discoverSkills(testDir, undefined, { fullDepth: true });
    const names = skills.map((s) => s.name);

    expect(names).toContain('web-access');
    expect(names.some((name) => name.includes('_bm_skillid_migration'))).toBe(false);
  });
});
