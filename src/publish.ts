import { readFileSync, readdirSync, lstatSync, realpathSync, existsSync } from 'fs';
import { join, resolve, sep } from 'path';
import { marketProvider } from './providers/market.ts';
import { getApiKey } from './auth.ts';
import { reportApiFailure } from './api-error.ts';
import { BIN_NAME } from './branding.ts';

const SKILL_MD_FILENAME = 'SKILL.md';
/** 二进制检测采样字节数，参考 Git 的检测量级 */
const BINARY_SNIFF_BYTES = 8000;
/** 无条件跳过的 VCS/编辑器/系统噪音目录或文件名 */
const SKIP_ENTRY_NAMES = new Set(['.git', '.svn', '.hg', '.idea', '.vscode', '.DS_Store']);

interface CollectedFile {
  /** 相对发布根目录的路径（正斜杠分隔） */
  path: string;
  content: string;
}

interface CollectResult {
  skillMd: string | null;
  files: CollectedFile[];
}

/** 检测文件内容是否为二进制：采样字节含 NUL，或严格 UTF-8 解码失败 */
function isBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, BINARY_SNIFF_BYTES));
  if (sample.includes(0)) return true;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return false;
  } catch {
    return true;
  }
}

/**
 * 遍历发布根目录，收集 SKILL.md 与附属文本文件。
 * 安全边界：跳过 VCS/编辑器/系统噪音目录（.git、.svn、.hg、.idea、.vscode、.DS_Store）、
 * 环境变量文件（.env*，.env.example 除外，防止误传密钥）、符号链接（不跟随）、
 * 非常规文件（FIFO/socket 等），并对每个候选文件做 realpath 校验，拒绝越出发布根目录的路径穿越。
 * 其余隐藏文件/目录（如 .github）不再特殊跳过，按普通文件走二进制/文本判断。
 */
function collectFiles(rootDir: string): CollectResult {
  const rootReal = realpathSync(rootDir);
  const files: CollectedFile[] = [];
  let skillMd: string | null = null;

  function walk(dir: string, relBase: string): void {
    for (const entry of readdirSync(dir)) {
      if (SKIP_ENTRY_NAMES.has(entry)) continue;
      if (entry.startsWith('.env') && entry !== '.env.example') {
        console.error(
          `警告: 跳过环境变量文件 ${relBase ? `${relBase}/${entry}` : entry}（可能含密钥）`
        );
        continue;
      }

      const fullPath = join(dir, entry);
      const relPath = relBase ? `${relBase}/${entry}` : entry;

      let stat;
      try {
        stat = lstatSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink()) {
        console.error(`警告: 跳过符号链接 ${relPath}`);
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath, relPath);
        continue;
      }

      if (!stat.isFile()) {
        console.error(`警告: 跳过非常规文件 ${relPath}`);
        continue;
      }

      let realPath: string;
      try {
        realPath = realpathSync(fullPath);
      } catch {
        continue;
      }
      if (realPath !== rootReal && !realPath.startsWith(rootReal + sep)) {
        console.error(`警告: 跳过越界文件（路径穿越）${relPath}`);
        continue;
      }

      if (relPath === SKILL_MD_FILENAME) {
        skillMd = readFileSync(fullPath, 'utf-8');
        continue;
      }

      let buf: Buffer;
      try {
        buf = readFileSync(fullPath);
      } catch {
        continue;
      }
      if (isBinary(buf)) {
        console.error(`警告: 跳过二进制文件 ${relPath}`);
        continue;
      }
      files.push({ path: relPath, content: buf.toString('utf-8') });
    }
  }

  walk(rootDir, '');
  return { skillMd, files };
}

export interface PublishOptions {
  path: string;
  version?: string;
  teamIds?: string[];
  public?: boolean;
}

/** 解析 `publish` 命令参数：`path`（位置参数，缺省 cwd）、`--version`、`--team`、`--public` */
export function parsePublishOptions(args: string[]): PublishOptions {
  let path: string | undefined;
  let version: string | undefined;
  let teamIds: string[] | undefined;
  let isPublic: boolean | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--version') {
      version = args[++i];
    } else if (arg === '--team') {
      const value = args[++i];
      teamIds = value
        ? value
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        : undefined;
    } else if (arg === '--public') {
      isPublic = true;
    } else if (arg && !arg.startsWith('--')) {
      path = arg;
    }
  }

  return { path: resolve(path ?? process.cwd()), version, teamIds, public: isPublic };
}

/**
 * `skills publish [path] [--version x.y.z] [--team a,b] [--public]` 命令：
 * 读取本地 SKILL.md + 附属文本文件，调用 `/api/skill/push` upsert 到私有（默认）或公开（`--public`）Skill；
 * 提供 `--team` 且 push 成功后，链式调用 `/api/skill/publishToTeam` 分发到多个团队（与 `--public` 可叠加，互不影响）。
 */
export async function runPublish(args: string[]): Promise<void> {
  const { path: targetDir, version, teamIds, public: isPublic } = parsePublishOptions(args);

  const skillMdPath = join(targetDir, SKILL_MD_FILENAME);
  if (!existsSync(skillMdPath)) {
    console.error(`错误: ${skillMdPath} 不存在`);
    process.exitCode = 1;
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(`请先运行 \`${BIN_NAME} login <api-key>\` 或设置 SKILLS_API_KEY 环境变量`);
    process.exitCode = 1;
    return;
  }

  const { skillMd, files } = collectFiles(targetDir);
  if (!skillMd) {
    console.error(`错误: ${skillMdPath} 不存在`);
    process.exitCode = 1;
    return;
  }

  console.log(`推送 Skill: ${targetDir}`);
  if (files.length > 0) {
    console.log(`附属文件: ${files.map((f) => f.path).join(', ')}`);
  }

  const pushResult = await marketProvider.push(
    skillMd,
    files,
    version,
    apiKey,
    isPublic ? 'PUBLIC' : undefined
  );
  if (!pushResult.ok) {
    reportApiFailure(pushResult);
    if (isPublic) {
      if (pushResult.status === 403) {
        console.error('提示: 当前账号角色无权发布公开 Skill');
      } else if (pushResult.status === 409) {
        console.error(
          '提示: 名称冲突——可能是你名下已有同名私有 Skill（需改走 Web 发布流程转公开），也可能是名称已被其他作者占用（需更换名称）'
        );
      } else if (pushResult.status === 400) {
        console.error(
          `提示: 该 Skill 可能正在审核中，可执行 \`${BIN_NAME} withdraw <name>\` 撤回后重试`
        );
      }
    }
    return;
  }

  const { data } = pushResult;
  if (isPublic && data.status === 'PENDING') {
    console.log(`✓ 已提交审核`);
    console.log(`  名称: ${data.name}`);
    console.log(`  状态: ${data.visibility} / ${data.status}`);
    console.log(`  等待管理员/审核员审核后生效，非立即生效`);
  } else {
    console.log(`✓ 推送成功`);
    console.log(`  名称: ${data.name}`);
    console.log(`  版本: ${data.currentVersion}`);
    console.log(`  状态: ${data.visibility} / ${data.status}`);
  }

  if (teamIds && teamIds.length > 0) {
    const teamResult = await marketProvider.publishToTeam(data.skillId, teamIds, apiKey);
    if (!teamResult.ok) {
      reportApiFailure(teamResult);
      return;
    }
    console.log(`✓ 已提交团队审核: ${teamIds.join(', ')}`);
  }
}
