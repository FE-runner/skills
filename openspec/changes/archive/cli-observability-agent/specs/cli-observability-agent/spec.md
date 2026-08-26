## Purpose

为 `skills` CLI 用户提供 Agent 可观测接入的终端操作：创建接入记录、列出接入清单、按 agentId 换发安装 token、在本机一键安装探针。与市场网页共用同一套 API 与数据表。

## ADDED Requirements

### Requirement: 创建接入记录
`skills obs` 命令 SHALL 允许用户创建一条接入记录：接收 agentName（必填）与 `--agent`（必填，hermes|openclaw），可选 `--note`。创建成功后 SHALL 返回该记录的 serviceName 与安装命令（`curl …/install?token=…&type=… | bash`）。未配置 API Key 时 SHALL 提示先登录并退出非零。

#### Scenario: 创建 Hermes 接入
- **WHEN** 用户运行 `skills obs 公司机 --agent hermes`
- **THEN** CLI 调用市场 create API，打印 serviceName 与 Hermes 安装命令

#### Scenario: agent 类型非法
- **WHEN** 用户传入 `--agent foo`（非 hermes/openclaw）
- **THEN** CLI 在本地拒绝，不发起请求，提示支持的 agent 类型

### Requirement: 列出接入清单
`skills obs list` 命令 SHALL 展示当前用户的接入记录清单，至少含 **agentId**、agentType、agentName、note（若存在）、serviceName、创建时间。**agentId 必须被打印**（`obs refresh` 所需的 id 从 list 输出获取）。该命令 SHALL 使用同一鉴权并调用 list API。

#### Scenario: 展示空清单
- **WHEN** 用户尚无任何接入记录，运行 `skills obs list`
- **THEN** CLI 打印空清单提示，退出码为 0

#### Scenario: list 输出包含 agentId
- **WHEN** 用户运行 `skills obs list` 且存在接入记录
- **THEN** 每一行展示该记录的 `agentId`，可直接用于 `skills obs refresh <agentId>`

### Requirement: 换发安装 token（refresh）
`skills obs refresh <agentId>` 命令 SHALL **仅接受 agentId**（接入记录 ID）作为参数，请求换发该记录的 installToken（旧 token 立即作废），并返回带新 token 的安装命令。

#### Scenario: 按 agentId 换发 token
- **WHEN** 用户运行 `skills obs refresh 42`
- **THEN** CLI 调用 renewToken API，打印带新 installToken 的安装命令

#### Scenario: agentId 参数缺失
- **WHEN** 用户运行 `skills obs refresh`（缺 agentId）
- **THEN** CLI 提示用法错误并不发起请求

#### Scenario: agentName 为保留字拒绝
- **WHEN** 用户意图创建名为 `list`/`refresh`/`add`/`install` 的接入记录（如 `skills obs list --agent hermes`），而该位置参数已被子命令语义占用
- **THEN** CLI 提示保留字冲突并退出非零，不发起创建请求

### Requirement: 在本机一键安装（install）
`skills obs install <agentId>` 命令 SHALL 换发该记录的 installToken（与 refresh 相同契约），随后**二次确认后在本机执行**平台返回的包壳安装命令（`curl …/install?token=…&type=… | bash`），探针装到运行命令的机器。用户取消确认时 SHALL 不执行并提示命令仍可手动执行；执行非零退出码 SHALL 置为非零退出且不抛出副作用。

#### Scenario: 确认后安装
- **WHEN** 用户运行 `skills obs install 42` 并确认执行
- **THEN** CLI 调用 renewToken API，将返回的安装命令交给本机 shell 执行，探针安装在当前机器

#### Scenario: 取消安装
- **WHEN** 用户运行 `skills obs install 42` 但取消确认
- **THEN** CLI 不执行任何安装命令，提示凭证 5 分钟内仍可手动执行，退出码为 0

#### Scenario: 安装命令执行失败
- **WHEN** 安装命令在 shell 中非零退出（如网络/凭证失效）
- **THEN** CLI 打印失败信息并置退出码为非零