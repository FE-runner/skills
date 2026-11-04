## Why

Market 的命令展示与 resolver/安装校验由配套 Market change 提供，但 CLI 仍只识别全团队 `t_<teamId>/<teamName>`。CLI 需要接入 `ts_<skillTeamId>/<skillName>` 解析，并在后续下载中携带不可变 `releaseId`，避免团队同版本 release 被替换后安装到错误内容。

## What Changes

- 新增 `skills add ts_<skillTeamId>/<skillName>` 命令入口：按 SkillTeam ID 和名称解析当前团队生效目标。
- 团队单 Skill 安装请求 SHALL 同时携带 `id`、`team`、`version` 和 `releaseId`；resolver 失败、名称过期、release 变化或网络失败时 fail-closed，不回退公开、私有、GitHub 或全团队安装。
- 采集探测、实际安装、全局 lock 与 `track on/off` SHALL 复用同一 `releaseId` 上下文；旧 `t_` 批量安装和缺少 `releaseId` 的历史 lock 保持兼容。
- `check/update` SHALL 通过团队 resolver 比较并更新 `ts_` entry，不得调用公开 Skill 的版本检查或把 `market/team` source 当普通更新源。
- CLI help 与 README SHALL 同时展示 `t_` 批量安装和 `ts_` 单 Skill 安装。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-release-install`: 增加团队单 Skill 命令解析、不可变 release 约束、fail-closed 安装与团队上下文持久化要求。
- `cli-skill-collection-consent`: 让 `ts_` 团队单 Skill 的采集探测与 `track on/off` 携带同一 `releaseId`。

## Impact

- CLI：`src/types.ts`、`src/source-parser.ts`、`src/add.ts`、`src/providers/market.ts`、`src/skill-lock.ts`、`src/local-lock.ts`、`src/track.ts`、`src/update-source.ts`、`src/cli.ts`。
- Market API：依赖新的匿名 `GET /api/team/skill/installTarget`，并扩展 `POST /api/skill/install` 的团队 `releaseId`。
- 文档：更新 README；配套 `blueai-skills-cli` 用户技能文档在协调上线时同步。
- 兼容性：不增加环境变量；`t_`、公开 Skill、私有 Skill 与旧 lock schema 不改变。
- 发布：部署与上线执行不属于 apply/commit 范围；发布负责人需在协调窗口确认 Market resolver、Web 命令和外部用户文档均已就绪。
