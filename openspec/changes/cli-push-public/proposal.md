## Why

skills-market 正在并行推进 `skill-push-public`（见 `../../../../skills-market/openspec/changes/skill-push-public/`）：`POST /api/skill/push` 新增可选字段 `visibility`（`PRIVATE` | `PUBLIC`），使 push 也能承载公开 Skill 的新建与更新（走 PENDING 审核状态机），而不是像现在这样遇到公开 Skill 直接 409 拒绝。CLI 侧 `skills publish` 目前完全不知道这个字段，无法让用户通过 CLI 走公开 Skill 的新建/更新，只能继续手动走 Web 界面。需要 CLI 并行补上对应能力，两侧接口对齐后才能一起验收。

## What Changes

- `providers/market.ts` 的 `push()` 新增可选参数 `visibility`，有值时写入请求体 `visibility` 字段；不传时行为与现状完全一致（省略即 PRIVATE，向后兼容）。
- `skills publish` 新增 `--public` flag。带该 flag 时以 `visibility: 'PUBLIC'` 调用 push；不带则保持现有 PRIVATE upsert 语义不变。
- `--public` 与既有 `--team` 可以叠加使用，不互斥：`publishToTeam` 只按 `skillId` + 作者身份工作，不关心 skill 当前 visibility/status，两条状态机独立。
- 响应输出区分场景：PUBLIC 场景服务端返回 `status: PENDING`（提交即待审核，非立即生效），CLI 输出改为"已提交审核"而非"推送成功"，避免用户误以为已经上线。PRIVATE 场景输出保持不变。
- 补充几种已知失败场景的人话提示（在现有 `reportApiFailure` 通用输出之外追加一行提示，不改变通用错误处理路径）：
  - 403（USER 角色请求 `--public`）：提示当前账号角色无权发布公开 Skill
  - 409（命中同名 PRIVATE Skill）：提示改走 Web 发布流程，或去掉 `--public` 更新私有版本
  - 409（全局同名 PUBLIC 冲突）：提示名称已被占用
  - 400（目标 Skill 正在 PENDING 审核中）：提示先 `skills withdraw <name>` 撤回或等审核完成
- **不改动** `skills withdraw`：该命令已经是通用实现（按 skillId 撤回，具体场景由服务端判断），本身就支持撤回公开 Skill 的审核，不需要跟着这次变更改动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `cli-publish`：新增 `--public` flag 及其请求体字段传递、`--team`/`--public` 组合行为、PUBLIC 场景的响应输出与错误提示 Requirement；现有 PRIVATE 相关 Requirement 保持不变。

## Impact

- **代码**：`src/providers/market.ts`（`push()` 签名新增可选参数）、`src/publish.ts`（`parsePublishOptions`/`PublishOptions`/`runPublish` 的输出与错误提示分支）。
- **测试**：`publish.test.ts` 补 `--public` 场景（含与 `--team` 叠加）、`providers/market.ts` 对应单测补 `visibility` 字段传递校验。
- **文档**：README/CLAUDE.md 中 `skills publish` 用法说明需补 `--public` 选项。
- **依赖**：功能验收依赖 skills-market 的 `skill-push-public` 变更部署上线；`visibility` 是新增可选字段，CLI 侧代码可以先行开发，但端到端验证（403/409/400 各分支、PENDING 状态输出）要等对端接口就位后手动跑一遍。
- **不影响**：不带 `--public` 的现有调用方（CI 脚本、已有用户习惯）行为和输出完全不变。
