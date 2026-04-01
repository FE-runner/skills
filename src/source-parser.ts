import { isAbsolute, resolve } from 'path';
import type { ParsedSource } from './types.ts';
import { isCosUrl } from './providers/cos.ts';

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

  // 处理 Git SSH URL (例如 git@gitlab.com:owner/repo.git, git@github.com:owner/repo.git)
  const sshMatch = parsed.url.match(/^git@[^:]+:(.+)$/);
  if (sshMatch) {
    let path = sshMatch[1]!;
    path = path.replace(/\.git$/, '');

    // 至少需要 owner/repo（一个斜杠）
    if (path.includes('/')) {
      return path;
    }
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
 * 清理子路径，防止路径遍历攻击。
 * 拒绝包含 ".." 段的子路径（可能逃逸到仓库根目录之外）。
 * 返回清理后的子路径，如果子路径不安全则抛出错误。
 */
export function sanitizeSubpath(subpath: string): string {
  // 统一使用正斜杠以便一致处理
  const normalized = subpath.replace(/\\/g, '/');

  // 检查每个路径段是否包含 ".."
  const segments = normalized.split('/');
  for (const segment of segments) {
    if (segment === '..') {
      throw new Error(
        `Unsafe subpath: "${subpath}" contains path traversal segments. ` +
          `Subpaths must not contain ".." components.`
      );
    }
  }

  return subpath;
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

// ============================================
// Fragment ref 解析（上游 FEAT-01: branch ref 支持）
// ============================================

interface FragmentRefResult {
  inputWithoutFragment: string;
  ref?: string;
  skillFilter?: string;
}

function decodeFragmentValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 判断输入是否看起来像 git 源（用于决定是否将 # 后缀解析为 ref）。
 * 避免对普通 well-known URL 误解析 fragment。
 */
function looksLikeGitSource(input: string): boolean {
  if (input.startsWith('github:') || input.startsWith('gitlab:') || input.startsWith('git@')) {
    return true;
  }

  if (input.startsWith('http://') || input.startsWith('https://')) {
    try {
      const parsed = new URL(input);
      const pathname = parsed.pathname;

      // 仅对 GitHub 的 repo/tree URL 将 fragment 当作 ref
      if (parsed.hostname === 'github.com') {
        return /^\/[^/]+\/[^/]+(?:\.git)?(?:\/tree\/[^/]+(?:\/.*)?)?\/?$/.test(pathname);
      }

      // 仅对 gitlab.com 的 repo/tree URL 将 fragment 当作 ref
      if (parsed.hostname === 'gitlab.com') {
        return /^\/.+?\/[^/]+(?:\.git)?(?:\/-\/tree\/[^/]+(?:\/.*)?)?\/?$/.test(pathname);
      }
    } catch {
      // 继续到下面的通用检查
    }
  }

  if (/^https?:\/\/.+\.git(?:$|[/?])/i.test(input)) {
    return true;
  }

  return (
    !input.includes(':') &&
    !input.startsWith('.') &&
    !input.startsWith('/') &&
    /^([^/]+)\/([^/]+)(?:\/(.+)|@(.+))?$/.test(input)
  );
}

/**
 * 解析输入中的 fragment ref（#branch 或 #branch@skill-filter）。
 * 仅对 git 类源生效，避免影响 well-known URL 的 fragment 语义。
 */
function parseFragmentRef(input: string): FragmentRefResult {
  const hashIndex = input.indexOf('#');
  if (hashIndex < 0) {
    return { inputWithoutFragment: input };
  }

  const inputWithoutFragment = input.slice(0, hashIndex);
  const fragment = input.slice(hashIndex + 1);

  // 仅对 git 类源将 URL fragment 解析为 git ref
  if (!fragment || !looksLikeGitSource(inputWithoutFragment)) {
    return { inputWithoutFragment: input };
  }

  const atIndex = fragment.indexOf('@');
  if (atIndex === -1) {
    return {
      inputWithoutFragment,
      ref: decodeFragmentValue(fragment),
    };
  }

  const ref = fragment.slice(0, atIndex);
  const skillFilter = fragment.slice(atIndex + 1);
  return {
    inputWithoutFragment,
    ref: ref ? decodeFragmentValue(ref) : undefined,
    skillFilter: skillFilter ? decodeFragmentValue(skillFilter) : undefined,
  };
}

function appendFragmentRef(input: string, ref?: string, skillFilter?: string): string {
  if (!ref) {
    return input;
  }
  return `${input}#${ref}${skillFilter ? `@${skillFilter}` : ''}`;
}

// ============================================
// 主解析函数
// ============================================

export function parseSource(input: string): ParsedSource {
  // 去除首尾空格
  input = input.trim();

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

  // 解析 fragment ref（#branch 或 #branch@skill-filter）
  const {
    inputWithoutFragment,
    ref: fragmentRef,
    skillFilter: fragmentSkillFilter,
  } = parseFragmentRef(input);
  input = inputWithoutFragment;

  // Resolve source aliases before parsing
  const alias = SOURCE_ALIASES[input];
  if (alias) {
    input = alias;
  }

  // github: 前缀简写: github:owner/repo -> owner/repo（交给现有简写逻辑处理）
  // 也支持 github:owner/repo/subpath 和 github:owner/repo@skill
  const githubPrefixMatch = input.match(/^github:(.+)$/);
  if (githubPrefixMatch) {
    return parseSource(appendFragmentRef(githubPrefixMatch[1]!, fragmentRef, fragmentSkillFilter));
  }

  // gitlab: 前缀简写: gitlab:owner/repo -> https://gitlab.com/owner/repo
  const gitlabPrefixMatch = input.match(/^gitlab:(.+)$/);
  if (gitlabPrefixMatch) {
    return parseSource(
      appendFragmentRef(
        `https://gitlab.com/${gitlabPrefixMatch[1]!}`,
        fragmentRef,
        fragmentSkillFilter
      )
    );
  }

  // GitHub URL with path: https://github.com/owner/repo/tree/branch/path/to/skill
  const githubTreeWithPathMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
  if (githubTreeWithPathMatch) {
    const [, owner, repo, ref, subpath] = githubTreeWithPathMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      ref: ref || fragmentRef,
      subpath: subpath ? sanitizeSubpath(subpath) : subpath,
    };
  }

  // GitHub URL with branch only: https://github.com/owner/repo/tree/branch
  const githubTreeMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)$/);
  if (githubTreeMatch) {
    const [, owner, repo, ref] = githubTreeMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      ref: ref || fragmentRef,
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
      ...(fragmentRef ? { ref: fragmentRef } : {}),
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
        ref: ref || fragmentRef,
        subpath: subpath ? sanitizeSubpath(subpath) : subpath,
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
        ref: ref || fragmentRef,
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
        ...(fragmentRef ? { ref: fragmentRef } : {}),
      };
    }
  }

  // Market install command: [author/]name[@version]
  // 在 GitHub 简写之前检查，确保 Market 技能优先解析。
  // e.g., `blueai-skills add 智能文案生成器@1.0.0` or `blueai-skills add <userId>/智能文案生成器@1.0.0`
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
      ...(fragmentRef ? { ref: fragmentRef } : {}),
      skillFilter: fragmentSkillFilter || skillFilter,
    };
  }

  const shorthandMatch = input.match(/^([^/]+)\/([^/]+)(?:\/(.+?))?\/?$/);
  if (shorthandMatch && !input.includes(':') && !input.startsWith('.') && !input.startsWith('/')) {
    const [, owner, repo, subpath] = shorthandMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      ...(fragmentRef ? { ref: fragmentRef } : {}),
      subpath: subpath ? sanitizeSubpath(subpath) : subpath,
      ...(fragmentSkillFilter ? { skillFilter: fragmentSkillFilter } : {}),
    };
  }

  // Tencent COS URL: https://<bucket>.cos.<region>.myqcloud.com/...
  if (isCosUrl(input)) {
    return {
      type: 'cos',
      url: input,
    };
  }

  // Well-known skills: arbitrary HTTP(S) URLs that aren't GitHub/GitLab
  // This is the final fallback for URLs - we'll check for /.well-known/agent-skills/index.json
  // then fall back to /.well-known/skills/index.json
  if (isWellKnownUrl(input)) {
    return {
      type: 'well-known',
      url: input,
    };
  }

  // Bare skill name (no slashes, no protocol) — resolve via Skills Market
  // e.g., `blueai-skills add 智能文案生成器` or `blueai-skills add 智能文案生成器@1.0.0`
  // e.g., `blueai-skills add <userId>/智能文案生成器@1.0.0` (private skill with author prefix)
  if (isBareSkillName(input)) {
    return parseMarketInstallCommand(input);
  }

  // Fallback: treat as direct git URL
  return {
    type: 'git',
    url: input,
    ...(fragmentRef ? { ref: fragmentRef } : {}),
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
 * 检查输入是否像 Market 安装命令（应优先于 GitHub 简写解析）。
 * 匹配以下模式：
 * - @version 后缀 (e.g., "name@1.0.0", "author/name@1.0.0")
 * - 非 ASCII 字符 (e.g., "智能文案生成器", "<userId>/智能文案生成器")
 * - author/name 格式 (e.g., "cmmnedkm200000jov51yqjlo6/bmc-field-shortcut-dev")
 *   Market 解析优先；如未找到，在 add 流程中回退到 GitHub。
 */
function isMarketInstallCommand(input: string): boolean {
  // Must not be a URL or local path
  if (input.includes(':') || input.startsWith('.') || input.endsWith('.git')) return false;
  if (input.startsWith('http://') || input.startsWith('https://')) return false;
  if (input.trim().length === 0) return false;

  // Contains non-ASCII -> market skill name
  if (/[^\x00-\x7F]/.test(input)) return true;

  // Contains @ with version-like suffix -> market install command
  const atIdx = input.lastIndexOf('@');
  if (atIdx > 0 && /^\d+(\.\d+)*$/.test(input.slice(atIdx + 1))) return true;

  // author/name format (single slash, no subpaths, no @) -> try Market first
  // e.g., "userId/skill-name" -- Market resolution will be attempted first,
  // with fallback to GitHub in the add flow if not found.
  // Excludes: "owner/repo@skill" (GitHub skill filter) and "owner/repo/path" (subpaths)
  if (!input.includes('@')) {
    const parts = input.split('/');
    if (parts.length === 2 && parts[0]!.length > 0 && parts[1]!.length > 0) return true;
  }

  return false;
}

/**
 * 检查输入是否为裸技能名（无斜杠、无 @version）。
 * 在 GitHub 简写匹配之后作为回退使用。
 * 示例: "my-skill", "commit-assistant"
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
 * 将 Market 安装命令解析为 ParsedSource。
 * 输入格式: [author/]name[@version]
 */
function parseMarketInstallCommand(input: string): ParsedSource {
  // 1. 从 @suffix 提取版本（使用 lastIndexOf 处理名称中可能包含 @ 字符的情况）
  const atIdx = input.lastIndexOf('@');
  let version: string | undefined;
  let nameStr: string;

  if (atIdx > 0) {
    const candidate = input.slice(atIdx + 1);
    // 验证 @ 后面的部分是否看起来像版本号（数字和点）
    if (/^\d+(\.\d+)*$/.test(candidate)) {
      version = candidate;
      nameStr = input.slice(0, atIdx);
    } else {
      nameStr = input;
    }
  } else {
    nameStr = input;
  }

  // 2. 从斜杠中提取 author 前缀
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
