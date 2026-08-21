# CLI 可观测（observability）接入 — Proposal

## Why

平台侧可观测模块已经定稿（observability-agent-guide：开通引导 → 唯一 serviceName → 包壳安装命令 → 用户本机手动执行）。但 CLI 用户无法在终端完成同样的开通与命令获取，仍要到网页操作，链路不完整。本 change 让 `skills` CLI 支持创建接入记录、列出清单、按 agentId 换发安装 token，与网页共用同一套 API 与数据表。

## What Changes

- 新增 `skills obs` 命令族（观测）：
  - `skills obs <agentName> --agent <hermes|openclaw> [--note "<备注>"]`：创建接入记录，返回 serviceName + 安装命令
  - `skills obs list`：当前用户接入清单（**含 agentId**/agentType/agentName/note/serviceName/createdAt）——`refresh` 所需 agentId 来自 `list` 输出
  - `skills obs refresh <agentId>`：**仅接受 agentId**，换发新 installToken（旧 token 立即作废），返回新安装命令
- CLI 通过已有 Bearer API Key 鉴权（`auth.ts` 复用 `SKILLS_API_KEY`），调用市场侧同一组 API（与网页共用一张表）——市场侧 `observability-agent-guide` 已承诺本组非 install 端点走 `authGuard()` 的 Cookie + Bearer 双通道
- CLI 帮助（`skills --help`/`skills obs --help`）补充 obs 用法
- **BREAKING**：无（纯新增命令，不影响既有命令）

## Capabilities

### New Capabilities

- `cli-observability-agent`: `skills obs` 命令族——创建接入记录、列出接入清单、按 agentId 换发安装凭证；鉴权沿用 API Key，与市场网页共用数据

### Modified Capabilities

（无既有规范行为变化）

## Impact

- `src/cli.ts`：命令路由新增 `obs` 家族
- 新增 `src/obs.ts`（或 providers 下扩展）：解析 `obs add/list/refresh` 参数
- `src/providers/market.ts`：新增 createObservability/listObservability/renewObservability 的 requestApiResult 调用
- `src/auth.ts`：复用现有 API Key（不新增键）
- 依赖市场侧 API（与 observability-agent-guide change 配套，CLI 不新增鉴权机制）：
  - `POST /api/observability/create` — Bearer API Key，body `{ agentType, agentName, note? }`
  - `GET /api/observability/list` — Bearer API Key，响应每项含 `id`
  - `POST /api/observability/renewToken` — Bearer API Key，body `{ agentId }`（RPC-over-HTTP POST + JSON body 惯例）
- `CHANGELOG.md`、`README.md` 补命令说明