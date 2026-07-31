import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { BIN_NAME } from './branding.ts';

/** 复用既有键名（其他本地脚本，如 push.mjs，已在用同一把 Key），不新增独立键名 */
const API_KEY_SECRET_KEY = 'blueai-skills-market-push.apiKey';

/** 环境变量优先级最高，覆盖本地凭证文件 */
const API_KEY_ENV_VAR = 'SKILLS_API_KEY';

/** 默认凭证文件路径：~/.blueai/secrets.json */
export function getSecretsPath(): string {
  return join(homedir(), '.blueai', 'secrets.json');
}

function readSecrets(secretsPath: string): Record<string, unknown> {
  if (!existsSync(secretsPath)) return {};
  try {
    return JSON.parse(readFileSync(secretsPath, 'utf-8'));
  } catch {
    return {};
  }
}

/** 已存在文件权限比 0600 更宽时输出一次性警告，不强制修改 */
function warnIfPermissionsTooWide(secretsPath: string): void {
  try {
    const mode = statSync(secretsPath).mode & 0o777;
    if (mode & 0o077) {
      console.error(
        `警告: ${secretsPath} 当前权限为 ${mode.toString(8)}，比 0600 更宽，同机其他用户可能可读。建议手动执行 chmod 600 ${secretsPath}`
      );
    }
  } catch {
    // 文件不存在或无法访问，忽略
  }
}

/**
 * 将 API Key 写入凭证文件，键名固定为 `blueai-skills-market-push.apiKey`，
 * 保留文件中其他既有键不变。目录/文件不存在时自动创建：目录权限 0700，文件权限 0600。
 * 若文件已存在但权限过宽，只警告不强制修改。
 */
export function saveApiKey(apiKey: string, secretsPath: string = getSecretsPath()): void {
  const dir = dirname(secretsPath);
  const dirExisted = existsSync(dir);
  if (!dirExisted) {
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o700);
  }

  const fileExisted = existsSync(secretsPath);
  if (fileExisted) {
    warnIfPermissionsTooWide(secretsPath);
  }

  const secrets = readSecrets(secretsPath);
  secrets[API_KEY_SECRET_KEY] = apiKey;
  writeFileSync(secretsPath, JSON.stringify(secrets, null, 2) + '\n', 'utf-8');

  if (!fileExisted) {
    chmodSync(secretsPath, 0o600);
  }
}

/**
 * 按优先级读取 API Key：环境变量 `SKILLS_API_KEY` > 凭证文件中的
 * `blueai-skills-market-push.apiKey`。均缺失时返回 null。
 */
export function getApiKey(secretsPath: string = getSecretsPath()): string | null {
  const envValue = process.env[API_KEY_ENV_VAR];
  if (envValue) return envValue;

  const secrets = readSecrets(secretsPath);
  const value = secrets[API_KEY_SECRET_KEY];
  return typeof value === 'string' && value ? value : null;
}

/**
 * `skills login <api-key>` 命令：保存 API Key 供后续 publish/withdraw 命令鉴权使用。
 */
export function runLogin(args: string[]): void {
  const apiKey = args[0];
  if (!apiKey) {
    console.error(`用法: ${BIN_NAME} login <api-key>`);
    process.exitCode = 1;
    return;
  }

  const secretsPath = getSecretsPath();
  saveApiKey(apiKey);
  console.log(`API Key 已保存到 ${secretsPath}`);
}
