import type { RemoteSkill } from './types.ts';
import { SKILLS_SITE } from '../branding.ts';

/**
 * Unwrap the API envelope: { code, message, data } → data
 * Falls back to raw JSON if no envelope detected.
 */
function unwrapEnvelope<T>(json: unknown): T {
  if (json && typeof json === 'object' && 'data' in json && 'code' in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

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
  authorId: string;
}

/**
 * Check API response shape from the market.
 */
interface CheckResponse {
  currentVersion: string;
}

/**
 * Skills Market provider.
 *
 * Install flow: resolve by name → install by ID
 * For private skills, pass author (userId) to resolve and install.
 *
 * Also supports check/update via the /api/skills/:id/check endpoint.
 */
export class MarketProvider {
  readonly id = 'market';
  readonly displayName = 'Skills Market';

  private get apiBase(): string {
    return SKILLS_SITE;
  }

  // ─── Public API Methods ───

  /**
   * Resolve a skill name to its market ID.
   * Used for bare-name installs: `blueai-skills add <skill-name>`
   * For private skills, pass author (userId) to resolve by authorId.
   */
  async resolve(name: string, author?: string): Promise<ResolveResponse | null> {
    try {
      const params = new URLSearchParams({ name });
      if (author) params.set('author', author);

      const res = await fetch(`${this.apiBase}/api/skills/resolve?${params}`);
      if (!res.ok) return null;
      return unwrapEnvelope<ResolveResponse>(await res.json());
    } catch {
      return null;
    }
  }

  /**
   * Install a skill by its market ID.
   * Pass `author` for private skills (userId format).
   */
  async fetchById(skillId: string, version?: string, author?: string): Promise<MarketSkill | null> {
    try {
      const params = new URLSearchParams();
      if (version) params.set('version', version);
      if (author) params.set('author', author);
      const qs = params.toString();
      const url = `${this.apiBase}/api/skills/${skillId}/install${qs ? `?${qs}` : ''}`;

      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) return null;

      const data = unwrapEnvelope<InstallResponse>(await res.json());
      return this.toMarketSkill(data, skillId);
    } catch {
      return null;
    }
  }

  /**
   * Check if a skill has updates by comparing version.
   */
  async check(skillId: string, author?: string): Promise<CheckResponse | null> {
    try {
      const params = new URLSearchParams();
      if (author) params.set('author', author);
      const qs = params.toString();
      const url = `${this.apiBase}/api/skills/${skillId}/check${qs ? `?${qs}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return unwrapEnvelope<CheckResponse>(await res.json());
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
