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

/**
 * 统一发起请求并解析为 `ApiResult<T>`。
 * 与既有只读方法（`resolve`/`fetchById`/`check`）的 `catch { return null }` 模式不同，
 * 这里保留 HTTP 状态码、服务端 code/message/校验详情，供命令层区分 401/404/网络异常。
 */
async function requestApiResult<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
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

  return {
    ok: false,
    status: res.status,
    code: json?.code,
    message: json?.message ?? `HTTP ${res.status}`,
    issues: json?.details,
  };
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
  teamId?: string; // 当通过 team 解析时返回
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
    team?: string
  ): Promise<MarketSkill | null> {
    try {
      const body: Record<string, string> = { id: skillId };
      if (version) body.version = version;
      if (team) body.team = team;
      else if (author) body.author = author;
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
    visibility?: 'PRIVATE' | 'PUBLIC'
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
