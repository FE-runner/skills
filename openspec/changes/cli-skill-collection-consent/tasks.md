# Tasks: cli-skill-collection-consent

## 1. lock 类型与读写

- [ ] 1.1 `src/skill-lock.ts`：`SkillLockEntry` 新增可选字段 `collectConsent?: boolean`
- [ ] 1.2 确认 `addSkillToLock` 透传新字段（entry 为 `Omit<SkillLockEntry,'installedAt'|'updatedAt'>`，无需改签名，仅类型透传）

## 2. provider 透传已落（收测试）

- [ ] 2.1 `src/providers/market.ts`：确认已改的 `fetchById(..., report?)` 与 `InstallResponse`/`MarketSkill.collect` 透传，补 `tests/market-observability-provider.test.ts` 断言（report=true 时 body 带 report、collect 透传）

## 3. add 首问流程

- [ ] 3.1 `src/add.ts` 安装主链路：查 `collectConsent`——true 直接装监测版 / false 直接装原版 / 缺失走首次询问
- [ ] 3.2 首次：`fetchById(report=true)`；无 collect → 装原版不写字段
- [ ] 3.3 有 collect → `p.confirm` 询问；同意 → 用 collect.files 落盘 + 写 lock true；拒绝 → 再 `fetchById(report=false)` 拿原样落盘 + 写 lock false
- [ ] 3.4 非交互（`-y`/`--all`/update 重装/非 TTY）有 collect → 不询问、默认拒绝：装原版 + 写 lock false + 提示可 `track on` 开启

## 4. track 命令组

- [ ] 4.1 新增 `src/track.ts`：`runTrack(args)` 实现 `track list`（遍历 `getAllLockedSkills` → on/off/未定夺 三态）
- [ ] 4.2 `track on <skill>`：`fetchById(report=true)` 拉监测版覆盖落盘 + `addSkillToLock` 写 collectConsent=true
- [ ] 4.3 `track off <skill>`：`fetchById(report=false)` 拉原版覆盖落盘 + 写 collectConsent=false（=退回原样）
- [ ] 4.4 `cli.ts`：注册 `track` 子命令分派（与 obs 同级）

## 5. 测试

- [ ] 5.1 `src/add.test.ts`：首问三态（无 collect 不写 / 有 collect 同意写 true / 拒绝写 false）+ 锁 true/false 不询问 + `-y`/非 TTY 默认拒绝写 false
- [ ] 5.2 新增 `src/track.test.ts`：list 三态、on/off 写锁与调用 fetchById report 正确
- [ ] 5.3 全量 `vitest run` / `tsc --noEmit` / `prettier --check` 通过

## 6. 文档

- [ ] 6.1 `README.md`：新增 `track` 命令段（list/on/off + 采集知情同意说明）+ 更新 obs 段落提及 track
- [ ] 6.2 `CHANGELOG.md` 补条目

## 7. 联调与验收

- [ ] 7.1 服务端（市场侧 install report=true）联调：首次安装带采集 skill → 询问 → 同意装监测版（本地 SKILL.md 含签名）→ track list 显示 on
- [ ] 7.2 track off 退回原样后本地文件为原版；track on 恢复监测版
- [ ] 7.3 与市场侧 `skill-collection-consent` 行为对齐（report=false 原样、report=true 改造）