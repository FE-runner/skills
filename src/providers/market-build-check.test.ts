import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth.ts', () => ({
  getApiKey: vi.fn(() => 'sk-build-check'),
}));

import { marketProvider } from './market.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 'SUCCESS', message: 'ok', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Market build contract', () => {
  it.each([
    { scope: 'PUBLIC' as const, skillId: 'skill-a' },
    { scope: 'PRIVATE' as const, skillId: 'skill-a', authorId: 'author-a' },
  ])('$scope checkBuildBatch 只发送目标身份且不携带鉴权', async (item) => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        items: Array<Record<string, unknown>>;
      };
      return response({
        items: body.items.map((target) => ({
          ok: true,
          ...target,
          version: '1.0.0',
          observabilityEnabled: false,
          available: true,
        })),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await marketProvider.checkBuildBatch([item]);
    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ items: [item] });
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('TEAM checkBuildBatch 携带鉴权', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        items: [
          {
            ok: true,
            scope: 'TEAM',
            skillId: 'skill-a',
            version: '1.0.0',
            observabilityEnabled: false,
            available: true,
          },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await marketProvider.checkBuildBatch([
      {
        scope: 'TEAM',
        skillId: 'skill-a',
        teamId: 'team-a',
        releaseId: 'release-a',
      },
    ]);
    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-build-check');
  });

  it('checkBuildBatch 遇到空项时返回 fail-closed，而不是抛出 TypeError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          items: [null],
        })
      )
    );

    await expect(
      marketProvider.checkBuildBatch([{ scope: 'PUBLIC', skillId: 'skill-a' }])
    ).resolves.toEqual({
      ok: false,
      status: 0,
      message: 'Market 批量构建检测响应不完整或顺序不一致',
    });
  });

  it('checkBuildBatch 遇到非 boolean ok 时返回 fail-closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          items: [{ ok: 'false', scope: 'PUBLIC', skillId: 'skill-a' }],
        })
      )
    );

    await expect(
      marketProvider.checkBuildBatch([{ scope: 'PUBLIC', skillId: 'skill-a' }])
    ).resolves.toEqual({
      ok: false,
      status: 0,
      message: 'Market 批量构建检测响应不完整或顺序不一致',
    });
  });

  it('观测安装解析 releaseSeq/buildHash', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          name: 'demo',
          description: null,
          content: '# demo',
          installName: 'demo',
          sourceUrl: 'https://market.test',
          version: '1.0.0',
          files: { 'SKILL.md': '# demo' },
          skillFolderHash: 'sha256:legacy',
          observabilityEnabled: true,
          releaseSeq: 4,
          buildHash: 'sha256:build',
        })
      )
    );
    const result = await marketProvider.installById(
      'skill-a',
      '1.0.0',
      undefined,
      undefined,
      undefined,
      4
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        observabilityEnabled: true,
        releaseSeq: 4,
        buildHash: 'sha256:build',
      },
    });
  });

  it('观测响应缺少 buildHash 时 fail-closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          name: 'demo',
          description: null,
          content: '# demo',
          installName: 'demo',
          sourceUrl: 'https://market.test',
          version: '1.0.0',
          files: { 'SKILL.md': '# demo' },
          skillFolderHash: 'sha256:legacy',
          observabilityEnabled: true,
          releaseSeq: 4,
        })
      )
    );
    const result = await marketProvider.installById('skill-a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('fail-closed');
  });
});
