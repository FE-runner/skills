import { isAbsolute, resolve } from 'path';
import type { ParsedSource } from './types.ts';
import { isCosUrl } from './providers/cos.ts';
import { SKILLS_SITE } from './branding.ts';

/**
 * Extract owner/repo (or group/subgroup/repo for GitLab) from a parsed source
 * for lockfile tracking and telemetry.
 * Returns null for local paths or unparseable sources.
 * Supports any Git host with an owner/repo URL structure, including GitLab subgroups.
 */
export function getOwnerRepo(parsed: ParsedSource): string | null {
  if (parsed.type === 'local') {
    return null;
  }

  // Only handle HTTP(S) URLs
  if (!parsed.url.startsWith('http://') && !parsed.url.startsWith('https://')) {
    return null;
  }

  try {
    const url = new URL(parsed.url);
    // Get pathname, remove leading slash and trailing .git
    let path = url.pathname.slice(1);
    path = path.replace(/\.git$/, '');

    // Must have at least owner/repo (one slash)
    if (path.includes('/')) {
      return path;
    }
  } catch {
    // Invalid URL
  }

  return null;
}

/**
 * Extract owner and repo from an owner/repo string.
 * Returns null if the format is invalid.
 */
export function parseOwnerRepo(ownerRepo: string): { owner: string; repo: string } | null {
  const match = ownerRepo.match(/^([^/]+)\/([^/]+)$/);
  if (match) {
    return { owner: match[1]!, repo: match[2]! };
  }
  return null;
}

/**
 * Check if a GitHub repository is private.
 * Returns true if private, false if public, null if unable to determine.
 * Only works for GitHub repositories (GitLab not supported).
 */
