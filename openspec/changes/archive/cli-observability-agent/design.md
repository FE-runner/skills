# CLI 可观测（observability）接入 — Design

## Context

市场侧 `observability-agent-guide` 已定稿：`POST /api/observability/create`、`GET /api/observability/list`、`POST /api/observability/renewToken`（body `{ agentId }`），非 install 端点走 `authGuard()` 的统一 Cookie + Bearer API Key 双通道；安装 token 一次性 + 5 分钟过期。CLI 已具备 API Key 鉴权（`auth.ts`，复用 `SKILLS_API_KEY`）与 `providers/market.ts` 的统一请求封装（`requestApiResult` 保留 HTTP 状态码与错误详情）。本 change 复用这些既有能力接入命令层。

## Goals / Non-Goals

**Goals:**

- 终端环境完成开通/清单/换 token 三个操作，与网页共用同一张表
- 错误路径可读（401/404/校验失败 → 明确提示）

**Non-Goals:**

- 不做编辑/删除命令（v1 最小集：add/list/refresh）
- 不修改 CLI 鉴权机制
- 不实现安装（安装仍靠用户复制 curl 命令本机执行）

## Decisions

### D1: 命令路由与参数解析

`src/cli.ts` switch 新增 `obs` 分支，分发到 `src/obs.ts` 的 `runObs(args)`：

```
skills obs <agentName> --agent hermes|openclaw [--note "..."]   → create
skills obs list                                                  → list
skills obs refresh <agentId>                                    → renewToken
```

- 首个非 `--` 位置参数语义由子命令决定：跳过 `add` 字样的直接 `obs <name> --agent …`（对齐 `skills find <kw>` 惯例）；`list`/`refresh` 明确关键字
- **保留字处理**：`agentName` 不得取 `add`/`list`/`refresh` 三个关键字（`obs add` / `obs list` / `obs refresh` 均有子命令语义）；命中保留字时输出明确错误提示并退出非零
- 解析用极小手工解析（沿用 publish.ts 的 `--x` 风格），不引新依赖

### D2: provider 调用

在 `src/providers/market.ts` 上新增三个方法，全部走既有 `requestApiResult`：

```
createObservability(payload)          POST /api/observability/create
                                         body: { agentType, agentName, note? }
listObservability()                   GET  /api/observability/list
renewObservability(agentId)           POST /api/observability/renewToken
                                         body: { agentId }          // 对齐市场侧 RPC-over-HTTP POST + JSON body 契约
```

所有请求统一携带已配置的 API Key（`SKILLS_API_KEY`）作为 Bearer 鉴权请求头；响应统一解包（沿用既有 `unwrapEnvelope`）后再处理。

### D3: 鉴权与错误处理

- 命令入口先 `getApiKey()`，没有则输出「请先运行 `skills login <api-key>` 或设置 `SKILLS_API_KEY`」并退出 1
- 调用失败走 `reportApiFailure`（对齐 whoami/publish）：401 → 提示 Key 失效；404 → 「记录不存在/token 失效」；网络错误 → 提示重试

## Risks / Trade-offs

- **[命令语义歧义]** `obs <agentName> --agent` 与 `obs refresh <agentId>` 都是短命令，误用参数 → 通过 `--agent` 必填 + refresh 强制接收数字 agentId 区分，失败归结为参数校验提示
- **[依赖市场侧版本]** 命令依赖市场 API 已上线 → 交付前与 observability-agent-guide 联调（冒烟：create → list → refresh 顺序验证）

## Migration Plan

- 纯新增命令，无数据迁移；随 CLI 版本一起发布
- 回滚：去除 `obs` 分支即可