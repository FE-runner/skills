# Context

本文件只记录 artifacts 之外的讨论结论与软上下文，细节见 `proposal.md`、`design.md`、`tasks.md` 和 delta specs。

## 核心决策

- 安装文件与统计 consent 完全解耦：Market 返回什么就安装什么，lock `collectConsent` 只决定下游统计与 Pilot 引导。
- 可观测 Skill 的安装文件始终是 active artifact；没有产物时 Market 返回 `409 OBS_VERSION_UNAVAILABLE`，CLI fail-closed，不回退原版或 GitHub。
- consent 缺失时只在首次交互安装询问；非交互默认 `false`，但不影响安装可观测文件。
- `add --observability` 只把本次 consent 强制为 true 并跳过询问，不触发第二次请求。
- `track on/off` 是纯 lock 操作，不发网络请求、不调用 installer、不改变版本或文件 hash。
- 团队安装仍保持 release-bound：同一 Skill 的 consent 判断与文件安装使用同一份 `id/team/installVersion/releaseId` 响应。
- 仅可观测 Skill 且 consent=true 时触发现有 LoongSuite Pilot 状态提示/自动安装；非可观测或 consent=false 不提示采集插件。
- 不提升 global/local lock schema，不新增状态文件。
- `collect.reason` 已废弃，CLI 只用合法 `collect.config + meta.blueai_signature` 识别可观测 Skill。

## 已否决方案

- 保留 `report=false` 原版先行：会产生双下载，且用户拒绝 consent 后仍必须再下一次改造版，违背文件与 consent 解耦。
- 使用 `report=true` 只探测 consent：Market 新契约已移除该字段，探测会误装或失败。
- `track off` 重装原版：会让 consent 操作改写安装文件并引入额外网络失败面。
- CLI 在 `OBS_VERSION_UNAVAILABLE` 后回退原版：会绕过版本使用门禁。
- 通过扫描签名或包内文件推断 consent：签名只表示可观测，不表示用户授权。

## 范围边界

- 本仓库只实现 CLI 消费契约；Market 的版本门禁已在 `skills-market` 同 change 实现。
- 不兼容旧 Market 或旧 CLI 的 `report` 行为，release notes 要求双仓配套发布。
- 不实现 CMS 数据过滤；CMS 查询/看板排除 `false/unset` 是独立下游发布前置。
- `blueai-skills-cli` companion skill 位于另一仓库，发现旧文案时只记录独立 follow-up，不混入本 change commit。

## 实施决策

- Provider 新增 `installById(): ApiResult<MarketSkill>` 保留 409 错误码；`fetchById()` 只作为非安装只读调用的失败折叠兼容包装。
- 团队批量安装先为每个 Skill 预取唯一 release-bound 响应，再复用该对象落盘；缺 `releaseId` 或单项安装失败只影响该项，最终以非零退出码收口。
- `--observability` 无论响应是否含合法 `collect` 都只写本次 `collectConsent=true`；非可观测响应不触发 Pilot，也不额外探测。
- `track on/off` 通过 `setSkillCollectConsent()` 只改目标 entry 的 consent，保留版本、hash、team/release 与时间戳等既有字段。

## 跨仓 Follow-up

- `blueai-skills-cli` companion skill 的 `references/agents.md` 与 `references/install.md` 仍把 `--observability` 描述为选择/安装可观测版本；应在其独立仓库改为“只记录 consent，安装文件始终由 Market active artifact 决定”。本次 CLI 仓库不修改该外部 checkout。
