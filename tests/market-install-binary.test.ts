/**
 * Provider 侧：市场 install 响应中的 binaryFiles（标准 Base64）解码为原始字节。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { MarketProvider } from '../src/providers/market.ts';

/** 原始 PNG 文件头：89 50 4e 47 0d 0a 1a 0a */
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 一份最小可用的 install 响应体（除 files/binaryFiles 外字段齐全） */
function installData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'jq-research-mcp-suite',
    description: 'test skill',
    content: '---\nname: jq-research-mcp-suite\ndescription: test skill\n---\n',
    installName: 'jq-research-mcp-suite',
    sourceUrl: 'https://example.com/skill',
    version: '1.0.0',
    files: { 'SKILL.md': '---\nname: jq-research-mcp-suite\ndescription: test skill\n---\n' },
    skillFolderHash: 'raw:abc123',
    ...overrides,
  };
}

describe('MarketProvider install binaryFiles', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchOnce(data: Record<string, unknown>): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 'SUCCESS', message: 'success', data }),
      })
    );
  }

  it('decodes binaryFiles into raw bytes, preserving the PNG header byte-for-byte', async () => {
    mockFetchOnce(
      installData({
        binaryFiles: {
          'assets/BlueFocusAI.png': PNG_HEADER.toString('base64'),
          'scripts/__pycache__/mod.cpython-311.pyc': Buffer.from([0x00, 0xff, 0x42]).toString(
            'base64'
          ),
        },
      })
    );

    const skill = await new MarketProvider().fetchById('skill-1');

    expect(skill).not.toBeNull();
    const png = skill!.files.get('assets/BlueFocusAI.png');
    expect(png).toBeInstanceOf(Uint8Array);
    expect(Array.from(png as Uint8Array)).toEqual(Array.from(PNG_HEADER));

    const pyc = skill!.files.get('scripts/__pycache__/mod.cpython-311.pyc');
    expect(Array.from(pyc as Uint8Array)).toEqual([0x00, 0xff, 0x42]);
    expect(skill!.binaryFileErrors).toBeUndefined();
  });

  it('keeps the file set unchanged when the response has no binaryFiles field', async () => {
    mockFetchOnce(installData());

    const skill = await new MarketProvider().fetchById('skill-1');

    expect(skill).not.toBeNull();
    expect(Array.from(skill!.files.keys())).toEqual(['SKILL.md']);
    expect(typeof skill!.files.get('SKILL.md')).toBe('string');
    expect(skill!.binaryFileErrors).toBeUndefined();
    // 不含二进制时行为与本次变更前一致：全部为字符串
    expect(Array.from(skill!.files.values()).every((v) => typeof v === 'string')).toBe(true);
  });

  it('records invalid base64 entries instead of putting garbage into the file set', async () => {
    mockFetchOnce(
      installData({
        binaryFiles: {
          'assets/bad.png': 'not-base64!!',
          'assets/truncated.png': 'iVBORw0KGgo',
        },
      })
    );

    const skill = await new MarketProvider().fetchById('skill-1');

    expect(skill).not.toBeNull();
    expect(skill!.binaryFileErrors).toHaveLength(2);
    expect(skill!.binaryFileErrors![0]).toContain('assets/bad.png');
    expect(skill!.binaryFileErrors![1]).toContain('assets/truncated.png');
    expect(skill!.files.has('assets/bad.png')).toBe(false);
    expect(skill!.files.has('assets/truncated.png')).toBe(false);
  });

  it('treats an empty decoded payload as invalid', async () => {
    mockFetchOnce(installData({ binaryFiles: { 'assets/empty.png': '' } }));

    const skill = await new MarketProvider().fetchById('skill-1');

    expect(skill!.binaryFileErrors).toHaveLength(1);
    expect(skill!.binaryFileErrors![0]).toContain('assets/empty.png');
    expect(skill!.files.has('assets/empty.png')).toBe(false);
  });

  it('lets binaryFiles win on a same-path collision (defensive only)', async () => {
    mockFetchOnce(
      installData({
        files: { 'a.bin': 'text content' },
        binaryFiles: { 'a.bin': Buffer.from([0x01, 0x02]).toString('base64') },
      })
    );

    const skill = await new MarketProvider().fetchById('skill-1');

    expect(skill!.files.get('a.bin')).toBeInstanceOf(Uint8Array);
    expect(Array.from(skill!.files.get('a.bin') as Uint8Array)).toEqual([0x01, 0x02]);
  });

  it('keeps skillFolderHash as returned, without recomputing it', async () => {
    mockFetchOnce(
      installData({
        binaryFiles: { 'assets/BlueFocusAI.png': PNG_HEADER.toString('base64') },
        skillFolderHash: 'raw:deadbeef',
      })
    );

    const skill = await new MarketProvider().fetchById('skill-1');

    expect(skill!.skillFolderHash).toBe('raw:deadbeef');
  });
});
