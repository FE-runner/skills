## ADDED Requirements

### Requirement: Team single Skill collection context is release-bound

`ts_<skillTeamId>/<skillName>` 团队单 Skill 的 `report=true` 采集探测 SHALL 与实际安装使用相同 `skillId`、`teamId`、版本和 `releaseId`。全局安装写入 lock 时 SHALL 保存 `skillTeamId` 与 `releaseId`；`track on/off` MUST 使用同一上下文重取，SHALL NOT 重新执行团队 resolver、公开解析或 GitHub 回退。`releaseId` 已失效时 CLI SHALL 报告失败并保持原 `collectConsent` 状态不变。

#### Scenario: Collection preflight uses the same release

- **WHEN** 团队单 Skill 全局安装需要探测采集配置
- **THEN** `report=true` 请求携带 resolver 返回的 `id`、`team`、`version` 和 `releaseId`
- **AND** 正式安装复用完全相同的版本上下文

#### Scenario: Track toggles the same team release

- **WHEN** 用户对带 `skillTeamId` 和 `releaseId` 的全局团队单 Skill 执行 `track on` 或 `track off`
- **THEN** 请求携带 lock 中的同一组团队与 release 标识
- **AND** 写回后保留这些字段

#### Scenario: Team release is no longer current

- **WHEN** `track on` 或 `track off` 使用已失效的 `releaseId` 请求 Market
- **THEN** CLI 输出团队版本不可用
- **AND** 不改变原 collectConsent，也不回退其他安装源
