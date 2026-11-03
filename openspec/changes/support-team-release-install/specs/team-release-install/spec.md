## Purpose

让 CLI 通过 Team、Skill ID 和团队生效 release 版本完成批量安装与采集预检，避免把团队 Skill 当作公开或私有 Skill 重新解析。

## ADDED Requirements

### Requirement: Team install list carries release version

CLI SHALL 读取 `/api/team/installAll` 返回的每个 Skill 标识、名称、展示名、authorId 和 `installVersion`。为兼容旧 Market，`installVersion` 缺失时可回退读取 `currentVersion`，但新 Market 响应存在 `installVersion` 时 MUST 优先使用它。

#### Scenario: New Market returns installVersion

- **WHEN** 团队安装列表返回 `installVersion=2.0.0`
- **THEN** CLI 使用 `2.0.0` 作为该 Skill 的安装版本

#### Scenario: Old Market omits installVersion

- **WHEN** 团队安装列表未返回 `installVersion` 但返回 `currentVersion=1.0.0`
- **THEN** CLI 使用 `1.0.0` 作为兼容版本

### Requirement: Team Skill installs by explicit identifier and team

团队批量安装中的每个 Skill SHALL 使用列表返回的 Skill ID、teamId 和生效版本直接请求 Market 安装接口，SHALL NOT 先经过 `resolve(name)`、裸名公开安装或 author/name 私有安装。请求体 MUST 包含 `id`、`team` 和 `version`，且 `team` 优先于 author 或公开解析。

#### Scenario: PUBLIC skill is still pending public review

- **WHEN** 团队列表返回一个 PUBLIC+PENDING Skill，但其团队已存在生效 release
- **THEN** CLI 以该 Skill ID、teamId 和 installVersion 调用安装接口
- **AND** 不要求该 Skill 出现在公开搜索结果中

#### Scenario: Team has previous approved release while new release is pending

- **WHEN** 团队新版待审且 installVersion 指向旧版
- **THEN** CLI 安装旧版
- **AND** 不尝试解析或安装待审新版

#### Scenario: Team Skill install fails

- **WHEN** 指定 teamId 或 installVersion 的安装请求失败
- **THEN** CLI 报告该团队版本不可用
- **AND** 不回退 GitHub、公开裸名或私有 author 解析

### Requirement: Team collection preflight uses the same release context

团队采集配置预检 SHALL 使用与实际安装相同的 Skill ID、teamId 和 installVersion 请求 `report=true`。预检结果 MUST 与随后落盘的版本一致；不得以公开 `currentVersion`、名称解析结果或其他团队版本进行探测。

#### Scenario: Team skill has collection config

- **WHEN** 团队列表返回可用 release
- **AND** 团队采集预检使用同一 id/team/version 探测到有效 `collect`
- **THEN** 团队级询问结果应用到该 Skill 的正式安装请求

#### Scenario: Collection preflight version differs from install version

- **WHEN** 探测请求与正式安装请求的 teamId 或 installVersion 不一致
- **THEN** CLI MUST NOT 复用该探测结果

### Requirement: Existing single Skill install remains unchanged

只有 `t_<teamId>/<teamName>` 团队批量入口 SHALL 使用新的显式 ID/team/version 流程。普通公开 Skill、私有 Skill、author/name、GitHub 回退和单 Skill 采集同意行为 MUST 保持不变。

#### Scenario: Install public skill by name

- **WHEN** 用户执行 `skills add my-skill`
- **THEN** CLI 继续走原有公开名称解析和安装流程

#### Scenario: Install private skill by author and name

- **WHEN** 用户执行 `skills add <authorId>/my-skill`
- **THEN** CLI 继续走原有私有名称解析和 author 安装流程
