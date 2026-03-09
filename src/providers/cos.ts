import matter from 'gray-matter';
import type { HostProvider, ProviderMatch, RemoteSkill } from './types.ts';

/**
 * Parsed components from a Tencent COS URL.
 */
export interface CosUrlParts {
  bucket: string;
  region: string;
  skillId?: string;
  version?: string;
}

/**
 * Represents a skill fetched from Tencent COS.
 */
export interface CosSkill extends RemoteSkill {
  /** All files in the skill, keyed by relative path */
  files: Map<string, string>;
  /** The skill ID (directory name under skills/) */
  skillId: string;
  /** The resolved version string */
  version: string;
}

// ─── COS XML helpers ───

/**
 * Extract CommonPrefixes from COS List Objects XML response.
 * COS returns `<Prefix>...</Prefix>` inside `<CommonPrefixes>` blocks.
 */
function extractPrefixes(xml: string): string[] {
  const results: string[] = [];
  const re = /<CommonPrefixes>\s*<Prefix>([^<]+)<\/Prefix>\s*<\/CommonPrefixes>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]!);
  }
  return results;
}

/**
 * Extract object Keys from COS List Objects XML response.
 */
function extractKeys(xml: string): string[] {
  const results: string[] = [];
  const re = /<Key>([^<]+)<\/Key>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]!);
  }
  return results;
}

/**
 * Check if a COS List Objects response is truncated (has more pages).
 */
function isTruncated(xml: string): boolean {
  return xml.includes('<IsTruncated>true</IsTruncated>');
}

/**
 * Extract NextContinuationToken for pagination.
 */
function extractNextToken(xml: string): string | null {
  const m = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
  return m ? m[1]! : null;
}

// ─── Version comparison ───

/**
 * Compare two dot-separated version strings numerically.
 * e.g., "1.2.3" vs "1.10.0" → correctly returns negative.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ─── COS URL detection ───

const COS_HOST_RE = /^([^.]+)\.cos\.([^.]+)\.myqcloud\.com$/;

/**
 * Check if a string is a Tencent COS URL.
 */
