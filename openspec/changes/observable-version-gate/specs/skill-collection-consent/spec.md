## REMOVED Requirements

### Requirement: 安装接口携带 report 参数

**Reason**: 市场端已移除 `report`，安装接口始终返回目标版本当前可用产物。

**Migration**: CLI 删除安装请求中的 `report`；根据响应是否含合法 `collect.config` + 签名识别可观测 Skill，实际文件始终按服务端 `files` 落盘。

### Requirement: 作者撤回采集声明不影响已装副本（跨仓边界一致）

**Reason**: 授权语义改为只由用户 lock 的 `collectConsent` 决定，作者撤回不再改变“已装文件是否可观测”。

**Migration**: 已安装文件保持不变；用户 `track off` 只写 `collectConsent=false`，后续安装按服务端当前版本产物落盘。

## ADDED Requirements

### Requirement: 安装接口统一返回目标版本可用产物

CLI SHALL NOT 在 Market 安装请求中发送 `report`。市场返回的 `files`/`binaryFiles` 是目标版本当前唯一可安装产物：可观测 Skill 返回 active artifact，非可观测 Skill 返回原版。CLI SHALL 原样落盘，不按用户 consent 切换包类型。

响应含合法 `collect`（`config` 与非空 `meta.blueai_signature`）表示该 Skill 可观测；不含 `collect` 表示非可观测 Skill。`collect.reason` 不再是失败降级契约。

#### Scenario: 可观测 Skill 安装

- **WHEN** 目标版本 `collectEnabled=true` 且存在 active artifact
- **THEN** 安装响应返回改造后文件；CLI 原样落盘并识别该 Skill 可观测

#### Scenario: 非可观测 Skill 安装

- **WHEN** 目标版本 `collectEnabled=false`
- **THEN** 安装响应返回原版文件且不返回 `collect`；CLI 不写 consent 变更

#### Scenario: 可观测版本不可用

- **WHEN** 目标版本 `collectEnabled=true` 但没有可用 active artifact
- **THEN** Market 返回 `409 OBS_VERSION_UNAVAILABLE`；CLI 明确报错并 fail-closed，不回退原版或其他来源

#### Scenario: 用户拒绝统计仍安装可观测版本

- **WHEN** lock 中该 Skill 的 `collectConsent=false`，且安装响应返回合法 `collect`
- **THEN** CLI 仍安装响应文件，但不上报同意、不引导安装采集插件
