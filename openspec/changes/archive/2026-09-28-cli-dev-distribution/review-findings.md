# cli-dev-distribution Review Findings

## 方案审查

- 执行轮次: 2（第 1 轮 Critical 2 / Warning 4 / Info 3，第 2 轮 Critical 清零）
- 记录时间: 2026-09-28
- 基线: propose commit `d1cf0af6cf80096314801932e2961a5c82328571`；review-plan 修复提交 `5bbb48e`
- 记录内容: 第 2 轮（最后一轮）Warning 原文

### Warning

1. [openspec/changes/cli-dev-distribution/design.md:Risks / Trade-offs] — D3 已改为“构建期上限、运行时只能关闭”，但风险段仍保留旧表述“显式运行时变量 > 构建期 dev 默认 > 正式默认”，并写“固定四种组合”；这与新的上限语义和 tasks 2.1 的五类组合存在措辞残留冲突。
   建议： 将风险措辞改为“构建期上限优先，运行时只能显式关闭；`BLUEAI_SKILLS_HOME` 仅在隔离启用时生效”，并同步“五类组合”计数。

2. [openspec/changes/cli-dev-distribution/design.md:D7] 与 [openspec/changes/cli-dev-distribution/tasks.md:4.3] — 版本唯一性仍只依赖分钟级时间戳，未定义并发发布或同一分钟重试时的 tag/npm 版本冲突预检。
   建议： 在 `publish:dev` 中增加远端 tag 与 npm 版本存在性预检，或在时间戳外增加递增序号/短随机标识。

3. [openspec/changes/cli-dev-distribution/design.md:D5] 与 [openspec/changes/cli-dev-distribution/tasks.md:3.2] — 隔离边界仍未明确区分全局与项目级：tasks 写作 `list` 与 `remove` 扫描来源收窄到状态根，可能被理解为项目级列表/卸载也被收窄，导致 dev 构建无法管理项目级安装。
   建议： 明确状态根边界仅适用于全局安装/全局列表/全局卸载；项目级安装、列表、卸载保持现状，并补充对应场景或 Non-Goal 说明。

4. [openspec/changes/cli-dev-distribution/proposal.md:What Changes] 与 [openspec/changes/cli-dev-distribution/tasks.md:3/5] — `experimental_sync`、`experimental_install`、`update` 可能通过 installer 或全局锁触达隔离状态与真实 agent 目录，但方案和测试清单仍主要覆盖 `add/list/remove`。
   建议： 明确这些命令是否由统一 installer/paths 行为覆盖；若覆盖，补充至少一个 `experimental_sync -g` 隔离测试；若不在范围，明确列为 Non-Goal。

## 代码审查

- 执行轮次: 2（第 1 轮 Critical 1 / Warning 5 / Info 2，第 2 轮 Critical 清零）
- 记录时间: 2026-09-28
- 基线: apply commit `7be51ef87f209e5b6b813c4525f201f6bf41d4e6`；review-code 修复提交 `3b939c0`
- 记录内容: 第 2 轮（最后一轮）Warning 原文

### Warning

1. [src/remove.ts:166] — 修复逻辑正确，但仍缺少针对“开发隔离 `remove -g` 不修改真实 agent 目录”的自动化回归测试。该边界是破坏性行为，单靠人工 smoke 容易回归。
   建议： 增加临时状态根 + 预置真实 agent 目录同名技能的测试，执行 `remove -g` 后断言状态根 canonical 已删除，而真实 agent 目录内容保持不变。
