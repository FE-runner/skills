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

    it('does not set public by default', () => {
      const opts = parsePublishOptions([]);
      expect(opts.public).toBeUndefined();
    });

    it('parses --public flag', () => {
      const opts = parsePublishOptions(['--public']);
      expect(opts.public).toBe(true);
    });

    it('parses --public together with --team', () => {
      const opts = parsePublishOptions(['--public', '--team', 'team-a']);
      expect(opts.public).toBe(true);
      expect(opts.teamIds).toEqual(['team-a']);
    });
  });

  describe('directory traversal', () => {
    it('errors and sets exitCode when SKILL.md is missing', async () => {
      await runPublish([dir]);
      expect(process.exitCode).toBe(1);
      expect(marketProvider.push).not.toHaveBeenCalled();
    });

    it('keeps symlink/binary skipping (security), collects plain text files; .git no longer skipped locally', async () => {
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
      // .git 内容不再被本地跳过（服务端收口），二进制/符号链接仍跳过
      expect(files).toEqual(
        expect.arrayContaining([
          { path: 'notes.txt', content: 'plain text content' },
          { path: '.git/config', content: 'should be skipped' },
        ])
      );
      expect(files.some((f) => f.path === 'binary.dat')).toBe(false);
      expect(files.some((f) => f.path === 'link.txt')).toBe(false);
      expect(
        errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('跳过符号链接'))
      ).toBe(true);
      expect(
        errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('跳过二进制文件'))
      ).toBe(true);
    });

    it('no longer filters user files: .gitignore/.env*/.github/.git all collected; only sys-noise not skipped locally', async () => {
      writeSkillMd();
      // 用户文件一律收集（含密钥文件/env/.gitignore 等），过滤已交由服务端收口
      mkdirSync(join(dir, '.git'));
      writeFileSync(join(dir, '.git', 'config'), 'collected too', 'utf-8');
      writeFileSync(join(dir, '.DS_Store'), 'collected too', 'utf-8');
      writeFileSync(join(dir, '.env'), 'SECRET=xxx', 'utf-8');
      writeFileSync(join(dir, '.env.local'), 'SECRET=xxx', 'utf-8');
      writeFileSync(join(dir, '.env.example'), 'SECRET=', 'utf-8');
      writeFileSync(join(dir, '.gitignore'), 'node_modules', 'utf-8');
      mkdirSync(join(dir, '.github'));
      writeFileSync(join(dir, '.github', 'note.txt'), 'kept', 'utf-8');

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
      expect(files).toEqual(
        expect.arrayContaining([
          { path: '.env.example', content: 'SECRET=' },
          { path: '.env', content: 'SECRET=xxx' },
          { path: '.env.local', content: 'SECRET=xxx' },
          { path: '.gitignore', content: 'node_modules' },
          { path: '.github/note.txt', content: 'kept' },
          { path: '.git/config', content: 'collected too' },
          { path: '.DS_Store', content: 'collected too' },
        ])
      );
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

    it('passes parsed --team ids through to marketProvider.push', async () => {
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

      await runPublish([dir, '--team', 'team-a,team-b']);

      const [, , , , , teamIds] = vi.mocked(marketProvider.push).mock.calls[0]!;
      expect(teamIds).toEqual(['team-a', 'team-b']);
      expect(process.exitCode).toBeUndefined();
    });

    it('does not pass team ids to push when push args omit --team', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: false,
        status: 409,
        message: '同名的公开 Skill 已存在',
      });

      await runPublish([dir, '--team', 'team-a']);

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

  describe('--public', () => {
    beforeEach(() => writeSkillMd());

    it('passes visibility: PUBLIC through to marketProvider.push', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: true,
        data: {
          skillId: 's1',
          name: 'my-skill',
          currentVersion: '',
          visibility: 'PUBLIC',
          status: 'PENDING',
        },
      });

      await runPublish([dir, '--public']);

      const [, , , , visibility] = vi.mocked(marketProvider.push).mock.calls[0]!;
      expect(visibility).toBe('PUBLIC');
    });

    it('does not pass visibility when --public is omitted', async () => {
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

      const [, , , , visibility] = vi.mocked(marketProvider.push).mock.calls[0]!;
      expect(visibility).toBeUndefined();
    });

    it('shows "已提交审核" instead of "推送成功" when PUBLIC push is pending', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: true,
        data: {
          skillId: 's1',
          name: 'my-skill',
          currentVersion: '',
          visibility: 'PUBLIC',
          status: 'PENDING',
        },
      });

      await runPublish([dir, '--public']);

      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('已提交审核'))).toBe(
        true
      );
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('推送成功'))).toBe(
        false
      );
    });

    it('keeps "推送成功" output unchanged when --public is omitted', async () => {
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

      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('推送成功'))).toBe(
        true
      );
    });

    it('still shows "推送成功" (not "已提交审核") when --public is omitted even if status happens to be PENDING', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: true,
        data: {
          skillId: 's1',
          name: 'my-skill',
          currentVersion: '0.0.1',
          visibility: 'PRIVATE',
          status: 'PENDING',
        },
      });

      await runPublish([dir]);

      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('推送成功'))).toBe(
        true
      );
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('已提交审核'))).toBe(
        false
      );
    });

    it('adds a role-permission hint on a 403 failure under --public', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: false,
        status: 403,
        message: '无权限',
      });

      await runPublish([dir, '--public']);

      expect(
        errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('无权发布公开 Skill'))
      ).toBe(true);
    });

    it('adds a name-conflict hint on a 409 failure under --public', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: false,
        status: 409,
        message: '同名的公开 Skill 已存在',
      });

      await runPublish([dir, '--public']);

      expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('名称冲突'))).toBe(
        true
      );
    });

    it('adds a withdraw hint on a 400 failure under --public', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: false,
        status: 400,
        message: 'Skill 正在审核中，无法更新',
      });

      await runPublish([dir, '--public']);

      expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('withdraw'))).toBe(
        true
      );
    });

    it('does not add PUBLIC-specific hints when --public is omitted', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: false,
        status: 409,
        message: '同名的公开 Skill 已存在',
      });

      await runPublish([dir]);

      expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('名称冲突'))).toBe(
        false
      );
    });

    it('passes team ids alongside PUBLIC visibility to push (not mutually exclusive)', async () => {
      vi.mocked(marketProvider.push).mockResolvedValue({
        ok: true,
        data: {
          skillId: 's1',
          name: 'my-skill',
          currentVersion: '',
          visibility: 'PUBLIC',
          status: 'PENDING',
        },
      });

      await runPublish([dir, '--public', '--team', 'team-a']);

      const [, , , , visibility, teamIds] = vi.mocked(marketProvider.push).mock.calls[0]!;
      expect(visibility).toBe('PUBLIC');
      expect(teamIds).toEqual(['team-a']);
    });
  });
});
