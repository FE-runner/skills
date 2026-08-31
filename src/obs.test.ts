import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./providers/market.ts', () => ({
  marketProvider: {
    createObservability: vi.fn(),
    listObservability: vi.fn(),
    renewObservability: vi.fn(),
  },
}));
vi.mock('./auth.ts', () => ({
  getApiKey: vi.fn(),
}));
vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(),
  isCancel: (v: unknown) => v === Symbol.for('clack:cancel'),
}));
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { EventEmitter } from 'events';
import * as p from '@clack/prompts';
import { spawn } from 'child_process';
import { marketProvider } from './providers/market.ts';
import { getApiKey } from './auth.ts';
import { runObs, parseObsOptions, detectHostPlatform, pickPlatformCommand } from './obs.ts';

const CMD = {
  unix: 'curl -fsSL "…/install?token=t1&os=unix" | bash',
  windows:
    'Invoke-WebRequest -Uri "…/install?token=t1&os=windows" -OutFile "$env:TEMP\\skills-obs.ps1" -UseBasicParsing; powershell -ExecutionPolicy Bypass -File "$env:TEMP\\skills-obs.ps1"',
};

describe('obs', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.exitCode = undefined;
    vi.mocked(getApiKey).mockReturnValue('sk-test');
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
    vi.clearAllMocks();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  describe('parseObsOptions', () => {
    it('parses a create command with optional note (no --agent)', () => {
      expect(parseObsOptions(['公司机', '--note', '主力开发机'])).toEqual({
        help: false,
        subcommand: 'create',
        agentName: '公司机',
        note: '主力开发机',
      });
    });

    it('accepts "add" as an alias for create', () => {
      expect(parseObsOptions(['add', 'nas-01'])).toEqual({
        help: false,
        subcommand: 'create',
        agentName: 'nas-01',
        note: undefined,
      });
    });

    it('rejects a now-removed --agent option locally', () => {
      const opts = parseObsOptions(['foo', '--agent', 'hermes']);
      expect(opts.subcommand).toBeUndefined();
      expect(opts.error).toContain('不支持的选项');
    });

    it('returns a usage error for refresh without agentId', () => {
      expect(parseObsOptions(['refresh']).error).toContain('agentId');
    });

    it('requires a UUID agentId for refresh', () => {
      expect(parseObsOptions(['refresh', 'abc']).error).toContain('UUID');
      expect(parseObsOptions(['refresh', '123']).error).toContain('UUID');
    });

    it('parses install with a UUID agentId', () => {
      expect(parseObsOptions(['install', '11111111-2222-4333-8444-555555555555'])).toEqual({
        help: false,
        subcommand: 'install',
        agentId: '11111111-2222-4333-8444-555555555555',
      });
    });

    it('rejects install without / non-UUID agentId', () => {
      expect(parseObsOptions(['install']).error).toContain('agentId');
      expect(parseObsOptions(['install', 'abc']).error).toContain('UUID');
    });

    it('rejects reserved subcommand keywords used as agentName', () => {
      // "list" 是子命令，不能创建名为 list 的接入记录
      expect(parseObsOptions(['list', '--note', 'x']).error).toContain('list');
      // "refresh" 同理（add 别名下，refresh 不能作为接入名）
      expect(parseObsOptions(['add', 'refresh']).error).toContain('refresh');
      // "install" 同理
      expect(parseObsOptions(['add', 'install']).error).toContain('install');
    });
  });

  describe('runObs', () => {
    it('creates a record and prints serviceName + dual install commands', async () => {
      vi.mocked(marketProvider.createObservability).mockResolvedValue({
        ok: true,
        data: {
          id: '11111111-2222-4333-8444-555555555555',
          agentName: '公司机',
          serviceName: 'BSM-11111111-2222-3333-4444-555555555555',
          installCommand: CMD,
          installScript: CMD,
        },
      });

      await runObs(['公司机']);

      expect(marketProvider.createObservability).toHaveBeenCalledWith(
        { agentName: '公司机', note: undefined },
        'sk-test'
      );
      expect(process.exitCode).toBeUndefined();
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('BSM-11111111'))).toBe(
        true
      );
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('os=unix'))).toBe(true);
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('os=windows'))).toBe(
        true
      );
    });

    it('lists records and prints agentId on every row (no Agent 类型列)', async () => {
      vi.mocked(marketProvider.listObservability).mockResolvedValue({
        ok: true,
        data: [
          {
            id: '33333333-4444-4555-4666-477777777777',
            agentName: 'nas-01',
            note: null,
            serviceName: 'BSM-22222222-2222-3333-4444-555555555555',
            createdAt: '2026-08-21T10:00:00Z',
          },
        ],
      });

      await runObs(['list']);

      expect(marketProvider.listObservability).toHaveBeenCalledWith('sk-test');
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('#33333333'))).toBe(
        true
      );
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('BSM-22222222'))).toBe(
        true
      );
      // 接入为单一 loongsuite：不打印 agentType
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('hermes'))).toBe(false);
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('openclaw'))).toBe(
        false
      );
    });

    it('prints an empty-list hint with exit code 0', async () => {
      vi.mocked(marketProvider.listObservability).mockResolvedValue({ ok: true, data: [] });

      await runObs(['list']);

      expect(process.exitCode).toBeUndefined();
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('暂无'))).toBe(true);
    });

    it('refreshes a token by agentId and prints dual commands', async () => {
      vi.mocked(marketProvider.renewObservability).mockResolvedValue({
        ok: true,
        data: { serviceName: 'BSM-11111111-2222-3333-4444-555555555555', installCommand: CMD },
      });

      await runObs(['refresh', '11111111-2222-4333-8444-555555555555']);

      expect(marketProvider.renewObservability).toHaveBeenCalledWith(
        '11111111-2222-4333-8444-555555555555',
        'sk-test'
      );
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('os=unix'))).toBe(true);
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('os=windows'))).toBe(
        true
      );
    });

    it('rejects a reserved-keyword agentName locally without any network call', async () => {
      await runObs(['list', '--note', 'x']);

      expect(process.exitCode).toBe(1);
      expect(marketProvider.createObservability).not.toHaveBeenCalled();
      expect(marketProvider.listObservability).not.toHaveBeenCalled();
      expect(marketProvider.renewObservability).not.toHaveBeenCalled();
    });

    it('shows a usage error and skips the network when refresh lacks agentId', async () => {
      await runObs(['refresh']);

      expect(process.exitCode).toBe(1);
      expect(marketProvider.renewObservability).not.toHaveBeenCalled();
    });

    it('hints at login and exits 1 when no API key is configured', async () => {
      vi.mocked(getApiKey).mockReturnValue(null);

      await runObs(['公司机']);

      expect(process.exitCode).toBe(1);
      expect(marketProvider.createObservability).not.toHaveBeenCalled();
      expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('login'))).toBe(true);
    });

    it('adds a login hint on a 401 failure', async () => {
      vi.mocked(marketProvider.createObservability).mockResolvedValue({
        ok: false,
        status: 401,
        message: '未登录',
      });

      await runObs(['公司机']);

      expect(process.exitCode).toBe(1);
      expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('401'))).toBe(true);
      expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('login'))).toBe(true);
    });

    it('adds a not-found hint when refresh hits a 404', async () => {
      vi.mocked(marketProvider.renewObservability).mockResolvedValue({
        ok: false,
        status: 404,
        message: '记录不存在',
      });

      await runObs(['refresh', '11111111-2222-4333-8444-555555555555']);

      expect(process.exitCode).toBe(1);
      expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('记录不存在'))).toBe(
        true
      );
    });

    it('runs the platform install command after confirm (unix host → /bin/sh)', async () => {
      // process.platform 非 win32（测试机即如此）→ detectHostPlatform 返回 'unix'
      vi.mocked(marketProvider.renewObservability).mockResolvedValue({
        ok: true,
        data: { serviceName: 'BSM-11111111-2222-3333-4444-555555555555', installCommand: CMD },
      });
      vi.mocked(p.confirm).mockResolvedValue(true);
      const child = new EventEmitter();
      vi.mocked(spawn).mockReturnValue(child as never);
      setImmediate(() => child.emit('exit', 0));

      await runObs(['install', '11111111-2222-4333-8444-555555555555']);

      expect(marketProvider.renewObservability).toHaveBeenCalledWith(
        '11111111-2222-4333-8444-555555555555',
        'sk-test'
      );
      expect(spawn).toHaveBeenCalledWith('/bin/sh', ['-c', CMD.unix], { stdio: 'inherit' });
      expect(process.exitCode).toBeUndefined();
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('执行完成'))).toBe(
        true
      );
    });

    it('skips execution when the user cancels', async () => {
      vi.mocked(marketProvider.renewObservability).mockResolvedValue({
        ok: true,
        data: { serviceName: 'BSM-11111111-2222-3333-4444-555555555555', installCommand: CMD },
      });
      vi.mocked(p.confirm).mockResolvedValue(false);

      await runObs(['install', '11111111-2222-4333-8444-555555555555']);

      expect(spawn).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('已取消'))).toBe(true);
    });

    it('sets exit code 1 when the install command fails', async () => {
      vi.mocked(marketProvider.renewObservability).mockResolvedValue({
        ok: true,
        data: { serviceName: 'BSM-11111111-2222-3333-4444-555555555555', installCommand: CMD },
      });
      vi.mocked(p.confirm).mockResolvedValue(true);
      const child = new EventEmitter();
      vi.mocked(spawn).mockReturnValue(child as never);
      setImmediate(() => child.emit('exit', 1));

      await runObs(['install', '11111111-2222-4333-8444-555555555555']);

      expect(process.exitCode).toBe(1);
    });
  });

  describe('detectHostPlatform / pickPlatformCommand', () => {
    it('detectHostPlatform 返回 "unix"（测试机非 win32）', () => {
      // 兜底：即便测试机未来迁移到 Windows CI，也保证 unix 分支有断言
      expect(detectHostPlatform()).toBe('unix');
    });

    it('pickPlatformCommand 按 unix 检测结果返回 cmd.unix（显式断言，防平台漂移）', () => {
      expect(pickPlatformCommand(CMD)).toBe(CMD.unix);
    });
  });
});
