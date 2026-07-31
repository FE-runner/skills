# private-skill-lifecycle Specification

## Purpose
TBD - created by archiving change fix-private-skill-lock-author. Update Purpose after archive.
## Requirements
### Requirement: 安装私有技能时 source 字段包含 author
系统在安装含 author 前缀的 Market 技能时，SHALL 将 author 编码进锁文件的 `source` 字段，格式为 `market/author/skillName`。

#### Scenario: 安装私有技能时 source 包含 author
- **WHEN** 用户执行 `skills add 李阳_242613/my-skill -g` 安装私有技能
- **THEN** 锁文件中该技能条目的 `source` 字段 SHALL 为 `"market/李阳_242613/my-skill"`

#### Scenario: 安装公开技能时 source 不含 author
- **WHEN** 用户执行 `skills add my-public-skill -g` 安装无 author 前缀的公开技能
- **THEN** 锁文件中该技能条目的 `source` 字段 SHALL 为 `"market/my-public-skill"`（格式不变）

### Requirement: check 命令支持私有技能版本检查
系统在执行 `skills check` 时，SHALL 从锁文件的 `source` 字段解析出 author 信息并传递给 Market API。

#### Scenario: 全局模式检查私有技能更新
- **WHEN** 用户执行 `skills check -g`，且全局锁文件中有 `source` 为 `"market/李阳_242613/my-skill"` 的技能
- **THEN** 系统 SHALL 解析出 author 为 `"李阳_242613"` 并调用 `marketProvider.check(skillPath, "李阳_242613")`

#### Scenario: 全局模式检查公开技能更新（向后兼容）
- **WHEN** 用户执行 `skills check -g`，且锁文件中技能 source 为 `"market/my-skill"`（不含 author）
- **THEN** 系统 SHALL 调用 `marketProvider.check(skillPath)` 不传递 author 参数（行为不变）

#### Scenario: 本地模式检查私有技能更新
- **WHEN** 用户执行 `skills check`（项目级），且本地锁文件中有含 author 的 source
- **THEN** 系统 SHALL 从 source 解析 author 并传递给 `marketProvider.check()`

### Requirement: update 命令支持私有技能更新
系统在执行 `skills update` 时，SHALL 从 source 字段派生包含 author 的 installUrl 重新安装私有技能。

#### Scenario: 全局模式更新私有技能
- **WHEN** 用户执行 `skills update -g`，且有 `source` 为 `"market/李阳_242613/my-skill"` 的技能需要更新
- **THEN** 系统 SHALL 使用 `李阳_242613/my-skill` 作为 installUrl 调用 `skills add` 进行重新安装

#### Scenario: 全局模式更新公开技能（向后兼容）
- **WHEN** 用户执行 `skills update -g`，且有 `source` 为 `"market/my-skill"` 的公开技能需要更新
- **THEN** 系统 SHALL 使用 `my-skill` 作为 installUrl（行为不变）

#### Scenario: 本地模式更新私有技能
- **WHEN** 用户执行 `skills update`（项目级），且本地锁文件中有含 author 的 source
- **THEN** 系统 SHALL 使用 `author/skillName` 格式作为 installUrl 进行重新安装

### Requirement: 旧锁文件向后兼容
系统 SHALL 能正常处理不包含 author 的旧版 `source` 字段格式，不产生报错。

#### Scenario: 读取旧格式 source 的锁文件
- **WHEN** 系统读取一个 source 格式为 `"market/skillName"` 的旧锁文件
- **THEN** 系统 SHALL 正常运行，解析结果中 author 为 undefined，所有已有功能不受影响

