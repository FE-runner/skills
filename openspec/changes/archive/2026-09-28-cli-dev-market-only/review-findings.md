# cli-dev-market-only Review Findings

## 方案审查

- 执行轮次: 2（第 1 轮 Critical 1 / Warning 3 / Info 2，第 2 轮 Critical 清零）
- 记录时间: 2026-09-28
- 基线: propose commit `83b11ca422204b0390b3a0f0d2c39922e9227ef4`；review-plan 修复提交 `e15dacd`
- 记录内容: 第 2 轮（最后一轮）Warning 原文

### Warning

1. [openspec/changes/cli-dev-market-only/design.md:42] — D5 仍说 `src/paths.test.ts` 收缩为“全局锁路径”断言，但 [tasks.md:13] 已扩展为凭证目录和全局锁路径；同时两者都未明确覆盖 canonical/global base 路径，而 delta 的「开发版与正式版共用本地状态路径」包含 canonical 目录。
   建议： 同步 D5，并在 tasks 2.2 中明确加入 canonical/global base 断言，或说明该断言由哪个更高层测试承接。

## 代码审查

- 执行轮次: 2（第 1 轮 Critical 2 / Warning 4 / Info 3，第 2 轮 Critical 清零）
- 记录时间: 2026-09-28
- 基线: apply commit `fd932b78dc281d0eac7508f5a0307a4fc221e4ae`；review-code 修复提交 `343182b`
- 记录内容: 第 2 轮（最后一轮）Warning / Info 原文

### Warning

1. [src/remove.test.ts:202] — 全局安装/卸载路径恢复后，缺少 mock HOME 的端到端回归测试，现有用例主要覆盖参数解析和项目级场景。
   建议: 增加临时 HOME 集成测试，覆盖 `add -g`、`list -g`、`remove -g` 在 canonical 目录与真实 agent 目录间的写入、展示与清理。

2. [tests/dist.test.ts:7] — dist 测试只验证一次默认构建，未断言 dev 与 prod 构建除市场地址和 npx tag 外行为一致。
   建议: 增加双构建冒烟测试，分别运行 dev/prod 构建并比较关键路径常量与产物行为。

### Info

1. [src/installer.ts:76] — 全局 canonical 路径运行时调用 `homedir()`，而 `src/agents.ts` 在模块加载期缓存 home；生产环境一致，但测试 mock 时可能产生路径来源不一致。
   建议: 后续统一 home 路径来源或显式注入，降低测试隔离成本。

2. [README.md:516] — 开发版章节未链接新的 `DEV_VERSION_USAGE.md`，使用者需要自行发现详细共用状态说明。
   建议: 在 README 开发版章节加入 `DEV_VERSION_USAGE.md` 文档链接。
