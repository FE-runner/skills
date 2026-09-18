## Why

Market 侧已将采集配置从 `collectConfig` 收口为 `collectEnabled`，并把结构化改造产物收口到 `SkillObsManifest.obsSnapshot`；安装接口继续以 `collect = { config, meta }` 表示成功、`collect = { reason }` 表示失败降级。CLI 的 `add` 已按“有效 collect”判定，但 `track on` 仍只检查 `collect` 是否存在，导致失败降级响应会被误当成监测版并写入 `collectConsent=true`。同时 CLI 仓内仍保留 `blueai-track.js`、插文字等旧口径，和当前 market 契约冲突。

## What Changes

- 将“安装响应中的有效采集配置”判定抽为 CLI 共享函数，统一要求 `collect.config` 与 `collect.meta.blueai_signature` 存在；`collect = { reason }` 视为无效。
- `skills track on <skill>` 改为使用共享判定：无效 collect 时不安装、不写 lock、不改变采集状态，并输出失败原因。
- 同步 `cli-skill-collection-consent` spec：明确有效 collect 判定、`track on` 失败路径，并移除 `blueai-track.js` / 插文字旧产物描述。
- 同步 CLI 仓内的 `skill-collection-consent` 跨仓契约 spec：对齐当前 `collectEnabled`、`blueai_signature`、`SkillObsManifest`/`obs-run` 与 `{ reason }` 降级口径，移除已由 `cli-skill-collection-consent` 接管的旧 CLI 行为要求。
- 更新 CHANGELOG，记录 `track on` 对齐安装失败降级响应与旧 track 口径清理。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cli-skill-collection-consent`: 明确有效 `collect` 判定；`track on` 遇到 `{ reason }` 降级响应时不得落盘或写入 `collectConsent=true`；清理旧产物描述。
- `skill-collection-consent`: 将 CLI 仓内的跨仓契约同步到当前 market 口径，移除 `blueai-track.js` / 插文字与旧包类型判定要求，保留安装响应 `report`、签名和降级契约。

## Impact

- CLI 代码：`src/add.ts`、`src/track.ts`，新增共享采集判定模块。
- CLI 测试：`src/track.test.ts`、必要时同步 `src/add` 相关 mock fixture。
- OpenSpec：`openspec/specs/cli-skill-collection-consent/spec.md`、`openspec/specs/skill-collection-consent/spec.md` 的 delta spec。
- 文档：`CHANGELOG.md`。
- 不涉及 market 仓代码、数据库迁移、`skills obs` / `ObservabilityAgent` API 契约或安装器落盘逻辑。