export function isCosUrl(input: string): boolean {
  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    return false;
  }
  try {
    const parsed = new URL(input);
    return COS_HOST_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Parse a COS URL into its components.
 *
 * Supported formats:
 * - https://<bucket>.cos.<region>.myqcloud.com
 * - https://<bucket>.cos.<region>.myqcloud.com/skills/<id>
 * - https://<bucket>.cos.<region>.myqcloud.com/skills/<id>/versions/<version>
 */
export function parseCosUrl(url: string): CosUrlParts | null {
  try {
    const parsed = new URL(url);
    const hostMatch = parsed.hostname.match(COS_HOST_RE);
    if (!hostMatch) return null;

    const bucket = hostMatch[1]!;
    const region = hostMatch[2]!;

    // Parse optional path: /skills/<id>/versions/<version>
    const path = parsed.pathname.replace(/^\/+|\/+$/g, ''); // trim slashes

    if (!path) {
      return { bucket, region };
    }

    // Match: skills/<id>/versions/<version>
    const fullMatch = path.match(/^skills\/([^/]+)\/versions\/([^/]+)$/);
    if (fullMatch) {
      return { bucket, region, skillId: fullMatch[1]!, version: fullMatch[2]! };
    }

    // Match: skills/<id>
    const skillMatch = path.match(/^skills\/([^/]+)$/);
    if (skillMatch) {
      return { bucket, region, skillId: skillMatch[1]! };
    }

    return { bucket, region };
  } catch {
    return null;
  }
}

/**
 * Tencent COS skills provider.
 *
 * Discovers skills from public-read COS buckets using the directory structure:
 *   skills/<id>/versions/<version>/SKILL.md
 *
 * Uses COS List Objects V2 API (no auth needed for public-read buckets).
 */
export class CosProvider implements HostProvider {
  readonly id = 'cos';
  readonly displayName = 'Tencent COS';

  match(url: string): ProviderMatch {
    if (!isCosUrl(url)) {
      return { matches: false };
    }

    const parts = parseCosUrl(url);
    if (!parts) {
      return { matches: false };
    }

    return {
      matches: true,
      sourceIdentifier: `cos/${parts.bucket}`,
    };
  }

  /**
   * Build the COS endpoint base URL for a bucket.
   */
  private baseUrl(bucket: string, region: string): string {
    return `https://${bucket}.cos.${region}.myqcloud.com`;
  }

  /**
   * Call COS List Objects V2 API and return the raw XML.
   * Handles pagination automatically, collecting all results.
   */
  private async listObjects(
    bucket: string,
    region: string,
    prefix: string,
    delimiter?: string
  ): Promise<string> {
    let allXml = '';
    let continuationToken: string | null = null;

    do {
      const params = new URLSearchParams({
        'list-type': '2',
        prefix,
        'max-keys': '1000',
      });
      if (delimiter) params.set('delimiter', delimiter);
      if (continuationToken) params.set('continuation-token', continuationToken);

      const url = `${this.baseUrl(bucket, region)}/?${params.toString()}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`COS ListObjects failed: ${res.status} ${res.statusText}`);
      }

      const xml = await res.text();
      allXml += xml;

      if (isTruncated(xml)) {
        continuationToken = extractNextToken(xml);
        if (!continuationToken) break; // safety: avoid infinite loop
      } else {
        break;
      }
    } while (true);

    return allXml;
  }

  /**
   * List all skill IDs in the bucket.
   * Looks for directories under `skills/` prefix.
   */
  async listSkillIds(bucket: string, region: string): Promise<string[]> {
    const xml = await this.listObjects(bucket, region, 'skills/', '/');
    const prefixes = extractPrefixes(xml);

    // Extract skill IDs from prefixes like "skills/my-skill/"
    return prefixes
      .map((p) => {
        const m = p.match(/^skills\/([^/]+)\/$/);
        return m ? m[1]! : null;
      })
      .filter((id): id is string => id !== null);
  }

  /**
   * List all versions for a given skill ID.
   * Looks for directories under `skills/<id>/versions/` prefix.
   */
  async listVersions(bucket: string, region: string, skillId: string): Promise<string[]> {
    const xml = await this.listObjects(bucket, region, `skills/${skillId}/versions/`, '/');
    const prefixes = extractPrefixes(xml);

    // Extract version strings from prefixes like "skills/my-skill/versions/1.0.0/"
    return prefixes
      .map((p) => {
        const m = p.match(/^skills\/[^/]+\/versions\/([^/]+)\/$/);
        return m ? m[1]! : null;
      })
      .filter((v): v is string => v !== null);
  }

  /**
   * Resolve the latest version from a list of version strings.
   */
  resolveLatestVersion(versions: string[]): string | null {
    if (versions.length === 0) return null;
    return [...versions].sort(compareVersions).pop()!;
  }

  /**
   * List all file keys under a specific skill version.
   */
  private async listFileKeys(
    bucket: string,
    region: string,
    skillId: string,
    version: string
  ): Promise<string[]> {
    const prefix = `skills/${skillId}/versions/${version}/`;
    const xml = await this.listObjects(bucket, region, prefix);
    const keys = extractKeys(xml);

    // Filter out the prefix itself and any directory markers
    return keys.filter((k) => k !== prefix && !k.endsWith('/'));
  }

  /**
   * Fetch a single file's text content from COS.
   */
  private async fetchFile(bucket: string, region: string, key: string): Promise<string | null> {
    try {
      const url = `${this.baseUrl(bucket, region)}/${key}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  /**
   * Fetch a single skill with all its files for a specific version.
   */
  async fetchSkillVersion(
    bucket: string,
    region: string,
    skillId: string,
    version: string
  ): Promise<CosSkill | null> {
    const prefix = `skills/${skillId}/versions/${version}/`;
    const fileKeys = await this.listFileKeys(bucket, region, skillId, version);

    if (fileKeys.length === 0) return null;

    // Must have SKILL.md
    const skillMdKey = fileKeys.find((k) => {
      const rel = k.slice(prefix.length);
      return rel.toLowerCase() === 'skill.md';
    });

    if (!skillMdKey) return null;

    // Fetch all files in parallel
    const fileEntries = await Promise.all(
      fileKeys.map(async (key) => {
        const content = await this.fetchFile(bucket, region, key);
        const relativePath = key.slice(prefix.length);
        return content !== null ? { path: relativePath, content } : null;
      })
    );

    const files = new Map<string, string>();
    let skillMdContent = '';

    for (const entry of fileEntries) {
      if (!entry) continue;
      files.set(entry.path, entry.content);
      if (entry.path.toLowerCase() === 'skill.md') {
        skillMdContent = entry.content;
      }
    }

    if (!skillMdContent) return null;

    // Parse frontmatter
    const { data } = matter(skillMdContent);
    if (!data.name || !data.description) return null;

    const sourceUrl = `${this.baseUrl(bucket, region)}/${skillMdKey}`;

    return {
      name: data.name as string,
      description: data.description as string,
      content: skillMdContent,
      installName: skillId,
      sourceUrl,
      metadata: data.metadata as Record<string, unknown> | undefined,
      files,
      skillId,
      version,
    };
  }

  /**
   * Fetch a skill (latest version) from a COS URL.
   */
  async fetchSkill(url: string): Promise<CosSkill | null> {
    const parts = parseCosUrl(url);
    if (!parts) return null;

    const { bucket, region, skillId, version } = parts;

    // Need a skill ID to fetch a single skill
    if (!skillId) return null;

    let resolvedVersion = version;
    if (!resolvedVersion) {
      const versions = await this.listVersions(bucket, region, skillId);
      resolvedVersion = this.resolveLatestVersion(versions) ?? undefined;
      if (!resolvedVersion) return null;
    }

    return this.fetchSkillVersion(bucket, region, skillId, resolvedVersion);
  }

  /**
   * Fetch all skills from a COS bucket (each with its latest version).
   */
  async fetchAllSkills(url: string): Promise<CosSkill[]> {
    const parts = parseCosUrl(url);
    if (!parts) return [];

    const { bucket, region, skillId, version } = parts;

    // If a specific skill+version is given, fetch just that
    if (skillId && version) {
      const skill = await this.fetchSkillVersion(bucket, region, skillId, version);
      return skill ? [skill] : [];
    }

    // If a specific skill is given (no version), fetch latest
    if (skillId) {
      const skill = await this.fetchSkill(url);
      return skill ? [skill] : [];
    }

    // Otherwise list and fetch all skills
    const skillIds = await this.listSkillIds(bucket, region);
    if (skillIds.length === 0) return [];

    // Resolve latest version for each skill in parallel
    const skills = await Promise.all(
      skillIds.map(async (id) => {
        try {
          const versions = await this.listVersions(bucket, region, id);
          const latest = this.resolveLatestVersion(versions);
          if (!latest) return null;
          return this.fetchSkillVersion(bucket, region, id, latest);
        } catch {
          return null;
        }
      })
    );

    return skills.filter((s): s is CosSkill => s !== null);
  }

  toRawUrl(url: string): string {
    return url;
  }

  getSourceIdentifier(url: string): string {
    const parts = parseCosUrl(url);
    if (!parts) return 'unknown';
    return `cos/${parts.bucket}`;
  }
}

export const cosProvider = new CosProvider();
