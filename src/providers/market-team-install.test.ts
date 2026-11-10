import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth.ts', () => ({
  getApiKey: vi.fn(() => 'sk-team-install'),
}));

import { MarketProvider } from './market.ts';

describe('MarketProvider team install', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends id, team, version and releaseId with team priority, without report', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            code: 'SUCCESS',
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
    const result = await provider.fetchById('skill-1', '2.0.0', 'author-1', 'team-1', 'release-1');

    expect(result?.version).toBe('2.0.0');
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      id: 'skill-1',
      version: '2.0.0',
      team: 'team-1',
      releaseId: 'release-1',
    });
    expect(body).not.toHaveProperty('author');
    expect(
      (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization
    ).toBeUndefined();
  });

  it('keeps legacy team install body when releaseId is omitted', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            code: 'SUCCESS',
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

    await new MarketProvider().fetchById('skill-1', '2.0.0', undefined, 'team-1');

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      id: 'skill-1',
      version: '2.0.0',
      team: 'team-1',
    });
    expect(body).not.toHaveProperty('releaseId');
  });

  it('resolves a team single Skill target and preserves the exact query parameters', async () => {
    const target = {
      skillTeamId: 'skill-team / 1',
      teamId: 'team-1',
      teamName: 'Team One',
      skillId: 'skill-1',
      skillName: 'my skill',
      displayName: 'My Skill',
      installVersion: '1.2.3',
      releaseId: 'release-1',
    };
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ code: 'SUCCESS', data: target }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MarketProvider().resolveTeamSkillInstallTarget(
      target.skillTeamId,
      target.skillName
    );

    expect(result).toEqual({ ok: true, data: target });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe('/api/team/skill/installTarget');
    expect(requestedUrl.searchParams.get('id')).toBe(target.skillTeamId);
    expect(requestedUrl.searchParams.get('name')).toBe(target.skillName);
  });

  it('preserves resolver 409 status and message', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            code: 'CONFLICT',
            message: 'Team Skill 名称已变化，请重新复制安装命令',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MarketProvider().resolveTeamSkillInstallTarget(
      'skill-team-1',
      'old-name'
    );

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      code: 'CONFLICT',
      message: 'Team Skill 名称已变化，请重新复制安装命令',
    });
  });

  it('preserves resolver 404 status and message', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Team Skill not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MarketProvider().resolveTeamSkillInstallTarget(
      'missing-team-skill',
      'demo'
    );

    expect(result).toMatchObject({
      ok: false,
      status: 404,
      code: 'NOT_FOUND',
      message: 'Team Skill not found',
    });
  });
});
