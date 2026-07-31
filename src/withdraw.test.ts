import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./providers/market.ts', () => ({
  marketProvider: {
    resolveMine: vi.fn(),
    withdraw: vi.fn(),
  },
}));
vi.mock('./auth.ts', () => ({
  getApiKey: vi.fn(),
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
