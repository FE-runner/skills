import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runTrack } from './track.ts';
import { runCli } from './test-utils.ts';
import { marketProvider } from './providers/market.ts';

vi.mock('./installer.ts', () => ({
  installWellKnownSkillForAgent: vi.fn().mockResolvedValue({
    success: true,
    path: '/tmp/x',
    mode: 'symlink',
  }),
}));

// 用临时 XDG_STATE_HOME 隔离全局 lock，避免污染真实 ~/.agents/.skill-lock.json
const LOCK_DIR = join(tmpdir(), `skills-track-test-${Date.now()}`);
const LOCK_FILE = join(LOCK_DIR, 'skills', '.skill-lock.json');

function writeLock(skills: Record<string, unknown>): void {
  const dir = join(LOCK_DIR, 'skills');
  mkdirSync(dir, { recursive: true });
  writeFileSync(LOCK_FILE, JSON.stringify({ version: 3, skills, dismissed: {} }, null, 2), 'utf-8');
}

function readLock(): { skills: Record<string, unknown> } {
  return JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
}

function marketSkillEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: 'market/demo',
    sourceType: 'market',
    sourceUrl: 'https://skills.example',
    skillFolderHash: 'sha256:1',
    skillPath: 'skill-123',
    version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function marketSkillResult(extra: Record<string, unknown> = {}) {
  return {
    installName: 'demo',
    files: new Map([['SKILL.md', '# demo']]),
    skillId: 'skill-123',
    version: '1.0.0',
    skillFolderHash: 'sha256:2',
    ...extra,
  };
}

describe('track command', () => {
  const prevHome = process.env.XDG_STATE_HOME;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.XDG_STATE_HOME = LOCK_DIR;
    if (existsSync(LOCK_DIR)) rmSync(LOCK_DIR, { recursive: true, force: true });
    fetchMock = vi.fn().mockResolvedValue(marketSkillResult({}));
    vi.spyOn(marketProvider, 'fetchById').mockImplementation(
      fetchMock as unknown as typeof marketProvider.fetchById
    );
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = prevHome;
    if (existsSync(LOCK_DIR)) rmSync(LOCK_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('track list shows on/off/未定夺 states', () => {
    writeLock({
      a: marketSkillEntry({ collectConsent: true }),
      b: marketSkillEntry({ collectConsent: false }),
      c: marketSkillEntry(),
    });
    const out = runCli(['track', 'list'], process.cwd());
    expect(out.stdout).toContain('on');
    expect(out.stdout).toContain('off');
    expect(out.stdout).toContain('未定夺');
  });

  it('track on writes collectConsent=true and fetches with report=true', async () => {
    writeLock({ demo: marketSkillEntry() });
    fetchMock.mockResolvedValue(
      marketSkillResult({ collect: { config: {}, meta: { blueai_signature: 'sig' } } })
    );

    await runTrack(['on', 'demo']);

    expect(fetchMock).toHaveBeenCalledWith('skill-123', '1.0.0', undefined, undefined, true);
    const lock = readLock();
    expect((lock.skills['demo'] as { collectConsent: unknown }).collectConsent).toBe(true);
  });

  it('track off writes collectConsent=false and fetches with report=false', async () => {
    writeLock({ demo: marketSkillEntry({ collectConsent: true }) });

    await runTrack(['off', 'demo']);

    expect(fetchMock).toHaveBeenCalledWith('skill-123', '1.0.0', undefined, undefined, false);
    const lock = readLock();
    expect((lock.skills['demo'] as { collectConsent: unknown }).collectConsent).toBe(false);
  });

  it('track on aborts and does not write lock when author has no collect', async () => {
    writeLock({ demo: marketSkillEntry() });

    await runTrack(['on', 'demo']);

    const lock = readLock();
    expect((lock.skills['demo'] as { collectConsent?: unknown }).collectConsent).toBeUndefined();
  });
});
