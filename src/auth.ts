import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, chmodSync } from 'fs';
import { join, dirname, parse as parsePath } from 'path';
import { homedir } from 'os';
import { BIN_NAME } from './branding.ts';
import { getCredentialDir } from './paths.ts';

/** 复用既有键名（其他本地脚本，如 push.mjs，已在用同一把 Key），不新增独立键名 */
const API_KEY_SECRET_KEY = 'blueai-skills-market-push.apiKey';

/** skills-cli 原生环境变量 */
const API_KEY_ENV_VAR = 'SKILLS_API_KEY';

/** blueai-cli 统一 key 环境变量 */
const BLUEAI_API_KEY_ENV_VAR = 'BLUEAI_API_KEY';

/** 用户级配置目录覆盖；设置时跳过工作区凭据查找（镜像 blueai-cli 语义） */
const BLUEAI_CONFIG_DIR_ENV_VAR = 'BLUEAI_CONFIG_DIR';

/** credentials.json 未声明 activeProfile 时的默认 profile 名 */
const DEFAULT_PROFILE = 'default';

/** 六个来源均解析不到 Key 时统一的提示语 */
export const API_KEY_MISSING_HINT =
  `请先运行 \`${BIN_NAME} login <api-key>\`，或设置 SKILLS_API_KEY / BLUEAI_API_KEY 环境变量，` +
  `或配置 ~/.blueai/credentials.json`;

/** 凭证文件路径：~/.blueai/secrets.json。开发版与正式版构建一致。 */
export function getSecretsPath(): string {
  return join(getCredentialDir(), 'secrets.json');
}

/** 用户级配置目录：BLUEAI_CONFIG_DIR 覆盖，否则凭证目录（~/.blueai，开发版与正式版一致） */
export function getConfigDir(): string {
  const override = process.env[BLUEAI_CONFIG_DIR_ENV_VAR];
  if (override && override.trim()) return override;
  return getCredentialDir();
}

function readJsonObject(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * 读取 `<configDir>/config.json` 的 `activeProfile`；文件缺失、不可解析或字段非法时
 * 回退到 `"default"`。
 */
export function getActiveProfile(configDir: string = getConfigDir()): string {
  const config = readJsonObject(join(configDir, 'config.json'));
  const name = config['activeProfile'];
  return typeof name === 'string' && name ? name : DEFAULT_PROFILE;
}

/** 从 credentials.json 取 `[profile].apiKey`；缺失或非字符串时返回 null */
function readCredentialApiKey(credentialsPath: string, profile: string): string | null {
  const entry = readJsonObject(credentialsPath)[profile];
  if (!entry || typeof entry !== 'object') return null;
  const value = (entry as Record<string, unknown>)['apiKey'];
  return typeof value === 'string' && value ? value : null;
}

/**
 * 从 `startDir` 向上查找最近的 `.blueai` 配置目录（不含用户主目录本身），
 * 未找到时返回 null。与 blueai-cli 一致：命中的是最近目录，不因该目录缺
 * `credentials.json` 而继续向上。
 */
export function findWorkspaceConfigDir(startDir: string = process.cwd()): string | null {
  const home = homedir();
  const root = parsePath(startDir).root;
  let dir = startDir;

  while (true) {
    if (dir === home) return null;

    const candidate = join(dir, '.blueai');
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // 路径不存在或无权访问，继续向上查找
    }

    if (dir === root) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
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

  const secrets = readJsonObject(secretsPath);
  secrets[API_KEY_SECRET_KEY] = apiKey;
  writeFileSync(secretsPath, JSON.stringify(secrets, null, 2) + '\n', 'utf-8');

  if (!fileExisted) {
    chmodSync(secretsPath, 0o600);
  }
}

export interface ResolveApiKeyOptions {
  /** `--api-key` flag：单次调用临时覆盖，优先级最高 */
  flagKey?: string;
  /** 覆盖 secrets.json 路径（缺省 `~/.blueai/secrets.json`） */
  secretsPath?: string;
  /** 覆盖用户级配置目录（缺省由 `BLUEAI_CONFIG_DIR` 或 `~/.blueai` 决定） */
  configDir?: string;
  /** 覆盖工作区凭据查找起点（缺省当前工作目录） */
  cwd?: string;
}

/**
 * 按优先级读取 API Key，取第一个非空值：
 *
 * 1. `--api-key` flag（单次覆盖，不落盘）
 * 2. `SKILLS_API_KEY` 环境变量
 * 3. `~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]`
 * 4. 工作区 `.blueai/credentials.json[activeProfile].apiKey`
 * 5. `BLUEAI_API_KEY` 环境变量
 * 6. 用户级 `<configDir>/credentials.json[activeProfile].apiKey`
 *
 * `BLUEAI_CONFIG_DIR` 设置时跳过第 4 层（与 blueai-cli 语义一致）。全部来源均无时返回 null。
 */
export function getApiKey(options: ResolveApiKeyOptions = {}): string | null {
  // 1. --api-key flag
  if (options.flagKey) return options.flagKey;

  // 2. SKILLS_API_KEY
  const skillsEnvKey = process.env[API_KEY_ENV_VAR];
  if (skillsEnvKey) return skillsEnvKey;

  // 3. ~/.blueai/secrets.json（skills login 写的原生来源）
  const secretsPath = options.secretsPath ?? getSecretsPath();
  const secretsValue = readJsonObject(secretsPath)[API_KEY_SECRET_KEY];
  if (typeof secretsValue === 'string' && secretsValue) return secretsValue;

  const configDir = options.configDir ?? getConfigDir();
  const profile = getActiveProfile(configDir);

  // 4. 工作区凭据（BLUEAI_CONFIG_DIR 设置时跳过）
  if (!process.env[BLUEAI_CONFIG_DIR_ENV_VAR]) {
    const workspaceDir = findWorkspaceConfigDir(options.cwd ?? process.cwd());
    if (workspaceDir) {
      const workspaceKey = readCredentialApiKey(join(workspaceDir, 'credentials.json'), profile);
      if (workspaceKey) return workspaceKey;
    }
  }

  // 5. BLUEAI_API_KEY
  const blueaiEnvKey = process.env[BLUEAI_API_KEY_ENV_VAR];
  if (blueaiEnvKey) return blueaiEnvKey;

  // 6. 用户级 credentials.json
  return readCredentialApiKey(join(configDir, 'credentials.json'), profile);
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
