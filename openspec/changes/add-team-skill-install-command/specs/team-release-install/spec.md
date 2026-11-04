## ADDED Requirements

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

全局 lock SHALL 为 `ts_` 安装保存 `teamId`、`skillTeamId`、`releaseId`、版本与 Skill ID；项目级 lock 的清点与来源 SHALL 保留同一团队单 Skill 上下文。`track list` SHALL 能识别团队单 Skill 来源，`track on/off` SHALL 使用 lock 中的同一 `skillId`、`teamId`、版本与 `releaseId` 重取，SHALL NOT 重新走名称解析。旧 `t_` 安装和缺少新增字段的历史 lock SHALL 保持兼容。

#### Scenario: Global install writes team single Skill context

- **WHEN** `ts_` 团队单 Skill 全局安装成功
- **THEN** lock entry 保存 `teamId`、`skillTeamId`、`releaseId`、`skillPath` 和安装版本

#### Scenario: Track toggles release-bound team Skill

- **WHEN** 用户对带 `skillTeamId` 和 `releaseId` 的全局 lock entry 执行 `track on` 或 `track off`
- **THEN** 请求携带相同 `skillId`、`teamId`、版本和 `releaseId`
- **AND** 不执行名称 resolve

#### Scenario: Legacy team lock remains compatible

- **WHEN** 全局 lock 只有旧 `teamId` 而没有 `skillTeamId` 或 `releaseId`
- **THEN** CLI 保持旧团队安装的重取行为
- **AND** 不提升 lock schema version

### Requirement: Team single Skill command is discoverable in help

CLI help 和仓内 README SHALL 同时展示 `t_<teamId>/<teamName>` 批量安装与 `ts_<skillTeamId>/<skillName>` 单 Skill 安装，帮助文本 MUST 明确两者用途不同。

#### Scenario: User opens add help

- **WHEN** 用户查看 `skills add --help` 或 README 的 Skills Market 安装示例
- **THEN** 能看到团队批量和团队单 Skill 两种命令
- **AND** 不会把 `ts_` 描述为公开或私有 author/name 格式

## MODIFIED Requirements

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
