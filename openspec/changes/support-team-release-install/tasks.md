## 1. 类型与团队列表契约

- [ ] 1.1 修改 `src/add.ts` 的 `TeamInstallSkill`，增加 `installVersion` 并兼容 `currentVersion`；用单元测试验证 `installVersion` 优先、旧字段回退和两者都缺失时跳过
- [ ] 1.2 修改 `src/types.ts` 的 `ParsedSource`，增加内部 `marketSkillId`、`marketTeamId` 字段；运行 `pnpm type-check` 验证普通 market source 不要求新增字段
- [ ] 1.3 抽取团队安装版本与稳定标识辅助函数，统一返回 `{skillId, teamId, version, collectKey}`；测试覆盖 PUBLIC、PRIVATE 和缺失版本场景

## 2. MarketProvider 与单 Skill 安装路径

- [ ] 2.1 修改 `src/providers/market.ts`：团队请求体继续携带 `team`，且 team 优先于 author；用 provider 单元测试验证 `{id, team, version, report}` 请求体
- [ ] 2.2 修改 `src/add.ts#handleMarketSkill`：存在 `marketSkillId + marketTeamId` 时跳过 `resolve`，直接调用 `fetchById`；测试验证 PUBLIC+PENDING 团队 Skill 不触发名称解析
- [ ] 2.3 调整团队失败路径：team 安装 fetch 失败时输出 teamId/version 并停止，不回退 GitHub、裸名或 author；测试断言无 GitHub fallback
- [ ] 2.4 保持普通公开/私有安装行为，用现有 `add`/source parser 测试验证单 Skill 路径没有回归

## 3. 团队批量安装

- [ ] 3.1 修改 `src/add.ts#handleTeamInstall`：为每个 Skill 构造包含 marketSkillId、marketTeamId、marketVersion 的 ParsedSource，并调用统一 `handleMarketSkill`；测试验证每个请求都带 team 和 installVersion
- [ ] 3.2 调整团队循环中的 installName、collectConsent key 和 lock 写入，确保预检判断与正式安装一一对应；测试同名 PUBLIC/PRIVATE 团队条目不会串用采集结果

## 4. 采集预检一致性

- [ ] 4.1 修改 `src/add.ts#preflightTeamCollectConsent`，增加 teamId 参数并统一使用 `{id, team, installVersion, report=true}` 探测；测试验证探测请求与正式安装使用同一版本
- [ ] 4.2 调整团队 `--observability` 和非交互默认拒绝分支继续复用同一 release 上下文；用 `add-team-observability.test.ts` 覆盖

## 5. 验证

- [ ] 5.1 运行 `pnpm type-check`，确认新增 ParsedSource 字段和 provider 参数无类型错误
- [ ] 5.2 运行 `pnpm test --run src/add*.test.ts src/providers/market*.test.ts tests/source-parser.test.ts`，确认团队与单 Skill 安装测试通过
- [ ] 5.3 运行 `pnpm test --run`，确认 CLI 全量测试通过
- [ ] 5.4 运行 `pnpm format:check && pnpm build`，确认格式和生产构建通过
