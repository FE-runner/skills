# Context

## 关键决策

- 命令契约固定为 `ts_<skillTeamId>/<skillName>`。`SkillTeam.id` 不可由 `teamId` 或 `authorId` 推导，名称只用于可读性和旧命令校验。
- Market resolver 返回的 `releaseId` 必须贯穿原版下载、`report=true` 探测与正式安装；只比较 version 无法区分同版本的新 release。
- `ts_` 解析失败一律 fail-closed，不回退公开、私有、GitHub 或 `t_` 全团队安装。
- 旧 `t_<teamId>/<teamName>` 批量命令保持原行为；新命令只安装 resolver 返回的一个目标。
- 不增加环境变量，CLI 与 Market/Web 在同一协调窗口上线。

## 已否决方案

- `ts_<teamId>/<skillName>`：团队内可存在同名 Skill，且 teamId 不能稳定定位 SkillTeam 关系。
- `ts_<teamId>/<authorId>/<skillName>`：可以消歧但命令过长，仍需额外查询且不优于 SkillTeam ID。
- 只传 Skill ID 或只传 version：无法同时提供可读名称和同版本 release 的不可变绑定。
- resolver 失败后沿用旧公开/私有名称解析：可能安装错渠道版本，违反团队 release 语义。

## 范围边界

- 做：CLI 解析、Market resolver 调用、release-bound 下载与采集、lock/track 上下文、help/README、测试。
- 不做：Market 侧 resolver 实现（已在另一 change 完成）、数据库迁移、自动刷新团队 release、全团队命令替换。
- `blueai-skills-cli` 用户技能位于独立 `liyang-skills` 仓库，不在本 worktree 写入范围；上线前需在该仓库单独同步 `ts_` 安装说明。

## 已知坑

- `parseMarketInstallCommand` 会把 `ts_<skillTeamId>` 放在 `marketAuthor`；必须在 `t_` 和普通 market resolve 之前识别，顺序错误会被当作私有 author。
- resolver 返回的 `teamId` 与命令里的 `skillTeamId` 不同，安装和 lock 要分别保存两者。
- resolver 到安装之间 release 可能变化；Market 会用 `releaseId + version` 拒绝，CLI 不得把失败当普通 Market miss 后回退。
- 团队单 Skill 的采集探测必须传同一 `releaseId`，不能只复用 id/team/version。
- `track` 的历史 `t_` entry 没有 `releaseId`；新增字段必须可选，否则会让旧 lock 失效。
- 项目级 lock 的恢复来源应保留可重新解析的 `ts_<skillTeamId>/<skillName>`，不能写成普通 `market/<name>`。
