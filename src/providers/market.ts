import matter from 'gray-matter';
import type { HostProvider, ProviderMatch, RemoteSkill } from './types.ts';
import { SEARCH_API_BASE } from '../branding.ts';

/**
 * Represents a skill fetched from the Skills Market.
 */
export interface MarketSkill extends RemoteSkill {
  /** All files in the skill, keyed by relative path */
  files: Map<string, string>;
  /** The skill ID on the market */
  skillId: string;
  /** The resolved version string */
  version: string;
  /** SHA-256 based folder hash for update detection */
  skillFolderHash: string;
}

/**
 * Install API response shape from the market.
 */
interface InstallResponse {
  name: string;
  description: string;
  content: string;
  installName: string;
  sourceUrl: string;
  version: string;
  files: Record<string, string>;
  skillFolderHash: string;
}

/**
 * Resolve API response shape from the market.
 */
interface ResolveResponse {
  id: string;
  name: string;
  currentVersion: string;
}

/**
 * Check API response shape from the market.
 */
interface CheckResponse {
  currentVersion: string;
  skillFolderHash: string;
}

/**
 * Market URL patterns:
 * - https://skills.sh/install/<token>  (token-based private install)
 * - Other skills.sh URLs are not direct install targets
 */
const INSTALL_TOKEN_RE = /^https?:\/\/[^/]+\/install\/([a-f0-9]+)$/;

/**
 * Skills Market provider.
 *
 * Handles two install flows:
 * 1. Public skills: resolve by name → install by ID
 * 2. Private skills: install via token URL (https://skills.sh/install/<token>)
 *
 * Also supports check/update via the /api/skills/:id/check endpoint.
 */
export class MarketProvider implements HostProvider {
  readonly id = 'market';
  readonly displayName = 'Skills Market';

  private get apiBase(): string {
    return SEARCH_API_BASE;
  }

  /**
   * Match skills.sh install token URLs.
   * Format: https://skills.sh/install/<token>
   */
  match(url: string): ProviderMatch {
    const tokenMatch = url.match(INSTALL_TOKEN_RE);
    if (tokenMatch) {
      return {
        matches: true,
        sourceIdentifier: `market/token/${tokenMatch[1]}`,
      };
    }

    return { matches: false };
  }

  /**
   * Fetch a skill via token URL.
   */
  async fetchSkill(url: string): Promise<MarketSkill | null> {
    const tokenMatch = url.match(INSTALL_TOKEN_RE);
    if (!tokenMatch) return null;

    const token = tokenMatch[1]!;
    return this.fetchByToken(token);
  }

  toRawUrl(url: string): string {
    return url;
  }

  getSourceIdentifier(url: string): string {
    const tokenMatch = url.match(INSTALL_TOKEN_RE);
    if (tokenMatch) {
      return `market/token/${tokenMatch[1]}`;
    }
    return 'market';
  }

  // ─── Public API Methods ───

  /**
   * Resolve a skill name to its market ID.
   * Used for bare-name installs: `bmc-skills add <skill-name>`
   * For private skills, pass author (e.g., "张三_EMP001") to resolve by author prefix.
   */
  async resolve(name: string, author?: string): Promise<ResolveResponse | null> {
    try {
      const params = new URLSearchParams({ name });
      if (author) params.set('author', author);

      const res = await fetch(`${this.apiBase}/api/skills/resolve?${params}`);
      if (!res.ok) return null;
      return (await res.json()) as ResolveResponse;
    } catch {
      return null;
    }
  }

  /**
   * Install a public skill by its market ID.
   */
  async fetchById(skillId: string, version?: string): Promise<MarketSkill | null> {
    try {
      const url = version
        ? `${this.apiBase}/api/skills/${skillId}/install?version=${encodeURIComponent(version)}`
        : `${this.apiBase}/api/skills/${skillId}/install`;

      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) return null;

      const data = (await res.json()) as InstallResponse;
      return this.toMarketSkill(data, skillId);
    } catch {
      return null;
    }
  }

  /**
   * Install a private skill via token.
   */
  async fetchByToken(token: string): Promise<MarketSkill | null> {
    try {
      const res = await fetch(`${this.apiBase}/api/install/${token}`);
      if (!res.ok) return null;

      const data = (await res.json()) as InstallResponse;
      return this.toMarketSkill(data, `token:${token}`);
    } catch {
      return null;
    }
  }

  /**
   * Check if a skill has updates by comparing folder hash.
   */
  async check(skillId: string): Promise<CheckResponse | null> {
    try {
      const res = await fetch(`${this.apiBase}/api/skills/${skillId}/check`);
      if (!res.ok) return null;
      return (await res.json()) as CheckResponse;
    } catch {
      return null;
    }
  }

  // ─── Private Helpers ───

  private toMarketSkill(data: InstallResponse, skillId: string): MarketSkill {
    const files = new Map<string, string>();
    for (const [path, content] of Object.entries(data.files)) {
      files.set(path, content);
    }

    return {
      name: data.name,
      description: data.description,
      content: data.content,
      installName: data.installName,
      sourceUrl: data.sourceUrl,
      version: data.version,
      files,
      skillId,
      skillFolderHash: data.skillFolderHash,
    };
  }
}

export const marketProvider = new MarketProvider();
