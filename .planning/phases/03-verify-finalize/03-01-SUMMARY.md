---
phase: 03-verify-finalize
plan: 01
subsystem: verification
tags: [build, test, brand-check, smoke-test]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [verified-build, verified-tests]
  affects: []
tech_stack:
  added: []
  patterns: [github-prefix-direct-resolution, fragment-ref-market-bypass]
key_files:
  created: []
  modified:
    - src/source-parser.ts
decisions:
  - github: 前缀直接构建 URL 而非递归 parseSource，避免 Market 拦截
  - 有 #branch fragment ref 时跳过 Market 优先匹配，保持 git 语义
metrics:
  duration: 6min
  completed: "2026-04-01T13:08:50Z"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 1
---

# Phase 03 Plan 01: 构建和测试验证 Summary

source-parser 修复 github: 前缀和 #branch 与 Market 解析冲突后，全部 410 测试通过、构建零错误、BMC 定制功能完整、无品牌泄露。

## What Was Done

### Task 1: 构建验证 (VAL-01)

- `pnpm build` 零错误通过
- 构建产物 `dist/cli.mjs` (192 KB) 正常生成
- obuild 在 813ms 内完成打包

### Task 2: 测试验证 (VAL-02)

- 初始运行发现 6 个测试失败（均在 source-parser 测试中）
- 根因：BMC Market 优先解析拦截了 `github:` 前缀和 `owner/repo#branch` 格式
- 修复 `src/source-parser.ts`：
  - `github:` 前缀直接构建 GitHub URL，不再递归调用 `parseSource()`
  - 存在 `#branch` fragment ref 时跳过 `isMarketInstallCommand` 检查
- 修复后全部 410 测试通过（26 个测试文件）

### Task 3: BMC 冒烟测试 + 品牌检查 (VAL-03, VAL-04)

- Market API: `src/find.ts` 正确使用 `SKILLS_SITE` 和 `searchSkillsAPI()`
- COS Provider: `src/providers/cos.ts` 中 `CosProvider` 完整
- Market Provider: `src/providers/market.ts` 中 `MarketProvider` 完整
- 品牌检查：`src/` 目录中无 `skills.sh` 或 `npx skills` 硬编码泄露

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] source-parser: github: 前缀和 #branch 与 Market 解析冲突**
- **Found during:** Task 2
- **Issue:** `github:` 前缀递归调用 `parseSource()` 时，去掉前缀的 `owner/repo` 被 `isMarketInstallCommand` 拦截为 Market 类型。同样，`owner/repo#branch` 在 fragment 解析后也被 Market 拦截。
- **Fix:** (1) `github:` 前缀直接构建 GitHub URL 返回，不递归调用 parseSource。(2) 当 `fragmentRef` 存在时跳过 Market 检查。
- **Files modified:** `src/source-parser.ts`
- **Commit:** `e13f9ab`

## Commits

| Hash | Message |
|------|---------|
| `e13f9ab` | fix(03-01): 修复 source-parser 中 github: 前缀和 #branch 与 Market 解析冲突 |

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm build` | PASS (0 errors) |
| `pnpm test` | PASS (410/410 tests) |
| BMC Market API path | PASS |
| BMC COS Provider | PASS |
| BMC Market Provider | PASS |
| Brand leak check (skills.sh) | PASS (0 leaks) |
| Brand leak check (npx skills) | PASS (0 leaks) |

## Known Stubs

None - all code paths are fully wired.

## Self-Check: PASSED

- [x] src/source-parser.ts exists
- [x] dist/cli.mjs exists
- [x] 03-01-SUMMARY.md exists
- [x] Commit e13f9ab exists
