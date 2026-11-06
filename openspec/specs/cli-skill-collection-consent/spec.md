# cli-skill-collection-consent Specification

## Purpose

为 `skills` CLI 用户提供 Skill 采集知情同意与状态管理：首次安装可观测 Skill 时询问是否同意（per-skill 永久记忆），以当前 scope 对应 lock 的 `skills[<skillName>].collectConsent` 三态判定采集状态。全局安装复用 `.agents/.skill-lock.json`（开发版与正式版一致），项目级安装复用项目根目录的 `skills-lock.json`，均不新建独立状态文件。`track list/on/off` 仍只管理全局技能且只改写 consent；项目级技能可再次执行 `add --observability` 显式同意统计。

## Requirements

### Requirement: 可观测 Skill 识别

CLI SHALL 仅在安装响应含对象型 `collect.config` 与非空字符串 `collect.meta.blueai_signature` 时识别该 Skill 为可观测 Skill。CLI SHALL NOT 使用 `collect.reason` 判断失败降级，也不得扫描文件内容判断 consent。

#### Scenario: 合法 collect

- **WHEN** 响应 `collect = { config: {...}, meta: { blueai_signature: "..." } }`
- **THEN** CLI 标记该 Skill 可观测，并可在 consent 未定夺时询问

#### Scenario: 非可观测 Skill

- **WHEN** 未显式传 `--observability`，且响应不含 `collect` 或 `collect` 缺少 config/签名
- **THEN** CLI 不询问采集，不写 `collectConsent`

### Requirement: 首次安装只询问 consent

`add` 安装 Skill 时 SHALL 只请求一次目标版本安装产物。若当前 scope lock 的 `collectConsent` 缺失且 Skill 可观测：交互环境 SHALL 询问是否同意统计；同意写 `true`，拒绝写 `false`。无论选择为何，落盘文件均为同一份服务端响应。非交互环境 SHALL 默认写 `false` 且不询问。

#### Scenario: 首次同意

- **WHEN** 可观测 Skill 首次安装，用户同意统计
- **THEN** CLI 安装响应文件并写 `collectConsent=true`

#### Scenario: 首次拒绝

- **WHEN** 可观测 Skill 首次安装，用户拒绝统计
- **THEN** CLI 仍安装同一份响应文件并写 `collectConsent=false`

#### Scenario: 非交互首次安装

- **WHEN** `-y`、非 TTY 或更新重装遇到 consent 缺失的可观测 Skill
- **THEN** CLI 不询问，写 `collectConsent=false`，文件仍为服务端 active artifact

### Requirement: add --observability 只强制 consent

`add --observability` SHALL 在本次安装写 `collectConsent=true` 并跳过询问。该开关 SHALL NOT 触发额外安装请求，也 SHALL NOT 在可观测产物不可用时回退原版。非可观测 Skill 仍安装原版，但显式 flag 仍写 `true`，不额外探测。

#### Scenario: 显式打开 consent

- **WHEN** 用户执行 `add <skill> --observability` 且响应为可观测 Skill
- **THEN** CLI 安装该响应文件一次并写 consent=true

#### Scenario: 可观测版本不可用

- **WHEN** Market 返回 `OBS_VERSION_UNAVAILABLE`
- **THEN** CLI 报错且不写 consent、不安装原版替代

### Requirement: consent 决定 Pilot 引导但不决定文件

只有 lock 中 `collectConsent=true` 的可观测 Skill SHALL 触发现有 LoongSuite Pilot 状态提示或自动安装询问。`false`/缺失且非交互时 SHALL 不提示 Pilot，但安装文件不变。

#### Scenario: consent=true

- **WHEN** 可观测 Skill 安装且 consent=true
- **THEN** CLI 按既有交互规则展示 Pilot 状态或询问安装

#### Scenario: consent=false

- **WHEN** 可观测 Skill 安装且 consent=false
- **THEN** CLI 不提示 Pilot、不自动安装插件，但仍落盘服务端文件

### Requirement: 团队安装一次询问 consent

团队批量安装 SHALL 在安装前收集团队内可观测 Skill，并仅对 consent 未定夺项发起一次团队级询问。同意时写 `true`，拒绝或非交互时写 `false`。显式传 `--observability` 时跳过询问，并为本次团队安装参与的每个 Skill 写 `true`，包括响应不可观测的 Skill。每个 Skill 的文件均来自各自一次安装响应；CLI SHALL NOT 用 `report` 探测或替换包。安装失败的 Skill SHALL NOT 写 `collectConsent`。

