## ADDED Requirements

### Requirement: 有效采集配置判定

CLI SHALL 仅在安装响应中的 `collect` 同时包含 `config` 与非空字符串 `meta.blueai_signature` 时，将其视为有效的监测版采集配置。响应不含 `collect`、`collect` 非对象、`collect` 仅含 `reason`、或缺少/为空 `config`/`meta.blueai_signature` 时，CLI SHALL 视为无效采集配置并按无监测版处理。

#### Scenario: 成功响应判定为有效

- **WHEN** 安装响应返回 `collect = { config: { collectEnabled: true }, meta: { blueai_signature: "..." } }`
- **THEN** CLI 将该响应判定为有效采集配置，可用于安装监测版

#### Scenario: 改造失败降级判定为无效

- **WHEN** 安装响应返回 `collect = { reason: "frontmatter 解析失败" }`
- **THEN** CLI 将该响应判定为无效采集配置，不安装监测版、不写采集同意

## MODIFIED Requirements

### Requirement: 首次安装知情同意

`skills add` 以**全局方式**（`--global`）安装 Skill 时 SHALL 采用**原版先行**策略：先以 `report=false` 拉取原版产物。仅当**首次未定夺**（lock 无 `collectConsent`）时，SHALL 再以 `report=true` 请求安装接口探测是否带采集配置——**`report` 参数 SHALL 为布尔值**（Market 契约 `SkillInstallBody.report: z.boolean()`，路由以 `body.report === true` 判定；字符串 `'true'` 恒判 false，会导致采集配置永不下发）。响应**无有效 `collect`**（作者未开启采集，或服务端改造失败降级）时 SHALL 安装原版且**不写入** `collectConsent` 字段。响应**有有效 `collect`** 时 SHALL 询问用户「是否同意采集并安装监测版」：同意 → **直接复用探测到的监测版产物**落盘（不重复拉取）并写入 `lock.skills[<skillName>].collectConsent = true`；拒绝 → 安装原版并写入 `false`。在**非交互环境**（`-y`/`--all`/update 重装/非 TTY 输入）下 SHALL **默认拒绝**：不询问，安装原版并写入 `false`，并提示用户可稍后运行 `track on <skillName>` 开启采集。该记录 SHALL **永久生效**（per-skill，后续安装该 skill 不再询问），但**不跨 skill 生效**。**项目级安装**（非 `--global`）SHALL NOT 询问采集、SHALL NOT 写入 `collectConsent`。**团队批量安装**（`add t_<teamId>/<name>`）以**一次询问覆盖该团队全部 `skill`**（见「团队安装的采集同意」Requirement）。

#### Scenario: 首次安装无采集配置的 skill

- **WHEN** 用户 `add` 安装一个作者未开启采集的 Skill（探测响应无 collect）
- **THEN** CLI 安装原版，不询问，不写入 collectConsent 字段

#### Scenario: 改造失败降级不触发询问

- **WHEN** 用户首次全局 `add` 一个作者开启采集但服务端返回 `collect = { reason }` 的 Skill
- **THEN** CLI 安装原版，不询问是否采集，不写入 collectConsent 字段

#### Scenario: 非交互环境遇到带采集的 skill

- **WHEN** 用户以 `-y`/`--all`/update 重装/非 TTY 方式安装带有效采集配置的 Skill 且此前未定夺
- **THEN** CLI 不询问、默认拒绝：安装原版并写入 collectConsent=false，提示可稍后运行 `track on <skillName>` 开启

#### Scenario: 首次安装带采集的 skill 并同意

- **WHEN** 用户 `add` 安装带有效采集配置的 Skill 且用户同意
- **THEN** CLI 直接复用探测到的监测版产物（含身份签名与可选结构化改造产物）落盘并写入 collectConsent=true，该 skill 后不再询问

#### Scenario: 首次安装带采集的 skill 并拒绝

- **WHEN** 用户 `add` 安装带有效采集配置的 Skill 且用户拒绝
- **THEN** CLI 安装原版并写入 collectConsent=false，该 skill 后不再询问

#### Scenario: 项目级安装带采集的 skill

- **WHEN** 用户以项目级方式（非 `--global`）`add` 安装带采集的 Skill
- **THEN** CLI 不询问、安装原版、不写入 collectConsent；项目级 `skills-lock.json` 不含该字段

### Requirement: 团队安装的采集同意

