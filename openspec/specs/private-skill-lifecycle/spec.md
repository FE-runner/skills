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

### Requirement: 旧锁文件向后兼容
系统 SHALL 能正常处理不包含 author 的旧版 `source` 字段格式，不产生报错。

#### Scenario: 读取旧格式 source 的锁文件
- **WHEN** 系统读取一个 source 格式为 `"market/skillName"` 的旧锁文件
- **THEN** 系统 SHALL 正常运行，解析结果中 author 为 undefined，所有已有功能不受影响
