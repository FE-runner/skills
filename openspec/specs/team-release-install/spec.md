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

### Requirement: Team collection preflight uses the same release context

团队采集配置预检 SHALL 使用与实际安装相同的 Skill ID、teamId 和 installVersion 请求 `report=true`。预检结果 MUST 与随后落盘的版本一致；不得以公开 `currentVersion`、名称解析结果或其他团队版本进行探测。

#### Scenario: Team skill has collection config

- **WHEN** 团队列表返回可用 release
- **AND** 团队采集预检使用同一 id/team/version 探测到有效 `collect`
- **THEN** 团队级询问结果应用到该 Skill 的正式安装请求

#### Scenario: Collection preflight version differs from install version

- **WHEN** 探测请求与正式安装请求的 teamId 或 installVersion 不一致
- **THEN** CLI MUST NOT 复用该探测结果

### Requirement: Team lock context supports collection toggles

团队安装 SHALL 在当前 scope 对应 lock 中写入可选 `teamId`，不提升 lock schema version：全局写入 `SkillLockEntry`，项目级写入 `LocalSkillLockEntry`。全局 `track on/off` SHALL 读取该字段，并以相同 Skill ID、teamId 和版本调用 Market 安装接口。旧 lock entry 缺少 `teamId` 时 SHALL 保持原有公开/私有重取行为。

#### Scenario: Team install writes team context

- **WHEN** 团队安装成功
- **THEN** lock entry 保存 Skill ID、teamId 和 version
- **AND** 仅当该 Skill 带有效采集配置且当前 scope 的采集决定已应用时保存 collectConsent
- **AND** source 标识包含 teamId

#### Scenario: Team skill without collect does not write consent

- **WHEN** 团队安装成功但该 Skill 无有效采集配置
- **THEN** lock entry 保存 teamId
- **AND** 不写 collectConsent 字段

#### Scenario: Project team install writes collection consent

- **WHEN** 项目级团队安装中的 Skill 带有效采集配置且用户同意
- **THEN** 项目 `skills-lock.json` 保存 teamId、Skill ID、version 和 collectConsent=true

#### Scenario: Track toggles a team skill

- **WHEN** 用户对带 teamId 的团队 lock entry 执行 `track on` 或 `track off`
- **THEN** CLI 请求 Market 时携带同一 teamId
- **AND** 使用 lock 中记录的 Skill ID 和 version
- **AND** 不重新走公开/私有名称解析

#### Scenario: Legacy lock without teamId

- **WHEN** lock entry 没有 teamId
- **THEN** `track on/off` 保持原有行为
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

团队单 Skill 的下载、采集探测和正式安装请求 SHALL 同时携带由 resolver 返回的 `id`、`team`、`version` 与 `releaseId`。resolver 返回 404、409、其他非成功响应或网络失败时，CLI MUST fail-closed，SHALL NOT 回退 GitHub、公开裸名、author/name 私有安装或 `t_` 全团队安装。安装接口拒绝已失效 `releaseId` 时，CLI SHALL 明确报告团队版本不可用。

#### Scenario: Install exact approved release

- **WHEN** resolver 返回当前团队生效目标
- **THEN** CLI 下载并安装该目标的 `installVersion`
- **AND** 安装请求包含同一 `releaseId`

#### Scenario: Resolver cannot find target

- **WHEN** resolver 返回 404 或网络错误
- **THEN** CLI 输出团队单 Skill 解析失败并退出
- **AND** 不发起名称解析、GitHub 或其他安装回退

#### Scenario: Approved release changed before download

- **WHEN** resolver 返回的 `releaseId` 在下载前已不是当前 `approvedReleaseId`
- **THEN** Market 安装接口返回不匹配
- **AND** CLI 报告团队版本已变化并退出，不回退其他渠道

### Requirement: Team single Skill context is persisted

全局 lock SHALL 为 `ts_` 安装保存 `teamId`、`skillTeamId`、`releaseId`、版本与 Skill ID；项目级 lock 的清点与来源 SHALL 保留同一团队单 Skill 上下文及 `collectConsent`。全局 `track list` SHALL 能识别团队单 Skill 来源，`track on/off` SHALL 使用 lock 中的同一 `skillId`、`teamId`、版本与 `releaseId` 重取，SHALL NOT 重新走名称解析。旧 `t_` 安装和缺少新增字段的历史 lock SHALL 保持兼容。

#### Scenario: Global install writes team single Skill context

- **WHEN** `ts_` 团队单 Skill 全局或项目级安装成功
- **THEN** lock entry 保存 `teamId`、`skillTeamId`、`releaseId`、`skillPath` 和安装版本
- **AND** 采集已定夺时在对应 lock 保存 `collectConsent`

#### Scenario: Track toggles release-bound team Skill

- **WHEN** 用户对带 `skillTeamId` 和 `releaseId` 的全局 lock entry 执行 `track on` 或 `track off`
- **THEN** 请求携带相同 `skillId`、`teamId`、版本和 `releaseId`
- **AND** 不执行名称 resolve

#### Scenario: Legacy team lock remains compatible

- **WHEN** 全局 lock 只有旧 `teamId` 而没有 `skillTeamId` 或 `releaseId`
- **THEN** CLI 保持旧团队安装的重取行为
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
