## REMOVED Requirements

### Requirement: 有效采集配置判定

**Reason**: `report` 探测与失败降级 reason 分支被单一 active-artifact 响应取代。

**Migration**: 改用合法 `collect.config` + 非空签名识别可观测 Skill。

### Requirement: 首次安装知情同意

**Reason**: consent 不再决定安装哪份文件，旧“原版先行 + 探测后替换”流程失效。

**Migration**: 一次安装响应即最终文件，consent 缺失时只询问统计同意。

### Requirement: add 命令的可观测版本开关

**Reason**: `--observability` 不再切换包类型或触发二次请求。

**Migration**: 显式开关只写 `collectConsent=true` 并跳过询问。

### Requirement: 监测插件状态与自动安装

**Reason**: Pilot 引导改由最终 consent 决定，而不是安装包类型。

**Migration**: consent=true 时沿用既有 Pilot 流程；false 时只安装文件。

### Requirement: 团队安装的采集同意

**Reason**: 团队不再通过 `report` 预检构造两套包，consent 与 release-bound 安装响应分离。

**Migration**: 每个 Team Skill 请求一次 active artifact，只对 consent 缺失项统一询问。

### Requirement: track 命令组（开发版与正式版一致）

**Reason**: track on/off 重装文件会把 consent 操作变成安装操作并造成网络/版本副作用。

**Migration**: track on/off 只改写全局 lock 的 `collectConsent`。

### Requirement: Team single Skill collection context is release-bound

**Reason**: 该 Requirement 的 `report` 采集预检被单次 release-bound 安装响应取代。

**Migration**: 用 resolver 返回的 `id/team/version/releaseId` 请求一次安装；consent 单独写入 lock。

## ADDED Requirements

### Requirement: 可观测 Skill 识别

CLI SHALL 仅在安装响应含对象型 `collect.config` 与非空字符串 `collect.meta.blueai_signature` 时识别该 Skill 为可观测 Skill。CLI SHALL NOT 使用 `collect.reason` 判断失败降级，也不得扫描文件内容判断 consent。

#### Scenario: 合法 collect

- **WHEN** 响应 `collect = { config: {...}, meta: { blueai_signature: "..." } }`
- **THEN** CLI 标记该 Skill 可观测，并可在 consent 未定夺时询问

#### Scenario: 非可观测 Skill

- **WHEN** 响应不含 `collect`，或 `collect` 缺少 config/签名
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

团队批量安装 SHALL 在安装前收集团队内可观测 Skill，并仅对 consent 未定夺项发起一次团队级询问。同意时写 `true`，拒绝或非交互时写 `false`。每个 Skill 的文件均来自各自一次安装响应；CLI SHALL NOT 用 `report` 探测或替换包。

#### Scenario: 团队同意

- **WHEN** 团队含 consent 未定夺的可观测 Skill 且用户同意
- **THEN** 这些 Skill 写 consent=true，文件仍按各自响应安装

#### Scenario: 团队拒绝

- **WHEN** 用户拒绝团队级询问
- **THEN** 这些 Skill 写 consent=false，文件不解包为原版

#### Scenario: 团队无非可观测 Skill

- **WHEN** 团队内无可观测 Skill
- **THEN** CLI 不询问也不写 collectConsent

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
