# Proposal: cli-skill-collection-consent

## Why

服务端（市场侧）已就绪：`/api/skill/install` 路由在 `report=true` 且作者开启采集时返回 `collect` 改造产物（SKILL.md 注入 `meta.blueai_signature` + 插文字 + `blueai-track.js`），`skill-collection-consent` spec 已定稿。但 CLI（`skills-cli`）安装主链路仍走 `fetchById` **不带 `report`**，导致用户装带采集的 Skill 时**无任何提示、直接装非监测版**。需把「采集知情同意 + per-skill 永久记忆 + 状态判定 + 反悔」落到 CLI 侧，复用既有 `.agents/.skill-lock.json` 与 `addSkillToLock` 写入流，不新建文件。

## What Changes

- **状态唯一来源改为 `lock.skills[<skillName>].collectConsent`**（三态，不再扫描包文件）：
  - 缺失 = 首次（待定夺）；`true` = 开（监测版）；`false` = 关（原版）
- **`add` 首次安装接入知情同意**：
  - `fetchById` 携带 `report=true`，消费响应 `collect`
  - 无 `collect`（作者未开采集）→ 装原版，**不写**字段
  - 有 `collect` → 交互环境询问「是否同意采集、安装监测版」；同意 → 装监测版 + 写 `true`；拒绝 → 装原版 + 写 `false`。**非交互环境（`-y`/`--all`/update 重装/非 TTY）默认拒绝**：装原版 + 写 `false` 并提示可 `track on` 开启（未经明确同意不采集）。该 skill 永不再问，per-skill 永久记忆
- **统一为 `track` 命令组**：
  - `track list`：按本机已装 skill 列 `on`（collectConsent=true）/ `off`（false）/ `未装` 状态
  - `track on <skillName>`：`fetchById(report=true)` 拉监测版覆盖落盘 + 写 `true`
  - `track off <skillName>`：`fetchById(report=false)` 拉原版覆盖落盘 + 写 `false`（= 从监测退回原样）
- **market provider**：`fetchById` 增加 `report` 参数并透传 `collect`；`InstallResponse` / `MarketSkill` 增加 `collect` 字段
- **不新建文件**：复用 `.agents/.skill-lock.json` 与既有 `addSkillToLock` 写入流

## Capabilities

- **New Capabilities**:
  - `cli-skill-collection-consent` — CLI 侧采集知情同意：首问、lock.collectConsent 三态判定、`track list/on/off` 命令组、fetchById report 透传

## Impact

- **代码**：`src/add.ts`（首问 + report=true 消费 collect）、`src/providers/market.ts`（fetchById report/collect）、新增 `src/track.ts`（track 命令组 + lock.collectConsent 读写）、`src/cli.ts`（注册 track 子命令）
- **lock**：`lock.skills[<skillName>].collectConsent` 三态字段（复用既有写流）
- **测试**：`src/add.test.ts` / `src/track.test.ts` / `tests/market-observability-provider.test.ts` 同步
- **文档**：`README.md`（obs 旁新增 track 说明）、CHANGELOG
- **服务端**：无需改动（`install(report=true)` 与 `collect` 已就绪）