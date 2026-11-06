# Team Release Install Specification

## Purpose

让 CLI 通过 Team、Skill ID 和团队生效 release 版本完成批量或单 Skill 安装，以每次 release-bound 安装响应同时识别可观测 Skill 并落盘 active artifact，避免把团队 Skill 当作公开或私有 Skill 重新解析。

## Requirements

### Requirement: Team install list carries release version

CLI SHALL 读取 `/api/team/installAll` 返回的每个 Skill 标识、名称、展示名、authorId 和 `installVersion`。为兼容旧 Market，`installVersion` 缺失时可回退读取 `currentVersion`，但新 Market 响应存在 `installVersion` 时 MUST 优先使用它。

#### Scenario: New Market returns installVersion

- **WHEN** 团队安装列表返回 `installVersion=2.0.0`
- **THEN** CLI 使用 `2.0.0` 作为该 Skill 的安装版本

#### Scenario: Old Market omits installVersion

- **WHEN** 团队安装列表未返回 `installVersion` 但返回 `currentVersion=1.0.0`
- **THEN** CLI 使用 `1.0.0` 作为兼容版本

#### Scenario: Both release versions are missing

- **WHEN** 团队安装列表的 `installVersion` 和 `currentVersion` 都缺失
- **THEN** CLI 输出 Skill 与 Team 上下文警告
- **AND** 不发起名称 resolve 或安装请求
- **AND** 该 Skill 不计入 installable 列表

### Requirement: Team Skill installs by explicit identifier and team

团队批量安装中的每个 Skill SHALL 使用列表返回的 Skill ID、teamId 和生效版本直接请求 Market 安装接口，SHALL NOT 先经过 `resolve(name)`、裸名公开安装或 author/name 私有安装。请求体 MUST 包含 `id`、`team` 和 `version`，且 `team` 优先于 author 或公开解析。

#### Scenario: PUBLIC skill is still pending public review

- **WHEN** 团队列表返回一个 PUBLIC+PENDING Skill，但其团队已存在生效 release
- **THEN** CLI 以该 Skill ID、teamId 和 installVersion 调用安装接口
- **AND** 不要求该 Skill 出现在公开搜索结果中

#### Scenario: Team has previous approved release while new release is pending

- **WHEN** 团队新版待审且 installVersion 指向旧版
- **THEN** CLI 安装旧版
- **AND** 不尝试解析或安装待审新版

#### Scenario: Team Skill install fails

- **WHEN** 指定 teamId 或 installVersion 的安装请求失败
- **THEN** CLI 报告该团队版本不可用
- **AND** 不回退 GitHub、公开裸名或私有 author 解析

### Requirement: Team install identifies observable skills without report

团队批量安装 SHALL 使用列表返回的 Skill ID、teamId、installVersion 和 releaseId 获取每个 Skill 的唯一安装响应。列表缺少 `releaseId` 时，该 Skill SHALL 在发起安装前 fail-closed：不落盘、不写 `collectConsent`，且不回退公开、私有、GitHub 或其他团队版本。CLI SHALL 根据响应 `collect` 识别可观测 Skill，SHALL NOT 发送 `report` 或额外请求原版/改造版。

#### Scenario: Observable team Skill

- **WHEN** release-bound 安装响应含合法 `collect`
- **THEN** CLI 使用同一响应文件，并按 lock consent 决定是否询问统计

#### Scenario: Non-observable team Skill

- **WHEN** release-bound 安装响应不含 `collect`
- **THEN** CLI 安装该响应文件
- **AND** 未显式传 `--observability` 时不写 consent

#### Scenario: Explicit observability on a non-observable team Skill

- **WHEN** 团队安装传入 `--observability`，且某 Skill 的 release-bound 安装响应不含合法 `collect`
- **THEN** CLI 仍安装该响应文件并写 `collectConsent=true`
- **AND** 不发起额外探测请求

#### Scenario: Team list omits releaseId

- **WHEN** 新 Market 的团队安装列表返回某 Skill 但缺少 `releaseId`
- **THEN** CLI 将该 Skill 标记为团队版本不可用并跳过安装
- **AND** 不为该 Skill 写 `collectConsent`
- **AND** 不回退公开、私有、GitHub 或其他团队版本

### Requirement: Observable team version failure is fail-closed

Market 返回 `409 OBS_VERSION_UNAVAILABLE`、`releaseId` 缺失或不匹配、或其他安装失败时，团队 CLI SHALL 报告该 Skill 不可用，SHALL NOT 回退原版、公开解析、私有 author 解析、GitHub 或其他团队版本。

#### Scenario: Active artifact unavailable

- **WHEN** 团队可观测 Skill 没有可用产物
- **THEN** CLI 报错并跳过该 Skill，不回退替代来源

#### Scenario: Release binding is unavailable

- **WHEN** 团队 Skill 缺少 releaseId，或安装接口返回 releaseId 不匹配
- **THEN** CLI 报团队版本不可用并跳过该 Skill
- **AND** 不写 collectConsent

#### Scenario: One team Skill fails