export async function isRepoPrivate(owner: string, repo: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`);

    // If repo doesn't exist or we don't have access, assume private to be safe
    if (!res.ok) {
      return null; // Unable to determine
    }

    const data = (await res.json()) as { private?: boolean };
    return data.private === true;
  } catch {
    // On error, return null to indicate we couldn't determine
    return null;
  }
}

/**
 * Check if a string represents a local file system path
 */
function isLocalPath(input: string): boolean {
  return (
    isAbsolute(input) ||
    input.startsWith('./') ||
    input.startsWith('../') ||
    input === '.' ||
    input === '..' ||
    // Windows absolute paths like C:\ or D:\
    /^[a-zA-Z]:[/\\]/.test(input)
  );
}

/**
 * Parse a source string into a structured format
 * Supports: local paths, GitHub URLs, GitLab URLs, GitHub shorthand, well-known URLs, and direct git URLs
 */
// Source aliases: map common shorthand to canonical source
const SOURCE_ALIASES: Record<string, string> = {
  'coinbase/agentWallet': 'coinbase/agentic-wallet-skills',
};

export function parseSource(input: string): ParsedSource {
  // Resolve source aliases before parsing
  const alias = SOURCE_ALIASES[input];
  if (alias) {
    input = alias;
  }

  // Local path: absolute, relative, or current directory
  if (isLocalPath(input)) {
    const resolvedPath = resolve(input);
    // Return local type even if path doesn't exist - we'll handle validation in main flow
    return {
      type: 'local',
      url: resolvedPath, // Store resolved path in url for consistency
      localPath: resolvedPath,
    };
  }

  // GitHub URL with path: https://github.com/owner/repo/tree/branch/path/to/skill
  const githubTreeWithPathMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
  if (githubTreeWithPathMatch) {
    const [, owner, repo, ref, subpath] = githubTreeWithPathMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      ref,
      subpath,
    };
  }

  // GitHub URL with branch only: https://github.com/owner/repo/tree/branch
  const githubTreeMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)$/);
  if (githubTreeMatch) {
    const [, owner, repo, ref] = githubTreeMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      ref,
    };
  }

  // GitHub URL: https://github.com/owner/repo
  const githubRepoMatch = input.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (githubRepoMatch) {
    const [, owner, repo] = githubRepoMatch;
    const cleanRepo = repo!.replace(/\.git$/, '');
    return {
      type: 'github',
      url: `https://github.com/${owner}/${cleanRepo}.git`,
    };
  }

  // GitLab URL with path (any GitLab instance): https://gitlab.com/owner/repo/-/tree/branch/path
  // Key identifier is the "/-/tree/" path pattern unique to GitLab.
  // Supports subgroups by using a non-greedy match for the repository path.
  const gitlabTreeWithPathMatch = input.match(
    /^(https?):\/\/([^/]+)\/(.+?)\/-\/tree\/([^/]+)\/(.+)/
  );
  if (gitlabTreeWithPathMatch) {
    const [, protocol, hostname, repoPath, ref, subpath] = gitlabTreeWithPathMatch;
    if (hostname !== 'github.com' && repoPath) {
      return {
        type: 'gitlab',
        url: `${protocol}://${hostname}/${repoPath.replace(/\.git$/, '')}.git`,
        ref,
        subpath,
      };
    }
  }

  // GitLab URL with branch only (any GitLab instance): https://gitlab.com/owner/repo/-/tree/branch
  const gitlabTreeMatch = input.match(/^(https?):\/\/([^/]+)\/(.+?)\/-\/tree\/([^/]+)$/);
  if (gitlabTreeMatch) {
    const [, protocol, hostname, repoPath, ref] = gitlabTreeMatch;
    if (hostname !== 'github.com' && repoPath) {
      return {
        type: 'gitlab',
        url: `${protocol}://${hostname}/${repoPath.replace(/\.git$/, '')}.git`,
        ref,
      };
    }
  }

  // GitLab.com URL: https://gitlab.com/owner/repo or https://gitlab.com/group/subgroup/repo
  // Only for the official gitlab.com domain for user convenience.
  // Supports nested subgroups (e.g., gitlab.com/group/subgroup1/subgroup2/repo).
  const gitlabRepoMatch = input.match(/gitlab\.com\/(.+?)(?:\.git)?\/?$/);
  if (gitlabRepoMatch) {
    const repoPath = gitlabRepoMatch[1]!;
    // Must have at least owner/repo (one slash)
    if (repoPath.includes('/')) {
      return {
        type: 'gitlab',
        url: `https://gitlab.com/${repoPath}.git`,
      };
    }
  }

  // Market install command: [author/]name[@version]
  // Check BEFORE GitHub shorthand so that market skills take priority.
  // e.g., `bmc-skills add 智能文案生成器@1.0.0` or `bmc-skills add 张三_EMP001/智能文案生成器@1.0.0`
  if (isMarketInstallCommand(input)) {
    return parseMarketInstallCommand(input);
  }

  // GitHub shorthand: owner/repo, owner/repo/path/to/skill, or owner/repo@skill-name
  // Exclude paths that start with . or / to avoid matching local paths
  // First check for @skill syntax: owner/repo@skill-name
  const atSkillMatch = input.match(/^([^/]+)\/([^/@]+)@(.+)$/);
  if (atSkillMatch && !input.includes(':') && !input.startsWith('.') && !input.startsWith('/')) {
    const [, owner, repo, skillFilter] = atSkillMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      skillFilter,
    };
  }

  const shorthandMatch = input.match(/^([^/]+)\/([^/]+)(?:\/(.+))?$/);
  if (shorthandMatch && !input.includes(':') && !input.startsWith('.') && !input.startsWith('/')) {
    const [, owner, repo, subpath] = shorthandMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      subpath,
    };
  }

  // Tencent COS URL: https://<bucket>.cos.<region>.myqcloud.com/...
  if (isCosUrl(input)) {
    return {
      type: 'cos',
      url: input,
    };
  }

  // Market install token URL: https://skills.sh/install/<token>
  if (isMarketInstallUrl(input)) {
    const token = extractInstallToken(input);
    return {
      type: 'market',
      url: input,
      installToken: token ?? undefined,
    };
  }

  // Well-known skills: arbitrary HTTP(S) URLs that aren't GitHub/GitLab
  // This is the final fallback for URLs - we'll check for /.well-known/skills/index.json
  if (isWellKnownUrl(input)) {
    return {
      type: 'well-known',
      url: input,
    };
  }

  // Bare skill name (no slashes, no protocol) — resolve via Skills Market
  // e.g., `bmc-skills add 智能文案生成器` or `bmc-skills add 智能文案生成器@1.0.0`
  // e.g., `bmc-skills add 张三_EMP001/智能文案生成器@1.0.0` (private skill with author prefix)
  if (isBareSkillName(input)) {
    return parseMarketInstallCommand(input);
  }

  // Fallback: treat as direct git URL
  return {
    type: 'git',
    url: input,
  };
}

