# cli-skill-collection-consent Specification

## Purpose

为 `skills` CLI 用户提供 Skill 采集知情同意与状态管理：可观测 Skill 首次交互安装时必须明确选择，`collectConsent=true` 或 `false` 在后续安装中直接复用，非交互首次安装默认关闭；`--observability` 仅对可观测 Skill 强制同意。以当前 scope 对应 lock 的 `skills[<skillName>].collectConsent` 三态判定采集状态。全局安装复用 `.agents/.skill-lock.json`（开发版与正式版一致），项目级安装复用项目根目录的 `skills-lock.json`，均不新建独立状态文件。`track list/on/off` 默认管理项目级技能，传 `-g`/`--global` 时管理全局技能，且只改写 consent。

## Requirements

### Requirement: 可观测 Skill 识别

CLI SHALL 仅在安装响应含对象型 `collect.config` 与非空字符串 `collect.meta.blueai_signature` 时识别该 Skill 为可观测 Skill。CLI SHALL NOT 使用 `collect.reason` 判断失败降级，也不得扫描文件内容判断 consent。

#### Scenario: 合法 collect

- **WHEN** 响应 `collect = { config: {...}, meta: { blueai_signature: "..." } }`
- **THEN** CLI 标记该 Skill 可观测，并可在 consent 未定夺时询问

#### Scenario: 非可观测 Skill

- **WHEN** 未显式传 `--observability`，且响应不含 `collect` 或 `collect` 缺少 config/签名
- **THEN** CLI 不询问采集，不写 `collectConsent`

### Requirement: 安装时确定并复用 consent

`add` 安装可观测 Skill 时 SHALL 只请求一次目标版本安装产物。当前 scope lock 缺少 `collectConsent` 时，交互安装 SHALL 在展示“开发者改进计划”声明后要求用户明确选择开启或关闭，选择项 SHALL NOT 预选；非交互安装 SHALL 默认写入 `false` 且不中断。lock 已有 `true` 或 `false` 时 CLI SHALL 直接复用，不得重复询问。显式 `--observability` SHALL 优先写入 `true`。无论选择为何，落盘文件均为同一份服务端响应。

#### Scenario: 首次同意

- **WHEN** 可观测 Skill 首次交互安装且 lock 缺少 `collectConsent`，用户选择开启
- **THEN** CLI 写 `collectConsent=true`

#### Scenario: 首次拒绝

- **WHEN** 可观测 Skill 首次交互安装且 lock 缺少 `collectConsent`，用户选择关闭
- **THEN** CLI 写 `collectConsent=false`

#### Scenario: 选择无预选

- **WHEN** CLI 展示首次安装采集选择
- **THEN** 开启和关闭均不处于默认选中状态

#### Scenario: 已同意后重装

- **WHEN** lock 的 `collectConsent=true`
- **THEN** CLI 不重复询问并继续写 `true`

#### Scenario: 已拒绝后交互重装或更新

- **WHEN** lock 的 `collectConsent=false`
- **THEN** CLI 不重复询问并继续写 `false`

#### Scenario: 非交互安装

- **WHEN** `-y`、非 TTY 或 CI 首次遇到 lock 缺少选择的可观测 Skill
- **THEN** CLI 不询问、写 `collectConsent=false` 并继续安装

#### Scenario: 显式开启覆盖旧拒绝

- **WHEN** 用户执行 `add <skill> --observability` 且 lock 原为 `false`
- **THEN** CLI 写 `collectConsent=true`

### Requirement: add --observability 只强制 consent

`add --observability` SHALL 在安装响应可观测时写 `collectConsent=true` 并跳过询问。该开关 SHALL NOT 触发额外安装请求，也 SHALL NOT 在可观测产物不可用时回退原版。响应不可观测时，该参数 SHALL 被忽略：正常安装，SHALL NOT 写入或修改 `collectConsent`，SHALL NOT 报错。

#### Scenario: 显式打开 consent

- **WHEN** 用户执行 `add <skill> --observability` 且响应为可观测 Skill
- **THEN** CLI 安装该响应文件一次并写 `collectConsent=true`

#### Scenario: 显式开启不可观测 Skill

- **WHEN** 用户执行 `add <skill> --observability` 且响应不可观测
- **THEN** CLI 正常安装并忽略该参数
- **AND** 不写 `collectConsent=true`
- **AND** 不修改已有 `collectConsent`

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

### Requirement: 安装结果分别报告 consent 与组件状态

