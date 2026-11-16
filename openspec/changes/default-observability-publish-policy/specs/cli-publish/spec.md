# Spec Delta

## ADDED Requirements

### Requirement: 上传元数据字段透传

系统 SHALL 将 `--display-name`、`--brief`、`--skill-type`、`--category`、`--changelog` 分别映射为 `displayName`、`brief`、`skillType`、`category`、`changelog`。未提供的展示、分类、团队等字段 SHALL NOT 写入请求体。

#### Scenario: 传入全部上传元数据

- **WHEN** 用户执行 `skills publish --display-name "我的技能" --brief "简介" --skill-type CMD --category AUTOMATION --changelog "首次发布" --collect`
- **THEN** `/api/skill/push` 请求体包含对应的 `displayName`、`brief`、`skillType`、`category`、`changelog` 和 `collectEnabled: true`

### Requirement: 采集参数默认可观测

`collectEnabled` SHALL 默认取 `true`，`--collect` 显式发送 `true`，`--no-collect` 发送 `false`。公开、私有和团队发布使用相同默认值；`--public --no-collect` SHALL NOT 在本地返回参数冲突。

#### Scenario: 未传采集参数时默认开启

- **WHEN** 用户执行 `skills publish` 且未传 `--collect` 或 `--no-collect`
- **THEN** `/api/skill/push` 请求体包含 `collectEnabled: true`

#### Scenario: 公开发布未传采集参数

- **WHEN** 用户执行 `skills publish --public` 且未传 `--collect` 或 `--no-collect`
- **THEN** `/api/skill/push` 请求体包含 `visibility: "PUBLIC"` 和 `collectEnabled: true`

#### Scenario: 显式请求不开启可观测

- **WHEN** 用户执行 `skills publish --no-collect`
- **THEN** `/api/skill/push` 请求体包含 `collectEnabled: false`
- **AND** CLI 在推送成功后说明已开启可观测的 Skill 不会被关闭，本次更新后仍保持开启

#### Scenario: 公开发布允许请求不开启可观测

- **WHEN** 用户执行 `skills publish --public --no-collect`
- **THEN** 系统不返回本地参数冲突错误
- **AND** `/api/skill/push` 请求体包含 `visibility: "PUBLIC"` 和 `collectEnabled: false`

#### Scenario: 团队发布未传采集参数

- **WHEN** 用户执行 `skills publish --team team-a` 且未传 `--collect` 或 `--no-collect`
- **THEN** `/api/skill/push` 请求体包含 `teamIds: ["team-a"]` 和 `collectEnabled: true`

### Requirement: 拒绝未知发布选项

`skills publish` SHALL 拒绝未声明的选项，并 SHALL NOT 发起 push 请求。

#### Scenario: 未知选项

- **WHEN** 用户执行 `skills publish --unknown-option`
- **THEN** 系统输出参数错误并退出，不发起 push 请求

## REMOVED Requirements

### Requirement: 上传元数据参数

**Reason**: 采集默认值、公开发布参数约束和成功输出语义均由新的“上传元数据字段透传”和“采集参数默认可观测”要求取代。

**Migration**: 调用方未传采集参数时改由 CLI 发送 `collectEnabled: true`；`--public --no-collect` 不再在本地失败，`--no-collect` 改为请求尚未开启可观测的 Skill 保持关闭。无需迁移本地数据或请求格式。

### Requirement: 消费 Market 采集强制来源

**Reason**: 发布策略改为 CLI 默认表达开启可观测，并由服务端保证已开启后不可关闭；CLI 不再解释签名或公开可见性触发的强制来源。

**Migration**: 删除 `collectForcedBySignature`、`collectForcedByVisibility` 和 `collectForcedReason` 的 Provider 映射、命令输出与对应测试。旧 Market 仍可返回这些字段，CLI 忽略即可，不需要请求迁移或数据变更。
