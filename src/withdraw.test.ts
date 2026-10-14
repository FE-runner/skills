import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./providers/market.ts', () => ({
  marketProvider: {
    resolveMine: vi.fn(),
    withdraw: vi.fn(),
  },
}));
vi.mock('./auth.ts', () => ({
  getApiKey: vi.fn(),
  API_KEY_MISSING_HINT:
    '请先运行 `skills login <api-key>`，或设置 SKILLS_API_KEY / BLUEAI_API_KEY 环境变量',
}));

import { marketProvider } from './providers/market.ts';
import { getApiKey } from './auth.ts';
import { runWithdraw, parseWithdrawOptions } from './withdraw.ts';

describe('withdraw', () => {
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

  describe('parseWithdrawOptions', () => {
    it('accepts a single positional name', () => {
      expect(parseWithdrawOptions(['my-skill'])).toEqual({ name: 'my-skill' });
    });

    it('reports the first unknown -- option, not silently ignoring it', () => {
      expect(parseWithdrawOptions(['my-skill', '--team', 'team-a'])).toEqual({
        name: 'my-skill',
        unknownOption: '--team',
      });
    });

    it('accepts --api-key as a single-call override', () => {
      expect(parseWithdrawOptions(['my-skill', '--api-key', 'sk-flag'])).toEqual({
        name: 'my-skill',
        apiKey: 'sk-flag',
      });
    });

    it('still reports other unknown -- options after --api-key', () => {
      expect(parseWithdrawOptions(['my-skill', '--api-key', 'sk-flag', '--team', 'x'])).toEqual({
        name: 'my-skill',
        apiKey: 'sk-flag',
        unknownOption: '--team',
      });
    });

    it('reports an error when --api-key has no value', () => {
      const opts = parseWithdrawOptions(['my-skill', '--api-key']);
      expect(opts.error).toBeDefined();
      expect(opts.apiKey).toBeUndefined();
    });

    it('reports an error when --api-key is followed by another option', () => {
      const opts = parseWithdrawOptions(['my-skill', '--api-key', '--team', 'x']);
      expect(opts.error).toBeDefined();
      expect(opts.apiKey).toBeUndefined();
    });
  });

  it('rejects a malformed --api-key before any network request', async () => {
    await runWithdraw(['my-skill', '--api-key']);

    expect(process.exitCode).toBe(1);
    expect(marketProvider.resolveMine).not.toHaveBeenCalled();
  });

  it('treats a 403 from resolveMine as an auth/permission failure, not "not found"', async () => {
    vi.mocked(marketProvider.resolveMine).mockResolvedValue({
      ok: false,
      status: 403,
      message: 'Key 已撤销',
    });

    await runWithdraw(['my-skill']);

    expect(process.exitCode).toBe(1);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('403'))).toBe(true);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('未找到'))).toBe(false);
  });

  it('treats a 500 from resolveMine as a server error, not "not found" or "auth failed"', async () => {
    vi.mocked(marketProvider.resolveMine).mockResolvedValue({
      ok: false,
      status: 500,
      message: 'boom',
    });

    await runWithdraw(['my-skill']);

    expect(process.exitCode).toBe(1);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('500'))).toBe(true);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('未找到'))).toBe(false);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('login'))).toBe(false);
  });

  it('passes --api-key through to the resolver as a single-call override', async () => {
    vi.mocked(marketProvider.resolveMine).mockResolvedValue({
      ok: false,
      status: 404,
      message: 'Skill不存在',
    });

    await runWithdraw(['my-skill', '--api-key', 'sk-flag']);

    expect(vi.mocked(getApiKey)).toHaveBeenCalledWith({ flagKey: 'sk-flag' });
    expect(marketProvider.resolveMine).toHaveBeenCalledWith('my-skill', 'sk-test');
  });

  it('treats a 503 from resolveMine as service-unavailable, not "not found" or "auth failed"', async () => {
    vi.mocked(marketProvider.resolveMine).mockResolvedValue({
      ok: false,
      status: 503,
      message: '中央解析不可用',
      retryAfterSeconds: 3,
    });

    await runWithdraw(['my-skill']);

    expect(process.exitCode).toBe(1);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('服务暂不可用'))).toBe(
      true
    );
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('未找到'))).toBe(false);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('login'))).toBe(false);
  });

  it('withdraws successfully: resolves then withdraws, printing the new state', async () => {
    vi.mocked(marketProvider.resolveMine).mockResolvedValue({
      ok: true,
      data: { id: 'skill-1', name: 'my-skill', currentVersion: '1.0.0', authorId: 'u1' },
    });
    vi.mocked(marketProvider.withdraw).mockResolvedValue({
      ok: true,
      data: { status: 'APPROVED', visibility: 'PRIVATE' },
    });

    await runWithdraw(['my-skill']);

    expect(marketProvider.resolveMine).toHaveBeenCalledWith('my-skill', 'sk-test');
    expect(marketProvider.withdraw).toHaveBeenCalledWith('skill-1', 'sk-test');
    expect(process.exitCode).toBeUndefined();
  });

  it('rejects unknown options without making any network request', async () => {
    await runWithdraw(['my-skill', '--team', 'team-a']);

    expect(process.exitCode).toBe(1);
    expect(marketProvider.resolveMine).not.toHaveBeenCalled();
    expect(marketProvider.withdraw).not.toHaveBeenCalled();
  });

  it('shows a usage hint and exits 1 when name is missing', async () => {
    await runWithdraw([]);

    expect(process.exitCode).toBe(1);
    expect(marketProvider.resolveMine).not.toHaveBeenCalled();
  });

  it('treats a 401 from resolveMine as a login prompt, not "not found"', async () => {
    vi.mocked(marketProvider.resolveMine).mockResolvedValue({
      ok: false,
      status: 401,
      message: '未登录',
    });

    await runWithdraw(['my-skill']);

    expect(process.exitCode).toBe(1);
    expect(marketProvider.withdraw).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('login'))).toBe(true);
  });

  it('treats a network error (status 0) from resolveMine distinctly from "not found"', async () => {
    vi.mocked(marketProvider.resolveMine).mockResolvedValue({
      ok: false,
      status: 0,
      message: 'fetch failed',
    });

    await runWithdraw(['my-skill']);

    expect(process.exitCode).toBe(1);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('网络异常'))).toBe(
      true
    );
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('未找到'))).toBe(false);
  });

  it('treats other resolveMine failures as "skill not found"', async () => {
    vi.mocked(marketProvider.resolveMine).mockResolvedValue({
      ok: false,
      status: 404,
      message: 'Skill不存在',
    });

    await runWithdraw(['unknown-name']);

    expect(process.exitCode).toBe(1);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('未找到'))).toBe(true);
  });

  it('surfaces a non-PENDING failure from the withdraw call itself', async () => {
    vi.mocked(marketProvider.resolveMine).mockResolvedValue({
      ok: true,
      data: { id: 'skill-1', name: 'my-skill', currentVersion: '1.0.0', authorId: 'u1' },
    });
    vi.mocked(marketProvider.withdraw).mockResolvedValue({
      ok: false,
      status: 400,
      message: 'Skill 当前状态不支持撤回',
    });

    await runWithdraw(['my-skill']);

    expect(process.exitCode).toBe(1);
    expect(
      errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('Skill 当前状态不支持撤回'))
    ).toBe(true);
  });

  it('errors when no API key is available', async () => {
    vi.mocked(getApiKey).mockReturnValue(null);

    await runWithdraw(['my-skill']);

    expect(process.exitCode).toBe(1);
    expect(marketProvider.resolveMine).not.toHaveBeenCalled();
  });
});
