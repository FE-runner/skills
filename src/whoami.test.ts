import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./providers/market.ts', () => ({
  marketProvider: {
    whoami: vi.fn(),
  },
}));
vi.mock('./auth.ts', () => ({
  getApiKey: vi.fn(),
}));

import { marketProvider } from './providers/market.ts';
import { getApiKey } from './auth.ts';
import { runWhoami } from './whoami.ts';

describe('whoami', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.exitCode = undefined;
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
    vi.clearAllMocks();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('prints name/email/role on success', async () => {
    vi.mocked(getApiKey).mockReturnValue('sk-test');
    vi.mocked(marketProvider.whoami).mockResolvedValue({
      ok: true,
      data: { name: '张三', email: 'zhangsan@example.com', role: 'DEVELOPER', isSuperAdmin: false },
    });

    await runWhoami();

    expect(marketProvider.whoami).toHaveBeenCalledWith('sk-test');
    expect(process.exitCode).toBeUndefined();
    expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('张三'))).toBe(true);
    expect(
      logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('zhangsan@example.com'))
    ).toBe(true);
    expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('DEVELOPER'))).toBe(true);
    expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('超级管理员'))).toBe(
      false
    );
  });

  it('shows a "(未设置)" placeholder when email is null', async () => {
    vi.mocked(getApiKey).mockReturnValue('sk-test');
    vi.mocked(marketProvider.whoami).mockResolvedValue({
      ok: true,
      data: { name: '张三', email: null, role: 'USER', isSuperAdmin: false },
    });

    await runWhoami();

    expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('未设置'))).toBe(true);
  });

  it('prints an extra super-admin hint when isSuperAdmin is true', async () => {
    vi.mocked(getApiKey).mockReturnValue('sk-test');
    vi.mocked(marketProvider.whoami).mockResolvedValue({
      ok: true,
      data: { name: 'admin', email: 'admin@example.com', role: 'ADMIN', isSuperAdmin: true },
    });

    await runWhoami();

    expect(logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('超级管理员'))).toBe(
      true
    );
  });

  it('errors and does not call the network when no API key is available', async () => {
    vi.mocked(getApiKey).mockReturnValue(null);

    await runWhoami();

    expect(process.exitCode).toBe(1);
    expect(marketProvider.whoami).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('login'))).toBe(true);
  });

  it('adds a login hint on a 401 failure', async () => {
    vi.mocked(getApiKey).mockReturnValue('sk-invalid');
    vi.mocked(marketProvider.whoami).mockResolvedValue({
      ok: false,
      status: 401,
      message: '未登录',
    });

    await runWhoami();

    expect(process.exitCode).toBe(1);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('401'))).toBe(true);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('login'))).toBe(true);
  });

  it('sets exitCode=1 on a network error (status 0)', async () => {
    vi.mocked(getApiKey).mockReturnValue('sk-test');
    vi.mocked(marketProvider.whoami).mockResolvedValue({
      ok: false,
      status: 0,
      message: 'fetch failed',
    });

    await runWhoami();

    expect(process.exitCode).toBe(1);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('fetch failed'))).toBe(
      true
    );
  });
});
