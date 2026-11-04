## Context

CLI 已把 Market 安装源统一解析为 `ParsedSource`，并通过 `handleMarketSkill` 完成单 Skill 下载、采集探测、落盘和 lock 写入。全团队 `t_` 入口在进入该函数前由 `handleTeamInstall` 截获；团队单 Skill 需要新增一条只解析一个目标、但仍复用单 Skill 安装后链路的路径。Market resolver 的 409 名称过期与 404 目标不存在需要保留错误语义，不能继续使用只返回 `null` 的旧 `resolve`。

## Goals / Non-Goals

**Goals:**

- 在不新增 `ParsedSource.type` 的前提下识别 `ts_`，复用既有 market 单 Skill 安装主流程。
- 把 resolver 返回的 `releaseId` 贯穿原始下载、采集探测和正式安装。
- 让全局与项目级 lock、`track on/off` 保留团队单 Skill 身份，旧 lock 无需迁移。

**Non-Goals:**

- 不改变 `t_` 全团队批量安装、公开/私有 resolve 或 GitHub 回退。
- 不为 `ts_` 增加本地缓存、自动刷新 release 或团队排行榜等 UI。
- 不提升 lock schema version，不增加环境变量开关。

## Decisions

### 用现有 market author 标记承载 `ts_`

`parseMarketInstallCommand` 已把第一个路径段放入 `marketAuthor`，因此 `ts_<skillTeamId>` 可沿用现有 market 类型，仅在 `ParsedSource` 增加可选 `marketReleaseId` 与运行期团队单 Skill 标识。CLI 在 `t_` 检查之前识别 `ts_` 前缀；这样不会把 SkillTeam ID 当作私有 author，也不会进入 GitHub fallback。

替代方案是新增 `market-team-skill` 类型，但会扩散到 clone、过滤、telemetry 和 lock 分支；现有 market 单 Skill 流程已经具备所需能力，扩展现有结构改动更小。

### resolver 返回结构化结果

新增 Market provider 方法调用 `GET /api/team/skill/installTarget`，返回值使用既有 `ApiResult`，保留 404、409、消息和校验详情。命令层在 resolver 非成功时直接显示错误并退出，不把失败折叠成 `null` 后误走私有/GitHub解析。

### 复用 `handleMarketSkill`，显式区分团队单 Skill

resolver 成功后，把 `skillId`、`teamId`、`installVersion`、`releaseId` 与 `ts_` 显示标签注入 `handleMarketSkill`。该函数跳过名称 resolve，所有 `fetchById` 调用（含 `report=true` 探测）追加同一 `releaseId`。普通 market 调用的第六参数为空，行为不变。

### lock 保存团队单 Skill 身份

全局 `SkillLockEntry` 增加可选 `skillTeamId` 与 `releaseId`；`track list` 优先显示 `ts_<skillTeamId>/<name>`，`track on/off` 把 `releaseId` 传给 Market。项目级 `LocalSkillLockEntry` 保存同一可选字段，并把可恢复来源写成 `ts_<skillTeamId>/<skillName>`，使 `experimental_install` 能重新走 resolver。新增字段均为可选，旧 lock 不迁移、不清空。

### check/update 对 `ts_` 使用 resolver

全局和项目级 `check` 识别带 `skillTeamId` 的 market entry 后，不调用 `/api/skill/check`，而是用 `skillTeamId + name` 调团队 resolver，并比较返回的 `releaseId`（同时校验 version）。`update` 使用锁内 `ts_<skillTeamId>/<skillName>` source 重新执行 `add`，由 resolver 取得最新 approved release；这样不会误用公开 Skill 的 check ID，也不会把 `market/team/...` 拼成不存在的安装源。resolver 失败时记录检查错误或跳过更新，不回退普通 Market/GitHub。

### 错误与兼容策略

`ts_` resolver 或 release 下载失败时只输出错误，不回退其他渠道。旧 `t_` entry 缺少 `skillTeamId`/`releaseId` 时按原 teamId/skillPath/version 请求；旧 Market 不返回 `releaseId` 时 `t_` 行为不变。Market 先在兼容窗口提供 resolver 和可选 `releaseId`，CLI 随后同批发布；回滚 CLI 不影响旧 `t_` 和其他安装源。

## Risks / Trade-offs

- [团队 release 在 resolver 与安装之间切换] → 安装接口同时校验当前 `approvedReleaseId` 与 version；CLI 收到 404 后不回退，提示用户重新复制命令。
- [旧 lock 缺少新字段] → 所有字段可选，`track` 和恢复流程只在字段存在时启用 release-bound 路径。
- [团队采集探测与正式安装版本漂移] → 原版下载、`report=true` 探测和正式安装复用同一 resolver 结果；任一后续请求失败均不回退其他版本。
- [`check/update` 混用普通 market 语义] → 带 `skillTeamId` 的 entry 单独走团队 resolver 与 `ts_` source；旧 entry 分支不变。
- [CLI 与 Market 发布不同步] → `ts_` 只在新 CLI 生效且 resolver 缺失时 fail-closed；旧 `t_` 与普通安装继续工作。

## Migration Plan

1. Market 先发布匿名 resolver 与可选 `releaseId` 安装校验，保持旧请求兼容。
2. CLI 与配套 Web 安装命令在同一发布窗口上线 `ts_` 解析和 release-bound 下载。
3. 验证旧 `t_`、公开/私有安装和旧 lock 后，再开放新团队单 Skill 命令。
4. 发布负责人确认 Market resolver、Web 命令和外部用户文档已就绪后开放 `ts_`；部署执行不属于 apply。
5. 回滚时撤销 CLI 新版本即可；已写出的 lock 新增字段仍被旧版本安全忽略。
