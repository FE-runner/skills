## Purpose

定义 CLI 通过 Skill 市场批量构建检测拉取不可变观测构建、使用 release 序列判断更新，并在下载校验后原子替换本地 Skill 的完整行为。

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

### Requirement: 原子替换且保留旧版本

安装器 SHALL 先把完整文件集合写入唯一 staging 目录，完成路径、二进制、`buildHash` 与文件写入校验后，再原子替换 canonical Skill 目录。目标目录已存在时，替换失败 SHALL 保留原目录及原文件，SHALL NOT 先删除旧版本。backup/staging 名称 SHALL 全局唯一；同一 canonical 目录的并发安装 SHALL 通过 sidecar lock 串行化或明确失败，并定义进程崩溃后残留目录的安全清理规则。

copy 模式涉及多个 Agent 目录时，安装器 SHALL 先为全部目标完成 staging 与校验，再逐个切换并保留各自 backup；任一目标切换失败 SHALL 回滚所有已切换目标。只有全部目标成功后才清理 backup 并推进 lock。若回滚本身失败，CLI SHALL 报告部分成功、保持 lock 旧值并保留可恢复 backup/staging；下一次持锁安装 SHALL 按恢复状态机收敛到同一构建。

copy 模式 SHALL 在 staging 前对全部目标规范化路径去重、按字节序排序并一次性获取所有目标 sidecar lock；这些锁 SHALL 持续持有到切换、回滚或恢复全部结束。目标锁全部获得后才获取 scope lock，释放时先释放 scope lock，再按目标锁获取顺序反向释放。

获得目标 sidecar lock 后，安装器 SHALL 先执行恢复状态机：canonical 存在且 backup 不存在时只清理 staging；canonical 不存在且 backup 存在时先把 backup rename 回 canonical；canonical 与 backup 均存在时确认 canonical 可读后删除 backup；canonical 与 backup 均不存在时清理未完成首次安装的 staging。其他组合 SHALL 停止并报告人工恢复，SHALL NOT 删除可能唯一有效的旧目录。

全局与项目 lock 的所有字段更新 SHALL 在同一 scope sidecar lock 内完成“读取 -> 修改 -> 临时文件写入 -> rename”，SHALL NOT 允许调用方持有一份旧快照后整体覆盖文件。安装不同 Skill 的两个进程也必须串行化最终 lock 写回，避免 `releaseSeq`、`collectConsent` 或其他条目互相覆盖。

符号链接模式 SHALL 在 canonical 目录原子切换后保持目标 Agent 链接有效；copy 模式 SHALL 对每个目标目录使用同样失败保留语义。

#### Scenario: 首次安装

- **WHEN** 目标 canonical 目录不存在且校验成功
- **THEN** 完整 staging 目录原子切换为目标目录

#### Scenario: 升级成功

- **WHEN** 目标目录已有旧版本且新构建完整校验通过
- **THEN** 原子替换为新目录
- **AND** Agent 链接继续指向 canonical 目录

#### Scenario: 升级写入失败

- **WHEN** staging 写入、hash 或原子替换失败
- **THEN** 旧 canonical 目录保持不变
- **AND** CLI 不推进 lock

#### Scenario: copy 模式替换失败

- **WHEN** copy 模式某个 Agent 目标目录写入失败
- **THEN** 所有已经切换的 Agent 目标回滚到各自旧内容
- **AND** lock 不推进

#### Scenario: copy 模式回滚失败

- **WHEN** 某个 Agent 目标切换失败且回滚另一个已切换目标也失败
- **THEN** CLI 报告部分成功并保留 backup/staging
- **AND** lock 保持旧值
- **AND** 下一次持锁安装按恢复状态机收敛到同一构建

#### Scenario: 同目录并发安装

- **WHEN** 两个 CLI 进程同时安装同一 canonical Skill
- **THEN** lockfile 使操作串行化或第二个进程明确失败
- **AND** 不出现两个 staging 同时切换目标目录

#### Scenario: 进程崩溃后残留 staging

- **WHEN** 旧进程留下超过安全窗口的 staging/backup
- **THEN** 下次安装可在确认无锁持有者后清理残留
- **AND** 不删除当前 canonical 目录

#### Scenario: 进程在 backup-only 状态崩溃

- **WHEN** canonical 已被 rename 为 backup，但 staging 尚未 rename 为 canonical
- **THEN** 下次持锁安装先把 backup 恢复为 canonical
- **AND** 绝不清除唯一的旧版本备份

#### Scenario: 不同 Skill 并发写回 lock

- **WHEN** 两个 CLI 进程同时安装不同 Skill
- **THEN** 两个进程按 scope sidecar lock 串行读取和写回全局或项目 lock
- **AND** 两个条目的版本、releaseSeq 与 collectConsent 均不丢失

#### Scenario: 并发 copy 安装目标顺序不同

- **WHEN** 两个 CLI 进程并发安装同一组 Agent 目标但内部枚举顺序不同
- **THEN** 双方按排序后的同一顺序获取全部目标 sidecar lock
- **AND** 不发生死锁或交叉回滚
- **AND** 最终目录状态与最后成功推进的 lock 一致

### Requirement: Lock 仅在安装成功后推进

CLI SHALL 仅在安装成功且目标目录已切换后，在 lock 的串行化读改写事务中写入 `version` 与已开启源版本的 `releaseSeq`。`observabilityEnabled=false` 时只更新原版 `version` 相关字段，不要求或写入 `releaseSeq`。安装失败、hash 不一致、releaseSeq 冲突或任一步骤异常时 SHALL 保留 lock 旧值。

lock 新增字段 SHALL 向后兼容；读取缺少 `releaseSeq` 的旧 lock 不报错。已开启目标在下一次成功安装后补齐 `releaseSeq`；未开启目标不补齐该字段。

#### Scenario: 安装成功后更新 lock

- **WHEN** `observabilityEnabled=true` 的 Skill 文件原子安装完成
- **THEN** lock 更新为响应中的 `version/releaseSeq`

#### Scenario: 安装失败不更新 lock

- **WHEN** 文件校验或落地失败
- **THEN** lock 保持旧 `version/releaseSeq`

#### Scenario: 旧 lock 兼容

- **WHEN** 已开启观测的 lock 条目缺少 `releaseSeq`
- **THEN** 读取与 `track` 操作不报错
- **AND** 下一次安装成功后写入新的 `releaseSeq`

#### Scenario: 未开启原版 lock 不写 releaseSeq

- **WHEN** 批量检测返回 `observabilityEnabled=false`
- **THEN** 安装成功只更新原版 `version`
- **AND** lock 不需要写入 `releaseSeq`
