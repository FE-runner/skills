import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('./providers/market.ts', () => ({
  marketProvider: {
    push: vi.fn(),
    publishToTeam: vi.fn(),
  },
}));
vi.mock('./auth.ts', () => ({
  getApiKey: vi.fn(),
}));

// 模拟 TOCTOU 场景：文件在 lstat 判断后被替换为指向根目录外的符号链接，
// realpath 解析出的真实路径不再位于发布根目录内。
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    realpathSync: Object.assign(
      (p: string) => {
        if (typeof p === 'string' && p.endsWith('escaped.txt')) {
          return '/definitely/outside/escaped.txt';
        }
        return (actual.realpathSync as (p: string) => string)(p);
      },
      { native: actual.realpathSync.native }
    ),
  };
});

import { marketProvider } from './providers/market.ts';
import { getApiKey } from './auth.ts';
import { runPublish, parsePublishOptions } from './publish.ts';

describe('publish', () => {
  let dir: string;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'skills-publish-test-'));
    process.exitCode = undefined;
    vi.mocked(getApiKey).mockReturnValue('sk-test');
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.exitCode = undefined;
    vi.clearAllMocks();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  function writeSkillMd(content = '---\nname: my-skill\n---\nbody'): void {
    writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  }

  describe('parsePublishOptions', () => {
    it('defaults path to cwd when omitted', () => {
      const opts = parsePublishOptions([]);
      expect(opts.path).toBe(process.cwd());
      expect(opts.version).toBeUndefined();
      expect(opts.teamIds).toBeUndefined();
    });

    it('parses --version passthrough', () => {
      const opts = parsePublishOptions(['--version', '2.0.0']);
      expect(opts.version).toBe('2.0.0');
    });

    it('parses --team as a comma-separated array', () => {
      const opts = parsePublishOptions(['--team', 'team-a,team-b']);
      expect(opts.teamIds).toEqual(['team-a', 'team-b']);
    });
  });

  describe('directory traversal', () => {
    it('errors and sets exitCode when SKILL.md is missing', async () => {
      await runPublish([dir]);
      expect(process.exitCode).toBe(1);
      expect(marketProvider.push).not.toHaveBeenCalled();
    });

    it('skips hidden entries, symlinks, and binary files; includes plain text files', async () => {
      writeSkillMd();
      writeFileSync(join(dir, 'notes.txt'), 'plain text content', 'utf-8');
      mkdirSync(join(dir, '.git'));
      writeFileSync(join(dir, '.git', 'config'), 'should be skipped', 'utf-8');
      writeFileSync(join(dir, 'binary.dat'), Buffer.from([0x41, 0x00, 0x42]));
      symlinkSync('/etc/hosts', join(dir, 'link.txt'));

      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: true,
        data: {
          skillId: 's1',
          name: 'my-skill',
          currentVersion: '0.0.1',
          visibility: 'PRIVATE',
          status: 'APPROVED',
        },
      });

      await runPublish([dir]);

      expect(marketProvider.push).toHaveBeenCalledTimes(1);
      const [, files] = vi.mocked(marketProvider.push).mock.calls[0]!;
      expect(files).toEqual([{ path: 'notes.txt', content: 'plain text content' }]);
      expect(
        errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('跳过符号链接'))
      ).toBe(true);
      expect(
        errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('跳过二进制文件'))
      ).toBe(true);
    });

    it('rejects files whose real path escapes the publish root (TOCTOU)', async () => {
      writeSkillMd();
      writeFileSync(join(dir, 'escaped.txt'), 'sneaky content', 'utf-8');

      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: true,
        data: {
          skillId: 's1',
          name: 'my-skill',
          currentVersion: '0.0.1',
          visibility: 'PRIVATE',
          status: 'APPROVED',
        },
      });

      await runPublish([dir]);

      const [, files] = vi.mocked(marketProvider.push).mock.calls[0]!;
      expect(files).toEqual([]);
      expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('路径穿越'))).toBe(
        true
      );
    });
  });

  describe('push / --team chaining', () => {
    beforeEach(() => writeSkillMd());

    it('passes --version through to marketProvider.push', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: true,
        data: {
          skillId: 's1',
          name: 'my-skill',
          currentVersion: '2.0.0',
          visibility: 'PRIVATE',
          status: 'APPROVED',
        },
      });

      await runPublish([dir, '--version', '2.0.0']);

      const [, , version] = vi.mocked(marketProvider.push).mock.calls[0]!;
      expect(version).toBe('2.0.0');
    });

    it('calls publishToTeam with parsed team ids after a successful push', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: true,
        data: {
          skillId: 's1',
          name: 'my-skill',
          currentVersion: '0.0.1',
          visibility: 'PRIVATE',
          status: 'APPROVED',
        },
      });
      vi.mocked(marketProvider.publishToTeam).mockResolvedValue({ ok: true, data: null });

      await runPublish([dir, '--team', 'team-a,team-b']);

      expect(marketProvider.publishToTeam).toHaveBeenCalledWith(
        's1',
        ['team-a', 'team-b'],
        'sk-test'
      );
      expect(process.exitCode).toBeUndefined();
    });

    it('does not call publishToTeam when push fails', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: false,
        status: 409,
        message: '同名的公开 Skill 已存在',
      });

      await runPublish([dir, '--team', 'team-a']);

      expect(marketProvider.publishToTeam).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe('error handling', () => {
    beforeEach(() => writeSkillMd());

    it('sets exitCode=1 and shows HTTP status + message on a non-401 failure', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: false,
        status: 409,
        message: '同名的公开 Skill 已存在',
      });

      await runPublish([dir]);

      expect(process.exitCode).toBe(1);
      expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('409'))).toBe(true);
      expect(
        errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('同名的公开 Skill 已存在'))
      ).toBe(true);
    });

    it('adds a login hint on a 401 failure', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: false,
        status: 401,
        message: '未登录',
      });

      await runPublish([dir]);

      expect(process.exitCode).toBe(1);
      expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('login'))).toBe(true);
    });

    it('sets exitCode=1 on a network error (status 0)', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: false,
        status: 0,
        message: 'fetch failed',
      });

      await runPublish([dir]);

      expect(process.exitCode).toBe(1);
      expect(
        errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('fetch failed'))
      ).toBe(true);
    });

    it('errors when no API key is available', async () => {
      vi.mocked(getApiKey).mockReturnValue(null);

      await runPublish([dir]);

      expect(process.exitCode).toBe(1);
      expect(marketProvider.push).not.toHaveBeenCalled();
    });
  });
});
