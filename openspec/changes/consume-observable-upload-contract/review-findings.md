# 审查未修项

## 方案审查

- 执行轮次: 2
- 记录时间: 2026-11-16
- 基线: e3cfdaba4b6aebb7eb4ea64bd69d8a5be56eee55

1. [openspec/changes/consume-observable-upload-contract/tasks.md:3.1] — 第 3.1 项仍写 `market-build-check.test.ts`，没有完整相对路径；当前实际可解析路径是 `src/providers/market-build-check.test.ts`，第 3.2 项已使用该完整路径。
   建议: 将第 3.1 项中的 `market-build-check.test.ts` 改为 `src/providers/market-build-check.test.ts`。
   可自动修复：是
   影响落地：否

## 代码审查

- 执行轮次: 1
- 记录时间: 2026-11-16
- 基线: 1a8271b6791a71881868dca2331e27d4a0245639

1. [src/publish.test.ts:521-530] — 测试名称声明冲突发生在 “before reading files” 前，但 `--public` 测试组的 `beforeEach` 已在 [src/publish.test.ts:483] 创建 `SKILL.md`；当前断言只能证明 `marketProvider.push` 未调用和输出了冲突错误，不能区分“参数解析先退出”与“文件检查后仍输出冲突”。实现本身已在 [src/publish.ts:236-239] 提前退出，因此这是测试缺口，不是已确认行为缺陷。
   建议: 让该用例使用空目录或先移除 `SKILL.md`，并断言错误输出只包含参数冲突、没有 `SKILL.md 不存在`，继续断言 `marketProvider.push` 未调用。
   可自动修复：否
   影响落地：否
