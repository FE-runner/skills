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

    it('uses resolver for a ts_ entry and never calls generic Market check', async () => {
      const resolveTeam = vi
        .spyOn(marketProvider, 'resolveTeamSkillInstallTarget')
        .mockResolvedValue({
          ok: true,
          data: {
            skillTeamId: 'skill-team-a',
            teamId: 'team-a',
            teamName: 'Team A',
            skillId: 'skill-1',
            skillName: 'demo',
            displayName: 'Demo',
            installVersion: '2.0.0',
            releaseId: 'release-2',
          },
        });
      const genericCheck = vi.spyOn(marketProvider, 'check');

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
      expect(resolveTeam).toHaveBeenCalledWith('skill-team-a', 'team-release-name');
      expect(genericCheck).not.toHaveBeenCalled();
    });

    it('returns resolver failure without generic fallback', async () => {
      vi.spyOn(marketProvider, 'resolveTeamSkillInstallTarget').mockResolvedValue({
        ok: false,
        status: 404,
        message: 'Team Skill not found',
      });
      const genericCheck = vi.spyOn(marketProvider, 'check');

      const result = await checkMarketLockEntry('demo', {
        source: 'ts_skill-team-a/demo',
        skillPath: 'skill-1',
        version: '1.0.0',
        skillTeamId: 'skill-team-a',
        releaseId: 'release-1',
        teamSkillName: 'team-release-name',
      });

      expect(result).toEqual({ hasUpdate: false, error: 'Team Skill not found' });
      expect(genericCheck).not.toHaveBeenCalled();
    });

    it('keeps the generic Market check path for entries without skillTeamId', async () => {
      const genericCheck = vi.spyOn(marketProvider, 'check').mockResolvedValue({
        currentVersion: '2.0.0',
      });
      const resolveTeam = vi.spyOn(marketProvider, 'resolveTeamSkillInstallTarget');

      const result = await checkMarketLockEntry('private-demo', {
        source: 'market/author-1/private-demo',
        skillId: 'skill-1',
        version: '1.0.0',
        authorId: 'author-1',
      });

      expect(result).toEqual({ hasUpdate: true });
      expect(genericCheck).toHaveBeenCalledWith('skill-1', 'author-1');
      expect(resolveTeam).not.toHaveBeenCalled();
    });
  });
});