- **WHEN** 团队批量安装中单个可观测 Skill 失败
- **THEN** 其他 Skill 可继续安装，失败项保留明确错误
- **AND** 失败项 SHALL NOT 写 `collectConsent`

### Requirement: Team lock context supports collection toggles

团队安装 SHALL 在当前 scope 对应 lock 中写入可选 `teamId`，不提升 lock schema version：全局写入 `SkillLockEntry`，项目级写入 `LocalSkillLockEntry`。全局 `track on/off` SHALL 只读取并改写对应 entry 的 `collectConsent`，SHALL NOT 请求 Market、调用 resolver 或 installer、下载文件、重装 Skill，也不得改写团队、版本、文件 hash 等其它字段。旧 lock entry 缺少 `teamId` 时 SHALL 保持原有 lock 字段兼容，不因 `track on/off` 触发安装重取。

#### Scenario: Team install writes team context

- **WHEN** 团队安装成功
- **THEN** lock entry 保存 Skill ID、teamId 和 version
- **AND** 仅当该 Skill 带有效采集配置且当前 scope 的采集决定已应用，或本次显式传 `--observability` 时保存 `collectConsent`
- **AND** source 标识包含 teamId

#### Scenario: Team skill without collect does not write consent

- **WHEN** 团队安装成功但该 Skill 无有效采集配置，且未显式传 `--observability`
- **THEN** lock entry 保存 teamId
- **AND** 不写 collectConsent 字段

#### Scenario: Project team install writes collection consent

- **WHEN** 项目级团队安装中的 Skill 带有效采集配置且用户同意
- **THEN** 项目 `skills-lock.json` 保存 teamId、Skill ID、version 和 collectConsent=true

#### Scenario: Track toggles a team skill

- **WHEN** 用户对带 teamId 的团队 lock entry 执行 `track on` 或 `track off`
- **THEN** CLI 只把对应 entry 的 `collectConsent` 写为 `true` 或 `false`
- **AND** 不请求 Market、不调用 installer、不改变版本、hash、teamId 或 source

#### Scenario: Legacy lock without teamId

- **WHEN** lock entry 没有 teamId
- **THEN** `track on/off` 仍只改写该 entry 的 collectConsent
- **AND** lock schema 不迁移、不清空

### Requirement: Team single Skill source resolves a stable target

CLI SHALL 识别 `ts_<skillTeamId>/<skillName>` 团队单 Skill 安装源。`skillTeamId` 与 `skillName` MUST 均为单个非空路径段；CLI SHALL 调用团队安装目标解析接口，以 `skillTeamId` 定位 SkillTeam、以 `skillName` 校验当前生效 release 名称，并取得 `teamId`、`skillId`、`installVersion` 与 `releaseId`。该入口 SHALL NOT 使用公开或私有名称 resolve。

#### Scenario: Resolve team single Skill successfully

- **WHEN** 用户执行 `skills add ts_team-skill-1/my-skill`
- **AND** Market 返回 `teamId=team-1`、`skillId=skill-1`、`installVersion=1.2.3`、`releaseId=release-1`
- **THEN** CLI 使用该组标识进入单 Skill 安装流程
- **AND** 不调用公开或私有名称解析

#### Scenario: Reject malformed team single Skill source

- **WHEN** 用户输入的 `ts_` 源缺少非空 SkillTeam ID、缺少 Skill 名或包含额外路径段
- **THEN** CLI 输出命令格式错误并退出
- **AND** 不发起 Market resolve、安装或 GitHub 回退

#### Scenario: Reject explicit version for team single Skill source

- **WHEN** 用户输入 `ts_<skillTeamId>/<skillName>@<version>`
- **THEN** CLI 拒绝该显式版本并以格式错误退出
- **AND** 安装版本只允许采用 resolver 返回的当前 approved release

#### Scenario: Reject stale Skill name

- **WHEN** resolver 返回名称已变化冲突
- **THEN** CLI 向用户显示需重新复制安装命令的错误
- **AND** 不安装任何 Skill

### Requirement: Team single Skill install is fail-closed and release-bound

团队单 Skill 的安装请求 SHALL 携带由 resolver 返回的 `id`、`team`、`version` 与 `releaseId`。CLI SHALL 使用这一次响应识别可观测 Skill、应用 consent 并安装文件，SHALL NOT 另发采集探测或第二次下载。resolver 返回 404、409、其他非成功响应或网络失败时，CLI MUST fail-closed，SHALL NOT 回退 GitHub、公开裸名、author/name 私有安装或 `t_` 全团队安装。安装接口拒绝已失效 `releaseId` 时，CLI SHALL 明确报告团队版本不可用。

#### Scenario: Install exact approved release

- **WHEN** resolver 返回当前团队生效目标
- **THEN** CLI 下载并安装该目标的 `installVersion`
- **AND** 安装请求包含同一 `releaseId`
- **AND** 不额外发送 `report` 或采集探测请求

#### Scenario: Resolver cannot find target

- **WHEN** resolver 返回 404 或网络错误
- **THEN** CLI 输出团队单 Skill 解析失败并退出
- **AND** 不发起名称解析、GitHub 或其他安装回退

#### Scenario: Approved release changed before download