`skills add` 以**团队批量方式**（`add t_<teamId>/<teamName>`）或 `--all`（`--skill '*'` 全量）安装 Skill 时，SHALL 在本次安装开始前以**一次询问**覆盖该团队全部带有效采集配置的 Skill：同意 → 该团队每个带有效采集配置的 Skill 安装监测版并写入 `collectConsent=true`；拒绝 → 每个带有效采集配置的 Skill 安装原版并写入 `collectConsent=false`（并提示可后续 `track on` 补开）。若团队全部 Skill 无有效采集配置 → SHALL NOT 询问，均装原版不写字段。该询问只在**全局 scope** 执行；**项目级团队安装**（非 `--global`）不询问、不记录。该一次询问只影响**当次团队安装**，`collectConsent` 仍按每个 Skill 独立写入，后续单 Skill `add`/`track` 遵循各自 lock 状态。

#### Scenario: 团队安装带采集 skill 并同意

- **WHEN** 用户以团队批量方式全局安装，团队存在带有效采集配置的 Skill 且用户对团队级询问点击同意
- **THEN** 该团队每个带有效采集配置的 Skill 安装监测版并写入 collectConsent=true，本次安装不再逐个询问

#### Scenario: 团队安装带采集 skill 并拒绝

- **WHEN** 用户以团队批量方式全局安装，团队存在带有效采集配置的 Skill 且用户对团队级询问点击拒绝
- **THEN** 该团队每个带有效采集配置的 Skill 安装原版并写入 collectConsent=false，并提示可稍后 `track on` 补开

#### Scenario: 团队无带采集 skill

- **WHEN** 用户以团队批量方式全局安装，团队全部 Skill 均无有效采集配置
- **THEN** 不出现采集询问，全部 Skill 装原版、不写入 collectConsent

#### Scenario: 团队探测遇到改造失败降级

- **WHEN** 用户以团队批量方式全局安装，某 Skill 的 `report=true` 探测响应为 `collect = { reason }`
- **THEN** CLI 不把该 Skill 计入团队带采集数量，也不因该 Skill 触发团队级采集询问

### Requirement: lock 三态判定采集状态

采集状态 SHALL 由 `lock.skills[<skillName>].collectConsent` 唯一决定：缺失 = 首次（未定夺）；`true` = 开（监测版）；`false` = 关（原版）。CLI 不得通过扫描已装包文件（是否有签名、`obs-run`、`obs-manifest.yaml` 或其他产物文件）判定采集状态。

#### Scenario: lock 无字段

- **WHEN** 用户 `track list` 且某已装 skill 无 collectConsent 字段
- **THEN** 该 skill 标记为未定夺/首次状态（不按开或关对待）

#### Scenario: lock true / false

- **WHEN** 用户 `track list` 且某 skill collectConsent=true（或 false）
- **THEN** 该 skill 展示为 on（监测版）或 off（原版）

### Requirement: track 命令组

CLI SHALL 提供 `track` 子命令统一管理**全局**采集状态（SHALL NOT 覆盖项目级安装的技能）：
- `track list`：SHALL 按全局 `.agents/.skill-lock.json` 中已装 Skill 列表展示采集状态（on=collectConsent true / off=false / 未定夺=缺失）
- `track on <skillName>`：SHALL 以该 skill 的 lock 条目中 `skillPath`（market skillId）调用 `fetchById`（`report=true`，布尔，见「首次安装知情同意」的参数契约）重新请求监测版覆盖全局落盘，并写入 `collectConsent=true`。若响应不含有效 `collect`，SHALL NOT 安装监测版、SHALL NOT 写入 `collectConsent=true`、SHALL NOT 改变原 lock 采集状态，并 SHALL 输出失败原因
- `track off <skillName>`：SHALL 以 `skillPath` 调 `fetchById`（`report=false`）重新请求安装原版覆盖全局落盘，并写入 `collectConsent=false`（从监测退回原样，反悔不丢失用户数据，已采集历史不追溯）

#### Scenario: track list 展示状态

- **WHEN** 用户运行 `track list` 且全局 `.agents/.skill-lock.json` 存在多个已装 Skill
- **THEN** 每个 Skill 展示 on（监测版）/ off（原版）/ 未定夺 三态之一；未定夺指缺 collectConsent 字段（即首次未问过）

#### Scenario: track off 退回原样

- **WHEN** 用户对 collectConsent=true 的 Skill 运行 `track off`
- **THEN** CLI 以 report=false 重装原版覆盖落盘，collectConsent 改为 false，该 Skill 停止采集

#### Scenario: track on 恢复监测

- **WHEN** 用户对 collectConsent=false 或缺失的 Skill 运行 `track on`，且服务端返回有效 `collect`
- **THEN** CLI 以 report=true 重装监测版覆盖落盘，collectConsent 改为 true，恢复采集

#### Scenario: track on 遇到改造失败降级

- **WHEN** 用户对 collectConsent=false 或缺失的 Skill 运行 `track on`，且服务端返回 `collect = { reason }`
- **THEN** CLI 不安装监测版、不写入 collectConsent=true、保持原 lock 状态不变，并输出改造失败原因
