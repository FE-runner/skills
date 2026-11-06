## REMOVED Requirements

### Requirement: Team collection preflight uses the same release context

**Reason**: 安装接口移除 `report`，团队不再通过独立采集预检请求切换产物。

**Migration**: 团队安装直接使用 release-bound 上下文获取每个 Skill 的唯一安装响应，并从该响应识别可观测 Skill 与 consent 状态。

## ADDED Requirements

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

## MODIFIED Requirements

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
