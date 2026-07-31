## Why

`skills` CLI 目前只有消费侧能力（`add`/`find`/`check`/`update`/`list`/`remove`），本地写好的 Skill 无法通过 CLI 推送到 Skills Market，只能手动切到网页操作，或临时写一次性脚本调 `/api/skill/push`。需要把发布/更新/团队分发/撤回这条链路收进 CLI，补齐 `add-remote → publish-local` 的对称能力。

## What Changes

- 新增 `skills login <api-key>` 命令：保存市场 API Key 到本地，供后续命令鉴权用。凭证复用 `~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]` 这一已有约定键（其他本地脚本已在用同一把 Key），不引入新键名。
- 新增 `skills publish [path] [--version x.y.z] [--team a,b]` 命令：读取本地 SKILL.md + 附属文本文件，调用 `/api/skill/push` upsert 到私有 Skill；可选 `--team` 触发链式调用 `/api/skill/publishToTeam` 分发到多个团队。
- 新增 `skills withdraw <name>` 命令：撤回处于 PENDING 审核状态的公开 Skill，解除"卡在审核中无法再次 publish"的死锁，让公开 Skill 的审核流程在 CLI 内闭环。

## Capabilities

### New Capabilities

- `cli-auth`：本地保存/读取 Skills Market API Key（`skills login`，文件存储位置与读取优先级）
- `cli-publish`：将本地 Skill 目录推送/更新到 Skills Market（`skills publish`），含版本覆盖与可选团队分发
- `cli-withdraw`：撤回处于 PENDING 状态的公开 Skill（`skills withdraw`）

### Modified Capabilities

（无——本次不修改任何现有 CLI 消费侧命令的行为，也不修改 skills-market 服务端接口行为）

## Impact

- 影响代码：`src/cli.ts`（新增命令路由）、`src/providers/market.ts`（新增 `push`/`publishToTeam`/`withdraw` 方法）、新增 `src/auth.ts`（API Key 读写）、新增 `src/publish.ts`（发布逻辑）
- 依赖的外部接口（不修改，仅消费）：skills-market 的 `POST /api/skill/push`、`POST /api/skill/publishToTeam`、`POST /api/skill/withdraw`、`GET /api/skill/resolve`
- 不影响：现有 `add`/`find`/`check`/`update`/`list`/`remove` 命令行为不变
