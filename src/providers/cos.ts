import matter from 'gray-matter';
import { createHash } from 'crypto';
import type { HostProvider, ProviderMatch, RemoteSkill } from './types.ts';

/**
 * Parsed components from a Tencent COS URL.
 */
export interface CosUrlParts {
  bucket: string;
  region: string;
  /** skills 容器目录（不含首尾斜杠），即 skillId 的父目录。空字符串表示 bucket 根目录。 */
  skillsRoot: string;
}

/**
 * Represents a skill fetched from Tencent COS.
 */
export interface CosSkill extends RemoteSkill {
  /** All files in the skill, keyed by relative path */
  files: Map<string, string>;
  /** The skill ID (directory name under skillsRoot) */
  skillId: string;
  /** The resolved version string */
  version: string;
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
 * URL path 整体视为 skillsRoot（skill 容器目录）。
 *
 * - https://<bucket>.cos.<region>.myqcloud.com           skillsRoot=''
 * - https://<bucket>.cos.<region>.myqcloud.com/<prefix>  skillsRoot='<prefix>'
 */
export function parseCosUrl(url: string): CosUrlParts | null {
  try {
    const parsed = new URL(url);
    const hostMatch = parsed.hostname.match(COS_HOST_RE);
    if (!hostMatch) return null;

    const bucket = hostMatch[1]!;
    const region = hostMatch[2]!;
    const skillsRoot = parsed.pathname.replace(/^\/+|\/+$/g, '');

    return { bucket, region, skillsRoot };
  } catch {
    return null;
  }
}

/**
 * Tencent COS skills provider.
 *
 * 通过 index.json 索引文件发现并安装技能，无需 ListObjects 权限。
 *
 * index.json 格式：
 * {
 *   "skills": [
 *     { "name": "my-skill", "files": ["SKILL.md", "references/foo.md"] }
 *   ]
 * }
 */
export class CosProvider implements HostProvider {
  readonly id = 'cos';
  readonly displayName = 'Tencent COS';

  match(url: string): ProviderMatch {
    if (!isCosUrl(url)) return { matches: false };
    const parts = parseCosUrl(url);
    if (!parts) return { matches: false };
    return { matches: true, sourceIdentifier: `cos/${parts.bucket}` };
  }

  private baseUrl(bucket: string, region: string): string {
    return `https://${bucket}.cos.${region}.myqcloud.com`;
  }

  private cosPath(skillsRoot: string, ...segments: string[]): string {
    return [skillsRoot, ...segments].filter(Boolean).join('/');
  }

  private async fetchFile(bucket: string, region: string, key: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl(bucket, region)}/${key}`);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  private async fetchIndex(
    bucket: string,
    region: string,
    skillsRoot: string
  ): Promise<Array<{ name: string; files?: string[] }> | null> {
    const content = await this.fetchFile(bucket, region, this.cosPath(skillsRoot, 'index.json'));
    if (!content) return null;
    try {
      const json = JSON.parse(content) as { skills?: unknown };
      if (!Array.isArray(json.skills)) {
        console.error(`[COS] index.json: "skills" 字段缺失或不是数组`);
        return null;
      }
      const valid: Array<{ name: string; files?: string[] }> = [];
      for (let i = 0; i < json.skills.length; i++) {
        const item = json.skills[i] as Record<string, unknown>;
        if (typeof item?.name !== 'string' || !item.name) {
          console.error(`[COS] index.json skills[${i}]: 缺少 "name" 字段，已跳过`);
          continue;
        }
        if (item.files !== undefined && !Array.isArray(item.files)) {
          console.error(`[COS] index.json skills[${i}] (${item.name}): "files" 不是数组，已跳过`);
          continue;
        }
        valid.push(item as { name: string; files?: string[] });
      }
      return valid;
    } catch {
      console.error(`[COS] index.json: JSON 解析失败`);
      return null;
    }
  }

  private async fetchSkillFromIndex(
    bucket: string,
    region: string,
    skillsRoot: string,
    entry: { name: string; files?: string[] }
  ): Promise<CosSkill | null> {
    const { name: skillId, files: fileList } = entry;
    if (!fileList || fileList.length === 0) return null;

    const fileEntries = await Promise.all(
      fileList.map(async (relPath) => {
        const content = await this.fetchFile(
          bucket,
          region,
          this.cosPath(skillsRoot, skillId, relPath)
        );
        return content !== null ? { path: relPath, content } : null;
      })
    );

    const files = new Map<string, string>();
    let skillMdContent = '';

    for (const e of fileEntries) {
      if (!e) continue;
      files.set(e.path, e.content);
      if (e.path.toLowerCase() === 'skill.md') skillMdContent = e.content;
    }

    if (!skillMdContent) {
      console.error(`[COS] ${skillId}: SKILL.md 未找到或下载失败，已跳过`);
      return null;
    }

    const { data } = matter(skillMdContent);
    const name = (data.name as string | undefined) ?? skillId;
    const description = data.description as string | undefined;
    if (!name || !description) {
      console.error(
        `[COS] ${skillId}: SKILL.md 缺少 ${!description ? '"description"' : '"name"'} 字段，已跳过`
      );
      return null;
    }

    const version =
      (data.version as string | undefined) ||
      createHash('sha256').update(skillMdContent).digest('hex').slice(0, 8);

    return {
      name,
      description,
      content: skillMdContent,
      installName: skillId,
      sourceUrl: `${this.baseUrl(bucket, region)}/${this.cosPath(skillsRoot, skillId, 'SKILL.md')}`,
      metadata: data.metadata as Record<string, unknown> | undefined,
      files,
      skillId,
      version,
    };
  }

  async fetchSkill(url: string): Promise<CosSkill | null> {
    const skills = await this.fetchAllSkills(url);
    return skills[0] ?? null;
  }

  async fetchAllSkills(url: string): Promise<CosSkill[]> {
    const parts = parseCosUrl(url);
    if (!parts) return [];

    const { bucket, region, skillsRoot } = parts;

    const index = await this.fetchIndex(bucket, region, skillsRoot);
    if (!index) return [];

    const results = await Promise.all(
      index.map((entry) => this.fetchSkillFromIndex(bucket, region, skillsRoot, entry))
    );
    return results.filter((s): s is CosSkill => s !== null);
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
