---
phase: 02-selective-merge
plan: 02
subsystem: merge
tags: [git-merge, source-parser, cli, branch-ref, sanitize-subpath, json-output, update-source, bmc-protection]

# Dependency graph
requires:
  - phase: 02-selective-merge-plan-01
    provides: "git merge upstream/main 完成，cli.ts 和 source-parser.ts 保留 ours 版本待正式合并"
provides:
  - "source-parser.ts: BMC Market 逻辑 + 上游 sanitizeSubpath + branch ref + SSH URL + github: 前缀"
  - "cli.ts: BMC 品牌/Market + 上游 --json + update-source + 跳过提示 + XDG 支持"
  - "完整合并结果（所有文件已处理，无冲突标记残留）"
affects: [build-verification, test-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "parseFragmentRef() 将 # 后缀解析为 git ref（仅对 git 类源生效）"
    - "sanitizeSubpath() 阻止 .. 路径遍历"
    - "buildUpdateInstallSource() 统一构建更新安装源"
    - "SkippedSkill 模式：对无法自动检查的技能提供跳过原因和手动命令"

key-files:
  created: []
  modified:
    - src/source-parser.ts
    - src/cli.ts

key-decisions:
  - "保留 BMC 的 isMarketInstallCommand 在 GitHub shorthand 之前的优先级位置"
  - "在 global check/update 中整合上游的 SkippedSkill/getSkipReason/printSkippedSkills 改进"
  - "global update 使用上游的 CLI 入口点直接调用模式（避免嵌套 npx）"
  - "local update 保留 BMC 原有的 process.argv 调用模式"
  - "移除不再需要的 CheckUpdatesRequest/CheckUpdatesResponse 接口（上游已改用直接 GitHub API 调用）"

patterns-established:
  - "BMC Market 优先解析：parseSource() 先检查 Market 命令，再回退到 GitHub shorthand"
  - "fragment ref 传播：所有 GitHub/GitLab URL 解析分支传播 fragmentRef 到结果"

requirements-completed: [FEAT-01, FEAT-02, SEC-01, BUG-03]

# Metrics
duration: 9min
completed: 2026-04-01
---

# Phase 2 Plan 2: 高冲突文件手动合并 Summary

**source-parser.ts 融合 BMC Market 优先解析 + 上游 sanitizeSubpath/branch ref/SSH URL；cli.ts 融合 BMC 品牌/Market 集成 + 上游 --json/update-source/跳过提示**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-01T10:31:22Z
- **Completed:** 2026-04-01T10:40:33Z
- **Tasks:** 3 (Task 3 为验证任务，无独立提交)
- **Files modified:** 2

## Accomplishments
- source-parser.ts 成功融合：保留全部 BMC Market/COS 解析逻辑（isMarketInstallCommand, isBareSkillName, parseMarketInstallCommand），引入上游 sanitizeSubpath() 安全修复、parseFragmentRef() branch ref 支持、SSH URL 解析、github:/gitlab: 前缀简写
- cli.ts 成功融合：保留全部 BMC 品牌常量引用（BIN_NAME, NPX_CMD, SKILLS_SITE, PACKAGE_NAME, EXAMPLE_REPO）和 Market check/update 逻辑（marketProvider, readLocalLock），引入上游 buildUpdateInstallSource/formatSourceInput、--json flag 帮助文本、SkippedSkill 提示改进、XDG_STATE_HOME 支持
- PROT-01 到 PROT-06 全部验证通过
- 无上游品牌名泄露（skills.sh 在 src/ 中出现 0 次）
- Prettier 格式化验证通过

## Task Commits

Each task was committed atomically:

1. **Task 1: 解决 source-parser.ts 高冲突合并** - `d139c84` (feat)
2. **Task 2: 解决 cli.ts 高冲突合并** - `f7cedc5` (feat)
3. **Task 3: 格式化验证和 PROT 检查** - 无独立提交（验证通过，工作区已干净）

## Files Created/Modified
- `src/source-parser.ts` - 源解析器：新增 sanitizeSubpath(), parseFragmentRef(), looksLikeGitSource(), appendFragmentRef(), SSH URL 处理；保留 BMC Market 解析逻辑
- `src/cli.ts` - CLI 主入口：新增 buildUpdateInstallSource/formatSourceInput import, SkippedSkill/getSkipReason/printSkippedSkills, XDG 支持, --json 帮助文本；保留 BMC 品牌常量和 Market check/update 逻辑

## Decisions Made
- 保留 BMC 的 isMarketInstallCommand 在 GitHub shorthand 之前的优先级位置，确保 Market 技能名始终优先解析
- 在 global check/update 中整合上游的 SkippedSkill 改进，为无法自动检查的技能提供清晰的跳过原因和手动更新命令
- global update 使用上游的 CLI 入口点直接调用模式（join(__dirname, '..', 'bin', 'cli.mjs')），避免嵌套 npx
- local update 保留 BMC 原有的 process.argv[1] 调用模式（因为本地模式仅处理 market 技能，不需要 -g flag）
- 移除 CheckUpdatesRequest/CheckUpdatesResponse 接口和 writeSkillLock 函数（上游已重构，不再需要）
- SkillLockEntry 接口保留 BMC 的 version/authorId 字段（market 技能需要）同时添加上游的 ref 字段

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 3 无需创建新 merge commit**
- **Found during:** Task 3
- **Issue:** Plan 设计 Task 3 执行 `git commit --no-edit` 创建 merge commit，但 merge commit 已在 Plan 02-01 中创建（e1353d4），当前工作是在 merge 之后的修正提交
- **Fix:** 跳过 merge commit 创建步骤，直接进行格式化验证和 PROT 检查
- **Verification:** 工作区干净，原始 merge commit (e1353d4) 确认有两个 parent

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 技术调整，不影响最终结果。merge commit 已在 Plan 02-01 完成，Task 1/2 的修正提交在其之上。

## Issues Encountered
- `pnpm format` 在 Windows 上因 glob 引号问题失败，改用 `npx prettier --write` 直接执行，格式化成功且无变更

## Known Stubs
None - 所有功能已完整实现，无占位符或空数据。

## User Setup Required
None - 无需外部服务配置。

## Next Phase Readiness
- 所有文件合并完成，无冲突标记残留
- 准备进入 build + test 验证阶段
- source-parser.ts 的 parseFragmentRef() 需要与 tests/source-parser.test.ts 中的已有测试兼容
- cli.ts 的 update-source 集成需要 src/update-source.ts 的正确存在（已在 Plan 02-01 引入）

---
*Phase: 02-selective-merge*
*Completed: 2026-04-01*

## Self-Check: PASSED
- src/source-parser.ts: FOUND
- src/cli.ts: FOUND
- SUMMARY.md: FOUND
- Commit d139c84: FOUND
- Commit f7cedc5: FOUND
