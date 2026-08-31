# Tasks: cli-skill-collection-consent

## 1. lock 类型与读写

- [ ] 1.1 `src/skill-lock.ts`：`SkillLockEntry` 新增可选字段 `collectConsent?: boolean`
- [ ] 1.2 确认 `addSkillToLock` 透传新字段（entry 为 `Omit<SkillLockEntry,'installedAt'|'updatedAt'>`，无需改签名，仅类型透传）
- [ ] 1.3 **scope 约束**：仅在全局安装（`installGlobally`）时写 `collectConsent`；项目级（`!installGlobally`）不写、不询问（沿用现状装原版、只写本地 lock 现有字段）

## 2. provider 透传已落（收测试）

- [ ] 2.1 `src/providers/market.ts`：确认已改的 `fetchById(..., report?)` 与 `InstallResponse`/`MarketSkill.collect` 透传，补 `tests/market-observability-provider.test.ts` 断言（report=true 时 body 带 report、collect 透传）

## 3. add 首问流程

- [ ] 3.1 `src/add.ts` 安装主链路：查 `collectConsent`——true 直接装监测版 / false 直接装原版 / 缺失走首次询问
- [ ] 3.2 首次：`fetchById(report=true)`；无有效 collect（无 collect 或 collect 仅含 reason 降级）→ 装原版不写字段
- [ ] 3.3 有有效 collect → `p.confirm` 询问；同意 → 直接用本次 `report=true` 返回的 files 落盘（**服务端已将改造版替换进顶层 files**，无 collect.files 子字段）+ 写 lock true；拒绝 → 再 `fetchById(report=false)` 拿原样落盘 + 写 lock false
- [ ] 3.4 非交互（`-y`/`--all`/update 重装/非 TTY）有有效 collect → 不询问、默认拒绝：**再 `fetchById(report=false)` 拿原样落盘** + 写 lock false + 提示可 `track on` 开启
- [ ] 3.5 **团队批量安装**（`handleTeamInstall`/`--all`）：全局时若团队含带采集 skill，安装前一次 `p.confirm` 询问覆盖全团队（同意 → 全队带采集 skill 装监测版 + 写 true；拒绝 → 装原版 + 写 false + 提示 `track on`）；无带采集 skill 不询问；项目级团队安装不询问不记录

## 4. track 命令组

- [ ] 4.1 新增 `src/track.ts`：`runTrack(args)` 实现 `track list`（遍历 `getAllLockedSkills` → on/off/未定夺 三态）
- [ ] 4.2 `track on <skill>`：读 lock entry 的 `skillPath`（=market skillId）→ `fetchById(skillPath, version, authorId, undefined, report=true)` 拉监测版覆盖全局落盘 + `addSkillToLock` 写 collectConsent=true
- [ ] 4.3 `track off <skill>`：读 `skillPath` → `fetchById(skillPath, version, authorId, undefined, report=false)` 拉原版覆盖全局落盘 + 写 collectConsent=false（=退回原样）
- [ ] 4.4 `cli.ts`：注册 `track` 子命令分派（与 obs 同级，仅全局）
- [ ] 4.5 **scope**：`track list` 只遍历全局 lock；项目级 `skills-lock.json` 技能不展示、`track on/off` 不管理（读全局 lock 条目找不到或 `collectConsent=false` 时仅影响全局）

## 5. 测试

- [ ] 5.1 `src/add.test.ts`：首问三态（无 collect 不写 / 有 collect 同意写 true / 拒绝写 false）+ 锁 true/false 不询问 + `-y`/非 TTY 默认拒绝写 false
- [ ] 5.2 新增 `src/track.test.ts`：list 三态、on/off 写锁、fetchById 传 `skillPath`+`report` 正确、项目级不参与
- [ ] 5.3 全量 `vitest run` / `tsc --noEmit` / `prettier --check` 通过

## 6. 文档

- [ ] 6.1 `README.md`：新增 `track` 命令段（list/on/off + 采集知情同意说明）+ 更新 obs 段落提及 track
- [ ] 6.2 `CHANGELOG.md` 补条目

## 7. 联调与验收

- [ ] 7.1 服务端（市场侧 install report=true）联调：首次安装带采集 skill → 询问 → 同意装监测版（本地 SKILL.md 含签名）→ track list 显示 on
- [ ] 7.2 track off 退回原样后本地文件为原版；track on 恢复监测版
- [ ] 7.3 与市场侧 `skill-collection-consent` 行为对齐（report=false 原样、report=true 改造）
- [ ] 7.4 **团队批量联调**：`add t_<teamId>/<name>` 团队含带采集 skill → 一次询问 → 同意后全队带采集 skill 装监测版并写 true；拒绝则全队原版 + false
- [ ] 7.5 **scope 联调**：项目级安装带采集 skill → 不询问、装原版、`track list` 不显示；全局 + 项目并存时 `track on/off` 只改全局