- **WHEN** resolver 返回的 `releaseId` 在下载前已不是当前 `approvedReleaseId`
- **THEN** Market 安装接口返回不匹配
- **AND** CLI 报告团队版本已变化并退出，不回退其他渠道

### Requirement: Team single Skill context is persisted

全局 lock SHALL 为 `ts_` 安装保存 `teamId`、`skillTeamId`、`releaseId`、版本与 Skill ID；项目级 lock 的清点与来源 SHALL 保留同一团队单 Skill 上下文及 `collectConsent`。全局 `track list` SHALL 能识别团队单 Skill 来源，`track on/off` SHALL 只改写对应 entry 的 `collectConsent`，SHALL NOT 使用 lock 中的 `skillId`、`teamId`、版本或 `releaseId` 重取，也 SHALL NOT 重新走名称解析或安装。旧 `t_` 安装和缺少新增字段的历史 lock SHALL 保持字段兼容。

#### Scenario: Global install writes team single Skill context

- **WHEN** `ts_` 团队单 Skill 全局或项目级安装成功
- **THEN** lock entry 保存 `teamId`、`skillTeamId`、`releaseId`、`skillPath` 和安装版本
- **AND** 采集已定夺时在对应 lock 保存 `collectConsent`

#### Scenario: Track toggles release-bound team Skill

- **WHEN** 用户对带 `skillTeamId` 和 `releaseId` 的全局 lock entry 执行 `track on` 或 `track off`
- **THEN** CLI 只把对应 entry 的 `collectConsent` 写为 `true` 或 `false`
- **AND** 不请求 Market、不执行名称 resolve、不重装文件

#### Scenario: Legacy team lock remains compatible

- **WHEN** 全局 lock 只有旧 `teamId` 而没有 `skillTeamId` 或 `releaseId`
- **THEN** CLI 为 `track on/off` 保留这些既有字段
- **AND** 不提升 lock schema version

### Requirement: Team single Skill check and update use the team resolver

全局和项目级 `check` SHALL 对带 `skillTeamId` 的 entry 使用 `skillTeamId` 与 Skill 名调用团队 resolver，并以当前 `releaseId` 和安装版本判断是否有更新；该路径 MUST NOT 调用普通 Market `check`。`update` SHALL 从 `ts_<skillTeamId>/<skillName>` source 重新执行 `add`，由 resolver 选择当前 approved release；resolver 失败时 SHALL 报错或跳过，不得回退公开、私有、GitHub 或 `market/team` 安装源。

#### Scenario: Check detects a new approved release

- **WHEN** 全局或项目 lock 的 `ts_` entry 记录 `releaseId=release-1`
- **AND** resolver 当前返回 `releaseId=release-2`
- **THEN** `check` 将该 Skill 标记为有更新
- **AND** 不调用普通 `/api/skill/check`

#### Scenario: Update re-resolves the team target

- **WHEN** `update` 处理需要更新的 `ts_` entry
- **THEN** CLI 以 `ts_<skillTeamId>/<skillName>` 重新执行 `add`
- **AND** 由 resolver 返回的新 approved release 进入安装

#### Scenario: Team resolver fails during check

- **WHEN** 团队 resolver 返回 404、409 或网络错误
- **THEN** `check` 记录该团队 Skill 检查失败
- **AND** 不调用公开/私有 check，也不尝试其他安装源

### Requirement: Team single Skill command is discoverable in help

CLI help 和仓内 README SHALL 同时展示 `t_<teamId>/<teamName>` 批量安装与 `ts_<skillTeamId>/<skillName>` 单 Skill 安装，帮助文本 MUST 明确两者用途不同。

#### Scenario: User opens add help

- **WHEN** 用户查看 `skills add --help` 或 README 的 Skills Market 安装示例
- **THEN** 能看到团队批量和团队单 Skill 两种命令
- **AND** 不会把 `ts_` 描述为公开或私有 author/name 格式

### Requirement: Existing single Skill install remains unchanged

只有 `t_<teamId>/<teamName>` 团队批量入口与 `ts_<skillTeamId>/<skillName>` 团队单 Skill 入口 SHALL 使用显式团队 ID、release 版本和团队上下文流程；`t_` MUST 继续安装团队全部可安装 Skill，`ts_` MUST 只安装 resolver 指向的一个 Skill。普通公开 Skill、私有 Skill、author/name、GitHub 回退和单 Skill 采集同意行为 MUST 保持不变。

#### Scenario: Install public skill by name

- **WHEN** 用户执行 `skills add my-skill`
- **THEN** CLI 继续走原有公开名称解析和安装流程

#### Scenario: Install private skill by author and name

- **WHEN** 用户执行 `skills add <authorId>/my-skill`
- **THEN** CLI 继续走原有私有名称解析和 author 安装流程

#### Scenario: Install all team skills

- **WHEN** 用户执行 `skills add t_<teamId>/<teamName>`
- **THEN** CLI 继续使用原有全团队批量安装流程

#### Scenario: Install one team Skill

- **WHEN** 用户执行 `skills add ts_<skillTeamId>/<skillName>`
- **THEN** CLI 只解析并安装该团队单 Skill，不展开全团队列表
