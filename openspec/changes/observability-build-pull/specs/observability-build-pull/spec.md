## Purpose

定义 CLI 通过 Skill 市场批量构建检测拉取不可变观测构建、使用 release 序列判断更新，并在下载校验后原子替换本地 Skill 的完整行为。

## ADDED Requirements

### Requirement: CLI 使用 version 与 releaseSeq 检测观测构建

CLI SHALL 将 Market lock 扩展为可保存目标版本对应的 `releaseSeq`。普通和私有 Market Skill SHALL 使用 `skillId + authorId + version + releaseSeq` 调用 Skill 市场批量构建检测；团队 Skill SHALL 使用 `skillId + teamId + releaseId + version + releaseSeq` 构造构建目标，`skillTeamId` 仅用于 `ts_` source 路由。

单条检查 SHALL 调用批量接口并提交长度为一的数组。`check` SHALL 在版本或 `releaseSeq` 任一不一致时标记有更新。`update` SHALL 对普通、私有和团队目标重新执行对应 `add`，安装成功后写入新的 `version/releaseSeq`。

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

#### Scenario: 旧 lock 缺少 releaseSeq

- **WHEN** lock 条目没有 `releaseSeq`
- **THEN** CLI 将该条目标记为需要重新检测并拉取

### Requirement: 观测构建安装校验

安装请求 SHALL 携带检测阶段获得的 `releaseSeq`。Market 返回 `409 BUILD_CHANGED` 时 CLI SHALL 重新检测或报告冲突，SHALL NOT 安装旧响应。Market 返回 `409 OBS_VERSION_UNAVAILABLE` 时 CLI SHALL fail-closed，SHALL NOT 回退原版或 GitHub 来源。

CLI SHALL 在安装响应中读取 `version`、`releaseSeq`、`buildHash`、`files` 和可选 `binaryFiles`。`buildHash` SHALL NOT 要求长期写入 lock。

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

### Requirement: buildHash 下载校验

CLI SHALL 在写入任何目标目录前，按安装响应中的文本与二进制文件计算最终包内容 hash，并与 `buildHash` 比较。不一致时 SHALL 丢弃本次下载并报错。

hash 计算 SHALL 覆盖文件相对路径及原始字节；文本和二进制 SHALL 使用同一字节口径。CLI 收到旧 Market 缺少 `buildHash` 的响应时 SHALL 将该安装视为不满足新观测构建契约并失败。

#### Scenario: hash 一致

- **WHEN** 本地计算 hash 与响应 `buildHash` 一致
- **THEN** 继续安装

#### Scenario: hash 不一致

- **WHEN** 本地计算 hash 与响应 `buildHash` 不一致
- **THEN** 本次安装失败
- **AND** 不修改目标目录

#### Scenario: 响应缺少 buildHash

- **WHEN** Market 安装响应没有 `buildHash`
- **THEN** CLI 按不兼容契约失败

### Requirement: 原子替换且保留旧版本

安装器 SHALL 先把完整文件集合写入临时或 staging 目录，完成路径、二进制、`buildHash` 与文件写入校验后，再原子替换 canonical Skill 目录。目标目录已存在时，替换失败 SHALL 保留原目录及原文件，SHALL NOT 先删除旧版本。

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
- **THEN** 该目录旧内容保持不变或由 staging 原子恢复

### Requirement: Lock 仅在安装成功后推进

CLI SHALL 仅在安装成功且目标目录已切换后写入 lock 的 `version` 与 `releaseSeq`。安装失败、hash 不一致、releaseSeq 冲突或任一步骤异常时 SHALL 保留 lock 旧值。

lock 新增字段 SHALL 向后兼容；读取缺少 `releaseSeq` 的旧 lock 不报错，并在下一次成功安装后补齐。

#### Scenario: 安装成功后更新 lock

- **WHEN** Skill 文件原子安装完成
- **THEN** lock 更新为响应中的 `version/releaseSeq`

#### Scenario: 安装失败不更新 lock

- **WHEN** 文件校验或落地失败
- **THEN** lock 保持旧 `version/releaseSeq`

#### Scenario: 旧 lock 兼容

- **WHEN** lock 条目缺少 `releaseSeq`
- **THEN** 读取与 `track` 操作不报错
- **AND** 下一次安装成功后写入新的 `releaseSeq`
