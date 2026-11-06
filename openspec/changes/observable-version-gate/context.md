# Context

本文件只记录 artifacts 之外的讨论结论与软上下文，细节见 `proposal.md`、`design.md`、`tasks.md` 和 delta specs。

## 核心决策

- 安装文件与统计 consent 完全解耦：Market 返回什么就安装什么，lock `collectConsent` 只决定下游统计与 Pilot 引导。
- 可观测 Skill 的安装文件始终是 active artifact；没有产物时 Market 返回 `409 OBS_VERSION_UNAVAILABLE`，CLI fail-closed，不回退原版或 GitHub。
- consent 缺失时只在首次交互安装询问；非交互默认 `false`，但不影响安装可观测文件。
- `add --observability` 只把本次 consent 强制为 true 并跳过询问，不触发第二次请求。
- `track on/off` 是纯 lock 操作，不发网络请求、不调用 installer、不改变版本或文件 hash。
- 团队安装仍保持 release-bound：同一 Skill 的 consent 判断与文件安装使用同一份 `id/team/installVersion/releaseId` 响应。
- 仅 consent=true 时触发现有 LoongSuite Pilot 状态提示/自动安装；consent=false 不提示采集插件。
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
