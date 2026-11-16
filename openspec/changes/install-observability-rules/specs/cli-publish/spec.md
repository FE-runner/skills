# Spec Delta

## REMOVED Requirements

### Requirement: 采集参数默认可观测

**Reason**: 公开发布现在禁止显式关闭采集，旧 Requirement 允许无冲突发送 `collectEnabled=false` 的行为不再成立。

**Migration**: 公开发布必须使用默认开启或不传采集参数；私有和团队发布仍可显式传 `--no-collect`。

## ADDED Requirements

### Requirement: 采集参数默认开启且公开发布禁止显式关闭

`collectEnabled` SHALL 默认取 `true`，`--collect` 显式发送 `true`，`--no-collect` 对非公开发送 `false`。`publish --public --no-collect` SHALL 在读取文件前返回本地参数错误且不发起 push 请求；公开 Skill 最终必须由服务端保持开启。

#### Scenario: 未传采集参数时默认开启

- **WHEN** 用户执行 `skills publish` 且未传 `--collect` 或 `--no-collect`
- **THEN** 请求体包含 `collectEnabled: true`

#### Scenario: 非公开显式关闭

- **WHEN** 用户执行 `skills publish --no-collect`
- **THEN** 请求体包含 `collectEnabled: false`

#### Scenario: 团队发布默认开启

- **WHEN** 用户执行 `skills publish --team team-a` 且未传采集参数
- **THEN** 请求体包含 `teamIds: ["team-a"]` 和 `collectEnabled: true`

#### Scenario: 公开发布未传采集参数

- **WHEN** 用户执行 `skills publish --public` 且未传采集参数
- **THEN** 请求体包含 `visibility: "PUBLIC"` 和 `collectEnabled: true`

#### Scenario: 公开发布禁止显式关闭

- **WHEN** 用户执行 `skills publish --public --no-collect`
- **THEN** CLI 在读取 `SKILL.md` 前返回参数错误
- **AND** 不发起 push 请求