/**
 * Check if a URL could be a well-known skills endpoint.
 * Must be HTTP(S) and not a known git host (GitHub, GitLab).
 * Also excludes URLs that look like git repos (.git suffix).
 */
function isWellKnownUrl(input: string): boolean {
  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    return false;
  }

  try {
    const parsed = new URL(input);

    // Exclude known git hosts that have their own handling
    const excludedHosts = ['github.com', 'gitlab.com', 'raw.githubusercontent.com'];
    if (excludedHosts.includes(parsed.hostname)) {
      return false;
    }

    // Don't match URLs that look like git repos (should be handled by git type)
    if (input.endsWith('.git')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a URL is a market install token URL.
 * Format: https://skills.sh/install/<token> (or any SKILLS_SITE host)
 */
function isMarketInstallUrl(input: string): boolean {
  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    return false;
  }

  try {
    const parsed = new URL(input);
    const siteUrl = new URL(SKILLS_SITE);

    // Match the configured skills site hostname
    if (parsed.hostname !== siteUrl.hostname) {
      return false;
    }

    // Must be /install/<token> path
    return /^\/install\/[a-f0-9]+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Extract the install token from a market install URL.
 */
function extractInstallToken(input: string): string | null {
  try {
    const parsed = new URL(input);
    const match = parsed.pathname.match(/^\/install\/([a-f0-9]+)$/);
    return match ? match[1]! : null;
  } catch {
    return null;
  }
}

/**
 * Check if input looks like a market install command that should take priority
 * over GitHub shorthand. Matches patterns with:
 * - @version suffix (e.g., "name@1.0.0", "author/name@1.0.0")
 * - Non-ASCII characters (e.g., "智能文案生成器", "张三_EMP001/智能文案生成器")
 * Does NOT match pure ASCII owner/repo without @ (leave that to GitHub shorthand).
 */
function isMarketInstallCommand(input: string): boolean {
  // Must not be a URL or local path
  if (input.includes(':') || input.startsWith('.') || input.endsWith('.git')) return false;
  if (input.startsWith('http://') || input.startsWith('https://')) return false;
  if (input.trim().length === 0) return false;

  // Contains non-ASCII → market skill name
  if (/[^\x00-\x7F]/.test(input)) return true;

  // Contains @ with version-like suffix → market install command
  const atIdx = input.lastIndexOf('@');
  if (atIdx > 0 && /^\d+(\.\d+)*$/.test(input.slice(atIdx + 1))) return true;

  return false;
}

/**
 * Check if input is a bare skill name (no slashes, no @version).
 * Used as fallback after GitHub shorthand matching.
 * Examples: "my-skill", "commit-assistant"
 */
function isBareSkillName(input: string): boolean {
  if (input.includes('/')) return false;
  if (input.includes(':')) return false;
  if (input.startsWith('.')) return false;
  if (input.startsWith('http://') || input.startsWith('https://')) return false;
  if (input.endsWith('.git')) return false;
  if (input.trim().length === 0) return false;

  return true;
}

/**
 * Parse a market install command into a ParsedSource.
 * Input format: [author/]name[@version]
 */
function parseMarketInstallCommand(input: string): ParsedSource {
  // 1. Extract version from @suffix (use lastIndexOf to handle names with potential @ chars)
  const atIdx = input.lastIndexOf('@');
  let version: string | undefined;
  let nameStr: string;

  if (atIdx > 0) {
    const candidate = input.slice(atIdx + 1);
    // Validate that the part after @ looks like a version (digits and dots)
    if (/^\d+(\.\d+)*$/.test(candidate)) {
      version = candidate;
      nameStr = input.slice(0, atIdx);
    } else {
      nameStr = input;
    }
  } else {
    nameStr = input;
  }

  // 2. Extract author prefix from slash
  const slashIdx = nameStr.indexOf('/');
  let author: string | undefined;
  let name: string;

  if (slashIdx > 0) {
    author = nameStr.slice(0, slashIdx);
    name = nameStr.slice(slashIdx + 1);
  } else {
    name = nameStr;
  }

  return {
    type: 'market',
    url: input,
    marketName: name,
    marketAuthor: author,
    marketVersion: version,
  };
}
