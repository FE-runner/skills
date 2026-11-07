import { describe, expect, it } from 'vitest';

import { computeBuildHash } from './build-hash.ts';

describe('computeBuildHash', () => {
  it('稳定覆盖文本、二进制和顺序变化', () => {
    const files = new Map<string, string | Uint8Array>([
      ['SKILL.md', '# demo\n'],
      ['assets/logo.bin', new Uint8Array([0, 1, 255])],
    ]);
    const reversed = new Map([...files].reverse());
    expect(computeBuildHash(files)).toBe(computeBuildHash(reversed));
    expect(computeBuildHash(files)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('路径和内容变化都会改变 hash', () => {
    const base = computeBuildHash(new Map([['SKILL.md', 'a']]));
    expect(computeBuildHash(new Map([['SKILL.md', 'b']]))).not.toBe(base);
    expect(computeBuildHash(new Map([['nested/SKILL.md', 'a']]))).not.toBe(base);
  });

  it('长度前缀消除冒号和换行路径歧义', () => {
    const left = computeBuildHash(
      new Map([
        ['a:b', 'one'],
        ['c', 'two'],
      ])
    );
    const right = computeBuildHash(
      new Map([
        ['a', 'one'],
        ['b\nc', 'two'],
      ])
    );
    expect(left).not.toBe(right);
  });

  it('拒绝绝对路径与上级目录', () => {
    expect(() => computeBuildHash(new Map([['/SKILL.md', 'x']]))).toThrow();
    expect(() => computeBuildHash(new Map([['../SKILL.md', 'x']]))).toThrow();
  });
});
