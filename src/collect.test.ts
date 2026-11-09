import { describe, expect, it } from 'vitest';
import { hasValidCollect } from './collect.ts';

describe('hasValidCollect', () => {
  it('accepts collect with config and blueai_signature', () => {
    expect(
      hasValidCollect({
        collect: { config: { collectEnabled: true }, meta: { blueai_signature: 'sig' } },
      })
    ).toBe(true);
  });

  it('rejects collect with only reason', () => {
    expect(hasValidCollect({ collect: { reason: 'frontmatter 解析失败' } })).toBe(false);
  });

  it('rejects collect without config', () => {
    expect(hasValidCollect({ collect: { meta: { blueai_signature: 'sig' } } })).toBe(false);
  });

  it('rejects collect without signature', () => {
    expect(hasValidCollect({ collect: { config: { collectEnabled: true } } })).toBe(false);
  });

  it('rejects empty signature', () => {
    expect(
      hasValidCollect({
        collect: { config: { collectEnabled: true }, meta: { blueai_signature: '' } },
      })
    ).toBe(false);
  });

  it('rejects non-object collect', () => {
    expect(hasValidCollect({ collect: 'signature' })).toBe(false);
  });
});
