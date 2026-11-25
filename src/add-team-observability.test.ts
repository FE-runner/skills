import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAdd } from './add.ts';
import * as p from '@clack/prompts';
import { marketProvider } from './providers/market.ts';
import { createRecordAndInstallPilot, readLocalPilotStatus } from './obs.ts';
import { getApiKey } from './auth.ts';
import { installWellKnownSkillForAgent } from './installer.ts';
import { addSkillToLock, getAllLockedSkills, getSkillFromLock } from './skill-lock.ts';
import { addSkillToLocalLock, readLocalLock } from './local-lock.ts';

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
    installById: vi.fn(),
    checkBuildBatch: vi.fn(async (items: Array<Record<string, unknown>>) => ({
      ok: true,
      data: {
        items: items.map((item) => ({
          ok: true,
          scope: item.scope,
          skillId: item.skillId,
          observabilityEnabled: false,
          available: true,
        })),
      },
    })),
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
    getAllLockedSkills: vi.fn(async () => ({})),
    getSkillFromLock: vi.fn(),
  };
});

vi.mock('./local-lock.ts', () => ({
  addSkillToLocalLock: vi.fn(),
  computeSkillFolderHash: vi.fn(async () => 'local-hash'),
  readLocalLock: vi.fn(async () => ({ version: 1, skills: {} })),
}));

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
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.stubEnv('CI', '');
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    process.exitCode = undefined;
    vi.clearAllMocks();

    vi.mocked(p.select).mockResolvedValue('on');
    vi.mocked(p.confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    vi.mocked(getApiKey).mockReturnValue('sk-test');
    vi.mocked(getAllLockedSkills).mockResolvedValue({});
    vi.mocked(getSkillFromLock).mockResolvedValue(null);
    vi.mocked(readLocalLock).mockResolvedValue({ version: 1, skills: {} });
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
    vi.mocked(marketProvider.installById).mockImplementation(
      async (id: string, _version?: string, _author?: string) =>
        ({
          ok: true,
          data: teamSkill(id, String(id).replace(/^id-/, '')),
        }) as never
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
                  teamId: 'team-id',
                  name: 'skill-a',
                  displayName: 'Skill A',
                  currentVersion: '1.0.0',
                  installVersion: '1.0.0',
                  releaseId: 'release-a',
                  visibility: 'PUBLIC',
                  authorId: 'author-a',
                },
                {
                  id: 'id-skill-b',
                  teamId: 'team-id',
                  name: 'skill-b',
                  displayName: 'Skill B',
                  currentVersion: '1.0.0',
                  installVersion: '1.0.0',
                  releaseId: 'release-b',
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
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: originalIsTTY,
    });
    process.exitCode = originalExitCode;
  });

  it('asks once after team collection consent and installs the component once', async () => {
    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
    });

    const selectCalls = vi.mocked(p.select).mock.calls.map(([options]) => options);
    const messages = selectCalls.map((options) => options.message);
    expect(messages.some((message) => message.includes('观测方式'))).toBe(true);
    expect(selectCalls).toContainEqual({
      message:
        '是否安装 BlueFlare 观测组件？安装后将上报运行数据，帮助持续优化技能的稳定性与效果。',
      initialValue: true,
      options: [
        { value: true, label: 'Yes（推荐）' },
        { value: false, label: 'No（暂不安装，稍后可补）' },
      ],
    });
    expect(p.note).toHaveBeenCalledWith(expect.stringContaining('开启观测后'), '开发者改进计划');
    expect(p.note).toHaveBeenCalledWith(
      expect.stringMatching(
        /采集状态：已记录（已同意 2 个，未同意 0 个；范围：全局）[\s\S]*观测组件：本次已安装完成[\s\S]*数据上报：尚未验证平台是否收到数据/
      ),
      'Observability'
    );
    expect(createRecordAndInstallPilot).toHaveBeenCalledTimes(1);
    expect(marketProvider.resolve).not.toHaveBeenCalled();
    for (const call of vi.mocked(marketProvider.installById).mock.calls) {
      expect(call[1]).toBe('1.0.0');
      expect(call[3]).toBe('team-id');
      expect(call[4]).toMatch(/^release-/);
    }
  });

  it('skips component installation when the user selects No', async () => {
    vi.mocked(p.select).mockResolvedValueOnce('on').mockResolvedValueOnce(false);

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
    });

    const messages = vi
      .mocked(p.log.message)
      .mock.calls.map(([message]) => String(message))
      .join('\n');
    expect(messages).toContain('已跳过安装');
    expect(messages).toContain('blueai-skills obs');
    expect(p.note).toHaveBeenCalledWith(
      expect.stringMatching(
        /采集状态：已记录（已同意 2 个，未同意 0 个；范围：全局）[\s\S]*观测组件：本次未安装（用户跳过）/
      ),
      'Observability'
    );
    expect(createRecordAndInstallPilot).not.toHaveBeenCalled();
  });

  it('prompts to repair an incomplete component install', async () => {
    vi.mocked(readLocalPilotStatus).mockReturnValue({
      serviceName: 'dea161ca-3b3e-42ff-a98f-2219dfcc1a90',
      hasBinary: false,
      isRunning: null,
    });

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
    });

    const messages = vi
      .mocked(p.log.message)
      .mock.calls.map(([message]) => String(message))
      .join('\n');
    expect(messages).toContain('BlueFlare 观测组件安装不完整，建议重新安装。');
    expect(createRecordAndInstallPilot).toHaveBeenCalledTimes(1);
  });

  it('reports an existing component without prompting to install again', async () => {
    vi.mocked(readLocalPilotStatus).mockReturnValue({
      serviceName: 'dea161ca-3b3e-42ff-a98f-2219dfcc1a90',
      hasBinary: true,
      isRunning: true,
    });

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
    });

    expect(p.note).toHaveBeenCalledWith(
      expect.stringMatching(
        /采集状态：已记录（已同意 2 个，未同意 0 个；范围：全局）[\s\S]*观测组件：本机已安装且正在运行，无需重复安装[\s\S]*数据上报：尚未验证平台是否收到数据/
      ),
      'Observability'
    );
    expect(
      vi
        .mocked(p.select)
        .mock.calls.some(([options]) => options.message.startsWith('是否安装 BlueFlare 观测组件'))
    ).toBe(false);
    expect(createRecordAndInstallPilot).not.toHaveBeenCalled();
  });

  it('shows login guidance instead of prompting when no API key is configured', async () => {
    vi.mocked(getApiKey).mockReturnValue(null);

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
    });

    const messages = vi
      .mocked(p.log.message)
      .mock.calls.map(([message]) => String(message))
      .join('\n');
    expect(messages).toContain('当前未登录，无法自动安装 BlueFlare 观测组件');
    expect(messages).toContain('skills login <api-key>');
    expect(p.note).toHaveBeenCalledWith(
      expect.stringMatching(
        /采集状态：已记录（已同意 2 个，未同意 0 个；范围：全局）[\s\S]*观测组件：本次未安装，需要按上方提示手动处理/
      ),
      'Observability'
    );
    expect(
      vi
        .mocked(p.select)
        .mock.calls.some(([options]) => options.message.includes('是否安装 BlueFlare 观测组件'))
    ).toBe(false);
    expect(createRecordAndInstallPilot).not.toHaveBeenCalled();
  });

  it('writes collect consent only to collect-capable team skills', async () => {
    vi.mocked(marketProvider.installById).mockImplementation(
      async (id: string, _version?: string, _author?: string) =>
        ({
          ok: true,
          data:
            String(id) === 'id-skill-b'
              ? teamSkill(id, 'skill-b', false)
              : teamSkill(id, String(id).replace(/^id-/, '')),
        }) as never
    );

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
    });

    const collectCall = vi.mocked(addSkillToLock).mock.calls.find(([name]) => name === 'skill-a');
    const noCollectCall = vi.mocked(addSkillToLock).mock.calls.find(([name]) => name === 'skill-b');

    expect(collectCall?.[1]).toMatchObject({ collectConsent: true });
    expect(noCollectCall?.[1]).toMatchObject({ teamId: 'team-id' });
    expect(noCollectCall?.[1]).not.toHaveProperty('collectConsent');
  });

  it('does not inherit bare-name public consent for team installs', async () => {
    const publicEntry = {
      skillPath: 'id-skill-a',
      source: 'market/skill-a',
      sourceType: 'market' as const,
      sourceUrl: 'market://skill-a',
      skillFolderHash: 'public-hash',
      collectConsent: true,
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(getAllLockedSkills).mockResolvedValue({ 'skill-a': publicEntry });
    vi.mocked(getSkillFromLock).mockImplementation(async (name: string) =>
      name === 'skill-a' ? publicEntry : null
    );

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
      yes: true,
    });

    expect(addSkillToLock).toHaveBeenCalledWith(
      'skill-a',
      expect.objectContaining({ teamId: 'team-id', collectConsent: false })
    );
    expect(addSkillToLock).not.toHaveBeenCalledWith(
      'skill-a',
      expect.objectContaining({ teamId: 'team-id', collectConsent: true })
    );
  });

  it('preserves existing team consent when reinstalling', async () => {
    const baseEntry = {
      source: 'market/skill-a',
      sourceType: 'market',
      sourceUrl: 'market://skill-a',
      skillFolderHash: 'team-hash',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      teamId: 'team-id',
    };
    vi.mocked(getAllLockedSkills).mockResolvedValue({
      'skill-a': { ...baseEntry, collectConsent: true },
      'skill-b': {
        ...baseEntry,
        source: 'market/skill-b',
        sourceUrl: 'market://skill-b',
        collectConsent: false,
      },
    });

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
      yes: true,
    });

    expect(addSkillToLock).toHaveBeenCalledWith(
      'skill-a',
      expect.objectContaining({ teamId: 'team-id', collectConsent: true })
    );
    expect(addSkillToLock).toHaveBeenCalledWith(
      'skill-b',
      expect.objectContaining({ teamId: 'team-id', collectConsent: false })
    );
  });

  it('reuses an existing team opt-out without reopening the choice', async () => {
    const baseEntry = {
      source: 'market/skill-a',
      sourceType: 'market',
      sourceUrl: 'market://skill-a',
      skillFolderHash: 'team-hash',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      teamId: 'team-id',
    };
    vi.mocked(getAllLockedSkills).mockResolvedValue({
      'skill-a': { ...baseEntry, collectConsent: false },
      'skill-b': {
        ...baseEntry,
        source: 'market/skill-b',
        sourceUrl: 'market://skill-b',
        collectConsent: true,
      },
    });

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
    });

    const selectMessages = vi.mocked(p.select).mock.calls.map(([options]) => options.message);
    expect(selectMessages.some((message) => message.includes('观测方式'))).toBe(false);
    expect(selectMessages).toContain(
      '是否安装 BlueFlare 观测组件？安装后将上报运行数据，帮助持续优化技能的稳定性与效果。'
    );
    expect(addSkillToLock).toHaveBeenCalledWith(
      'skill-a',
      expect.objectContaining({ teamId: 'team-id', collectConsent: false })
    );
    expect(addSkillToLock).toHaveBeenCalledWith(
      'skill-b',
      expect.objectContaining({ teamId: 'team-id', collectConsent: true })
    );
  });

  it('does not guide Pilot when non-interactive team consent defaults to false', async () => {
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
      .filter((message) => message.includes('BlueFlare 观测组件'));

    expect(messages).toHaveLength(0);
    expect(p.confirm).not.toHaveBeenCalled();
    expect(createRecordAndInstallPilot).not.toHaveBeenCalled();
  });

  it('does not prompt on team install when stdin is not a TTY without -y', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: false,
    });

    expect(p.select).not.toHaveBeenCalled();
    expect(p.confirm).not.toHaveBeenCalled();
    expect(addSkillToLocalLock).toHaveBeenCalledWith(
      'skill-a',
      expect.objectContaining({ teamId: 'team-id', collectConsent: false }),
      expect.any(String)
    );
    expect(addSkillToLocalLock).toHaveBeenCalledWith(
      'skill-b',
      expect.objectContaining({ teamId: 'team-id', collectConsent: false }),
      expect.any(String)
    );
  });

  it('only guides Pilot when non-interactive team consent is explicit true', async () => {
    vi.mocked(p.confirm).mockReset();

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
      yes: true,
      observability: true,
    });

    const messages = vi
      .mocked(p.log.message)
      .mock.calls.map(([message]) => String(message))
      .filter((message) => message.includes('BlueFlare 观测组件'));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('当前环境无法弹出安装选择');
    expect(messages[0]).toContain('blueai-skills obs');
    expect(p.confirm).not.toHaveBeenCalled();
    expect(createRecordAndInstallPilot).not.toHaveBeenCalled();
  });

  it('records consent=true for all team skills when observability=true is explicit', async () => {
    vi.mocked(p.confirm).mockReset();

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
      yes: true,
      observability: true,
    });

    expect(p.confirm).not.toHaveBeenCalled();
    expect(addSkillToLock).toHaveBeenCalledWith(
      'skill-a',
      expect.objectContaining({ collectConsent: true })
    );
    expect(addSkillToLock).toHaveBeenCalledWith(
      'skill-b',
      expect.objectContaining({ collectConsent: true })
    );
  });

  it('records project-level consent=true for team installs when observability=true is explicit', async () => {
    vi.mocked(p.confirm).mockReset();

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: false,
      copy: true,
      yes: true,
      observability: true,
    });

    expect(p.confirm).not.toHaveBeenCalled();
    expect(addSkillToLocalLock).toHaveBeenCalledWith(
      'skill-a',
      expect.objectContaining({ teamId: 'team-id', collectConsent: true }),
      expect.any(String)
    );
    expect(addSkillToLocalLock).toHaveBeenCalledWith(
      'skill-b',
      expect.objectContaining({ teamId: 'team-id', collectConsent: true }),
      expect.any(String)
    );
    expect(addSkillToLock).not.toHaveBeenCalled();
  });

  it('ignores explicit observability for a non-observable team skill', async () => {
    vi.mocked(p.confirm).mockReset();
    vi.mocked(marketProvider.installById).mockImplementation(
      async (id: string, _version?: string, _author?: string) =>
        ({
          ok: true,
          data:
            String(id) === 'id-skill-b'
              ? teamSkill(id, 'skill-b', false)
              : teamSkill(id, String(id).replace(/^id-/, '')),
        }) as never
    );

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
      yes: true,
      observability: true,
    });

    const noCollectCall = vi.mocked(addSkillToLock).mock.calls.find(([name]) => name === 'skill-b');

    expect(noCollectCall?.[1]).toMatchObject({ teamId: 'team-id' });
    expect(noCollectCall?.[1]).not.toHaveProperty('collectConsent');
    expect(marketProvider.installById).toHaveBeenCalledTimes(2);
  });

  it('skips team skill when both install versions are missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                teamName: 'Team',
                skills: [
                  {
                    id: 'id-missing-version',
                    name: 'missing-version',
                    displayName: 'Missing',
                    currentVersion: null,
                    visibility: 'PUBLIC',
                    authorId: 'author-a',
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      )
    );

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
      yes: true,
    });

    expect(marketProvider.installById).not.toHaveBeenCalled();
    const messages = vi.mocked(p.log.warn).mock.calls.map(([message]) => String(message));
    expect(
      messages.some((message) => message.includes('missing installVersion/currentVersion'))
    ).toBe(true);
  });

  it('prefers installVersion over currentVersion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                teamName: 'Team',
                skills: [
                  {
                    id: 'id-skill-a',
                    name: 'skill-a',
                    displayName: 'Skill A',
                    currentVersion: '1.0.0',
                    installVersion: '2.0.0',
                    releaseId: 'release-a',
                    visibility: 'PUBLIC',
                    authorId: 'author-a',
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      )
    );

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
      yes: true,
    });

    for (const call of vi.mocked(marketProvider.installById).mock.calls) {
      expect(call[1]).toBe('2.0.0');
      expect(call[3]).toBe('team-id');
      expect(call[4]).toBe('release-a');
    }
  });

  it('falls back to currentVersion when installVersion is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                teamName: 'Team',
                skills: [
                  {
                    id: 'id-skill-a',
                    name: 'skill-a',
                    displayName: 'Skill A',
                    currentVersion: '1.0.0',
                    releaseId: 'release-a',
                    visibility: 'PUBLIC',
                    authorId: 'author-a',
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      )
    );

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
      yes: true,
    });

    for (const call of vi.mocked(marketProvider.installById).mock.calls) {
      expect(call[1]).toBe('1.0.0');
      expect(call[3]).toBe('team-id');
      expect(call[4]).toBe('release-a');
    }
  });

  it('fails closed for a team Skill without releaseId and continues installable Skills', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                teamName: 'Team',
                skills: [
                  {
                    id: 'id-skill-a',
                    teamId: 'team-id',
                    name: 'skill-a',
                    displayName: 'Skill A',
                    installVersion: '1.0.0',
                    visibility: 'PUBLIC',
                    authorId: 'author-a',
                  },
                  {
                    id: 'id-skill-b',
                    teamId: 'team-id',
                    name: 'skill-b',
                    displayName: 'Skill B',
                    installVersion: '1.0.0',
                    releaseId: 'release-b',
                    visibility: 'PUBLIC',
                    authorId: 'author-b',
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      )
    );

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
      yes: true,
    });

    expect(marketProvider.installById).toHaveBeenCalledTimes(1);
    expect(marketProvider.installById).toHaveBeenCalledWith(
      'id-skill-b',
      '1.0.0',
      undefined,
      'team-id',
      'release-b'
    );
    expect(addSkillToLock).toHaveBeenCalledWith('skill-b', expect.any(Object));
    expect(addSkillToLock).not.toHaveBeenCalledWith('skill-a', expect.any(Object));
    expect(process.exitCode).toBe(1);
  });

  it('continues after one team install fails and does not write consent for it', async () => {
    vi.mocked(marketProvider.installById).mockImplementation(
      async (id: string, version?: string, _author?: string, _team?: string, releaseId?: string) =>
        String(id) === 'id-skill-b'
          ? ({
              ok: false,
              status: 409,
              code: 'OBS_VERSION_UNAVAILABLE',
              message: '当前版本尚无可安装的可观测产物',
            } as never)
          : ({
              ok: true,
              data: teamSkill(id, 'skill-a'),
            } as never)
    );

    await runAdd(['t_team-id/team-name'], {
      agent: ['claude-code'],
      global: true,
      copy: true,
      yes: true,
    });

    expect(addSkillToLock).toHaveBeenCalledWith(
      'skill-a',
      expect.objectContaining({ collectConsent: false })
    );
    expect(addSkillToLock).not.toHaveBeenCalledWith('skill-b', expect.any(Object));
    expect(process.exitCode).toBe(1);
  });
});
