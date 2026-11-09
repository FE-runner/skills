# skill-collection-consent Specification

## Purpose

为 Skill 数据采集的用户侧合规闭环（与 skills-market 侧「作者声明」对称）：market 侧统一返回目标版本的可用产物，CLI 只消费安装响应并原样落盘；用户是否统计由 lock `collectConsent` 决定。本 spec 为 **skills-market ↔ blueai-skills 双仓端到端契约**，供双仓维护对账；CLI 的用户侧状态机、首次询问与 `track` 行为见 `cli-skill-collection-consent`。采集数据直达阿里云可观测插件，平台不落使用数据。

## Requirements

### Requirement: 安装接口统一返回目标版本可用产物

CLI SHALL NOT 在 Market 安装请求中发送 `report`。市场返回的 `files`/`binaryFiles` 是目标版本当前唯一可安装产物：可观测 Skill 返回 active artifact，非可观测 Skill 返回原版。CLI SHALL 原样落盘，不按用户 consent 切换包类型。

响应含合法 `collect`（`config` 与非空 `meta.blueai_signature`）表示该 Skill 可观测；不含 `collect` 表示非可观测 Skill。`collect.reason` 不再是失败降级契约。

#### Scenario: 可观测 Skill 安装

- **WHEN** 目标版本 `collectEnabled=true` 且存在 active artifact
- **THEN** 安装响应返回改造后文件；CLI 原样落盘并识别该 Skill 可观测

#### Scenario: 非可观测 Skill 安装

- **WHEN** 未显式传 `--observability`，且目标版本 `collectEnabled=false`
- **THEN** 安装响应返回原版文件且不返回 `collect`；CLI 不写 consent 变更

#### Scenario: 可观测版本不可用

- **WHEN** 目标版本 `collectEnabled=true` 但没有可用 active artifact
- **THEN** Market 返回 `409 OBS_VERSION_UNAVAILABLE`；CLI 明确报错并 fail-closed，不回退原版或其他来源

#### Scenario: 用户拒绝统计仍安装可观测版本

- **WHEN** lock 中该 Skill 的 `collectConsent=false`，且安装响应返回合法 `collect`
- **THEN** CLI 仍安装响应文件，但不上报同意、不引导安装采集插件
