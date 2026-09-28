## REMOVED Requirements

### Requirement: track 命令组

**Reason**: 其中 `track list` 的"开发隔离模式读取状态根锁文件"分支已反转——开发版与正式版共用同一份全局锁文件。

**Migration**: 使用下方「track 命令组（开发版与正式版一致）」；行为规则不变，仅锁文件路径恢复为单一真实路径。

## ADDED Requirements

### Requirement: track 命令组（开发版与正式版一致）

CLI SHALL 提供 `track` 子命令统一管理**全局**采集状态（SHALL NOT 覆盖项目级安装的技能）：

- `track list`：SHALL 按全局锁文件 `~/.agents/.skill-lock.json`（设置 `XDG_STATE_HOME` 时为 `$XDG_STATE_HOME/skills/.skill-lock.json`）中已装 Skill 列表展示采集状态（on=collectConsent true / off=false / 未定夺=缺失）；开发版与正式版读取同一文件
- `track on <skillName>`：SHALL 以该 skill 的 lock 条目中 `skillPath`（market skillId）调用 `fetchById`（`report=true`，布尔，见「首次安装知情同意」的参数契约）重新请求监测版覆盖全局落盘，并写入 `collectConsent=true`。若响应不含有效 `collect`，SHALL NOT 安装监测版、SHALL NOT 写入 `collectConsent=true`、SHALL NOT 改变原 lock 采集状态，并 SHALL 输出失败原因
- `track off <skillName>`：SHALL 以 `skillPath` 调 `fetchById`（`report=false`）重新请求安装原版覆盖全局落盘，并写入 `collectConsent=false`（从监测退回原样，反悔不丢失用户数据，已采集历史不追溯）

#### Scenario: track list 展示状态

- **WHEN** 用户运行 `track list` 且全局锁文件存在多个已装 Skill
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

#### Scenario: 开发版与正式版读取同一份锁文件

- **WHEN** 用户分别用开发版与正式版构建运行 `track list`
- **THEN** 两者读取同一个全局锁文件，展示结果一致

## MODIFIED Requirements

### Requirement: 不新建文件

采集同意记录 SHALL 复用既有全局锁文件 `~/.agents/.skill-lock.json`（与安装记录同一文件；设置 `XDG_STATE_HOME` 时为 `$XDG_STATE_HOME/skills/.skill-lock.json`），不新建独立状态文件。开发版与正式版共用该文件。

#### Scenario: 记录写入既有 lock

- **WHEN** 用户同意/拒绝采集或执行 track on/off
- **THEN** collectConsent 写入 `.skill-lock.json` 的 `skills[<skillName>]` 节点，文件整体结构不变
