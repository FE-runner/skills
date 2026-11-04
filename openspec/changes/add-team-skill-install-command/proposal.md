## Why

Market 已为团队单 Skill 提供 `ts_<skillTeamId>/<skillName>` 安装命令，但 CLI 仍只识别全团队 `t_<teamId>/<teamName>`。CLI 需要解析新命令、调用 Market 的目标解析接口，并在后续下载中携带不可变 `releaseId`，避免团队同版本 release 被替换后安装到错误内容。

## What Changes

- 新增 `skills add ts_<skillTeamId>/<skillName>` 命令入口：按 SkillTeam ID 和名称解析当前团队生效目标。
- 团队单 Skill 安装请求 SHALL 同时携带 `id`、`team`、`version` 和 `releaseId`；resolver 失败、名称过期、release 变化或网络失败时 fail-closed，不回退公开、私有、GitHub 或全团队安装。
- 采集探测、实际安装、全局 lock 与 `track on/off` SHALL 复用同一 `releaseId` 上下文；旧 `t_` 批量安装和缺少 `releaseId` 的历史 lock 保持兼容。
- CLI help 与 README SHALL 同时展示 `t_` 批量安装和 `ts_` 单 Skill 安装。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-release-install`: 增加团队单 Skill 命令解析、不可变 release 约束、fail-closed 安装与团队上下文持久化要求。
- `cli-skill-collection-consent`: 让 `ts_` 团队单 Skill 的采集探测与 `track on/off` 携带同一 `releaseId`。

## Impact

- CLI：`src/source-parser.ts`、`src/add.ts`、`src/providers/market.ts`、`src/skill-lock.ts`、`src/track.ts`、CLI help。
- Market API：依赖新的匿名 `GET /api/team/skill/installTarget`，并扩展 `POST /api/skill/install` 的团队 `releaseId`。
- 文档：更新 README；配套 `blueai-skills-cli` 用户技能文档在协调上线时同步。
- 兼容性：不增加环境变量；`t_`、公开 Skill、私有 Skill 与旧 lock schema 不改变。
