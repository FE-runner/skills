import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { marketProvider, parseRetryAfterMs, computeRetryDelayMs } from './providers/market.ts';

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const SUCCESS_BODY = {
  code: 'SUCCESS',
  data: { name: '张三', email: null, role: 'USER', isSuperAdmin: false },
};
const UNAVAILABLE_BODY = { code: 'SERVICE_UNAVAILABLE', message: '中央解析不可用', data: null };

describe('parseRetryAfterMs', () => {
  it('parses delay-seconds', () => {
    expect(parseRetryAfterMs('120')).toBe(120_000);
  });

  it('treats zero as immediate retry', () => {
    expect(parseRetryAfterMs('0')).toBe(0);
  });

  it('parses an HTTP-date in the future', () => {
    const future = new Date(Date.now() + 5_000).toUTCString();
    const parsed = parseRetryAfterMs(future);
    expect(parsed).not.toBeNull();
    expect(parsed!).toBeGreaterThan(3_000);
    expect(parsed!).toBeLessThanOrEqual(5_000);
  });

  it('clamps an expired HTTP-date to zero', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfterMs(past)).toBe(0);
  });

  it('returns null for missing or invalid values', () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
    expect(parseRetryAfterMs('   ')).toBeNull();
    expect(parseRetryAfterMs('soon')).toBeNull();
  });
});

describe('computeRetryDelayMs', () => {
  it('falls back to the base backoff when Retry-After is missing', () => {
    expect(computeRetryDelayMs(0, null)).toBeGreaterThanOrEqual(500);
    expect(computeRetryDelayMs(0, null)).toBeLessThanOrEqual(750);
    expect(computeRetryDelayMs(1, null)).toBeGreaterThanOrEqual(1000);
    expect(computeRetryDelayMs(1, null)).toBeLessThanOrEqual(1250);
  });

  it('keeps the last base tier for attempts beyond the schedule', () => {
    expect(computeRetryDelayMs(9, null)).toBeGreaterThanOrEqual(1000);
    expect(computeRetryDelayMs(9, null)).toBeLessThanOrEqual(1250);
  });

  it('prefers Retry-After but caps a single wait at 10s (+ jitter)', () => {
    const delay = computeRetryDelayMs(0, 30_000);
    expect(delay).toBeGreaterThanOrEqual(10_000);
    expect(delay).toBeLessThanOrEqual(10_250);
  });

  it('clamps negative Retry-After to a jitter-only wait', () => {
    const delay = computeRetryDelayMs(0, -1);
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThanOrEqual(250);
  });
});

describe('requestApiResult 503 有界重试', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
  });

  it('retries a 503 and succeeds, printing retry progress', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, UNAVAILABLE_BODY))
      .mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));
    vi.stubGlobal('fetch', fetchMock);

    const pending = marketProvider.whoami('sk-central');
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('正在重试'))).toBe(
      true
    );
  });

  it('stops after 2 retries (3 attempts) and surfaces 503 with Retry-After', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(503, UNAVAILABLE_BODY, { 'retry-after': '2' }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = marketProvider.whoami('sk-central');
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.retryAfterSeconds).toBe(2);
    }
  });

  it('does not retry a 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { code: 'UNAUTHORIZED', message: 'invalid key' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await marketProvider.whoami('sk-bad');

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 403', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(403, { code: 'FORBIDDEN', message: 'revoked key' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await marketProvider.whoami('sk-revoked');

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
