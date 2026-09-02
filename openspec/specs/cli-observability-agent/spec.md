# cli-observability-agent Specification

## Purpose
为 `skills` CLI 用户提供 Agent 可观测接入的终端操作：创建接入记录（单一 loongsuite 类型）、列出接入清单、按 agentId 换发安装 token、在本机一键安装/卸载 LoongSuite Pilot，并对**本机安装状态做分层检测**（配置 / 程序文件 / 服务进程，均不执行任何插件命令）。与市场网页共用同一套 API 与数据表，响应契约（无 agentType、双平台命令）与市场侧对齐。

## Requirements
### Requirement: 创建接入记录

`skills obs` 命令 SHALL 允许用户创建一条接入记录：接收 agentName（必填）与可选 `--note`，**不接受 `--agent` 选项**（接入类型单一 loongsuite，本地无类型解析/校验）。创建成功后 SHALL 返回该记录的 serviceName 与双平台安装命令。未配置 API Key 时 SHALL 提示先登录并退出非零。创建结果 SHALL 附带本机 LoongSuite Pilot 检测提示，引导下一步 `obs install <agentId>` 动作。

#### Scenario: 创建接入

- **WHEN** 用户运行 `skills obs 公司机`
- **THEN** CLI 调用市场 create API（body 不含 agentType），打印 serviceName 与 macOS/Linux、Windows 两条安装命令

#### Scenario: 创建结果附带本机检测（未安装）

- **WHEN** 本机无 `~/.loongsuite-pilot` 配置与程序文件痕迹
- **THEN** 创建输出提示「未检测到 LoongSuite Pilot」，并给出 `obs install <agentId>` 安装指引

#### Scenario: 创建结果附带本机检测（已安装）

- **WHEN** 本机检测到完整安装（serviceNamePrefix 配置 + 程序文件痕迹）
- **THEN** 创建输出展示本机现有 serviceNamePrefix，并提示可用 `obs install <agentId>` 切换到新接入

#### Scenario: 创建结果附带本机检测（配置残留）

- **WHEN** 本机仅有 serviceNamePrefix 配置而无程序文件痕迹（如官方 uninstall 保留本地数据）
- **THEN** 创建输出提示「检测到配置残留」，并说明 `obs install <agentId>` 可重新安装修复

#### Scenario: 传入 --agent 报错

- **WHEN** 用户传入 `--agent hermes`（已移除的选项）
- **THEN** CLI 本地拒绝该未知选项，不发起请求

### Requirement: 本机安装状态分层检测

CLI SHALL 通过**纯本地文件信号**检测本机 LoongSuite Pilot 安装状态，**不执行任何插件命令**（不调用 `loongsuite-pilot status` 等外部进程）：

1. **配置**：`~/.loongsuite-pilot/config.json` 的 `serviceNamePrefix`（BSM-<agentId>），可与 Market 记录的 serviceName 直接比对
2. **程序文件**：`current` / `bin/` / `versions/` / `runtime` 任一存在即视为二进制仍在
3. **服务进程**：`loongsuite-pilot.pid` + `process.kill(pid, 0)` 探测（EPERM 视为运行中）；无 pid 文件时为「无法判断」

目录缺失/文件损坏时 SHALL 静默降级（不报错），视为未安装。

#### Scenario: 完整安装判定

- **WHEN** 配置与程序文件痕迹同时存在
- **THEN** 判定为「已安装」，可进一步区分服务运行/未运行

#### Scenario: 卸载残留判定

- **WHEN** 仅有 config.json 而无任何程序文件痕迹
- **THEN** 判定为「配置残留」（非已安装），各命令不得据此误报已安装

### Requirement: 列出接入清单

`skills obs list` 命令 SHALL 展示当前用户的接入记录清单，至少含 **agentId**、agentName、note（若存在）、serviceName、创建时间。**agentId 必须被打印**（`obs refresh` 所需的 id 从 list 输出获取）。该命令 SHALL 使用同一鉴权并调用 list API，并 SHALL 附带本机安装检测结果。

#### Scenario: 展示空清单

- **WHEN** 用户尚无任何接入记录，运行 `skills obs list`
- **THEN** CLI 打印空清单提示，退出码为 0

#### Scenario: list 输出包含 agentId

- **WHEN** 用户运行 `skills obs list` 且存在接入记录
- **THEN** 每一行展示该记录的 `agentId`，可直接用于 `skills obs refresh <agentId>`

#### Scenario: list 标记本机已安装的接入

- **WHEN** 本机完整安装（配置 + 程序文件）且其 serviceNamePrefix 与清单中某记录的 serviceName 一致
- **THEN** 该行末尾标记「✓ 本机已安装」；pid 文件探测服务未运行时附加「(服务未运行)」

#### Scenario: 残留配置不误标已安装

- **WHEN** 本机仅有配置残留（程序文件缺失）且 serviceNamePrefix 与某记录一致
- **THEN** 该行**不**标记「✓ 本机已安装」，改为清单尾部提示「检测到配置残留，可能已卸载不完整」

#### Scenario: 本机安装与清单不匹配

- **WHEN** 本机完整安装但 serviceNamePrefix 未匹配清单中任何记录
- **THEN** 清单尾部提示本机已安装但未匹配任何接入记录

#### Scenario: list 响应不含 agentType

- **WHEN** 用户运行 `skills obs list` 且存在接入记录
- **THEN** 每一行不展示 Agent 类型（响应无 agentType 字段），接入记录均为单一 loongsuite 类型

