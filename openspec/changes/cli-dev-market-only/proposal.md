## Why

开发版此前把凭证、全局锁与技能目录整体隔离到 `~/.blueai-skills-dev/`，代价是开发版安装的技能真实 agent 读不到，且与正式版的技能状态、登录态割裂。实际使用需要"用开发版装的技能能被 Claude / Codex 直接使用"，同时市场仍指向内网测试环境。因此把开发版的隔离范围收窄到只剩市场端点与命令提示 tag。

## What Changes

- 开发版构建只保留市场端点隔离（默认 `https://blueai-skills-market.domob-inc.cn`）与命令提示 tag（`@dev`）；正式构建默认值不变。
- 移除凭证隔离：`login` 与凭证读取回归 `~/.blueai/secrets.json`。
- 移除全局锁与技能目录隔离：全局锁回归 `~/.agents/.skill-lock.json`（或 `$XDG_STATE_HOME/skills/.skill-lock.json`），全局安装、列表、卸载回归真实 canonical 目录与真实 agent 目录。
- 移除 `BLUEAI_SKILLS_HOME` 与 `BLUEAI_SKILLS_DEV` 两个开关——它们只服务于被移除的隔离模式。
- 删除隔离模式在安装、卸载、扫描上的分支与对应测试，改为断言开发版与正式版共用同一套本地路径。
- 同步文档：`README.md`、`CLAUDE.md`、`DEV_VERSION_USAGE.md` 与飞书文档中"状态隔离"的相关说明。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cli-dev-distribution`: 移除隔离模式与状态根相关要求，改为"开发版仅覆盖市场端点与提示 tag，其余本地状态与正式版一致"。
- `cli-auth`: 凭证路径回归 `~/.blueai/secrets.json`，删除开发隔离模式分支。
- `agent-install-targets`: 移除开发隔离模式例外；对有独立 `globalSkillsDir` 的 agent 写入 agent 专属全局目录，universal agent 保持 canonical-only。
- `cli-skill-collection-consent`: 全局锁文件回归单一真实路径，删除开发隔离模式场景。

## Impact

- CLI 代码：`src/paths.ts`、`src/auth.ts`、`src/installer.ts`、`src/remove.ts`、`src/skill-lock.ts`、`src/cli.ts`、`build.config.mjs`。
- 测试：删除 `tests/dev-isolation.test.ts`，收缩 `src/paths.test.ts`，回归 `src/remove.test.ts`、`tests/list-installed.test.ts`。
- 文档：`README.md`、`CLAUDE.md`、`DEV_VERSION_USAGE.md`、`CHANGELOG.md`，以及已发布的飞书使用文档（同步隔离范围描述）。
- 已知影响：开发版与正式版共用登录态，切换市场需重新 `login` 或用 `SKILLS_API_KEY`；开发市场写入的 `skillId` 会进入真实锁，正式版 `check` 对这些条目匹配不上；同名技能在两个市场间互相覆盖。
- 不涉及 market 仓代码、不迁移既有本地状态、不改 `skills-lock.json` schema。
