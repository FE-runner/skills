## 1. 共享有效采集判定

- [ ] 1.1 新增共享采集判定模块，导出 `hasValidCollect(skill)`：仅当 `collect.config` 为对象且 `collect.meta.blueai_signature` 为非空字符串时返回 true；验证新增单元测试覆盖有效响应、`{ reason }`、缺 `config`、缺 `meta` 四类输入
- [ ] 1.2 修改 `src/add.ts`，删除本地 `hasValidCollect` 并改为引用共享模块；验证 `pnpm test src/add.test.ts` 通过，团队探测与单 skill 探测行为不变
- [ ] 1.3 修改 `src/track.ts` 的 `track on` 分支：使用共享判定，无效 collect 时在安装前中止、不写 lock、保持原采集状态，并在存在 `reason` 时输出该原因；验证 `pnpm test src/track.test.ts` 覆盖失败路径
- [ ] 1.4 扩展 `src/track.test.ts`：新增 `collect = { reason }` 场景，断言 installer 未调用、lock 未写入/未改变；将现有成功场景 fixture 更新为 `config.collectEnabled: true` + `meta.blueai_signature`

## 2. Spec 与文档同步

- [ ] 2.1 直接更新 `openspec/specs/skill-collection-consent/spec.md` 的 Purpose 与 Open Questions，移除“按包类型判定”“blueai-track.js/插文字”旧口径并指向当前 signature + obs-run 契约；验证 `rg -n "blueai-track\\.js|插文字|按包类型" openspec/specs/skill-collection-consent/spec.md` 无残留
- [ ] 2.2 确认 delta spec 与 tasks/design 一致，运行 `openspec validate --changes align-track-collect-consent` 通过
- [ ] 2.3 更新 `CHANGELOG.md`，记录 `track on` 对齐 `{ reason }` 降级响应与旧 track.js 口径清理；验证条目位于当前 Unreleased/最新版本段且措辞与本次改动一致

## 3. 回归验证

- [ ] 3.1 运行 `pnpm test src/track.test.ts src/add.test.ts tests/market-observability-provider.test.ts`，验证采集相关测试全部通过
- [ ] 3.2 运行 `pnpm type-check`，验证共享模块导入与 track/add 类型无回归
- [ ] 3.3 运行 `pnpm format` 后执行 `pnpm format:check`，验证格式符合仓库要求
- [ ] 3.4 运行 `pnpm test`，验证全量测试通过；若存在与本 change 无关的既有失败，记录失败摘要并确认不来自本次改动
