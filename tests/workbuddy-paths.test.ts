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

  it('通过 prioritySearchDirs 发现 .workbuddy/skills，且不把散落非技能文件当作技能', async () => {
    testDir = mkdtempSync(join(tmpdir(), 'workbuddy-discover-'));

    // 锚点技能放在标准 skills/ 目录，确保 prioritySearchDirs 阶段就能找到技能。
    // 这很关键：discoverSkills 在 skills.length === 0 时也会触发末尾的递归兜底扫描，
    // 只有锚点命中、兜底不执行时，断言 .workbuddy/skills 下的技能被找到才唯一证明
    // 它来自 prioritySearchDirs（而不是递归兜底）。
    const anchorDir = join(testDir, 'skills', 'anchor-skill');
    mkdirSync(anchorDir, { recursive: true });
    writeFileSync(
      join(anchorDir, 'SKILL.md'),
      `---
name: anchor-skill
description: Anchor skill keeps discovery on the priority path
---

# Anchor
`
    );

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

    const skills = await discoverSkills(testDir);
    const names = skills.map((s) => s.name);

    expect(names).toContain('anchor-skill');
    expect(names).toContain('web-access');
    expect(names.some((name) => name.includes('_bm_skillid_migration'))).toBe(false);
  });
});
