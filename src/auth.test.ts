import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  statSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { saveApiKey, getApiKey, getActiveProfile, findWorkspaceConfigDir } from './auth.ts';

/** 影响解析链的环境变量，测试期间需要清理并可还原 */
const MANAGED_ENV_VARS = ['SKILLS_API_KEY', 'BLUEAI_API_KEY', 'BLUEAI_CONFIG_DIR'] as const;

/** 写一个 profile-keyed 的 credentials.json */
function writeCredentials(filePath: string, profile: string, apiKey: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify({ [profile]: { apiKey } }), 'utf-8');
}

describe('auth', () => {
  let dir: string;
  let secretsPath: string;
  let configDir: string;
  let projectRoot: string;
  let cwd: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'skills-auth-test-'));
    secretsPath = join(dir, 'secrets-root', '.blueai', 'secrets.json');
    configDir = join(dir, 'config-root');
    projectRoot = join(dir, 'project');
    cwd = join(projectRoot, 'nested');
    mkdirSync(cwd, { recursive: true });

    for (const key of MANAGED_ENV_VARS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const key of MANAGED_ENV_VARS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  describe('saveApiKey', () => {
    it('creates the directory (0700) and file (0600) when they do not exist', () => {
      saveApiKey('sk-new', secretsPath);

      expect(existsSync(secretsPath)).toBe(true);
      expect(statSync(dirname(secretsPath)).mode & 0o777).toBe(0o700);
      expect(statSync(secretsPath).mode & 0o777).toBe(0o600);

      const content = JSON.parse(readFileSync(secretsPath, 'utf-8'));
      expect(content['blueai-skills-market-push.apiKey']).toBe('sk-new');
    });

    it('only updates the target key, preserving other existing keys', () => {
      mkdirSync(dirname(secretsPath), { recursive: true });
      writeFileSync(secretsPath, JSON.stringify({ 'other-skill.key': 'keep-me' }), 'utf-8');

      saveApiKey('sk-updated', secretsPath);

      const content = JSON.parse(readFileSync(secretsPath, 'utf-8'));
      expect(content['other-skill.key']).toBe('keep-me');
      expect(content['blueai-skills-market-push.apiKey']).toBe('sk-updated');
    });

    it('warns but does not force-fix permissions on an existing too-wide file', () => {
      mkdirSync(dirname(secretsPath), { recursive: true });
      writeFileSync(secretsPath, JSON.stringify({}), 'utf-8');
      chmodSync(secretsPath, 0o644);

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      saveApiKey('sk-x', secretsPath);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(secretsPath));
      errorSpy.mockRestore();

      // 不强制修改已有文件权限
      expect(statSync(secretsPath).mode & 0o777).toBe(0o644);
    });
  });

  describe('getApiKey 优先级链', () => {
    it('tier 1: --api-key flag 覆盖所有持久化来源', () => {
      mkdirSync(dirname(secretsPath), { recursive: true });
      writeFileSync(
        secretsPath,
        JSON.stringify({ 'blueai-skills-market-push.apiKey': 'file-key' }),
        'utf-8'
      );
      process.env.SKILLS_API_KEY = 'env-key';
      process.env.BLUEAI_API_KEY = 'blueai-env-key';

      expect(getApiKey({ flagKey: 'flag-key', secretsPath, configDir, cwd })).toBe('flag-key');
    });

    it('tier 2: SKILLS_API_KEY 优先于 secrets.json 与工作区凭据', () => {
      mkdirSync(dirname(secretsPath), { recursive: true });
      writeFileSync(
        secretsPath,
        JSON.stringify({ 'blueai-skills-market-push.apiKey': 'file-key' }),
        'utf-8'
      );
      writeCredentials(join(projectRoot, '.blueai', 'credentials.json'), 'default', 'ws-key');
      process.env.SKILLS_API_KEY = 'env-key';

      expect(getApiKey({ secretsPath, configDir, cwd })).toBe('env-key');
    });

    it('tier 3: 仅 secrets.json 存在时使用文件中的值', () => {
      mkdirSync(dirname(secretsPath), { recursive: true });
      writeFileSync(
        secretsPath,
        JSON.stringify({ 'blueai-skills-market-push.apiKey': 'file-key' }),
        'utf-8'
      );

      expect(getApiKey({ secretsPath, configDir, cwd })).toBe('file-key');
    });

    it('tier 4: 命中工作区 .blueai/credentials.json（向上查找）', () => {
      writeCredentials(join(projectRoot, '.blueai', 'credentials.json'), 'default', 'ws-key');

      expect(getApiKey({ secretsPath, configDir, cwd })).toBe('ws-key');
    });

    it('tier 4: 向上查找取最近的一层 .blueai', () => {
      writeCredentials(join(projectRoot, '.blueai', 'credentials.json'), 'default', 'outer-key');
      writeCredentials(join(cwd, '.blueai', 'credentials.json'), 'default', 'inner-key');

      expect(getApiKey({ secretsPath, configDir, cwd })).toBe('inner-key');
    });

    it('tier 5: 命中 BLUEAI_API_KEY 环境变量', () => {
      process.env.BLUEAI_API_KEY = 'blueai-env-key';

      expect(getApiKey({ secretsPath, configDir, cwd })).toBe('blueai-env-key');
    });

    it('tier 6: 命中用户级 credentials.json', () => {
      writeCredentials(join(configDir, 'credentials.json'), 'default', 'user-key');

      expect(getApiKey({ secretsPath, configDir, cwd })).toBe('user-key');
    });

    it('按 config.json 的 activeProfile 取对应 profile 的 Key', () => {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'config.json'), JSON.stringify({ activeProfile: 'work' }));
      writeFileSync(
        join(configDir, 'credentials.json'),
        JSON.stringify({ default: { apiKey: 'default-key' }, work: { apiKey: 'work-key' } })
      );

      expect(getApiKey({ secretsPath, configDir, cwd })).toBe('work-key');
    });

    it('BLUEAI_CONFIG_DIR 设置时跳过工作区凭据查找', () => {
      writeCredentials(join(projectRoot, '.blueai', 'credentials.json'), 'default', 'ws-key');
      writeCredentials(join(configDir, 'credentials.json'), 'default', 'user-key');
      process.env.BLUEAI_CONFIG_DIR = configDir;

      // 跳过工作区 -> 落到用户级 credentials.json
      expect(getApiKey({ secretsPath, cwd })).toBe('user-key');
    });

    it('所有来源均为空时返回 null', () => {
      expect(getApiKey({ secretsPath, configDir, cwd })).toBeNull();
    });

    it('credentials.json 缺失对应 profile 时视为未命中，不报错', () => {
      writeCredentials(join(configDir, 'credentials.json'), 'other', 'other-key');

      expect(getApiKey({ secretsPath, configDir, cwd })).toBeNull();
    });
  });

  describe('getActiveProfile', () => {
    it('缺省为 default', () => {
      expect(getActiveProfile(configDir)).toBe('default');
    });

    it('读取 config.json 的 activeProfile', () => {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'config.json'), JSON.stringify({ activeProfile: 'staging' }));

      expect(getActiveProfile(configDir)).toBe('staging');
    });

    it('config.json 不可解析时回退 default', () => {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'config.json'), '{ not json');

      expect(getActiveProfile(configDir)).toBe('default');
    });
  });

  describe('findWorkspaceConfigDir', () => {
    it('返回最近的 .blueai 目录', () => {
      mkdirSync(join(projectRoot, '.blueai'), { recursive: true });

      expect(findWorkspaceConfigDir(cwd)).toBe(join(projectRoot, '.blueai'));
    });

    it('未找到时返回 null', () => {
      expect(findWorkspaceConfigDir(cwd)).toBeNull();
    });
  });
});
