import type { RemoteSkill } from './types.ts';
import type { ApiResult } from '../types.ts';
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

/** 响应信封的宽松形状，仅用于从失败响应里挑出 code/message/details */
interface ApiEnvelope {
  code?: string;
  message?: string;
  data?: unknown;
  details?: unknown;
}

/** 中央身份解析不可用/限流时市场返回的状态码 */
const SERVICE_UNAVAILABLE_STATUS = 503;

/** 503 最多重试次数（共 MAX_503_RETRIES + 1 次尝试） */
const MAX_503_RETRIES = 2;

/** 无 Retry-After 时的默认退避基线（按尝试序号取，超出后取最后一档） */
const BACKOFF_BASE_MS = [500, 1000];

/** 单次等待上限：Retry-After 再大也不超过它 */
const RETRY_AFTER_CAP_MS = 10_000;

/** 叠加的抖动上限（0 与上限之间的随机值），避免重试同步化 */
const JITTER_MAX_MS = 250;

/**
 * 解析 `Retry-After` 头，返回等待毫秒数；缺失或非法返回 null。
 * 同时支持秒数（按 HTTP 规范允许的 delay-seconds）与 HTTP-date。
 * 已过期的 HTTP-date 返回 0（立即重试）。
 */
export function parseRetryAfterMs(header: string | null | undefined): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, timestamp - Date.now());
}

/**
 * 计算第 `attempt` 次重试前的等待毫秒数（attempt 从 0 起）：
 * 优先按 `retryAfterMs`，缺失/非法时回退到基线退避，两者都受 10s 上限约束，
 * 最后叠加 0~250ms 抖动。
 */
export function computeRetryDelayMs(attempt: number, retryAfterMs: number | null): number {
  const base = BACKOFF_BASE_MS[Math.min(attempt, BACKOFF_BASE_MS.length - 1)]!;
  const preferred = retryAfterMs !== null && Number.isFinite(retryAfterMs) ? retryAfterMs : base;
  const capped = Math.min(Math.max(preferred, 0), RETRY_AFTER_CAP_MS);
  const jitter = Math.floor(Math.random() * (JITTER_MAX_MS + 1));
  return capped + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 严格校验并解码服务端 `binaryFiles` 的标准 Base64 值。
 *
 * `Buffer.from(value, 'base64')` 不会抛错——非法字符会被静默忽略、可能返回被截断甚至为空的
 * 结果，所以必须自己判定：字符集、`=` padding、长度 `% 4 === 0`、回编码与输入一致、且解码非空。
 * 任一不满足返回 `null`（调用方据此判定安装失败，不落任何文件）。
 */
export function decodeBinaryFileContent(value: string): Uint8Array | null {
  if (value.length === 0 || value.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;

  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0) return null;
  if (bytes.toString('base64') !== value) return null;

  return bytes;
}

/**
 * 统一发起请求并解析为 `ApiResult<T>`。
 * 与既有只读方法（`resolve`/`fetchById`/`check`）的 `catch { return null }` 模式不同，
 * 这里保留 HTTP 状态码、服务端 code/message/校验详情，供命令层区分 401/404/网络异常。
 *
 * 对 `503`（中央身份解析不可用/限流）做有界重试：最多 `MAX_503_RETRIES` 次，
 * 退避优先按 `Retry-After`、否则按基线，单次等待上限 10s，重试期间在 stderr 提示进度。
 * `401`/`403` 等其它状态不重试。市场侧 503 发生在鉴权守卫中（业务处理之前），
 * 因此包含非幂等写请求在内的重试都是安全的。
 */
async function requestApiResult<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      return { ok: false, status: 0, message: err instanceof Error ? err.message : String(err) };
    }

    let json: ApiEnvelope | undefined;
    try {
      json = (await res.json()) as ApiEnvelope;
    } catch {
      // 响应体非 JSON（如服务不可达返回的 HTML 错误页）
    }

    if (res.ok && json?.code === 'SUCCESS') {
      return { ok: true, data: json.data as T };
    }

    // 防御性读取：测试替身/异构 Response 可能没有 headers 字段
    const retryAfterMs = parseRetryAfterMs(res.headers?.get?.('retry-after') ?? null);

    if (res.status === SERVICE_UNAVAILABLE_STATUS && attempt < MAX_503_RETRIES) {
      const delayMs = computeRetryDelayMs(attempt, retryAfterMs);
      console.error(
        `服务暂不可用，正在重试 (${attempt + 1}/${MAX_503_RETRIES})…（${Math.round(delayMs / 1000)}s 后）`
      );
      await sleep(delayMs);
      continue;
    }

    return {
      ok: false,
      status: res.status,
      code: json?.code,
      message: json?.message ?? `HTTP ${res.status}`,
      issues: json?.details,
      retryAfterSeconds: retryAfterMs === null ? undefined : Math.round(retryAfterMs / 1000),
    };
  }
}

