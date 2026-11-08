## Purpose

定义 CLI 通过 Skill 市场批量构建检测拉取不可变观测构建、使用 release 序列判断更新，并在下载校验后直接写入本地 Skill 的完整行为。

## ADDED Requirements

### Requirement: CLI 使用 version 与 releaseSeq 检测观测构建

CLI SHALL 将 Market lock 扩展为可保存已开启观测源版本对应的 `releaseSeq`。批量检测请求 SHALL 只发送 Market `BuildCheckTarget` 身份字段：普通/私有目标为 `skillId + authorId?`，团队目标为 `skillId + teamId + releaseId`；`version/releaseSeq` 是响应与本地 lock 的比较状态，SHALL NOT 作为 `checkBatch` 请求字段。团队目标由 Market 校验 approved release 后解析其引用的源个人 Skill 版本，`skillTeamId` 仅用于 `ts_` source 路由。

检测响应 SHALL 携带显式 `observabilityEnabled` 和源版本 `version`；已开启时携带 `releaseSeq`，SHALL NOT 在批量检测响应中承诺 `buildHash`。`observabilityEnabled=false` 时按原版 Market 路径处理，缺少 `releaseSeq` 不构成构建冲突。

单条检查 SHALL 调用批量接口并提交长度为一的数组。已开启观测目标 SHALL 在版本或 `releaseSeq` 任一不一致时标记有更新；未开启观测目标 SHALL 仅按原版版本判断。批内单项错误只标记该项检查失败，不影响其他项；整批网络、鉴权或接口失败 SHALL 报告检查失败，SHALL NOT 显示为无更新。`update` SHALL 只重新安装检查成功且需要更新的目标；已开启观测目标安装成功后写入新的 `version/releaseSeq`，未开启目标保持原版安装语义。

#### Scenario: 同版本 releaseSeq 变化

- **WHEN** lock 为 `version=1.0.0/releaseSeq=3`，Market 返回 `version=1.0.0/releaseSeq=4`
- **THEN** CLI 标记有更新

#### Scenario: 版本变化

- **WHEN** lock 的版本低于 Market 当前版本
- **THEN** CLI 标记有更新

#### Scenario: 团队 release 未变化

- **WHEN** lock 与 Market 的 `releaseId` 和 `releaseSeq` 均一致
- **THEN** CLI 不标记更新

#### Scenario: 团队 release 变化

- **WHEN** Market 返回新的 `releaseId` 或更大的 `releaseSeq`
- **THEN** CLI 标记有更新

#### Scenario: 团队 release 读取源版本新构建

- **WHEN** 多个团队 release 引用同一源 `skillId + version`
- **AND** 该源版本产生新 active build、`releaseSeq` 增大
- **THEN** 每个团队目标检测都返回相同的新 `releaseSeq`
- **AND** 后续安装响应返回相同的新 `buildHash`
- **AND** CLI 不要求团队级观测序列

#### Scenario: 已开启旧 lock 缺少 releaseSeq

- **WHEN** lock 条目没有 `releaseSeq` 且批量检测返回 `observabilityEnabled=true`
- **THEN** CLI 将该条目标记为需要重新检测并拉取

#### Scenario: 未开启观测的 Market Skill

- **WHEN** 批量检测返回 `observabilityEnabled=false`
- **THEN** CLI 继续原版安装与版本判断
- **AND** 不要求 `releaseSeq` 或 `buildHash`

#### Scenario: 批内单项失败

- **WHEN** 批量检测中的某一项无权限或目标失效
- **THEN** 只有该项显示检查失败
- **AND** 其他项继续返回结果

#### Scenario: 整批检查失败

- **WHEN** 批量检测接口网络失败或返回鉴权错误
- **THEN** CLI 报告检查失败
- **AND** 不显示全部为最新

#### Scenario: 旧团队 lock 缺少构建上下文

- **WHEN** `t_` 历史条目缺少 teamId、releaseId 或 skillId
- **THEN** CLI 不调用批量检测
- **AND** 不标记无更新
- **AND** 提示重新 add 后恢复自动检查

### Requirement: 观测构建安装校验

已开启观测目标的安装请求 SHALL 携带检测阶段获得的 `releaseSeq`。Market 返回 `409 BUILD_CHANGED` 时 CLI SHALL 重新检测或报告冲突，SHALL NOT 安装旧响应。已开启观测目标返回 `409 OBS_VERSION_UNAVAILABLE` 时 CLI SHALL fail-closed，SHALL NOT 回退原版或 GitHub 来源。`observabilityEnabled=false` 时 CLI SHALL 使用原版安装路径，不携带 `releaseSeq`。

CLI SHALL 在已开启观测目标的安装响应中读取 `observabilityEnabled=true`、`version`、`releaseSeq`、`buildHash`、`files` 和可选 `binaryFiles`。未开启观测目标的响应 SHALL 视为原版安装，不要求观测身份字段。`buildHash` SHALL NOT 要求长期写入 lock。

#### Scenario: 检测后构建变化

- **WHEN** 安装请求携带的 `releaseSeq` 与 Market 当前值不一致
- **THEN** CLI 报告构建已变化
- **AND** 不落盘

#### Scenario: 无可用观测产物

- **WHEN** Market 返回 `OBS_VERSION_UNAVAILABLE`
- **THEN** CLI 报告目标版本不可用
- **AND** 不回退原版或其他来源

#### Scenario: 成功响应携带构建身份

- **WHEN** Market 安装成功
- **THEN** CLI 获得 `version/releaseSeq/buildHash`

#### Scenario: 未开启观测走原版安装

- **WHEN** 检测响应为 `observabilityEnabled=false`
- **THEN** CLI 使用原版 Market 安装路径
- **AND** 不要求 `releaseSeq/buildHash`

