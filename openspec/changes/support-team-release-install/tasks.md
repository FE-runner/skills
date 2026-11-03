## 1. 类型与团队列表契约

- [x] 1.1 修改 `src/add.ts` 的 `TeamInstallSkill`，增加 `installVersion` 并兼容 `currentVersion`；用单元测试验证 `installVersion` 优先、旧字段回退和两者都缺失时跳过
- [x] 1.2 修改 `src/types.ts` 的 `ParsedSource`，增加内部 `marketSkillId`、`marketTeamId` 字段；运行 `pnpm type-check` 验证普通 market source 不要求新增字段
- [x] 1.3 修改 `src/skill-lock.ts` 的 `SkillLockEntry`，增加可选 `teamId` 且不提升 lock schema version；测试旧 lock 反序列化与写回保持兼容
- [x] 1.4 抽取团队安装版本与稳定标识辅助函数，统一返回 `{skillId, teamId, version, collectKey}`；测试覆盖 PUBLIC、PRIVATE 和缺失版本场景

## 2. MarketProvider 与单 Skill 安装路径

- [x] 2.1 修改 `src/providers/market.ts`：团队请求体继续携带 `team`，且 team 优先于 author；用 provider 单元测试验证 `{id, team, version, report}` 请求体
- [x] 2.2 修改 `src/add.ts#handleMarketSkill`：存在 `marketSkillId + marketTeamId` 时跳过 `resolve`，直接调用 `fetchById`；测试验证 PUBLIC+PENDING 团队 Skill 不触发名称解析
- [x] 2.3 调整团队失败路径：team 安装 fetch 失败时输出 teamId/version 并停止，不回退 GitHub、裸名或 author；测试断言无 GitHub fallback
- [x] 2.4 保持普通公开/私有安装行为，用现有 `add`/source parser 测试验证单 Skill 路径没有回归

## 3. 团队批量安装

- [x] 3.1 修改 `src/add.ts#handleTeamInstall`：先过滤具备 installVersion/currentVersion 的 installable 列表，输出缺失版本警告并在空列表时结束；agent/scope 选择、采集预检、安装循环和完成计数统一使用该列表
- [x] 3.2 修改 `src/add.ts#handleTeamInstall`：为每个 installable Skill 构造包含 marketSkillId、marketTeamId、marketVersion 的 ParsedSource，并调用统一 `handleMarketSkill`；测试验证每个请求都带 team 和 installVersion
- [x] 3.3 调整团队循环中的 installName、collectConsent key、source 和 lock 写入，写入 teamId 并确保预检判断与正式安装一一对应；测试同名 PUBLIC/PRIVATE 团队条目不会串用采集结果，并验证无有效采集时写 teamId 但不写 collectConsent

## 4. 采集预检一致性

- [x] 4.1 修改 `src/add.ts#preflightTeamCollectConsent`，增加 teamId 参数并统一使用 `{id, team, installVersion, report=true}` 探测；测试验证探测请求与正式安装使用同一版本
- [x] 4.2 调整团队 `--observability` 和非交互默认拒绝分支继续复用同一 release 上下文；用 `add-team-observability.test.ts` 覆盖

## 5. 团队 lock 与 track

- [x] 5.1 修改 `src/track.ts#resolveTarget` 和 `runTrackToggle`，让带 teamId 的 lock entry 使用同一 id/team/version 重取，并在写回时保留 teamId/source；补充 `src/track.test.ts` 覆盖 `track on -> off -> on`
- [x] 5.2 修改 `track list` 展示团队来源标识，补充带 teamId lock entry 的测试

## 6. 验证

- [x] 6.1 运行 `pnpm type-check`，确认新增 ParsedSource、lock teamId 和 provider 参数无类型错误
- [x] 6.2 运行 `pnpm test --run src/add*.test.ts src/providers/market*.test.ts src/track.test.ts tests/source-parser.test.ts`，确认团队与单 Skill 安装测试通过
- [x] 6.3 运行 `pnpm test --run`，确认 CLI 全量测试通过
- [x] 6.4 运行 `pnpm format:check && pnpm build`，确认格式和生产构建通过