/**
 * Represents a skill fetched from the Skills Market.
 */
export interface MarketSkill extends RemoteSkill {
  /**
   * All files in the skill, keyed by relative path.
   * 文本文件为 `string`（UTF-8），二进制文件为原始字节（`Uint8Array`）；
   * 两类内容共用同一张 map，`add.ts` 里的整表替换（probed/monitored）才不会漏掉二进制。
   */
  files: Map<string, string | Uint8Array>;
  /** The skill ID on the market */
  skillId: string;
  /** The resolved version string */
  version: string;
  /** SHA-256 based folder hash for update detection */
  skillFolderHash: string;
  /** 采集改造信息（fetchById 传 report=true 且作者开启时带返） */
  collect?: unknown;
  /**
   * `binaryFiles` 中未通过严格 Base64 校验的条目（`<path>: <原因>`）。
   * 非空时安装必须失败且不得写盘（由 installer 入口判定）。
   */
  binaryFileErrors?: string[];
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
  /** 二进制文件（标准 Base64，无 data URI 前缀）；没有二进制文件时该字段不出现 */
  binaryFiles?: Record<string, string>;
  skillFolderHash: string;
  /** 采集改造信息：report=true 且作者开启采集时返回（含 config.meta 签名与改造版 files） */
  collect?: unknown;
}

/**
 * Resolve API response shape from the market.
 */
interface ResolveResponse {
  id: string;
  name: string;
  currentVersion: string;
  authorId: string;
  teamId?: string; // 当通过 team 解析时返回
}

/**
 * Check API response shape from the market.
 */
interface CheckResponse {
  currentVersion: string;
}

/**
 * 观测接入记录（`obs list` 返回的每一条），含 `id`（agentId）供 `obs refresh` 引用。
 * 接入为单一 loongsuite 方案（无 agentType）。
 */
export interface ObservabilityRecord {
  id: string;
  agentName: string;
  note?: string | null;
  serviceName: string;
  createdAt: string;
}

/** 双平台安装命令契约（与市场侧 create/renewToken 响应一致） */
export interface ObservabilityInstallCommand {
  unix: string;
  windows: string;
}

/** `/api/observability/create` 返回: 创建后记录 + 双平台安装命令/脚本 */
export interface CreateObservabilityResponse {
  id: string;
  agentName: string;
  serviceName: string;
  installCommand: ObservabilityInstallCommand;
  installScript: ObservabilityInstallCommand;
  note?: string | null;
}

/** `/api/observability/renewToken` 返回：换发后的双平台安装命令 */
export interface RenewObservabilityResponse {
  serviceName: string;
  installCommand: ObservabilityInstallCommand;
}

