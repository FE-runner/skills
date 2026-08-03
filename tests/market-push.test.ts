import { describe, it, expect, vi, afterEach } from 'vitest';
import { MarketProvider } from '../src/providers/market.ts';

describe('MarketProvider.push', () => {
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

  it('does not include visibility field when omitted', async () => {
    const fetchMock = mockFetchOnce({
      code: 'SUCCESS',
      data: {
        id: 's1',
        name: 'my-skill',
        currentVersion: '0.0.1',
        visibility: 'PRIVATE',
        status: 'APPROVED',
      },
    });
    const provider = new MarketProvider();

    await provider.push('---\nname: my-skill\n---\nbody', [], undefined, 'sk-test');

    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody).not.toHaveProperty('visibility');
  });

  it('includes visibility: PUBLIC when passed', async () => {
    const fetchMock = mockFetchOnce({
      code: 'SUCCESS',
      data: {
        id: 's1',
        name: 'my-skill',
        currentVersion: '',
        visibility: 'PUBLIC',
        status: 'PENDING',
      },
    });
    const provider = new MarketProvider();

    await provider.push('---\nname: my-skill\n---\nbody', [], undefined, 'sk-test', 'PUBLIC');

    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.visibility).toBe('PUBLIC');
  });
});
