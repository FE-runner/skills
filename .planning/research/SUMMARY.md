# 研究总结：blueai-skills 上游同步

**领域:** Git fork 维护与上游同步
**研究日期:** 2026-04-01
**整体置信度:** HIGH

## 摘要

blueai-skills 是 vercel-labs/skills 的深度定制 fork，从 v1.4.3 分叉后，BMC 有 ~54 个提交的定制化开发，上游有 29 个新提交（v1.4.3 → v1.4.7）。双方在 16 个文件上有重叠修改，但冲突模式可预测：BMC 的定制集中在品牌、市场集成和 COS 存储，上游的改进集中在 bug 修复、新 agent 支持和功能增强。

推荐策略是在独立分支上执行 `git merge upstream/main`，配合 `.gitattributes` 的 `merge=ours` 驱动自动保护 BMC 核心定制文件。16 个冲突文件中，约 5 个可自动保留 BMC 版本，约 8 个需要手动三方合并，约 3 个是测试文件可以合并双方用例。

这是一次性操作，不需要自动化工具。核心风险是 `src/source-parser.ts` 和 `src/cli.ts` 的大规模冲突，需要逐段审查。

## 关键发现

**策略:** 使用 `git merge`（非 rebase），配合 `.gitattributes` 保护 BMC 定制文件
**架构:** 在独立分支 `sync/upstream-v1.4.7` 上操作，验证通过后合并回 master
**关键风险:** `src/source-parser.ts` 双方各有 100+ 行修改，冲突解决需要最多时间

## 路线图建议

基于研究，建议的阶段结构：

1. **准备阶段** - 配置合并保护，分析上游变更价值
   - 任务: 创建 `.gitattributes`，配置 `merge.ours` 驱动，运行 `git merge --no-commit` 预览
   - 避免: 直接在 master 上操作

2. **分析阶段** - 逐提交审查上游 29 个提交的价值
   - 任务: 生成差异分析报告，标注每个上游提交的引入价值和冲突风险
   - 关注: v1.4.4 的安全修复（subpath traversal），v1.4.5 的 bug 修复，v1.4.6 的功能增强

3. **合并阶段** - 执行合并并解决冲突
   - 任务: 在 sync 分支上 merge，解决冲突，运行 build + test
   - 避免: 跳过测试验证

4. **验证阶段** - 确保 BMC 功能完整
   - 任务: 手动测试 BMC 定制命令（market install, COS provider），确认上游新功能可用

**阶段排序理由:**
- 准备和分析在前，因为盲目合并 29 个提交可能引入不需要的变更
- 在独立分支操作，确保 master 始终可用
- 验证在最后，确保合并没有破坏 BMC 定制功能

**需要更深入研究的阶段:**
- 阶段 2（分析）: 需要逐个审查上游提交，判断哪些 bug 修复已在 BMC 独立实现过
- 阶段 3（合并）: `source-parser.ts` 的冲突可能比预期复杂

## 置信度评估

| 领域 | 置信度 | 说明 |
|------|--------|------|
| 策略 | HIGH | Git merge 是定制 fork 同步的标准做法，不依赖最新工具 |
| 工具 | HIGH | 使用 Git 内建功能 + VS Code，无外部依赖 |
| 冲突预判 | MEDIUM | 基于 `git diff --stat` 分析，实际冲突细节需要预览合并才能确认 |
| 工作量 | MEDIUM | 预估 16 个冲突文件需要 2-4 小时手动审查 |

## 待解决问题

- 上游 v1.4.4 的 `prevent-subpath-traversal` 修复是否与 BMC 的 `source-parser.ts` 改动冲突
- 上游新增的 `update-source.ts` 是否与 BMC 的市场安装逻辑有交互
- 上游的 XDG config paths 支持 (`skill-lock.ts`) 是否影响 BMC 的全局 lock 文件路径
