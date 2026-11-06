## REMOVED Requirements

### Requirement: Team collection preflight uses the same release context

**Reason**: 安装接口移除 `report`，团队不再通过独立采集预检请求切换产物。

**Migration**: 团队安装直接使用 release-bound 上下文获取每个 Skill 的唯一安装响应，并从该响应识别可观测 Skill 与 consent 状态。

## ADDED Requirements

### Requirement: Team install identifies observable skills without report

团队批量安装 SHALL 使用列表返回的 Skill ID、teamId、installVersion 和 releaseId 获取每个 Skill 的唯一安装响应。CLI SHALL 根据响应 `collect` 识别可观测 Skill，SHALL NOT 发送 `report` 或额外请求原版/改造版。

#### Scenario: Observable team Skill

- **WHEN** release-bound 安装响应含合法 `collect`
- **THEN** CLI 使用同一响应文件，并按 lock consent 决定是否询问统计

#### Scenario: Non-observable team Skill

- **WHEN** release-bound 安装响应不含 `collect`
- **THEN** CLI 安装原版且不写 consent

### Requirement: Observable team version failure is fail-closed

Market 返回 `409 OBS_VERSION_UNAVAILABLE`、release 不匹配或其他安装失败时，团队 CLI SHALL 报告该 Skill 不可用，SHALL NOT 回退原版、公开解析、私有 author 解析、GitHub 或其他团队版本。

#### Scenario: Active artifact unavailable

- **WHEN** 团队可观测 Skill 没有可用产物
- **THEN** CLI 报错并跳过该 Skill，不回退替代来源

#### Scenario: One team Skill fails

- **WHEN** 团队批量安装中单个可观测 Skill 失败
- **THEN** 其他 Skill 可继续安装，失败项保留明确错误
