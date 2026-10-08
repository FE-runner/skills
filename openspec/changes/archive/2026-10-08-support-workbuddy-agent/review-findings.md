# support-workbuddy-agent 审查未修项快照

## 代码审查

- 执行轮次：1
- 记录时间：2026-10-08 12:31:34 CST
- 基线：apply commit `6c4cfe9b`；工作区无额外未提交改动
- Critical：0

### Warning

1. [tests/workbuddy-paths.test.ts:81-105] — `discoverSkills(testDir, undefined, { fullDepth: true })` 会触发递归兜底扫描，因此该测试不能唯一证明 `.workbuddy/skills` 是通过新增的 `prioritySearchDirs` 路径被发现的。
   建议: 移除 `fullDepth: true`，让测试在无递归兜底的路径下验证 `.workbuddy/skills/<skill>/SKILL.md` 能被发现。
   - 解决：本 change 内修复（未复审，commit 5dae509）— 去掉 `fullDepth`，并新增标准 `skills/` 目录下的锚点技能让递归兜底分支不执行（仅去掉 fullDepth 不够，`skills.length === 0` 时同样会触发兜底）；已做反证：临时移除 `.workbuddy/skills` 后该用例失败，恢复后通过。
