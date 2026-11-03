import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketProvider } from './market.ts';

describe('MarketProvider team install', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends id, team, version and report with team priority', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              name: 'team-skill',
              description: 'desc',
              content: '# team-skill',
              installName: 'team-skill',
              sourceUrl: 'https://market',
              version: '2.0.0',
              files: { 'SKILL.md': '# team-skill' },
              skillFolderHash: 'hash',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MarketProvider();
    const result = await provider.fetchById('skill-1', '2.0.0', 'author-1', 'team-1', true);

    expect(result?.version).toBe('2.0.0');
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      id: 'skill-1',
      version: '2.0.0',
      team: 'team-1',
      report: true,
    });
    expect(body).not.toHaveProperty('author');
  });
});
