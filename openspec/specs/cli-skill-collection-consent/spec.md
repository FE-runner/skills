# cli-skill-collection-consent Specification

## Purpose

为 `skills` CLI 用户提供 Skill 采集知情同意与状态管理：首次安装带采集的 Skill 时询问是否同意（per-skill 永久记忆），以 `lock.skills[<skillName>].collectConsent` 三态判定采集状态，并提供 `track list/on/off` 命令组统一查看、开启、反悔。采集状态唯一来源是 lock 字段（不扫描包文件），复用既有 `.agents/.skill-lock.json` 写入流，不新建文件。本 capability **仅覆盖全局安装**（`--global`）：项目级安装不提示、不记录采集状态，`track` 命令不管理项目级技能。

## Requirements

### Requirement: 首次安装知情同意

`skills add` 以**全局方式**（`--global`）安装 Skill 时 SHALL 携带 `report=true` 请求安装接口并消费响应的 `collect` 字段。响应**无** `collect`（作者未开启采集）时 SHALL 安装原版且**不写入** `collectConsent` 字段。响应**有** `collect`（作者开启采集）时 SHALL 询问用户「是否同意采集并安装监测版」：同意 → 安装监测版（改造产物）并写入 `lock.skills[<skillName>].collectConsent = true`；拒绝 → 安装原版并写入 `false`。在**非交互环境**（`-y`/`--all`/update 重装/非 TTY 输入）下 SHALL **默认拒绝**：不询问，安装原版并写入 `false`，并提示用户可稍后运行 `track on <skillName>` 开启采集。该记录 SHALL **永久生效**（per-skill，后续安装该 skill 不再询问），但**不跨 skill 生效**。**项目级安装**（非 `--global`）SHALL NOT 询问采集、SHALL NOT 写入 `collectConsent`。**团队批量安装**（`add t_<teamId>/<name>`）以**一次询问覆盖该团队全部 `skill`**（见「团队安装的采集同意」Requirement）。

#### Scenario: 首次安装无采集配置的 skill

- **WHEN** 用户 `add` 安装一个作者未开启采集的 Skill（响应无 collect）
- **THEN** CLI 安装原版，不询问，不写入 collectConsent 字段

#### Scenario: 非交互环境遇到带采集的 skill

- **WHEN** 用户以 `-y`/`--all`/update 重装/非 TTY 方式安装带采集的 Skill（响应有 collect）且此前未定夺
- **THEN** CLI 不询问、默认拒绝：安装原版并写入 collectConsent=false，提示可稍后运行 `track on <skillName>` 开启

#### Scenario: 首次安装带采集的 skill 并同意

- **WHEN** 用户 `add` 安装带采集的 Skill（响应有 collect）且用户同意
- **THEN** CLI 安装监测版（含签名与 blueai-track.js）并写入 collectConsent=true，该 skill 后不再询问

#### Scenario: 首次安装带采集的 skill 并拒绝

- **WHEN** 用户 `add` 安装带采集的 Skill 且用户拒绝
- **THEN** CLI 安装原版并写入 collectConsent=false，该 skill 后不再询问

#### Scenario: 项目级安装带采集的 skill

- **WHEN** 用户以项目级方式（非 `--global`）`add` 安装带采集的 Skill
- **THEN** CLI 不询问、安装原版、不写入 collectConsent；项目级 `skills-lock.json` 不含该字段

### Requirement: 团队安装的采集同意

`skills add` 以**团队批量方式**（`add t_<teamId>/<teamName>`）或 `--all`（`--skill '*'` 全量）安装 Skill 时，SHALL 在本次安装开始前以**一次询问**覆盖该团队全部带采集 Skill：同意 → 该团队每个带采集 Skill 安装监测版并写入 `collectConsent=true`；拒绝 → 每个带采集 Skill 安装原版并写入 `collectConsent=false`（并提示可后续 `track on` 补开）。若团队全部 Skill 无带采集 → SHALL NOT 询问，均装原版不写字段。该询问只在**全局 scope** 执行；**项目级团队安装**（非 `--global`）不询问、不记录。该一次询问只影响**当次团队安装**，`collectConsent` 仍按每个 Skill 独立写入，后续单 Skill `add`/`track` 遵循各自 lock 状态。

