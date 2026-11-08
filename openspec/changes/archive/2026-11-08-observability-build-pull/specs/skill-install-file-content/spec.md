## MODIFIED Requirements

### Requirement: 旧服务端响应保持行为不变

当安装响应属于非 Market 观测构建路径且不包含 `buildHash` 时，系统 SHALL 与本次变更前的行为完全一致：`binaryFiles` 缺失不报错、不输出额外提示、不改变写入文件的数量与内容。

当响应显式 `observabilityEnabled=true` 或目标属于 Market 已开启观测的 Skill 时，缺少 `buildHash` SHALL 视为不兼容契约并安装失败；SHALL NOT 因兼容旧响应而跳过 buildHash 校验。`observabilityEnabled=false` 的 Market 原版路径继续旧兼容。存在 `buildHash` 但缺少 `binaryFiles` 时仍按纯文本响应处理。

#### Scenario: 非观测旧响应不含 binaryFiles

- **WHEN** 非 Market 观测构建响应没有 `binaryFiles` 和 `buildHash`
- **THEN** 安装成功且结果与本次变更前一致，无警告、无错误

#### Scenario: 响应不含 binaryFiles

- **WHEN** 非观测构建响应没有 `binaryFiles` 字段
- **THEN** 安装成功且结果与本次变更前完全一致
- **AND** 不输出额外提示或错误

#### Scenario: 观测构建响应缺少 buildHash

- **WHEN** Market 已开启观测 Skill 的安装响应缺少 `buildHash`
- **THEN** 安装失败
- **AND** 目标目录保持不变

#### Scenario: 未开启观测的 Market 原版响应

- **WHEN** Market 响应 `observabilityEnabled=false` 且不包含 `buildHash`
- **THEN** 安装保持旧原版行为
- **AND** 不产生观测构建契约错误

#### Scenario: 观测构建纯文本响应

- **WHEN** 响应包含 `buildHash` 但不含 `binaryFiles`
- **THEN** 按纯文本文件集合完成 hash 校验后安装
