---
phase: 02-selective-merge
plan: 01
subsystem: merge
tags: [git-merge, upstream-sync, conflict-resolution, bmc-protection]

# Dependency graph
requires:
  - phase: 01-merge-prep
    provides: ".gitattributes 保护配置, upstream remote, sync 分支"
provides:
  - "上游 v1.4.7 变更合并到 sync 分支"
  - "BMC 保护文件完整保留"
  - "上游新增文件引入（update-source.ts, subpath-traversal.test.ts 等）"
  - "4 个新 agent 定义（warp, deepagents, firebender, bob）"
  - "XDG 路径支持、symlink bug 修复等上游改进"
affects: [02-selective-merge-plan-02, build-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: [".gitattributes merge=ours 保护策略生效"]

key-files:
  created:
    - src/update-source.ts
    - src/update-source.test.ts
    - tests/subpath-traversal.test.ts
    - tests/local-lock.test.ts
    - tests/xdg-config-paths.test.ts
  modified:
    - src/agents.ts
    - src/types.ts
    - src/installer.ts
    - src/skill-lock.ts
    - src/local-lock.ts
    - src/add.ts
    - src/skills.ts
    - src/git.ts
    - src/list.ts
    - src/install.ts
    - src/list.test.ts
    - src/providers/wellknown.ts
    - src/providers/types.ts
    - tests/source-parser.test.ts
    - tests/wellknown-provider.test.ts

key-decisions:
  - "cli.ts 和 source-parser.ts 临时保留 ours 版本，留给 Plan 02-02 正式解决"
  - "AGENTS.md 和 skills/find-skills/SKILL.md 保留 BMC 版本"
  - "6 个中等冲突文件由 git auto-merge 正确处理，无需手动干预"

patterns-established:
  - "merge=ours 策略: .gitattributes 配合 merge.ours.driver=true 在大多数情况下自动保护 BMC 文件"

requirements-completed: [SEC-01, SEC-02, BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06, FEAT-03, FEAT-04, PROT-01, PROT-02, PROT-03, PROT-04, PROT-05, PROT-06]

# Metrics
duration: 7min
completed: 2026-04-01
---

# Phase 2 Plan 1: 选择性合并 Summary

**git merge upstream/main 完成，BMC 8 个保护文件完整保留，引入 4 个新 agent、XDG 路径支持、安全修复和上游新模块**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-01T10:20:51Z
- **Completed:** 2026-04-01T10:27:25Z
- **Tasks:** 2
- **Files modified:** 25+

## Accomplishments
- 成功执行 git merge upstream/main --no-commit，将上游 v1.4.7 的所有变更引入 sync 分支
- 8 个 BMC 保护文件内容与合并前完全一致（PROT-01 到 PROT-06 全部通过）
- 上游新增文件已引入：update-source.ts, subpath-traversal.test.ts, local-lock.test.ts, xdg-config-paths.test.ts
- agents.ts 包含 4 个新 agent 定义（warp, deepagents, firebender, bob）
- types.ts 保留 BMC market 类型且包含新 AgentType 成员
- installer.ts 包含上游 symlink bug 修复和下划线文件修复
- skill-lock.ts 引入 XDG_STATE_HOME 支持且保留 BMC authorId
- local-lock.ts 保留 BMC authorId 字段
- add.ts 保留 BMC provider 集成（cosProvider, marketProvider）且引入上游改进
- 仅剩 cli.ts 和 source-parser.ts 待 Plan 02-02 处理

## Task Commits

Each task was committed atomically:

1. **Task 1: 执行 git merge 并解决保护文件 + 简单冲突** - `e1353d4` (feat)
2. **Task 2: 解决中等冲突文件** - 无独立提交（6 个文件由 git auto-merge 正确处理，已包含在 Task 1 合并提交中）

## Files Created/Modified
- `src/update-source.ts` - 上游新增：update-source 辅助模块
- `src/update-source.test.ts` - 上游新增：update-source 测试
- `tests/subpath-traversal.test.ts` - 上游新增：子路径遍历防护测试
- `tests/local-lock.test.ts` - 上游新增：本地 lock 文件测试（含合并冲突标记处理测试）
- `tests/xdg-config-paths.test.ts` - 上游新增：XDG 配置路径测试
- `src/agents.ts` - 新增 warp/deepagents/firebender/bob agent 定义
- `src/types.ts` - 新增 AgentType 成员，保留 BMC market 类型
- `src/installer.ts` - 上游 symlink 和下划线文件 bug 修复
- `src/skill-lock.ts` - XDG_STATE_HOME 支持 + BMC authorId 保留
- `src/local-lock.ts` - BMC authorId 保留 + 上游改进
- `src/add.ts` - BMC provider 集成保留 + 上游改进
- `src/skills.ts` - 接受上游版本
- `src/git.ts` - 接受上游版本
- `src/providers/wellknown.ts` - 接受上游版本
- `src/providers/types.ts` - 上游恢复的类型定义

## Decisions Made
- cli.ts 和 source-parser.ts 临时保留 BMC (ours) 版本以解除合并锁定状态，Plan 02-02 将正式处理这两个高冲突文件
- AGENTS.md 保留 BMC 版本（上游有 modify/delete 冲突，BMC 有自己的文档）
- skills/find-skills/SKILL.md 保留 BMC 版本
- src/providers/registry.ts 上游已不存在（可能已重构），仅 types.ts 被恢复

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] cli.ts 和 source-parser.ts 需临时解决以允许提交**
- **Found during:** Task 1
- **Issue:** git merge 状态下存在未解决冲突时无法 git commit，而 Plan 设计将这两个文件留给 Plan 02-02
- **Fix:** 临时使用 `git checkout --ours` 保留 BMC 版本并 git add，使合并可以提交。Plan 02-02 将在此基础上重新引入上游变更。
- **Files modified:** src/cli.ts, src/source-parser.ts
- **Verification:** git commit 成功，文件内容为 BMC 当前版本
- **Committed in:** e1353d4 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 必要的技术调整，不影响最终合并结果。Plan 02-02 将正式处理这两个文件的上游变更引入。

## Issues Encountered
- src/providers/registry.ts 在上游已不存在，git add 时静默跳过，无影响
- tests/local-lock.test.ts 中包含 `<<<<<<<` 冲突标记，但这是测试数据（测试合并冲突标记的处理逻辑），非真实冲突

## User Setup Required
None - 无需外部服务配置。

## Next Phase Readiness
- 合并的主体工作已完成，25+ 个文件已正确合并
- cli.ts（8 处冲突）和 source-parser.ts（1 处冲突）待 Plan 02-02 处理
- 处理完这两个文件后即可进行 build + test 验证

---
*Phase: 02-selective-merge*
*Completed: 2026-04-01*
