import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runTrack } from './track.ts';
import { runCli } from './test-utils.ts';
import * as p from '@clack/prompts';

const LOCK_DIR = join(tmpdir(), `skills-track-test-${Date.now()}`);
const LOCK_FILE = join(LOCK_DIR, 'skills', '.skill-lock.json');

function writeLock(skills: Record<string, unknown>): void {
  const dir = join(LOCK_DIR, 'skills');
  mkdirSync(dir, { recursive: true });
  writeFileSync(LOCK_FILE, JSON.stringify({ version: 3, skills, dismissed: {} }, null, 2), 'utf-8');
}

function readLock(): { skills: Record<string, Record<string, unknown>> } {
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

describe('track command', () => {
  const prevHome = process.env.XDG_STATE_HOME;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.XDG_STATE_HOME = LOCK_DIR;
    if (existsSync(LOCK_DIR)) rmSync(LOCK_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = prevHome;
    if (existsSync(LOCK_DIR)) rmSync(LOCK_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('track list shows consent states', () => {
    writeLock({
      a: marketSkillEntry({ collectConsent: true }),
      b: marketSkillEntry({ collectConsent: false }),
      c: marketSkillEntry(),
    });

    const out = runCli(['track', 'list'], process.cwd());

    expect(out.stdout).toContain('同意统计');
    expect(out.stdout).toContain('拒绝统计');
    expect(out.stdout).toContain('未定夺');
    expect(out.stdout).not.toContain('监测版');
    expect(out.stdout).not.toContain('原版');
  });

  it('track on only writes collectConsent=true and preserves all other lock fields', async () => {
    const before = marketSkillEntry({
      source: 'market/team/team-a/demo',
      teamId: 'team-a',
      skillTeamId: 'skill-team-a',
      releaseId: 'release-a',
      teamSkillName: 'release-name',
      sourceUrl: 'https://skills.example/team',
      skillFolderHash: 'sha256:unchanged',
      version: '9.9.9',
    });
    writeLock({ demo: before });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const successSpy = vi.spyOn(p.log, 'success');

    await runTrack(['on', 'demo']);

    const after = readLock().skills.demo!;
    expect(after).toEqual({ ...before, collectConsent: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('安装文件与版本未改变'));
  });

  it('track off only writes collectConsent=false', async () => {
    writeLock({ demo: marketSkillEntry({ collectConsent: true }) });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await runTrack(['off', 'demo']);

    expect(readLock().skills.demo?.collectConsent).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('track list and toggles preserve team context', async () => {
    writeLock({
      demo: marketSkillEntry({
        teamId: 'team-a',
        source: 'market/team/team-a/demo',
      }),
    });

    const output = runCli(['track', 'list'], process.cwd());
    expect(output.stdout).toContain('t_team-a/demo');

    await runTrack(['on', 't_team-a/demo']);
    await runTrack(['off', 't_team-a/demo']);
    await runTrack(['on', 't_team-a/demo']);

    const entry = readLock().skills.demo;
    expect(entry).toMatchObject({
      teamId: 'team-a',
      source: 'market/team/team-a/demo',
      version: '1.0.0',
      skillFolderHash: 'sha256:1',
      collectConsent: true,
    });
  });

  it('track toggles preserve team single Skill release context', async () => {
    writeLock({
      demo: marketSkillEntry({
        teamId: 'team-a',
        skillTeamId: 'skill-team-a',
        releaseId: 'release-a',
        teamSkillName: 'release-name',
        source: 'ts_skill-team-a/release-name',
      }),
    });

    const output = runCli(['track', 'list'], process.cwd());
    expect(output.stdout).toContain('ts_skill-team-a/release-name');

    await runTrack(['on', 'ts_skill-team-a/release-name']);

    expect(readLock().skills.demo).toMatchObject({
      teamId: 'team-a',
      skillTeamId: 'skill-team-a',
      releaseId: 'release-a',
      teamSkillName: 'release-name',
      source: 'ts_skill-team-a/release-name',
      collectConsent: true,
    });
  });

  it('reports an error when the global lock entry does not exist', async () => {
    writeLock({});
    const errorSpy = vi.spyOn(p.log, 'error');

    await runTrack(['on', 'missing']);

    const errors = errorSpy.mock.calls.map(([message]) => String(message));
    expect(errors.some((message) => message.includes('未在全局 lock 中找到'))).toBe(true);
    expect(readLock().skills).toEqual({});
  });
});
