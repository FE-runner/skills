## MODIFIED Requirements

### Requirement: track 命令组（开发版与正式版一致）

CLI SHALL 提供 `track` 子命令统一管理**全局**采集状态：

- `track list`：按全局锁文件展示已装 Skill 的采集状态和团队上下文。
- `track on <skillName>`：以 lock 中的 `skillPath`、可选 `teamId` 和版本调用 `fetchById`（`report=true`），写入 `collectConsent=true`；无有效 `collect` 时不覆盖文件、不改变 consent，并输出失败原因。
- `track off <skillName>`：以相同 id/team/version 上下文调用 `fetchById`（`report=false`），写入 `collectConsent=false`。

团队 lock entry 的 `teamId` SHALL 优先于 author/公开解析。写回 lock 时 SHALL 保留 teamId 和包含 teamId 的 source。旧 entry 缺少 teamId 时保持原有行为。任何采集状态写入 MUST 继续使用现有 lock 文件，不提升 schema version。

#### Scenario: track list 展示状态

- **WHEN** 用户运行 `track list` 且全局锁文件存在多个已装 Skill
- **THEN** 每个 Skill 展示 on（监测版）/ off（原版）/ 未定夺 三态之一

#### Scenario: track off 退回原样

- **WHEN** 用户对 collectConsent=true 的 Skill 运行 `track off`
- **THEN** CLI 以 report=false 重装原版覆盖落盘，collectConsent 改为 false

#### Scenario: track on 恢复监测

- **WHEN** 用户对 collectConsent=false 或缺失的 Skill 运行 `track on`，且服务端返回有效 `collect`
- **THEN** CLI 以 report=true 重装监测版覆盖落盘，collectConsent 改为 true

#### Scenario: track on 遇到改造失败降级

- **WHEN** 用户对 collectConsent=false 或缺失的 Skill 运行 `track on`，且服务端返回 `collect = { reason }`
- **THEN** CLI 不安装监测版、不写入 collectConsent=true、保持原 lock 状态不变
- **AND** 输出改造失败原因

#### Scenario: 开发版与正式版读取同一份锁文件

- **WHEN** 用户分别用开发版与正式版构建运行 `track list`
- **THEN** 两者读取同一个全局锁文件，展示结果一致

#### Scenario: 团队 lock 使用 teamId 重取

- **WHEN** lock entry 包含 `teamId`
- **THEN** `track on/off` 请求携带该 teamId、skillPath 和 version
- **AND** 不重新名称解析
- **AND** 写回后仍保留 teamId 和团队 source

#### Scenario: 团队 lock 连续切换

- **WHEN** 用户对同一团队 Skill 连续执行 `track on`、`track off`、`track on`
- **THEN** 每一步都携带相同 teamId、skillPath 和 version
- **AND** lock 中不会丢失 teamId

#### Scenario: track list 展示团队上下文

- **WHEN** lock entry 包含 teamId
- **THEN** `track list` 展示对应采集状态和团队来源标识
