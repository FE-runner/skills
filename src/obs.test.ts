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

import { marketProvider } from './providers/market.ts';
import { getApiKey } from './auth.ts';
import { runObs, parseObsOptions } from './obs.ts';

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
    it('parses a create command with agent type and optional note', () => {
      expect(parseObsOptions(['公司机', '--agent', 'hermes', '--note', '主力开发机'])).toEqual({
        help: false,
        subcommand: 'create',
        agentName: '公司机',
        agentType: 'hermes',
        note: '主力开发机',
      });
    });

    it('accepts "add" as an alias for create', () => {
      expect(parseObsOptions(['add', 'nas-01', '--agent', 'openclaw'])).toEqual({
        help: false,
        subcommand: 'create',
        agentName: 'nas-01',
        agentType: 'openclaw',
        note: undefined,
      });
    });

    it('rejects an unsupported --agent enum locally', () => {
      const opts = parseObsOptions(['foo', '--agent', 'nope']);
      expect(opts.subcommand).toBeUndefined();
      expect(opts.error).toContain('不支持的 Agent 类型');
    });

    it('rejects create without a required --agent', () => {
      expect(parseObsOptions(['foo']).error).toContain('--agent');
    });

    it('returns a usage error for refresh without agentId', () => {
      expect(parseObsOptions(['refresh']).error).toContain('agentId');
    });

    it('requires a numeric agentId for refresh', () => {
      expect(parseObsOptions(['refresh', 'abc']).error).toContain('必须是数字');
    });

    it('rejects reserved subcommand keywords used as agentName', () => {
      // "list" 是子命令，不能创建名为 list 的接入记录
      expect(parseObsOptions(['list', '--agent', 'hermes']).error).toContain('list');
      // "refresh" 同理
      expect(parseObsOptions(['add', 'refresh', '--agent', 'hermes']).error).toContain('refresh');
    });
  });

  describe('runObs', () => {
    it('creates a record and prints serviceName + install command', async () => {
      vi.mocked(marketProvider.createObservability).mockResolvedValue({
        ok: true,
        data: {
          id: 7,
          agentType: 'hermes',
          agentName: '公司机',
          serviceName: 'BSM-hermes-7',
          installCommand: 'curl -fsSL "…/install?token=t1&type=hermes" | bash',
        },
      });

      await runObs(['公司机', '--agent', 'hermes']);

      expect(marketProvider.createObservability).toHaveBeenCalledWith(
        { agentType: 'hermes', agentName: '公司机', note: undefined },
        'sk-test'
      );
      expect(process.exitCode).toBeUndefined();
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('BSM-hermes-7'))).toBe(
        true
      );
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('curl -fsSL'))).toBe(
        true
      );
    });

    it('lists records and prints agentId on every row', async () => {
      vi.mocked(marketProvider.listObservability).mockResolvedValue({
        ok: true,
        data: [
          {
            id: 42,
            agentType: 'openclaw',
            agentName: 'nas-01',
            note: null,
            serviceName: 'BSM-openclaw-42',
            createdAt: '2026-08-21T10:00:00Z',
          },
        ],
      });

      await runObs(['list']);

      expect(marketProvider.listObservability).toHaveBeenCalledWith('sk-test');
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('#42'))).toBe(true);
      expect(
        logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('BSM-openclaw-42'))
      ).toBe(true);
    });

    it('prints an empty-list hint with exit code 0', async () => {
      vi.mocked(marketProvider.listObservability).mockResolvedValue({ ok: true, data: [] });

      await runObs(['list']);

      expect(process.exitCode).toBeUndefined();
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('暂无'))).toBe(true);
    });

    it('refreshes a token by agentId', async () => {
      vi.mocked(marketProvider.renewObservability).mockResolvedValue({
        ok: true,
        data: { serviceName: 'BSM-hermes-7', installCommand: 'curl -fsSL …?token=new | bash' },
      });

      await runObs(['refresh', '7']);

      expect(marketProvider.renewObservability).toHaveBeenCalledWith(7, 'sk-test');
      expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('new'))).toBe(true);
    });

    it('rejects a reserved-keyword agentName locally without any network call', async () => {
      await runObs(['list', '--agent', 'hermes']);

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

      await runObs(['公司机', '--agent', 'hermes']);

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

      await runObs(['公司机', '--agent', 'hermes']);

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

      await runObs(['refresh', '999']);

      expect(process.exitCode).toBe(1);
      expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('记录不存在'))).toBe(
        true
      );
    });
  });
});