/**
 * Skills Market provider.
 *
 * Install flow: resolve by name → install by ID
 * For private skills, pass author (userId) to resolve and install.
 *
 * Also supports check/update via the /api/skill/check endpoint.
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

      const res = await fetch(`${this.apiBase}/api/skill/resolve?${params}`);
      if (!res.ok) return null;
      return unwrapEnvelope<ResolveResponse>(await res.json());
    } catch {
      return null;
    }
  }

  /**
   * Install a skill by its market ID.
   * Pass `author` for private skills (userId format).
   * Pass `team` for team skills (teamId format),优先于 author。
   */
  async fetchById(
    skillId: string,
    version?: string,
    author?: string,
    team?: string,
    report?: boolean
  ): Promise<MarketSkill | null> {
    try {
      const body: Record<string, string | boolean> = { id: skillId };
      if (version) body.version = version;
      if (team) body.team = team;
      else if (author) body.author = author;
      // Market 契约（SkillInstallBody）report 为 boolean；发字符串 'true' 会被
      // 路由的 `body.report === true` 判 false，导致采集配置永不下发
      if (report) body.report = true;
      const url = `${this.apiBase}/api/skill/install`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
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
      const params = new URLSearchParams({ id: skillId });
      if (author) params.set('author', author);
      const url = `${this.apiBase}/api/skill/check?${params}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return unwrapEnvelope<CheckResponse>(await res.json());
    } catch {
      return null;
    }
  }

  /**
   * 推送（upsert）本地 Skill 到市场：同名则更新已有私有 Skill，不同名则创建新私有 Skill。
   * 用于 `skills publish` 命令。失败时保留 HTTP 状态码/服务端 message/校验详情，不折叠成 null。
   */
  async push(
    skillMd: string,
    files: Array<{ path: string; content: string }>,
    version: string | undefined,
    apiKey: string,
    visibility?: 'PRIVATE' | 'PUBLIC',
    teamIds?: string[]
  ): Promise<
    ApiResult<{
      skillId: string;
      name: string;
      currentVersion: string;
      visibility: string;
      status: string;
    }>
  > {
    const body: Record<string, unknown> = { skillMd };
    if (files.length > 0) body.files = files;
    if (version) body.version = version;
    if (visibility) body.visibility = visibility;
    if (teamIds && teamIds.length > 0) body.teamIds = teamIds;

    const result = await requestApiResult<{
      id: string;
      name: string;
      currentVersion: string;
      visibility: string;
      status: string;
    }>(`${this.apiBase}/api/skill/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!result.ok) return result;

    const { data } = result;
    return {
      ok: true,
      data: {
        skillId: data.id,
        name: data.name,
        currentVersion: data.currentVersion,
        visibility: data.visibility,
        status: data.status,
      },
    };
  }

  /**
   * 将 Skill 分发到多个团队（提交团队审核）。用于 `skills publish --team` 命令。
   */
  async publishToTeam(
    skillId: string,
    teamIds: string[],
    apiKey: string
  ): Promise<ApiResult<null>> {
    return requestApiResult<null>(`${this.apiBase}/api/skill/publishToTeam`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ id: skillId, teamIds }),
    });
  }

  /**
   * 撤回处于 PENDING 状态的公开 Skill 审核。用于 `skills withdraw` 命令。
   * 三种撤回场景（draft 更新 / 私有发布到市场 / 首次公开创建）由服务端自动判断。
   */
  async withdraw(
    skillId: string,
    apiKey: string
  ): Promise<ApiResult<{ status: string; visibility: string }>> {
    const result = await requestApiResult<{ status: string; visibility: string }>(
      `${this.apiBase}/api/skill/withdraw`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ id: skillId }),
      }
    );
    return result;
  }

  /**
   * 带鉴权的名称解析，用于 `skills withdraw <name>` 拿到目标 skillId。
   *
   * skills-market 侧 `GET /api/skill/resolve`（`app/api/skill/resolve/route.ts`）已支持：
   * 请求携带 `Authorization` 且未显式传 `author` 时，优先按当前登录用户的 `authorId` + `name`
   * 精确匹配，不受 `visibility`/`currentVersion` 限制，覆盖 PENDING、无 currentVersion 的公开
   * Skill（首次公开创建撤回场景）；查不到再回退匿名解析逻辑。因此本方法无需再传 `author`。
   */
  async resolveMine(name: string, apiKey: string): Promise<ApiResult<ResolveResponse>> {
    const params = new URLSearchParams({ name });
    return requestApiResult<ResolveResponse>(`${this.apiBase}/api/skill/resolve?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  }

  /**
   * 查询当前 API Key 对应的用户身份。用于 `skills whoami` 命令。
   * `GET /api/auth/me` 内部 `getCurrentUser()` 在 Cookie 缺失时 fallback 到
   * `getCurrentUserFromBearer()`，已确认支持 `sk-` 前缀 API Key。
   */
  async whoami(
    apiKey: string
  ): Promise<
    ApiResult<{ name: string; email: string | null; role: string; isSuperAdmin: boolean }>
  > {
    return requestApiResult<{
      name: string;
      email: string | null;
      role: string;
      isSuperAdmin: boolean;
    }>(`${this.apiBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  }

  /**
   * 创建观测接入记录。用于 `skills obs <agentName> --agent <type> [--note ……]` 命令。
   * `POST /api/observability/create`，请求体 `{ agentType, agentName, note? }`；
   * 返回该记录的 serviceName 与一次性安装命令（与市场网页共用同一张表）。
   */
  async createObservability(
    payload: { agentName: string; note?: string },
    apiKey: string
  ): Promise<ApiResult<CreateObservabilityResponse>> {
    const body: Record<string, string> = {
      agentName: payload.agentName,
    };
    if (payload.note) body.note = payload.note;

    return requestApiResult<CreateObservabilityResponse>(
      `${this.apiBase}/api/observability/create`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      }
    );
  }

  /**
   * 列出当前用户的观测接入清单。用于 `skills obs list` 命令。
   * `GET /api/observability/list`，响应每一项含 `id`（agentId），
   * 供 `skills obs refresh <agentId>` 引用。
   */
  async listObservability(apiKey: string): Promise<ApiResult<ObservabilityRecord[]>> {
    return requestApiResult<ObservabilityRecord[]>(`${this.apiBase}/api/observability/list`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  }

  /**
   * 换发接入记录的安装凭证（旧 token 立即作废）。用于 `skills obs refresh <agentId>` 命令。
   * `POST /api/observability/renewToken`：请求体 `{ agentId }`（RPC-over-HTTP POST + JSON body 惯例），
   * 返回带新 installToken 的安装命令。
   */
  async renewObservability(
    agentId: string,
    apiKey: string
  ): Promise<ApiResult<RenewObservabilityResponse>> {
    return requestApiResult<RenewObservabilityResponse>(
      `${this.apiBase}/api/observability/renewToken`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ agentId }),
      }
    );
  }

  // ─── Private Helpers ───

  private toMarketSkill(data: InstallResponse, skillId: string): MarketSkill {
    const files = new Map<string, string | Uint8Array>();
    for (const [path, content] of Object.entries(data.files)) {
      files.set(path, content);
    }

    // 二进制与文本共用同一张 map；先 files 后 binaryFiles，同名以字节版本为准。
    // 服务端按文件内容二选一（互斥），这里按覆盖语义处理只作防御。
    const binaryFileErrors: string[] = [];
    for (const [path, base64] of Object.entries(data.binaryFiles ?? {})) {
      const bytes = decodeBinaryFileContent(base64);
      if (bytes === null) {
        binaryFileErrors.push(`${path}: 不是合法的标准 Base64，或解码结果为空`);
        continue;
      }
      files.set(path, bytes);
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
      ...(data.collect !== undefined ? { collect: data.collect } : {}),
      ...(binaryFileErrors.length > 0 ? { binaryFileErrors } : {}),
    };
  }
}

export const marketProvider = new MarketProvider();
