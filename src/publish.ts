import { readFileSync, readdirSync, lstatSync, realpathSync, existsSync } from 'fs';
import { join, resolve, sep } from 'path';
import { marketProvider } from './providers/market.ts';
import { getApiKey } from './auth.ts';
import { reportApiFailure } from './api-error.ts';
import { BIN_NAME } from './branding.ts';

const SKILL_MD_FILENAME = 'SKILL.md';
/** 二进制检测采样字节数，参考 Git 的检测量级 */
const BINARY_SNIFF_BYTES = 8000;

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
 * 安全边界：跳过隐藏条目、符号链接（不跟随）、非常规文件（FIFO/socket 等），
 * 并对每个候选文件做 realpath 校验，拒绝越出发布根目录的路径穿越。
 */
function collectFiles(rootDir: string): CollectResult {
  const rootReal = realpathSync(rootDir);
  const files: CollectedFile[] = [];
  let skillMd: string | null = null;

  function walk(dir: string, relBase: string): void {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue;

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
}

/** 解析 `publish` 命令参数：`path`（位置参数，缺省 cwd）、`--version`、`--team` */
export function parsePublishOptions(args: string[]): PublishOptions {
  let path: string | undefined;
  let version: string | undefined;
  let teamIds: string[] | undefined;

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
    } else if (arg && !arg.startsWith('--')) {
      path = arg;
    }
  }

  return { path: resolve(path ?? process.cwd()), version, teamIds };
}

/**
 * `skills publish [path] [--version x.y.z] [--team a,b]` 命令：
 * 读取本地 SKILL.md + 附属文本文件，调用 `/api/skill/push` upsert 到私有 Skill；
 * 提供 `--team` 且 push 成功后，链式调用 `/api/skill/publishToTeam` 分发到多个团队。
 */
export async function runPublish(args: string[]): Promise<void> {
  const { path: targetDir, version, teamIds } = parsePublishOptions(args);

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

  const pushResult = await marketProvider.push(skillMd, files, version, apiKey);
  if (!pushResult.ok) {
    reportApiFailure(pushResult);
    return;
  }

  const { data } = pushResult;
  console.log(`✓ 推送成功`);
  console.log(`  名称: ${data.name}`);
  console.log(`  版本: ${data.currentVersion}`);
  console.log(`  状态: ${data.visibility} / ${data.status}`);

  if (teamIds && teamIds.length > 0) {
    const teamResult = await marketProvider.publishToTeam(data.skillId, teamIds, apiKey);
    if (!teamResult.ok) {
      reportApiFailure(teamResult);
      return;
    }
    console.log(`✓ 已提交团队审核: ${teamIds.join(', ')}`);
  }
}
