import { describe, it, expect, vi, afterEach } from 'vitest';
import { MarketProvider } from '../src/providers/market.ts';
import { SKILLS_SITE } from '../src/branding.ts';

describe('MarketProvider observability methods', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchOnce(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('createObservability POSTs to /api/observability/create with bearer token and exact body', async () => {
    const fetchMock = mockFetchOnce({
      code: 'SUCCESS',
      data: {
        id: 7,
        agentType: 'hermes',
        agentName: '公司机',
        serviceName: 'BSM-hermes-7',
        installCommand: 'curl -fsSL "…/install?token=t1&type=hermes" | bash',
      },
    });
    const provider = new MarketProvider();

    const result = await provider.createObservability(
      { agentType: 'hermes', agentName: '公司机' },
      'sk-test'
    );

    expect(result).toEqual({
      ok: true,
      data: {
        id: 7,
        agentType: 'hermes',
        agentName: '公司机',
        serviceName: 'BSM-hermes-7',
        installCommand: 'curl -fsSL "…/install?token=t1&type=hermes" | bash',
      },
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${SKILLS_SITE}/api/observability/create`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      agentType: 'hermes',
      agentName: '公司机',
    });
  });

  it('includes note in the body only when provided', async () => {
    const fetchMock = mockFetchOnce({
      code: 'SUCCESS',
      data: {
        id: 8,
        agentType: 'openclaw',
        agentName: 'nas-01',
        serviceName: 'BSM-openclaw-8',
        installCommand: 'curl …',
      },
    });
    const provider = new MarketProvider();

    await provider.createObservability(
      { agentType: 'openclaw', agentName: 'nas-01', note: '主力机' },
      'sk-test'
    );

    const [_, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.note).toBe('主力机');
  });

  it('listObservability GETs /api/observability/list and returns the raw envelope data array', async () => {
    const fetchMock = mockFetchOnce({
      code: 'SUCCESS',
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
    const provider = new MarketProvider();

    const result = await provider.listObservability('sk-test');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${SKILLS_SITE}/api/observability/list`);
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('renewObservability POSTs { agentId } to /api/observability/renewToken', async () => {
    const fetchMock = mockFetchOnce({
      code: 'SUCCESS',
      data: { serviceName: 'BSM-hermes-7', installCommand: 'curl …?token=new | bash' },
    });
    const provider = new MarketProvider();

    const result = await provider.renewObservability(7, 'sk-test');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${SKILLS_SITE}/api/observability/renewToken`);
    expect(init.method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ agentId: 7 });
    expect(result.ok).toBe(true);
  });

  it('returns a failure result preserving status when the API responds with an error envelope', async () => {
    mockFetchOnce({ code: 'NOT_FOUND', message: '接入记录不存在' }, false, 404);
    const provider = new MarketProvider();

    const result = await provider.renewObservability('999', 'sk-test');

    expect(result).toEqual({
      ok: false,
      status: 404,
      code: 'NOT_FOUND',
      message: '接入记录不存在',
    });
  });

  it('falls back to a status-0 failure on network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
    const provider = new MarketProvider();

    const result = await provider.listObservability('sk-test');

    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(0);
  });
});
