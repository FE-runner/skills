import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAdd } from './add.ts';
import * as p from '@clack/prompts';
import { marketProvider } from './providers/market.ts';
import { createRecordAndInstallPilot, readLocalPilotStatus } from './obs.ts';
import { getApiKey } from './auth.ts';
import { installWellKnownSkillForAgent } from './installer.ts';
import { addSkillToLock } from './skill-lock.ts';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
  isCancel: vi.fn((value: unknown) => typeof value === 'symbol'),
  log: {
    info: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    step: vi.fn(),
  },
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('./providers/market.ts', () => ({
  marketProvider: {
    resolve: vi.fn(),
    fetchById: vi.fn(),
  },
}));

vi.mock('./obs.ts', () => ({
  readLocalPilotStatus: vi.fn(),
  createRecordAndInstallPilot: vi.fn(),
}));

vi.mock('./auth.ts', () => ({
  getApiKey: vi.fn(),
}));

vi.mock('./installer.ts', async () => {
  const actual = await vi.importActual<typeof import('./installer.ts')>('./installer.ts');
  return {
    ...actual,
    installWellKnownSkillForAgent: vi.fn(),
  };
});

vi.mock('./skill-lock.ts', async () => {
  const actual = await vi.importActual<typeof import('./skill-lock.ts')>('./skill-lock.ts');
  return {
    ...actual,
    addSkillToLock: vi.fn(),
    getSkillFromLock: vi.fn(),
  };
});

vi.mock('./telemetry.ts', () => ({
  setVersion: vi.fn(),
  track: vi.fn(),
}));

vi.mock('../package.json', () => ({
  default: { version: 'test' },
}));

const collect = {
  config: { collectEnabled: true },
  meta: { blueai_signature: 'signature' },
};

function teamSkill(id: string, name: string, includeCollect = true) {
  return {
    name,
    description: '',
    content: '',
    installName: name,
    sourceUrl: `market://${name}`,
    version: '1.0.0',
    files: new Map([['SKILL.md', `# ${name}`]]),
    skillId: id,
    skillFolderHash: `hash-${id}`,
    ...(includeCollect ? { collect } : {}),
  };
}

describe('team install observability confirmation', () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    vi.clearAllMocks();

    vi.mocked(p.confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    vi.mocked(getApiKey).mockReturnValue('sk-test');
    vi.mocked(readLocalPilotStatus).mockReturnValue({
      serviceName: null,
      hasBinary: false,
      isRunning: null,
    });
    vi.mocked(createRecordAndInstallPilot).mockResolvedValue(true);
    vi.mocked(installWellKnownSkillForAgent).mockResolvedValue({
      success: true,
      path: '/tmp/skill',
      mode: 'copy',
    });

    vi.mocked(marketProvider.resolve).mockImplementation(
      async (name: string) =>
        ({
          id: `id-${name}`,
          name,
          currentVersion: '1.0.0',
          authorId: 'author-id',
        }) as never
    );
    vi.mocked(marketProvider.fetchById).mockImplementation(
      async (id: string, _version?: string, _author?: string) =>
        teamSkill(id, String(id).replace(/^id-/, '')) as never
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            data: {
              teamName: 'Team',
              skills: [
                {
                  id: 'id-skill-a',
                  name: 'skill-a',
                  displayName: 'Skill A',
                  currentVersion: '1.0.0',
                  visibility: 'PUBLIC',
                  authorId: 'author-a',
                },
                {
                  id: 'id-skill-b',
                  name: 'skill-b',
                  displayName: 'Skill B',
                  currentVersion: '1.0.0',
                  visibility: 'PUBLIC',
                  authorId: 'author-b',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: originalIsTTY,
    });
  });

  it('asks once after team collection consent and installs Pilot once', async () => {
    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
    });

    const messages = vi.mocked(p.confirm).mock.calls.map(([options]) => options.message);
    expect(messages.some((message) => message.includes('数据采集'))).toBe(true);
    expect(messages.some((message) => message.includes('LoongSuite Pilot'))).toBe(true);
    expect(createRecordAndInstallPilot).toHaveBeenCalledTimes(1);
  });

  it('writes collect consent only to collect-capable team skills', async () => {
    vi.mocked(marketProvider.fetchById).mockImplementation(
      async (id: string, _version?: string, _author?: string) =>
        String(id) === 'id-skill-b'
          ? (teamSkill(id, 'skill-b', false) as never)
          : (teamSkill(id, String(id).replace(/^id-/, '')) as never)
    );

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
    });

    const collectCall = vi.mocked(addSkillToLock).mock.calls.find(([name]) => name === 'skill-a');
    const noCollectCall = vi.mocked(addSkillToLock).mock.calls.find(([name]) => name === 'skill-b');

    expect(collectCall?.[1]).toMatchObject({ collectConsent: true });
    expect(noCollectCall?.[1]).not.toHaveProperty('collectConsent');
  });

  it('keeps non-interactive team installs safe with one Pilot hint', async () => {
    vi.mocked(p.confirm).mockReset();

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
      yes: true,
    });

    const messages = vi
      .mocked(p.log.message)
      .mock.calls.map(([message]) => String(message))
      .filter((message) => message.includes('本机监测插件'));

    expect(messages).toHaveLength(1);
    expect(p.confirm).not.toHaveBeenCalled();
    expect(createRecordAndInstallPilot).not.toHaveBeenCalled();
  });
});