#### Scenario: 团队安装带采集 skill 并同意

- **WHEN** 用户以团队批量方式全局安装，团队存在带采集 Skill 且用户对团队级询问点击同意
- **THEN** 该团队每个带采集 Skill 安装监测版并写入 collectConsent=true，本次安装不再逐个询问

#### Scenario: 团队安装带采集 skill 并拒绝

- **WHEN** 用户以团队批量方式全局安装，团队存在带采集 Skill 且用户对团队级询问点击拒绝
- **THEN** 该团队每个带采集 Skill 安装原版并写入 collectConsent=false，并提示可稍后 `track on` 补开

#### Scenario: 团队无带采集 skill

- **WHEN** 用户以团队批量方式全局安装，团队全部 Skill 均无采集配置
- **THEN** 不出现采集询问，全部 Skill 装原版、不写入 collectConsent

### Requirement: lock 三态判定采集状态

采集状态 SHALL 由 `lock.skills[<skillName>].collectConsent` 唯一决定：缺失 = 首次（未定夺）；`true` = 开（监测版）；`false` = 关（原版）。CLI 不得通过扫描已装包文件（是否有签名 / blueai-track.js）判定采集状态。

#### Scenario: lock 无字段

- **WHEN** 用户 `track list` 且某已装 skill 无 collectConsent 字段
- **THEN** 该 skill 标记为未定夺/首次状态（不按开或关对待）

#### Scenario: lock true / false

- **WHEN** 用户 `track list` 且某 skill collectConsent=true（或 false）
- **THEN** 该 skill 展示为 on（监测版）或 off（原版）

### Requirement: track 命令组

CLI SHALL 提供 `track` 子命令统一管理**全局**采集状态（SHALL NOT 覆盖项目级安装的技能）：
- `track list`：SHALL 按全局 `.agents/.skill-lock.json` 中已装 Skill 列表展示采集状态（on=collectConsent true / off=false / 未定夺=缺失）
- `track on <skillName>`：SHALL 以该 skill 的 lock 条目中 `skillPath`（market skillId）调用 `fetchById`（`report=true`）重新请求安装监测版覆盖全局落盘，并写入 `collectConsent=true`
- `track off <skillName>`：SHALL 以 `skillPath` 调 `fetchById`（`report=false`）重新请求安装原版覆盖全局落盘，并写入 `collectConsent=false`（从监测退回原样，反悔不丢失用户数据，已采集历史不追溯）

#### Scenario: track list 展示状态

- **WHEN** 用户运行 `track list` 且全局 `.agents/.skill-lock.json` 存在多个已装 Skill
- **THEN** 每个 Skill 展示 on（监测版）/ off（原版）/ 未定夺 三态之一；未定夺指缺 collectConsent 字段（即首次未问过）

#### Scenario: track off 退回原样

- **WHEN** 用户对 collectConsent=true 的 Skill 运行 `track off`
- **THEN** CLI 以 report=false 重装原版覆盖落盘，collectConsent 改为 false，该 Skill 停止采集

#### Scenario: track on 恢复监测

- **WHEN** 用户对 collectConsent=false 或缺失的 Skill 运行 `track on`
- **THEN** CLI 以 report=true 重装监测版覆盖落盘，collectConsent 改为 true，恢复采集

### Requirement: 不新建文件

采集同意记录 SHALL 复用既有 `.agents/.skill-lock.json`（与安装记录同一文件），不新建独立状态文件。

#### Scenario: 记录写入既有 lock

- **WHEN** 用户同意/拒绝采集或执行 track on/off
- **THEN** collectConsent 写入 `.skill-lock.json` 的 `skills[<skillName>]` 节点，文件整体结构不变