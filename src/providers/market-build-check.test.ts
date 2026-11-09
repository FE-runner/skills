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
  it('checkBuildBatch 只发送目标身份并保留顺序', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        items: [
          {
            ok: true,
            scope: 'PUBLIC',
            skillId: 'skill-a',
            version: '1.0.0',
            observabilityEnabled: false,
            available: true,
          },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await marketProvider.checkBuildBatch([{ scope: 'PUBLIC', skillId: 'skill-a' }]);
    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      items: [{ scope: 'PUBLIC', skillId: 'skill-a' }],
    });
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