#### Scenario: 团队同意

- **WHEN** 团队含 consent 未定夺的可观测 Skill 且用户同意
- **THEN** 这些 Skill 写 consent=true，文件仍按各自响应安装

#### Scenario: 团队拒绝

- **WHEN** 用户拒绝团队级询问
- **THEN** 这些 Skill 写 consent=false，文件不解包为原版

#### Scenario: 团队无可观测 Skill

- **WHEN** 团队内无可观测 Skill
- **THEN** CLI 不询问；未显式传 `--observability` 时不写 collectConsent

#### Scenario: 团队显式开启采集

- **WHEN** 团队安装传入 `--observability`，无论响应是否含合法 `collect`
- **THEN** CLI 跳过团队询问，并为参与本次安装的每个 Skill 写 `collectConsent=true`
- **AND** 各 Skill 仍安装服务端返回的响应文件

### Requirement: lock 三态判定采集状态

采集状态 SHALL 由当前 scope 对应 lock 的 `skills[<skillName>].collectConsent` 唯一决定：缺失 = 首次（未定夺）；`true` = 同意下游统计；`false` = 拒绝下游统计。该字段 SHALL NOT 表示安装包类型，CLI 不得通过扫描已装包文件判定采集状态。

#### Scenario: lock 无字段

- **WHEN** 用户运行 `track list` 且某已装 skill 无 `collectConsent` 字段
- **THEN** 展示“未定夺”

#### Scenario: lock true / false

- **WHEN** `collectConsent=true` 或 `false`
- **THEN** `track list` 分别展示“同意统计”或“拒绝统计”

#### Scenario: 已装文件与 consent 不一致

- **WHEN** 已装文件含可观测产物但 lock 为 `false`
- **THEN** 文件保持可观测版本，但下游不得统计

### Requirement: 不新建文件

采集同意记录 SHALL 复用当前 scope 的既有安装锁文件：全局使用 `~/.agents/.skill-lock.json`（设置 `XDG_STATE_HOME` 时为 `$XDG_STATE_HOME/skills/.skill-lock.json`），项目级使用项目根目录 `skills-lock.json`。不得新建独立状态文件，不得因新增字段提升任一 lock 的 schema version。开发版与正式版共用全局锁文件。

#### Scenario: 记录写入既有 lock

- **WHEN** 用户同意/拒绝采集或执行 track on/off
- **THEN** collectConsent 写入当前 scope 锁文件对应 skill 节点，文件整体结构不变

### Requirement: track 只修改 lock

`track on <skillName>` SHALL 只把全局 lock 对应条目 `collectConsent` 写为 `true`；`track off` SHALL 只写 `false`。命令 SHALL NOT 请求 Market、下载文件、重装 Skill 或改写其它 lock 字段。缺失目标 lock entry 时 SHALL 报错且不创建条目。

#### Scenario: track on

- **WHEN** 全局 lock 存在该 Skill
- **THEN** 只更新 `collectConsent=true`

#### Scenario: track off

- **WHEN** 全局 lock 存在该 Skill
- **THEN** 只更新 `collectConsent=false`

#### Scenario: track 不访问 Market

- **WHEN** 用户执行 track on/off
- **THEN** CLI 不发起安装请求、不调用 installer、不改变文件 hash 或版本

### Requirement: Team single Skill consent is release-bound only for identity

`ts_<skillTeamId>/<skillName>` 安装 SHALL 仍以 resolver 返回的 `skillId`、`teamId`、`installVersion`、`releaseId` 请求安装。`collectConsent` 只影响是否统计和 Pilot 引导；缺失时按首次询问，已定夺时复用。CLI SHALL NOT 为该 Skill 发起 `report` 预检。

#### Scenario: Team single consent missing

- **WHEN** release-bound 安装响应可观测且 lock 缺失 consent
- **THEN** CLI 询问一次并将结果写入 lock，安装 response 文件

#### Scenario: Team release unavailable

- **WHEN** Market 返回 `OBS_VERSION_UNAVAILABLE` 或 release 不匹配
- **THEN** CLI 报团队版本不可用并 fail-closed
