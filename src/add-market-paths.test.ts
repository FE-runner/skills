import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as p from '@clack/prompts';
import { handleMarketSkill } from './add.ts';
import { marketProvider } from './providers/market.ts';
import { installWellKnownSkillForAgent } from './installer.ts';
import { addSkillToLock } from './skill-lock.ts';
import { addSkillToLocalLock } from './local-lock.ts';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
  isCancel: vi.fn((value: unknown) => typeof value === 'symbol'),
  log: { info: vi.fn(), message: vi.fn(), error: vi.fn(), warn: vi.fn(), step: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock('./providers/market.ts', () => ({
  marketProvider: {
    resolve: vi.fn(),
    resolveTeamSkillInstallTarget: vi.fn(),
    fetchById: vi.fn(),
  },
}));

vi.mock('./installer.ts', async () => {
  const actual = await vi.importActual<typeof import('./installer.ts')>('./installer.ts');
  return {
    ...actual,
    installWellKnownSkillForAgent: vi.fn().mockResolvedValue({
      success: true,
      path: '/tmp/market-skill',
      mode: 'copy',
    }),
  };
});

vi.mock('./local-lock.ts', () => ({
  addSkillToLocalLock: vi.fn(),
  computeSkillFolderHash: vi.fn().mockResolvedValue('local-hash'),
}));

vi.mock('./skill-lock.ts', async () => {
  const actual = await vi.importActual<typeof import('./skill-lock.ts')>('./skill-lock.ts');
  return {
    ...actual,
    addSkillToLock: vi.fn(),
  };
});

vi.mock('./obs.ts', () => ({
  readLocalPilotStatus: vi.fn(() => ({ serviceName: null, hasBinary: false, isRunning: null })),
  createRecordAndInstallPilot: vi.fn(),
}));

vi.mock('./auth.ts', () => ({ getApiKey: vi.fn(() => null) }));
vi.mock('./telemetry.ts', () => ({ track: vi.fn(), setVersion: vi.fn() }));
vi.mock('../package.json', () => ({ default: { version: 'test' } }));

function marketSkill(name = 'demo', extra: Record<string, unknown> = {}) {
  return {
    name,
    description: 'desc',
    content: '# demo',
    installName: name,
    sourceUrl: 'https://market',
    version: '1.0.0',
    files: new Map([['SKILL.md', '# demo']]),
    skillId: `id-${name}`,
    skillFolderHash: 'hash',
    ...extra,
  };
}

function teamTarget() {
  return {
    skillTeamId: 'skill-team-1',
    teamId: 'team-1',
    teamName: 'Team One',
    skillId: 'id-team-skill',
    skillName: 'team-skill',
    displayName: 'Team Skill',
    installVersion: '1.2.3',
    releaseId: 'release-1',
  };
}

describe('market install paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(marketProvider.fetchById).mockResolvedValue(marketSkill() as never);
  });

  it('keeps public bare-name resolve and install behavior', async () => {
    vi.mocked(marketProvider.resolve).mockResolvedValue({
      id: 'id-demo',
      name: 'demo',
      currentVersion: '1.0.0',
      authorId: 'author-id',
    });

    await handleMarketSkill(
      'demo',
      { type: 'market', url: 'demo', marketName: 'demo' },
      { agent: ['claude-code'], yes: true, copy: true, global: false },
      p.spinner()
    );

    expect(marketProvider.resolve).toHaveBeenCalledWith('demo', undefined);
    expect(marketProvider.fetchById).toHaveBeenCalledWith(
      'id-demo',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );
    expect(installWellKnownSkillForAgent).toHaveBeenCalled();
  });

  it('keeps private author/name resolve and install behavior', async () => {
    vi.mocked(marketProvider.resolve).mockResolvedValue({
      id: 'id-demo',
      name: 'demo',
      currentVersion: '1.0.0',
      authorId: 'author-id',
    });

    await handleMarketSkill(
      'author-id/demo',
      {
        type: 'market',
        url: 'author-id/demo',
        marketName: 'demo',
        marketAuthor: 'author-id',
      },
      { agent: ['claude-code'], yes: true, copy: true, global: false },
      p.spinner()
    );

    expect(marketProvider.resolve).toHaveBeenCalledWith('demo', 'author-id');
    expect(marketProvider.fetchById).toHaveBeenCalledWith(
      'id-demo',
      undefined,
      'author-id',
      undefined,
      undefined,
      undefined
    );
  });

  it('resolves and installs a release-bound team single Skill without name resolve', async () => {
    vi.mocked(marketProvider.resolveTeamSkillInstallTarget).mockResolvedValue({
      ok: true,
      data: teamTarget(),
    });

    await handleMarketSkill(
      'ts_skill-team-1/team-skill',
      {
        type: 'market',
        url: 'ts_skill-team-1/team-skill',
        marketName: 'team-skill',
        marketAuthor: 'ts_skill-team-1',
      },
      { agent: ['claude-code'], yes: true, copy: true, global: false },
      p.spinner()
    );

    expect(marketProvider.resolveTeamSkillInstallTarget).toHaveBeenCalledWith(
      'skill-team-1',
      'team-skill'
    );
    expect(marketProvider.resolve).not.toHaveBeenCalled();
    expect(marketProvider.fetchById).toHaveBeenCalledWith(
      'id-team-skill',
      '1.2.3',
      undefined,
      'team-1',
      undefined,
      'release-1'
    );
    expect(addSkillToLocalLock).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({
        source: 'ts_skill-team-1/team-skill',
        teamId: 'team-1',
        skillTeamId: 'skill-team-1',
        releaseId: 'release-1',
        teamSkillName: 'team-skill',
        version: '1.0.0',
      }),
      expect.any(String)
    );
  });

  it('writes release-bound team context to the global lock', async () => {
    vi.mocked(marketProvider.resolveTeamSkillInstallTarget).mockResolvedValue({
      ok: true,
      data: teamTarget(),
    });

    await handleMarketSkill(
      'ts_skill-team-1/team-skill',
      {
        type: 'market',
        url: 'ts_skill-team-1/team-skill',
        marketName: 'team-skill',
        marketAuthor: 'ts_skill-team-1',
      },
      {
        agent: ['claude-code'],
        yes: true,
        copy: true,
        global: true,
        skipPilotStatus: true,
      },
      p.spinner()
    );

    expect(addSkillToLock).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({
        source: 'ts_skill-team-1/team-skill',
        teamId: 'team-1',
        skillTeamId: 'skill-team-1',
        releaseId: 'release-1',
        teamSkillName: 'team-skill',
        version: '1.0.0',
      })
    );
  });

  it('keeps spinner start and stop paired for team single Skill installs', async () => {
    vi.mocked(marketProvider.resolveTeamSkillInstallTarget).mockResolvedValue({
      ok: true,
      data: teamTarget(),
    });
    let spinnerStarted = false;
    const spinner = {
      start: vi.fn(() => {
        spinnerStarted = true;
      }),
      stop: vi.fn(() => {
        if (!spinnerStarted) {
          throw new TypeError('spinner.stop called without start');
        }
        spinnerStarted = false;
      }),
    };

    await handleMarketSkill(
      'ts_skill-team-1/team-skill',
      {
        type: 'market',
        url: 'ts_skill-team-1/team-skill',
        marketName: 'team-skill',
        marketAuthor: 'ts_skill-team-1',
      },
      { agent: ['claude-code'], yes: true, copy: true, global: false },
      spinner as never
    );

    expect(spinner.start).toHaveBeenCalled();
    expect(spinner.stop).toHaveBeenCalled();
  });

  it('uses the same releaseId for collection preflight and monitored replacement', async () => {
    vi.mocked(marketProvider.resolveTeamSkillInstallTarget).mockResolvedValue({
      ok: true,
      data: teamTarget(),
    });
    vi.mocked(marketProvider.fetchById)
      .mockResolvedValueOnce(marketSkill() as never)
      .mockResolvedValueOnce(
        marketSkill('demo', {
          collect: { config: { collectEnabled: true }, meta: { blueai_signature: 'sig' } },
          skillFolderHash: 'hash-monitored',
        }) as never
      );

    await handleMarketSkill(
      'ts_skill-team-1/team-skill',
      {
        type: 'market',
        url: 'ts_skill-team-1/team-skill',
        marketName: 'team-skill',
        marketAuthor: 'ts_skill-team-1',
      },
      {
        agent: ['claude-code'],
        yes: true,
        copy: true,
        global: true,
        skipPilotStatus: true,
        collectConsent: true,
      },
      p.spinner()
    );

    expect(marketProvider.fetchById).toHaveBeenNthCalledWith(
      1,
      'id-team-skill',
      '1.2.3',
      undefined,
      'team-1',
      undefined,
      'release-1'
    );
    expect(marketProvider.fetchById).toHaveBeenNthCalledWith(
      2,
      'id-team-skill',
      '1.2.3',
      undefined,
      'team-1',
      true,
      'release-1'
    );
  });

  it.each([
    ['ts_skill-team-1', { marketName: 'ts_skill-team-1' }],
    ['ts_/team-skill', { marketAuthor: 'ts_', marketName: 'team-skill' }],
    [
      'ts_skill-team-1/team-skill/extra',
      { marketAuthor: 'ts_skill-team-1', marketName: 'team-skill/extra' },
    ],
    [
      'ts_skill-team-1/team-skill@1.2.3',
      {
        marketAuthor: 'ts_skill-team-1',
        marketName: 'team-skill',
        marketVersion: '1.2.3',
      },
    ],
  ])('rejects malformed team single Skill source %s', async (source, fields) => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    try {
      await expect(
        handleMarketSkill(
          source,
          { type: 'market', url: source, ...fields },
          { agent: ['claude-code'], yes: true, copy: true, global: false },
          p.spinner()
        )
      ).rejects.toThrow('process.exit');

      expect(marketProvider.resolveTeamSkillInstallTarget).not.toHaveBeenCalled();
      expect(marketProvider.fetchById).not.toHaveBeenCalled();
      expect(p.outro).toHaveBeenCalledWith(expect.stringContaining('团队单 Skill 命令格式错误'));
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('fails closed with resolver error and never falls back', async () => {
    vi.mocked(marketProvider.resolveTeamSkillInstallTarget).mockResolvedValue({
      ok: false,
      status: 409,
      code: 'CONFLICT',
      message: 'Team Skill 名称已变化，请重新复制安装命令',
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    try {
      await expect(
        handleMarketSkill(
          'ts_skill-team-1/old-name',
          {
            type: 'market',
            url: 'ts_skill-team-1/old-name',
            marketName: 'old-name',
            marketAuthor: 'ts_skill-team-1',
          },
          { agent: ['claude-code'], yes: true, copy: true, global: false },
          p.spinner()
        )
      ).rejects.toThrow('process.exit');

      expect(marketProvider.resolve).not.toHaveBeenCalled();
      expect(marketProvider.fetchById).not.toHaveBeenCalled();
      expect(p.outro).toHaveBeenCalledWith(
        expect.stringContaining('Team Skill 名称已变化，请重新复制安装命令')
      );
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('stops explicit team installs when the approved release is unavailable', async () => {
    vi.mocked(marketProvider.fetchById).mockResolvedValue(null);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    try {
      await expect(
        handleMarketSkill(
          't_team-id/team-skill',
          {
            type: 'market',
            url: 't_team-id/team-skill',
            marketName: 'team-skill',
            marketSkillId: 'id-team-skill',
            marketTeamId: 'team-id',
            marketVersion: '1.2.3',
          },
          { agent: ['claude-code'], yes: true, copy: true, global: false },
          p.spinner()
        )
      ).rejects.toThrow('process.exit');

      expect(marketProvider.resolve).not.toHaveBeenCalled();
      expect(marketProvider.fetchById).toHaveBeenCalledWith(
        'id-team-skill',
        '1.2.3',
        undefined,
        'team-id',
        undefined,
        undefined
      );
      expect(p.outro).toHaveBeenCalledWith(
        expect.stringContaining('团队版本不可用：t_team-id/team-skill v1.2.3')
      );
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('keeps spinner start and stop paired for explicit team installs', async () => {
    let spinnerStarted = false;
    const spinner = {
      start: vi.fn(() => {
        spinnerStarted = true;
      }),
      stop: vi.fn(() => {
        if (!spinnerStarted) {
          throw new TypeError('s is not a function');
        }
        spinnerStarted = false;
      }),
    };

    await handleMarketSkill(
      't_team-id/team-skill',
      {
        type: 'market',
        url: 't_team-id/team-skill',
        marketName: 'team-skill',
        marketSkillId: 'id-team-skill',
        marketTeamId: 'team-id',
        marketVersion: '1.2.3',
      },
      { agent: ['claude-code'], yes: true, copy: true, global: false },
      spinner as never
    );

    expect(spinner.start).toHaveBeenCalled();
    expect(spinner.stop).toHaveBeenCalled();
  });

  it('returns GitHub fallback when market name is not found', async () => {
    vi.mocked(marketProvider.resolve).mockResolvedValue(null);

    const result = await handleMarketSkill(
      'owner/repo',
      {
        type: 'market',
        url: 'owner/repo',
        marketName: 'repo',
        marketAuthor: 'owner',
      },
      { agent: ['claude-code'], yes: true, copy: true, global: false },
      p.spinner()
    );

    expect(result).toEqual({ fallbackToGitHub: true });
  });
});