Market Skill 安装完成后，CLI SHALL 分别报告当前 scope 的采集同意是否已写入，以及 BlueFlare 观测组件的安装结果。仅报告“本机已安装组件”或“跳过组件安装”不构成完整结果。consent 只有在对应 lock 写入成功后才可表示为“已记录”；Skill 安装失败或 lock 写入失败时 SHALL 明确表示 consent 未写入。

#### Scenario: 已同意且组件已安装

- **WHEN** `add <skill> --observability` 安装成功、lock 写入 `collectConsent=true`，且本机已有完整 BlueFlare 观测组件
- **THEN** 结果同时显示采集状态为已记录
- **AND** 显示观测组件已安装且无需重复安装
- **AND** 不得声称已经验证平台能够收到数据

#### Scenario: lock 写入失败

- **WHEN** Skill 文件安装成功但当前 scope 的 lock 写入失败
- **THEN** 结果明确显示采集同意未写入
- **AND** 不得显示 `collectConsent=true` 已记录

#### Scenario: 团队安装结果

- **WHEN** 团队安装包含多个可观测 Skill
- **THEN** CLI 汇总显示已同意和未同意的 Skill 数量
- **AND** 观测组件状态只汇总报告一次

### Requirement: 团队安装一次确定、复用或询问 consent

团队批量安装 SHALL 在安装前收集团队内可观测 Skill，并对 lock 缺少 `collectConsent` 的项发起一次团队级明确选择；lock 已为 `true` 或 `false` 的项直接复用。选择前 SHALL 展示开发者改进计划声明，选择项 SHALL NOT 预选。非交互环境无显式参数时 SHALL 对待定夺项写 `false` 并继续安装。显式 `--observability` 时 SHALL 为安装成功的可观测 Skill 写 `true`。不可观测 Skill SHALL NOT 写 consent；任一 Skill 安装失败时 SHALL NOT 写入或修改该 Skill 的 consent。

#### Scenario: 团队同意

- **WHEN** 团队含首次未定夺的可观测 Skill 且用户选择开启
- **THEN** 这些 Skill 写 `collectConsent=true`

#### Scenario: 团队拒绝

- **WHEN** 团队含首次未定夺的可观测 Skill 且用户选择关闭
- **THEN** 这些 Skill 写 `collectConsent=false`

#### Scenario: 团队已拒绝项保持拒绝

- **WHEN** 团队安装中某可观测 Skill 的 lock 为 `collectConsent=false`
- **THEN** CLI 不重新询问并保持 `collectConsent=false`

#### Scenario: 团队静默默认关闭

- **WHEN** 团队批量安装使用 `-y` 且未传观测参数，存在首次未定夺的可观测 Skill
- **THEN** 这些 Skill 写 `collectConsent=false`
- **AND** 安装继续

#### Scenario: 团队无可观测 Skill

- **WHEN** 团队批次没有任何可观测 Skill
- **THEN** CLI 不发起团队级观测选择
- **AND** 不写 `collectConsent`

#### Scenario: 团队显式开启采集

- **WHEN** 团队批量安装传入 `--observability`
- **THEN** 参与本次安装的可观测 Skill 写 `collectConsent=true`

#### Scenario: 团队单项安装失败

- **WHEN** 团队批量安装中某可观测 Skill 安装失败
- **THEN** CLI 不为该 Skill 写入或修改 `collectConsent`
- **AND** 其他成功 Skill 继续按团队选择或 lock 复用规则处理

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

### Requirement: track 按 scope 只修改 lock

`track list` SHALL 默认读取项目根目录 `skills-lock.json`；传 `-g`/`--global` 时 SHALL 读取全局 lock。`track on <skillName>` SHALL 只把当前 scope 对应条目 `collectConsent` 写为 `true`；`track off` SHALL 只写 `false`。命令 SHALL NOT 请求 Market、下载文件、重装 Skill 或改写其它 lock 字段。缺失目标 lock entry 时 SHALL 报错且不创建条目。

#### Scenario: track on 默认项目级

- **WHEN** 项目 lock 存在该 Skill 且用户执行 `track on <skillName>`
- **THEN** 只更新项目 lock 的 `collectConsent=true`
- **AND** 全局 lock 不变

#### Scenario: track off 默认项目级

- **WHEN** 项目 lock 存在该 Skill 且用户执行 `track off <skillName>`
- **THEN** 只更新项目 lock 的 `collectConsent=false`
- **AND** 全局 lock 不变

#### Scenario: track 显式操作全局

- **WHEN** 全局 lock 存在该 Skill 且用户执行 `track on/off <skillName> -g`
- **THEN** 只更新全局 lock 的 `collectConsent`
- **AND** 项目 lock 不变

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
