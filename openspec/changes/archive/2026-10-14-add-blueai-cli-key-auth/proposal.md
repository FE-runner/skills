## Why

blueflare 等外部 agent 环境使用 blueai-cli 的统一 apiKey 鉴权，凭证来源是
`--api-key` flag、工作区/用户 `~/.blueai/credentials.json`（按 `activeProfile`）或
`BLUEAI_API_KEY` 环境变量。skills-cli 目前只认 `SKILLS_API_KEY` 与
`~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]`，在只有统一 key 的环境里解析不到
凭证，`publish` / `withdraw` / `whoami` 无法工作。

配合 market 侧 central-openapi-user-auth（统一 key 由服务端解析为用户身份，客户端契约零变化），
skills-cli 需要扩展本地凭证解析链，让"有 blueai-cli 授权的人"能直接对 Skill Market 鉴权。
同时 market 侧约定：中央解析不可用或限流时返回 503，客户端应视为**可重试**，不能落入"key 无效"。

## What Changes

- 扩展 API Key 读取链，新增 4 个来源并与 blueai-cli 语义对齐（含 `activeProfile` 解析与
  `BLUEAI_CONFIG_DIR` 覆盖）。
- 新增 `--api-key` flag，作用于 `publish` / `withdraw` / `whoami`，单次调用临时覆盖所有持久化配置。
- 新增 503 有界重试：最多 2 次重试（共 3 次尝试），退避 500ms → 1s（抖动），`Retry-After`
  优先且上限 10s。
- 新增错误分级：401/403 为鉴权失败；500/503 为服务端异常，明确不当作 "key 无效"。
- **保持不变**：`skills login` 仍只写 `~/.blueai/secrets.json`；原生两条来源相对顺序不变；
  请求头与 endpoint 契约零变化；鉴权流程范围仍只有 `publish` / `withdraw` / `whoami`。

## Capabilities

### New Capabilities
<!-- 无新增 capability -->

### Modified Capabilities
- `cli-auth`: 读取优先级链从 2 级扩展为 6 级（新增 `--api-key`、工作区/用户
  `credentials.json`、`BLUEAI_API_KEY`），新增 `activeProfile` / `BLUEAI_CONFIG_DIR` 解析语义；
  新增 503 有界重试与 401/403/500/503 错误分级语义。
- `cli-publish`: 错误处理 requirement 增加 503 重试分支与"服务端异常非 key 无效"语义。
- `cli-withdraw`: 带鉴权的名称解析 requirement 增加 503 重试分支，明确 503 不误判为"名称不存在"
  或"鉴权失败"。

## Impact

- 代码：`src/auth.ts`（解析链重写）、`src/api-error.ts`（错误分级 + 最终提示）、
  `src/providers/market.ts`（`requestApiResult` 暴露 `Retry-After` 并按 503 有界重试）、
  `src/cli.ts`（`whoami` 透传 `restArgs`）、`src/publish.ts` / `src/withdraw.ts` /
  `src/whoami.ts`（接 `--api-key`、提示语）。
- 测试：`src/auth.test.ts` 扩展链路用例；新增 503 重试与错误分级用例。
- 依赖：真机端到端验收依赖 market 侧 central-openapi-user-auth 落地（统一 key → 200），
  在此之前实现与单测可完成，真机验收延后。
- 兼容性：现有 `SKILLS_API_KEY` / `secrets.json` 行为不回归；`skills login` 行为不变。