### Requirement: 观测构建 buildHash 下载校验

仅当安装响应为 `observabilityEnabled=true` 时，CLI SHALL 在写入任何目标目录前，按响应中的文本与二进制文件计算最终包内容 hash，并与 `buildHash` 比较。不一致时 SHALL 丢弃本次下载并报错。

hash 计算 SHALL 覆盖文件相对路径及原始字节；文本和二进制 SHALL 使用同一字节口径。CLI 收到 `observabilityEnabled=true` 且缺少 `buildHash` 的响应时 SHALL 将该安装视为不满足新观测构建契约并失败；`observabilityEnabled=false` 或非 Market 原版响应缺少 `buildHash` 时 SHALL 保持旧兼容行为。

路径 SHALL 使用相对 `/` 路径并按 UTF-8 路径字节序排序。每项编码 SHALL 为 `<utf8 path 的十进制字节长度>:<utf8 path>:<64 位 lowercase hex sha256(raw bytes)>`，项之间使用单个 `\n`，末尾不加换行；外层 SHA-256 SHALL 输出为 `sha256:<hex>`。长度前缀 SHALL 支持包含 `:`、换行或其他控制字符的合法文件路径。

#### Scenario: hash 一致

- **WHEN** `observabilityEnabled=true` 且本地计算 hash 与响应 `buildHash` 一致
- **THEN** 继续安装

#### Scenario: hash 不一致

- **WHEN** `observabilityEnabled=true` 且本地计算 hash 与响应 `buildHash` 不一致
- **THEN** 本次安装失败
- **AND** 不修改目标目录

#### Scenario: 响应缺少 buildHash

- **WHEN** `observabilityEnabled=true` 的 Market 安装响应没有 `buildHash`
- **THEN** CLI 按不兼容契约失败

#### Scenario: 未开启观测不要求 buildHash

- **WHEN** `observabilityEnabled=false` 的原版响应没有 `buildHash`
- **THEN** CLI 不执行观测构建 hash 校验
- **AND** 保持旧版响应兼容

### Requirement: 写盘前校验并直接写入

已开启观测构建的 `buildHash` SHALL 在安装器修改任何目标目录前完成校验。校验通过后，安装器 SHALL 沿用原有直接写入流程：对目标目录执行清理与重建，再逐项写入文件。CLI SHALL NOT 创建 staging、backup 或完成标记，SHALL NOT 执行目录级原子替换、崩溃恢复、跨 Agent 全量回滚或 `partialSuccess`。

copy 模式涉及多个 Agent 目录时，CLI SHALL 按目标顺序逐个安装，不要求先为全部目标预写文件。某个目标写入失败时，该目标目录允许为空或残缺；CLI SHALL 继续尝试剩余目标，并在任一目标失败时返回整次安装失败。

符号链接模式 SHALL 清理并重建 canonical 目录后写入文件，再维护目标 Agent 链接；建链失败时可回退为 copy。全局与项目 lock SHALL 保持原有普通读改写；并发执行多个 CLI 不是支持场景，本期不提供 sidecar lock。

#### Scenario: 首次安装

- **WHEN** 目标目录不存在且 `buildHash` 校验成功
- **THEN** CLI 清理并创建目标目录后直接写入完整文件

#### Scenario: 升级成功

- **WHEN** 目标目录已有旧版本且新构建校验通过
- **THEN** CLI 清理旧目录并直接写入新文件
- **AND** Agent 链接继续指向 canonical 目录

#### Scenario: 升级写入失败

- **WHEN** 文件写盘过程中发生错误
- **THEN** 失败目标目录允许为空或残缺
- **AND** CLI 返回安装失败
- **AND** CLI 不推进 lock

#### Scenario: copy 模式部分目标失败

- **WHEN** copy 模式某个 Agent 目标写入失败
- **THEN** CLI 不回滚已经成功写入的其他 Agent 目标
- **AND** 继续尝试剩余目标
- **AND** 最终返回安装失败且 lock 保持旧值

### Requirement: Lock 仅在安装成功后推进

CLI SHALL 仅在全部目标文件都写入成功后，通过 lock 的普通读改写写入 `version` 与已开启源版本的 `releaseSeq`。`observabilityEnabled=false` 时只更新原版 `version` 相关字段，不要求或写入 `releaseSeq`。安装失败、任一目标写入失败、hash 不一致、releaseSeq 冲突或任一步骤异常时 SHALL 保留 lock 旧值。

lock 新增字段 SHALL 向后兼容；读取缺少 `releaseSeq` 的旧 lock 不报错。已开启目标在下一次成功安装后补齐 `releaseSeq`；未开启目标不补齐该字段。

#### Scenario: 安装成功后更新 lock

- **WHEN** `observabilityEnabled=true` 的 Skill 文件已写入全部目标
- **THEN** lock 更新为响应中的 `version/releaseSeq`

#### Scenario: 安装失败不更新 lock

- **WHEN** 文件校验或落地失败
- **THEN** lock 保持旧 `version/releaseSeq`

#### Scenario: 文件安装成功但 lock 写入失败

- **WHEN** 全部目标文件已写入但 lock 文件写入失败
- **THEN** 文件保持已安装内容
- **AND** lock 保持旧值
- **AND** CLI 输出明确警告并保持本次安装成功结果

#### Scenario: 旧 lock 兼容

- **WHEN** 已开启观测的 lock 条目缺少 `releaseSeq`
- **THEN** 读取与 `track` 操作不报错
- **AND** 下一次安装成功后写入新的 `releaseSeq`

#### Scenario: 未开启原版 lock 不写 releaseSeq

- **WHEN** 批量检测返回 `observabilityEnabled=false`
- **THEN** 安装成功只更新原版 `version`
- **AND** lock 不需要写入 `releaseSeq`