### Requirement: 换发安装 token（refresh）

`skills obs refresh <agentId>` 命令 SHALL **仅接受 agentId**（UUID，36 位，与 serviceName 同源）作为参数，请求换发该记录的 installToken（旧 token 立即作废），并返回带新 token 的**双平台安装命令**（macOS/Linux + Windows）。

#### Scenario: 按 agentId 换发 token

- **WHEN** 用户运行 `skills obs refresh 11111111-2222-4333-8444-555555555555`
- **THEN** CLI 调用 renewToken API，打印带新 installToken 的 macOS/Linux 与 Windows 两条安装命令

#### Scenario: agentId 参数缺失或非 UUID

- **WHEN** 用户运行 `skills obs refresh`（缺 agentId）或传入非 36 位 UUID
- **THEN** CLI 提示用法错误并不发起请求

#### Scenario: agentName 为保留字拒绝

- **WHEN** 用户意图创建名为 `list`/`refresh`/`add`/`install`/`uninstall` 的接入记录（如 `skills obs list`），而该位置参数已被子命令语义占用
- **THEN** CLI 提示保留字冲突并退出非零，不发起创建请求

### Requirement: 在本机一键安装（install）

`skills obs install <agentId>` 命令 SHALL 换发该记录的 installToken（与 refresh 相同契约），执行前 SHALL 做本机安装状态检查（分层检测），随后确认后在本机执行对应宿主平台的那条安装命令：macOS/Linux 执行 `curl …&os=unix | bash`，Windows 执行 `Invoke-WebRequest …&os=windows | powershell -ExecutionPolicy Bypass -File`。探针装到运行命令的机器。用户取消确认时 SHALL 不执行并提示命令仍可手动执行；执行非零退出码 SHALL 置为非零退出且不抛出副作用。

#### Scenario: 本机已有完整安装时二次确认

- **WHEN** 本机检测到完整安装（配置 + 程序文件）
- **THEN** CLI 先展示本机现有 serviceNamePrefix（serviceName 一致提示「重装并覆盖本地配置」，不一致提示「切换 serviceNamePrefix」），确认文案改为「本机已存在 LoongSuite Pilot 安装，确认要再次执行安装？」；用户拒绝则不执行

#### Scenario: 本机仅配置残留时走普通确认

- **WHEN** 本机仅有配置残留（程序文件缺失）
- **THEN** CLI 提示残留可由重新安装修复，确认文案保持普通安装文案，不触发二次确认

#### Scenario: 确认后安装

- **WHEN** 用户运行 `skills obs install 11111111-2222-4333-8444-555555555555` 并确认执行
- **THEN** CLI 调用 renewToken API，将对应**本机平台**的安装命令交给本机 shell 执行，探针安装在当前机器

#### Scenario: 取消安装

- **WHEN** 用户运行 `skills obs install 11111111-2222-4333-8444-555555555555` 但取消确认
- **THEN** CLI 不执行任何安装命令，提示凭证 5 分钟内仍可手动执行，退出码为 0

#### Scenario: 安装命令执行失败

- **WHEN** 安装命令在 shell 中非零退出（如网络/凭证失效）
- **THEN** CLI 打印失败信息并置退出码为非零

### Requirement: 本机卸载（uninstall）

`skills obs uninstall [--purge]` 命令 SHALL 在本机卸载 LoongSuite Pilot：执行前 SHALL 做本机安装状态检查，配置与程序文件均缺失时 SHALL 直接提示无需卸载（不发起请求、不执行脚本）；否则展示检测现状（完整安装含 serviceNamePrefix 与服务运行状态；配置残留单独提示），确认后执行**官方安装脚本的 uninstall 子命令**（双平台命令直接使用与 Market 端 `OBSERVABILITY_INSTALL_TEMPLATE` 同源的 OSS 官方安装脚本直链，不依赖 Market 凭证）。`--purge` SHALL 连同 `~/.loongsuite-pilot` 本地数据（配置与采集记录）一起删除，且确认文案 SHALL 明确说明删除范围。用户拒绝时 SHALL 不执行；执行非零退出码 SHALL 置为非零退出。

#### Scenario: 未安装时直接跳过

- **WHEN** 本机无任何配置与程序文件痕迹，用户运行 `skills obs uninstall`
- **THEN** CLI 提示「未检测到 LoongSuite Pilot 安装，无需卸载」，不弹出确认、不执行脚本，退出码为 0

#### Scenario: 配置残留时仍可清理

- **WHEN** 本机仅有配置残留（程序文件缺失）
- **THEN** CLI 提示检测到配置残留并正常进入确认与执行流程（允许清理残留）

#### Scenario: 默认卸载保留本地数据

- **WHEN** 用户运行 `skills obs uninstall` 并确认
- **THEN** CLI 执行官方卸载命令（uninstall，不带 --purge），保留 `~/.loongsuite-pilot` 本地数据

#### Scenario: --purge 连同本地数据删除

- **WHEN** 用户运行 `skills obs uninstall --purge` 并确认
- **THEN** CLI 执行带 `--purge`（Windows 为 `-Purge`）的官方卸载命令，确认文案说明将删除配置与采集记录

#### Scenario: 取消卸载

- **WHEN** 用户在确认时拒绝
- **THEN** CLI 不执行卸载命令，退出码为 0

#### Scenario: 卸载命令执行失败

- **WHEN** 卸载命令在 shell 中非零退出
- **THEN** CLI 打印失败信息并置退出码为非零
