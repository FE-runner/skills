## Why

`skills publish --team a,b` 之前分两步：push 成功后再单独发一次 `POST /api/skill/publishToTeam`。市场侧 `/api/skill/push` 现已支持在同一请求内直接完成团队分发（`skill-push-team-inline` 变更），CLI 侧继续保留两段式请求已无必要，且存在"push 成功但第二次请求因网络/进程退出丢失"的窗口。

## What Changes

- `marketProvider.push()` 新增 `teamIds` 参数，非空时写入请求体 `teamIds` 字段，随 push 一次性发出。
- `runPublish`（`src/publish.ts`）删除 push 成功后链式调用 `marketProvider.publishToTeam` 的逻辑，改为把 `--team` 解析出的 `teamIds` 直接传给 `marketProvider.push(...)`。
- `--team` 与 `--public` 仍可同时提供，语义不变：团队分发只依赖服务端返回的 `skillId` 与调用者身份，与本次 push 是否为 PUBLIC、是否 PENDING 无关（服务端保证）。
- push 失败时不会尝试团队分发（因为团队分发已内嵌在同一次请求里，服务端在 Skill 创建/更新失败时不会执行分发逻辑）。
- `marketProvider.publishToTeam()` 方法保留（供其他潜在场景单独调用），仅不再被 `runPublish` 使用。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `cli-publish`：`--team` 团队分发 Requirement 改为"随 push 请求一次性发出"，不再是"push 成功后链式调用"。

## Impact

- **代码**：`src/providers/market.ts`（`push()` 签名新增 `teamIds` 参数）、`src/publish.ts`（删除链式调用，改为透传参数）。
- **测试**：`src/publish.test.ts` 中依赖旧链式调用行为的用例改为断言 `push()` 调用参数包含预期 `teamIds`。
- **依赖能力**：依赖市场侧 `skill-push-team-inline` 变更已上线（`POST /api/skill/push` 支持 `teamIds` 字段）。
- **不影响**：不带 `--team` 的现有调用行为不变；`marketProvider.publishToTeam()` 方法签名和实现不变，仅调用方改变。
