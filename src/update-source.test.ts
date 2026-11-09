import { afterEach, describe, it, expect, vi } from 'vitest';
import { marketProvider } from './providers/market.ts';
import {
  buildMarketUpdateInstallSource,
  buildUpdateInstallSource,
  checkMarketLockEntry,
  formatSourceInput,
} from './update-source.ts';

describe('update-source', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatSourceInput', () => {
    it('appends ref fragment when provided', () => {
      expect(formatSourceInput('https://github.com/owner/repo.git', 'feature/install')).toBe(
        'https://github.com/owner/repo.git#feature/install'
      );
    });

    it('returns source unchanged when ref is missing', () => {
      expect(formatSourceInput('https://github.com/owner/repo.git')).toBe(
        'https://github.com/owner/repo.git'
      );
    });
  });

  describe('buildUpdateInstallSource', () => {
    it('builds root-level install source without trailing slash', () => {
      const result = buildUpdateInstallSource({
        source: 'owner/repo',
        sourceUrl: 'https://github.com/owner/repo.git',
        ref: 'feature/install',
        skillPath: 'SKILL.md',
      });
      expect(result).toBe('owner/repo#feature/install');
    });

    it('builds nested skill install source with ref', () => {
      const result = buildUpdateInstallSource({
        source: 'owner/repo',
        sourceUrl: 'https://github.com/owner/repo.git',
        ref: 'feature/install',
        skillPath: 'skills/my-skill/SKILL.md',
      });
      expect(result).toBe('owner/repo/skills/my-skill#feature/install');
    });

    it('falls back to sourceUrl when skillPath is missing', () => {
      const result = buildUpdateInstallSource({
        source: 'owner/repo',
        sourceUrl: 'https://github.com/owner/repo.git',
        ref: 'feature/install',
      });
      expect(result).toBe('https://github.com/owner/repo.git#feature/install');
    });
  });

  describe('team single Skill update context', () => {
    it('builds a ts_ install source instead of a market/team path', () => {
      expect(
        buildMarketUpdateInstallSource('demo', {
          source: 'ts_skill-team-a/demo',
          skillTeamId: 'skill-team-a',
          releaseId: 'release-1',
          teamSkillName: 'team-release-name',
        })
      ).toBe('ts_skill-team-a/team-release-name');

      expect(
        buildMarketUpdateInstallSource('private-demo', {
          source: 'market/author-1/private-demo',
          skillId: 'skill-1',
        })
      ).toBe('author-1/private-demo');
    });

    it('uses batch build check for a ts_ entry', async () => {
      const buildCheck = vi.spyOn(marketProvider, 'checkBuildBatch').mockResolvedValue({
        ok: true,
        data: {
          items: [
            {
              ok: true,
              scope: 'TEAM',
              skillId: 'skill-1',
              version: '2.0.0',
              observabilityEnabled: true,
              releaseSeq: 2,
            },
          ],
        },
      });

      const result = await checkMarketLockEntry('demo', {
        source: 'ts_skill-team-a/demo',
        skillPath: 'skill-1',
        version: '1.0.0',
        teamId: 'team-a',
        skillTeamId: 'skill-team-a',
        releaseId: 'release-1',
        teamSkillName: 'team-release-name',
      });

      expect(result).toEqual({ hasUpdate: true });
      expect(buildCheck).toHaveBeenCalledWith([
        {
          scope: 'TEAM',
          skillId: 'skill-1',
          teamId: 'team-a',
          releaseId: 'release-1',
        },
      ]);
    });

    it('fails closed when a team lock lacks target context', async () => {
      const result = await checkMarketLockEntry('demo', {
        source: 'ts_skill-team-a/demo',
        skillPath: 'skill-1',
        version: '1.0.0',
        skillTeamId: 'skill-team-a',
        releaseId: 'release-1',
        teamSkillName: 'team-release-name',
      });

      expect(result).toEqual({
        hasUpdate: false,
        error: '团队 lock 缺少 teamId/releaseId，请重新 add 后再检查',
      });
    });

    it('compares version and releaseSeq for a private entry', async () => {
      const buildCheck = vi.spyOn(marketProvider, 'checkBuildBatch').mockResolvedValue({
        ok: true,
        data: {
          items: [
            {
              ok: true,
              scope: 'PRIVATE',
              skillId: 'skill-1',
              version: '2.0.0',
              observabilityEnabled: true,
              releaseSeq: 4,
            },
          ],
        },
      });

      const result = await checkMarketLockEntry('private-demo', {
        source: 'market/author-1/private-demo',
        skillId: 'skill-1',
        version: '1.0.0',
        releaseSeq: 3,
        authorId: 'author-1',
      });

      expect(result).toEqual({ hasUpdate: true });
      expect(buildCheck).toHaveBeenCalledWith([
        { scope: 'PRIVATE', skillId: 'skill-1', authorId: 'author-1' },
      ]);
    });
  });
});
