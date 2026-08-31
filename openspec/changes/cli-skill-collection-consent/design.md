# Design: cli-skill-collection-consent

## Context

服务端已就绪：`/api/skill/install` 在 `report=true` 且作者开启采集时返回 `collect`（改造版本 SKILL.md 注入 `meta.blueai_signature` + 插文字 + `blueai-track.js`），`skill-collection-consent` 市场 spec 已定稿。CLI 现状：`add` 走 `fetchById` 不带 `report`，导致恒装原版零提示。本设计把采集知情同意落到 CLI，复用既有 lock 写流不新建文件。

## Goals / Non-Goals

**Goals**
- `add` 首次安装带采集 skill 时询问，同意装监测版 / 拒绝装原版，per-skill 永久记忆
- 采集状态唯一来源 `lock.skills[<skillName>].collectConsent` 三态（缺失/true/false），不扫描包文件
- `track list/on/off` 命令组统一查看/开启/反悔（退回）采集
- 复用 `.agents/.skill-lock.json` 既有写流，不新建文件；服务端零改动

**Non-Goals**
- 不做全局级同意（per-skill 永久记忆，不跨 skill）
- 不追溯已采集历史数据（`track off` 反悔仅对新采集生效）
- 不处理「作者关了又开」时 false 的重问（false 永不再问，缺失才问）

## Decisions

### D1: lock 三态判定，字段 `collectConsent`

`lock.skills[S].collectConsent`：
- 缺失 = 首次（未定夺）
- `true` = 开（监测版）
- `false` = 关（原版）

不再通过扫描包内签名 / blueai-track.js 判定（原 spec 的包类型判定作废，改为 lock 字段单一来源）。字段新增到 `SkillLockEntry` 类型：`collectConsent?: boolean`。

### D2: `add` 首问流程

在 `add.ts` 安装主链路（`addMarketSkill` 附近 `fetchById` 调用点）：

```
1) 先查 lock.skills[S].collectConsent
   - true  → 直接 fetchById(report=true) 装监测版（不问）
   - false → 直接 fetchById(report=false) 装原版（不问）
   - 缺失  → 走下面的首次询问
2) 首次：fetchById(report=true)
   - 响应无有效 collect（无 collect，或 collect 仅含 reason 降级）→ 装原版 files，不写字段
   - 响应有有效 collect（含 config/meta）→
       非交互（options.yes / --all / update 重装 / 非 TTY）→ 不询问、默认拒绝：再 fetchById(report=false) 拿原样 files 落盘 + 写 lock false，并提示「可稍后运行 track on <skill> 开启采集」（隐私缺省：未经用户明确同意不采集）
       交互 → p.confirm 询问「该 skill 带数据采集，是否同意采集并安装监测版？」
           同意 → 直接用本次 fetchById(report=true) 返回的 files 落盘（服务端已将改造版替换进 files）+ 写 lock true
           拒绝 → 再 fetchById(report=false) 拿原样 files 落盘 + 写 lock false
```

`options.yes` 判定覆盖 `-y`、`--all`（已强制 `yes=true`）与非 TTY 环境；`update` 重装复用 `add -y` 路径，同样落到默认拒绝分支。该分支符合隐私安全缺省，且与「false = 关（原版）」三态语义一致。

服务端 `install` 的 collect 语义（以 `executeInstall` 现行为准，两 service 分支一致）：`report=true` 且作者开启采集时，**顶层 `files` 已被服务端替换为改造版**（注入 `blueai_signature` + 插文字 + `blueai-track.js`），`collect` 为 `{ config, meta: { blueai_signature } }`——**没有 `collect.files` 子字段**；改造失败时 `collect = { reason }` 且 files 保持原版（CLI 按无采集处理，不询问不写字段）。因此在「拒绝 / 非交互默认拒绝」分支想落盘原版，**必须再 `fetchById(report=false)`**，不能直接用 `report=true` 响应的 files（否则会误装监测版却写 false，破坏「lock 是唯一来源」信任模型）。

### D3: `track` 命令组

新增 `src/track.ts`，在 `cli.ts` 注册 `track` 子命令（与 `obs` 同级分派）：

```
track list            读 getAllLockedSkills → 每 skill 列 on(collectConsent===true)/ off(false)/ 未定夺(无字段/未装)
track on  <skill>     fetchById(report=true) 拉监测版覆盖落盘 + addSkillToLock 补 collectConsent=true
track off <skill>     fetchById(report=false) 拉原版覆盖落盘 + addSkillToLock 补 collectConsent=false（=退回原样）
```

`addSkillToLock` 已支持 `Omit<SkillLockEntry,'installedAt'|'updatedAt'>` 传入，新增字段通过给 `SkillLockEntry` 加 `collectConsent?` 后自然透传（现有调用点补传可选字段即可，不破坏既有安装流）。

`track on/off` 的落盘：复用 `add` 的安装函数（按来源重新 fetch + write），或最小实现为「fetchById 后把返回 files 写回该 skill 的已装目录」——为控制改动面，建议复用 `add` 的 `installSkillFiles` / canonical path 逻辑（`getCanonicalPath(skillName, {global})`），覆盖该 skill 目录。

### D4: market provider 透传

已改（调研阶段落盘）：`fetchById(skillId, version?, author?, team?, report?)`；body 带 `report:'true'` 当 report==true；`InstallResponse`/`MarketSkill` 增加 `collect?: unknown`，`toMarketSkill` 透传 `data.collect`。

## Risks / Trade-offs

- [track on/off 覆盖落盘] 重装覆盖要正确处理 global/project 目录与既有文件的删除——复用 add 的落盘路径，避免目录残留。
- [collect 结构稳定] `collect.files` 依赖服务端返回形状；若服务端后续调整字段需同步。当前以服务端 `executeInstall` collect 块字段为准。
- [false 永不再问] 作者后来重开采集时，锁 false 用户会被一直装原版——按需求接受（缺失才问）。

## Migration Plan

1. `src/skill-lock.ts`：`SkillLockEntry` 加 `collectConsent?: boolean`
2. `src/providers/market.ts`：已改（D4），补测试
3. `src/add.ts`：首问流程（D2）+ 替换落盘 files 逻辑
4. 新增 `src/track.ts`：`runTrack` 实现 track list/on/off
5. `src/cli.ts`：注册 `track` 子命令
6. 测试：`src/add.test.ts` 首问场景、新增 `src/track.test.ts`、`tests/market-observability-provider.test.ts` report 传参
7. 文档：`README.md` 补 track 段、CHANGELOG

**Rollback**：`collectConsent` 为新增可选字段，移除即回退；`track` 命令可整体摘除；服务端无改动无需回滚。

## Open Questions

- `track on/off` 重装路径是否含 `--agent/--global` 维度：默认对所有已装 agent 目录覆盖，还是当前 scope？建议「对该 skill 全部已装 agent 覆盖」，避免局部采/不采混装。