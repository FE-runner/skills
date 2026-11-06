import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as p from '@clack/prompts';
import { handleMarketSkill } from './add.ts';
import { marketProvider } from './providers/market.ts';
import { installWellKnownSkillForAgent } from './installer.ts';
import { addSkillToLock } from './skill-lock.ts';
import { addSkillToLocalLock, readLocalLock } from './local-lock.ts';

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
    installById: vi.fn(),
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
  readLocalLock: vi.fn(),
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
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    vi.clearAllMocks();
    vi.mocked(marketProvider.installById).mockResolvedValue({
      ok: true,
      data: marketSkill(),
    } as never);
    vi.mocked(readLocalLock).mockResolvedValue({ version: 1, skills: {} });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: originalIsTTY,
    });
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
    expect(marketProvider.installById).toHaveBeenCalledWith(
      'id-demo',
      undefined,
      undefined,
      undefined,
      undefined
    );
    expect(installWellKnownSkillForAgent).toHaveBeenCalled();
  });

  it('installs one active artifact when observability is explicit', async () => {
    vi.mocked(marketProvider.installById).mockResolvedValue({
      ok: true,
      data: marketSkill('demo', {
        collect: { config: { collectEnabled: true }, meta: { blueai_signature: 'sig' } },
        skillFolderHash: 'hash-monitored',
        files: new Map([
          ['SKILL.md', '# monitored demo'],
          ['.blueai-skills-market/bsm-obs-run.cjs', 'module.exports = {};'],
        ]),
      }),
    } as never);

    await handleMarketSkill(
      'demo',
      { type: 'market', url: 'demo', marketName: 'demo' },
      {
        agent: ['claude-code'],
        yes: true,
        copy: true,
        global: false,
        observability: true,
        skipPilotStatus: true,
      },
      p.spinner()
    );

    expect(marketProvider.installById).toHaveBeenCalledTimes(1);
    expect(marketProvider.installById).toHaveBeenCalledWith(
      'id-demo',
      undefined,
      undefined,
      undefined,
      undefined
    );
    expect(addSkillToLocalLock).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({ collectConsent: true }),
      expect.any(String)
    );
    const installCall = vi.mocked(installWellKnownSkillForAgent).mock.calls[0]!;
    expect(installCall[0].files.get('.blueai-skills-market/bsm-obs-run.cjs')).toBe(
      'module.exports = {};'
    );
    expect(installCall[1]).toBe('claude-code');
    expect(installCall[2]).toMatchObject({ global: false });
  });

  it('asks once for project-level collection consent and keeps the same file', async () => {
    vi.mocked(p.confirm).mockResolvedValue(true);
    vi.mocked(marketProvider.installById).mockResolvedValue({
      ok: true,
      data: marketSkill('demo', {
        collect: { config: { collectEnabled: true }, meta: { blueai_signature: 'sig' } },
        skillFolderHash: 'hash-monitored',
      }),
    } as never);

    await handleMarketSkill(
      'demo',
      { type: 'market', url: 'demo', marketName: 'demo' },
      { agent: ['claude-code'], copy: true, global: false, skipPilotStatus: true },
      p.spinner()
    );

    expect(p.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('是否同意数据采集') })
    );
    expect(marketProvider.installById).toHaveBeenCalledTimes(1);
    expect(addSkillToLocalLock).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({ collectConsent: true }),
      expect.any(String)
    );
  });

  it('defaults project-level collection to off in non-interactive installs', async () => {
    vi.mocked(marketProvider.installById).mockResolvedValue({
      ok: true,
      data: marketSkill('demo', {
        collect: { config: { collectEnabled: true }, meta: { blueai_signature: 'sig' } },
      }),
    } as never);

    await handleMarketSkill(
      'demo',
      { type: 'market', url: 'demo', marketName: 'demo' },
      {
        agent: ['claude-code'],
        yes: true,
        copy: true,
        global: false,
        skipPilotStatus: true,
      },
      p.spinner()
    );

    expect(p.confirm).not.toHaveBeenCalled();
    expect(addSkillToLocalLock).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({ collectConsent: false }),
      expect.any(String)
    );
  });

  it('reuses existing project-level collection consent', async () => {
    vi.mocked(readLocalLock).mockResolvedValue({
      version: 1,
      skills: {
        demo: {
          source: 'market/demo',
          sourceType: 'market',
          computedHash: 'old-hash',
          collectConsent: true,
        },
      },
    });
    vi.mocked(marketProvider.installById).mockResolvedValue({
      ok: true,
      data: marketSkill('demo', {
        collect: { config: { collectEnabled: true }, meta: { blueai_signature: 'sig' } },
      }),
    } as never);

    await handleMarketSkill(
      'demo',
      { type: 'market', url: 'demo', marketName: 'demo' },
      {
        agent: ['claude-code'],
        yes: true,
        copy: true,
        global: false,
        skipPilotStatus: true,
      },
      p.spinner()
    );

    expect(p.confirm).not.toHaveBeenCalled();
    expect(marketProvider.installById).toHaveBeenCalledTimes(1);
    expect(addSkillToLocalLock).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({ collectConsent: true }),
      expect.any(String)
    );
  });

  it('keeps an existing project-level collection opt-out', async () => {
    vi.mocked(readLocalLock).mockResolvedValue({
      version: 1,
      skills: {
        demo: {
          source: 'market/demo',
          sourceType: 'market',
          computedHash: 'old-hash',
          collectConsent: false,
        },
      },
    });

    await handleMarketSkill(
      'demo',
      { type: 'market', url: 'demo', marketName: 'demo' },
      {
        agent: ['claude-code'],
        yes: true,
        copy: true,
        global: false,
        skipPilotStatus: true,
      },
      p.spinner()
    );

    expect(p.confirm).not.toHaveBeenCalled();
    expect(marketProvider.installById).toHaveBeenCalledTimes(1);
    expect(addSkillToLocalLock).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({ collectConsent: false }),
      expect.any(String)
    );
  });

  it('writes consent=true for explicit observability on a non-observable response', async () => {
    vi.mocked(marketProvider.installById).mockResolvedValue({
      ok: true,
      data: marketSkill('demo'),
    } as never);

    await handleMarketSkill(
      'demo',
      { type: 'market', url: 'demo', marketName: 'demo' },
      {
        agent: ['claude-code'],
        yes: true,
        copy: true,
        global: false,
        observability: true,
        skipPilotStatus: true,
      },
      p.spinner()
    );

    expect(addSkillToLocalLock).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({ collectConsent: true }),
      expect.any(String)
    );
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('安装响应不含合法可观测信息'));
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
    expect(marketProvider.installById).toHaveBeenCalledWith(
      'id-demo',
      undefined,
      'author-id',
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
    expect(marketProvider.installById).toHaveBeenCalledWith(
      'id-team-skill',
      '1.2.3',
      undefined,
      'team-1',
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

  it('uses one release-bound install response for consent and installation', async () => {
    vi.mocked(marketProvider.resolveTeamSkillInstallTarget).mockResolvedValue({
      ok: true,
      data: teamTarget(),
    });
    vi.mocked(marketProvider.installById).mockResolvedValue({
      ok: true,
      data: marketSkill('demo', {
        collect: { config: { collectEnabled: true }, meta: { blueai_signature: 'sig' } },
        skillFolderHash: 'hash-monitored',
      }),
    } as never);

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

    expect(marketProvider.installById).toHaveBeenCalledTimes(1);
    expect(marketProvider.installById).toHaveBeenCalledWith(
      'id-team-skill',
      '1.2.3',
      undefined,
      'team-1',
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
      expect(marketProvider.installById).not.toHaveBeenCalled();
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
      expect(marketProvider.installById).not.toHaveBeenCalled();
      expect(p.outro).toHaveBeenCalledWith(
        expect.stringContaining('Team Skill 名称已变化，请重新复制安装命令')
      );
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('fails closed before install when an explicit team source lacks releaseId', async () => {
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

      expect(marketProvider.installById).not.toHaveBeenCalled();
      expect(p.outro).toHaveBeenCalledWith(expect.stringContaining('缺少 releaseId'));
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('stops explicit team installs when the approved release is unavailable', async () => {
    vi.mocked(marketProvider.installById).mockResolvedValue({
      ok: false,
      status: 409,
      code: 'OBS_VERSION_UNAVAILABLE',
      message: '当前版本尚无可安装的可观测产物',
    });
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
            marketReleaseId: 'release-1',
          },
          { agent: ['claude-code'], yes: true, copy: true, global: false },
          p.spinner()
        )
      ).rejects.toThrow('process.exit');

      expect(marketProvider.resolve).not.toHaveBeenCalled();
      expect(marketProvider.installById).toHaveBeenCalledWith(
        'id-team-skill',
        '1.2.3',
        undefined,
        'team-id',
        'release-1'
      );
      expect(p.outro).toHaveBeenCalledWith(
        expect.stringContaining('当前版本尚无可安装的可观测产物：t_team-id/team-skill')
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
        marketReleaseId: 'release-1',
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

    expect(result).toEqual({ fallbackToGitHub: true, installed: false });
  });
});
