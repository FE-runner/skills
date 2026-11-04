import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as p from '@clack/prompts';
import { handleMarketSkill } from './add.ts';
import { marketProvider } from './providers/market.ts';
import { installWellKnownSkillForAgent } from './installer.ts';

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
}));

vi.mock('./obs.ts', () => ({
  readLocalPilotStatus: vi.fn(() => ({ serviceName: null, hasBinary: false, isRunning: null })),
  createRecordAndInstallPilot: vi.fn(),
}));

vi.mock('./auth.ts', () => ({ getApiKey: vi.fn(() => null) }));
vi.mock('./telemetry.ts', () => ({ track: vi.fn(), setVersion: vi.fn() }));
vi.mock('../package.json', () => ({ default: { version: 'test' } }));

function marketSkill(name = 'demo') {
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
      undefined
    );
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
        'team-id'
      );
      expect(p.outro).toHaveBeenCalledWith(
        expect.stringContaining('团队版本不可用：t_team-id/team-skill v1.2.3')
      );
    } finally {
      exitSpy.mockRestore();
    }
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
