## Why

Market 将团队发布改为独立的 `TeamSkillRelease` 后，PUBLIC Skill 可能仍在公开审核，但团队已经拥有可安装的生效版本。现有 CLI 团队批量安装仍按名称走公开或私有解析，无法稳定携带 teamId 和团队生效版本，会在 PUBLIC+PENDING、公开拒绝或团队新版待审时安装失败或装错版本。

## What Changes

- 团队批量安装读取 `/api/team/installAll` 返回的 `installVersion` 和团队 Skill ID，并逐条以 `id + teamId + installVersion` 调用 Market 安装接口。
- `MarketProvider.fetchById` 继续支持 `team` 参数，并确保团队请求优先于 author/公开名称路径。
- 团队安装与采集配置预检共用同一 teamId 和生效版本，避免探测版本与实际落盘版本不一致。
- 团队安装失败时不回退 GitHub 或裸名公开解析，直接报告该团队版本不可用。
- 团队全局安装把可选 `teamId` 写入现有 lock entry；`track on/off` 读取该字段并携带同一 teamId 请求 Market。
- 保留现有单 Skill、私有 Skill、公开 Skill 安装行为和 lock schema version；仅增加向后兼容的可选字段。

## Capabilities

### New Capabilities

- `team-release-install`: CLI 按 Team、Skill ID 和生效 release 版本完成团队批量安装、采集预检与错误处理。

### Modified Capabilities

- `cli-skill-collection-consent`: `track on/off` 需要识别团队安装的 teamId 并重取同一团队 release。

## Impact

- CLI：`src/add.ts`、`src/providers/market.ts`、`src/types.ts`、`src/skill-lock.ts`、`src/track.ts` 和相关团队安装/采集测试。
- 服务端依赖：需要 `skills-market` change `decouple-team-review-version` 先提供 `installVersion` 和 `/api/skill/install` 的 `team` 参数。
- 兼容性：普通单 Skill、私有和公开安装不变；团队批量安装切换为显式 ID/version，不再依赖名称重新解析；旧 lock 缺少 `teamId` 时保持原行为。
