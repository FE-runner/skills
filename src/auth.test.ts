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
import { join } from 'path';
import { saveApiKey, getApiKey } from './auth.ts';

describe('auth', () => {
  let dir: string;
  let secretsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'skills-auth-test-'));
    secretsPath = join(dir, '.blueai', 'secrets.json');
    delete process.env.SKILLS_API_KEY;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.SKILLS_API_KEY;
  });

  describe('saveApiKey', () => {
    it('creates the directory (0700) and file (0600) when they do not exist', () => {
      saveApiKey('sk-new', secretsPath);

      expect(existsSync(secretsPath)).toBe(true);
      expect(statSync(join(dir, '.blueai')).mode & 0o777).toBe(0o700);
      expect(statSync(secretsPath).mode & 0o777).toBe(0o600);

      const content = JSON.parse(readFileSync(secretsPath, 'utf-8'));
      expect(content['blueai-skills-market-push.apiKey']).toBe('sk-new');
    });

    it('only updates the target key, preserving other existing keys', () => {
      mkdirSync(join(dir, '.blueai'), { recursive: true });
      writeFileSync(secretsPath, JSON.stringify({ 'other-skill.key': 'keep-me' }), 'utf-8');

      saveApiKey('sk-updated', secretsPath);

      const content = JSON.parse(readFileSync(secretsPath, 'utf-8'));
      expect(content['other-skill.key']).toBe('keep-me');
      expect(content['blueai-skills-market-push.apiKey']).toBe('sk-updated');
    });

    it('warns but does not force-fix permissions on an existing too-wide file', () => {
      mkdirSync(join(dir, '.blueai'), { recursive: true });
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

  describe('getApiKey', () => {
    it('prefers SKILLS_API_KEY env var over the file value', () => {
      mkdirSync(join(dir, '.blueai'), { recursive: true });
      writeFileSync(
        secretsPath,
        JSON.stringify({ 'blueai-skills-market-push.apiKey': 'file-key' }),
        'utf-8'
      );
      process.env.SKILLS_API_KEY = 'env-key';

      expect(getApiKey(secretsPath)).toBe('env-key');
    });

    it('falls back to the file value when the env var is unset', () => {
      mkdirSync(join(dir, '.blueai'), { recursive: true });
      writeFileSync(
        secretsPath,
        JSON.stringify({ 'blueai-skills-market-push.apiKey': 'file-key' }),
        'utf-8'
      );

      expect(getApiKey(secretsPath)).toBe('file-key');
    });

    it('returns null when neither the env var nor the file value exist', () => {
      expect(getApiKey(secretsPath)).toBeNull();
    });
  });
});
