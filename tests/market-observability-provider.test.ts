import { describe, it, expect, vi, afterEach } from 'vitest';
import { MarketProvider } from '../src/providers/market.ts';
import { SKILLS_SITE } from '../src/branding.ts';

const CMD = {
  unix: 'curl -fsSL "…/install?token=t1&os=unix" | bash',
  windows:
    'Invoke-WebRequest -Uri "…/install?token=t1&os=windows" -OutFile "$env:TEMP\\skills-obs.ps1" -UseBasicParsing; powershell -ExecutionPolicy Bypass -File "$env:TEMP\\skills-obs.ps1"',
};

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

  it('createObservability POSTs to /api/observability/create with bearer token and exact body (no agentType)', async () => {
    const fetchMock = mockFetchOnce({
      code: 'SUCCESS',
      data: {
        id: 7,
        agentName: '公司机',
        serviceName: 'BSM-11111111-2222-3333-4444-555555555555',
        installCommand: CMD,
        installScript: CMD,
      },
    });
    const provider = new MarketProvider();

    const result = await provider.createObservability({ agentName: '公司机' }, 'sk-test');

    expect(result).toEqual({
      ok: true,
      data: {
        id: 7,
        agentName: '公司机',
        serviceName: 'BSM-11111111-2222-3333-4444-555555555555',
        installCommand: CMD,
        installScript: CMD,
      },
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${SKILLS_SITE}/api/observability/create`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      agentName: '公司机',
    });
  });

  it('includes note in the body only when provided', async () => {
    const fetchMock = mockFetchOnce({
      code: 'SUCCESS',
      data: {
        id: 8,
        agentName: 'nas-01',
        serviceName: 'BSM-33333333-2222-3333-4444-555555555555',
        installCommand: CMD,
        installScript: CMD,
      },
    });
    const provider = new MarketProvider();

    await provider.createObservability({ agentName: 'nas-01', note: '主力机' }, 'sk-test');

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
          agentName: 'nas-01',
          note: null,
          serviceName: 'BSM-33333333-2222-3333-4444-555555555555',
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
      data: { serviceName: 'BSM-11111111-2222-3333-4444-555555555555', installCommand: CMD },
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

  describe('fetchById report / collect', () => {
    const INSTALL_URL = `${SKILLS_SITE}/api/skill/install`;
    const bg = {
      code: 'SUCCESS',
      data: {
        name: 'demo',
        description: 'd',
        installName: 'demo',
        sourceUrl: 'https://example.com',
        version: '1.0.0',
        files: { 'SKILL.md': '# demo' },
        skillFolderHash: 'sha256:x',
      },
    };

    function mockBody(fetchMock: ReturnType<typeof vi.fn>) {
      return JSON.parse(
        (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body as string
      ) as Record<string, string>;
    }

    it('sends report=true when report option is passed', async () => {
      const fetchMock = mockFetchOnce(bg);
      const provider = new MarketProvider();

      await provider.fetchById('id-1', undefined, undefined, undefined, true);

      expect(fetchMock.mock.calls[0]?.[0]).toBe(INSTALL_URL);
      expect(mockBody(fetchMock)).toEqual({ id: 'id-1', report: 'true' });
    });

    it('omits report when report option is not passed (backward compatible)', async () => {
      const fetchMock = mockFetchOnce(bg);
      const provider = new MarketProvider();

      await provider.fetchById('id-1');

      expect(mockBody(fetchMock)).toEqual({ id: 'id-1' });
    });

    it('surfaces collect on the returned MarketSkill when present', async () => {
      const collect = { config: { collectEnabled: true }, meta: { blueai_signature: 'sig' } };
      const fetchMock = mockFetchOnce({ ...bg, data: { ...bg.data, collect } });
      const provider = new MarketProvider();

      const skill = await provider.fetchById('id-1', undefined, undefined, undefined, true);

      expect(skill?.collect).toEqual(collect);
    });

    it('omits collect when the install response has none (author not collecting)', async () => {
      mockFetchOnce(bg);
      const provider = new MarketProvider();

      const skill = await provider.fetchById('id-1');

      expect(skill).not.toHaveProperty('collect');
      expect(skill?.collect).toBeUndefined();
    });
  });
});
