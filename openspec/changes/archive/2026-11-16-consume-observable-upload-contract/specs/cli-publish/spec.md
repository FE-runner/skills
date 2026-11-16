# 规格增量

## MODIFIED Requirements

### Requirement: 上传元数据参数

系统 SHALL 支持通过 `publish` 设置市场展示信息：

| CLI 参数                | push 请求字段           | 说明                                      |
| ----------------------- | ----------------------- | ----------------------------------------- |
| `--display-name <name>` | `displayName`           | 市场展示名称，不修改 `SKILL.md` 的 `name` |
| `--brief <text>`        | `brief`                 | 技能简介                                  |
| `--skill-type <type>`   | `skillType`             | 技能类型                                  |
| `--category <category>` | `category`              | 技能分类                                  |
| `--changelog <text>`    | `changelog`             | 本次变更说明                              |
| `--collect`             | `collectEnabled: true`  | 开启数据采集改造                          |
| `--no-collect`          | `collectEnabled: false` | 私有 Skill 关闭数据采集改造               |

未提供的字段 SHALL NOT 写入请求体。私有 Skill 的 `collectEnabled` 为三态：未提供时新建使用服务端默认值、更新保持原值；`--collect` 和 `--no-collect` 显式覆盖。

携带 `--public` 时，系统 SHALL 无条件发送 `collectEnabled=true`。同时携带 `--public --no-collect` SHALL 在本地返回参数冲突错误，不发送 push 请求。

#### Scenario: 传入全部上传元数据

- **WHEN** 用户执行 `skills publish --display-name "我的技能" --brief "简介" --skill-type CMD --category AUTOMATION --changelog "首次发布" --collect`
- **THEN** `/api/skill/push` 请求体包含对应的 `displayName`、`brief`、`skillType`、`category`、`changelog` 和 `collectEnabled: true`

#### Scenario: 显式关闭数据采集

- **WHEN** 用户执行 `skills publish --no-collect`
- **THEN** `/api/skill/push` 请求体包含 `collectEnabled: false`

#### Scenario: 公开 Skill 未显式指定采集

- **WHEN** 用户执行 `skills publish --public`
- **THEN** `/api/skill/push` 请求体包含 `visibility: "PUBLIC"` 和 `collectEnabled: true`

#### Scenario: 公开 Skill 禁止关闭采集

- **WHEN** 用户执行 `skills publish --public --no-collect`
- **THEN** 系统输出参数冲突错误并设置非零退出状态
- **AND** 不发送 push 请求

#### Scenario: 拒绝未知选项

- **WHEN** 用户执行 `skills publish --unknown-option`
- **THEN** 系统输出参数错误并退出，不发起 push 请求

## ADDED Requirements

### Requirement: 消费 Market 采集强制来源

`marketProvider.push` SHALL 保留 Market 响应中的 `collectForcedBySignature`、`collectForcedByVisibility` 和 `collectForcedReason`。旧 Market 响应缺少这些字段时，CLI SHALL 归一为 `false`、`false` 和 `null`，且不得因此阻断发布。成功发布后，任一强制标记为 `true` 时命令 SHALL 输出明确说明：Market 已强制开启采集；签名来源与公开来源同时命中时 SHALL 说明签名原因优先。

CLI SHALL NOT 扫描本地 `SKILL.md` 自行判断可观测版本，SHALL NOT 用客户端判断覆盖 Market 返回的强制结果。

#### Scenario: 签名上传被强制采集

- **WHEN** push 响应返回 `collectForcedBySignature=true` 与 `SIGNATURE_FIELD_PRESENT`
- **THEN** CLI 输出 Market 已因签名强制开启采集的提示

#### Scenario: 未签名公开上传被强制采集

- **WHEN** push 响应返回 `collectForcedByVisibility=true` 与 `PUBLIC_VISIBILITY`
- **THEN** CLI 输出 Market 已因公开可见性强制开启采集的提示

#### Scenario: 签名与公开同时命中

- **WHEN** push 响应两个强制标记均为 `true` 且原因码为 `SIGNATURE_FIELD_PRESENT`
- **THEN** CLI 同时说明签名和公开均已强制，并标明原因码来自签名

#### Scenario: 无强制来源

- **WHEN** push 响应两个强制标记均为 `false` 且原因码为 `null`
- **THEN** CLI 不输出 Market 强制采集提示

#### Scenario: 旧 Market 缺少强制来源字段

- **WHEN** push 成功响应不含三个强制来源字段
- **THEN** CLI 使用 `false`、`false`、`null` 处理
- **AND** 正常显示既有发布成功或审核输出
