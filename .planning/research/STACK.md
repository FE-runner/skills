# 上游同步技术栈

**项目:** blueai-skills (BMC fork of vercel-labs/skills)
**研究日期:** 2026-04-01

## 当前分叉状态

| 指标 | 数值 |
|------|------|
| 分叉点 | `5ac56d8` (v1.4.3) |
| 上游新增提交 | 29 (v1.4.3 → v1.4.7) |
| BMC 新增提交 | ~54 (v1.4.3 → v1.4.3-bmc1.1.12) |
| 双方都修改的文件 | 16 个 |
| BMC 独有新文件 | `branding.ts`, `providers/cos.ts`, `providers/market.ts`, `find.ts` 等 |
| 上游独有新文件 | `update-source.ts`, `tests/subpath-traversal.test.ts`, `tests/xdg-config-paths.test.ts` 等 |

## 推荐策略：Git Merge（非 Rebase）

### 核心决策

**使用 `git merge upstream/main`，不要使用 `git rebase`。**

### 为什么选择 Merge 而非 Rebase

| 维度 | Merge | Rebase | 本项目结论 |
|------|-------|--------|-----------|
| 历史保留 | 保留两条独立历史线 | 重写 BMC 所有 54 个提交 | BMC 有发布版本标签，重写历史会破坏 |
| 冲突处理 | 一次性解决所有冲突 | 每个提交都可能重复冲突 | 16 个冲突文件，逐提交 rebase 痛苦 |
| 已推送分支 | 安全，不改变已推送提交 | 需要 force push，影响协作者 | origin 已推送，不应 force push |
| 可逆性 | `git merge --abort` 或 `git reset` 到合并前 | 中途失败恢复复杂 | 安全第一 |
| 后续同步 | 下次 merge 只处理新增差异 | 每次都要重新 rebase 全部 | 长期维护友好 |

**置信度: HIGH** — 这是 Git 社区对"已推送的定制化 fork"的标准建议，不依赖最新工具。

### 为什么不用 Cherry-Pick

Cherry-pick 适合"只要上游的某几个提交"的场景。本项目需要引入上游 v1.4.4 到 v1.4.7 的大部分改动（29 个提交），逐个 cherry-pick：
- 丢失合并历史追踪，Git 不知道哪些上游提交已被引入
- 下次同步时无法自动排除已选择的提交
- 管理 29 个提交的选择列表容易出错

**例外：** 如果分析后发现只有 3-5 个提交有价值，可以考虑 cherry-pick。但从上游 diff 看（+1127 行，涉及 bug 修复、新功能、安全修复），大部分都应引入。

## 推荐工具与流程

### 工具 1: Git 自带 Merge + .gitattributes 合并策略

**用途:** 自动处理"BMC 定制文件永远保留我方版本"的需求。

```gitattributes
# 这些文件在合并时永远保留 BMC 版本
src/branding.ts merge=ours
src/providers/cos.ts merge=ours
src/providers/market.ts merge=ours
src/telemetry.ts merge=ours
package.json merge=ours
```

**配置合并驱动:**

```bash
git config merge.ours.driver true
```

`true` 命令总是返回 0，效果是保留当前分支（BMC）的版本，忽略上游的修改。

**置信度: HIGH** — 这是 Git 内建功能，文档稳定。

**注意:** `.gitattributes` 中的 `merge=ours` 只在出现冲突时生效。如果上游没有修改这些文件，Git 会正常 fast-forward。这正是我们想要的行为。

### 工具 2: `git diff` 三方分析脚本

**用途:** 合并前生成冲突预判报告。

```bash
# 预览合并冲突（不实际执行）
git merge --no-commit --no-ff upstream/main

# 查看冲突文件
git diff --name-only --diff-filter=U

# 放弃预览
git merge --abort
```

**置信度: HIGH** — 标准 Git 操作。

### 工具 3: VS Code 合并编辑器

**用途:** 手动解决 16 个冲突文件时的三方对比。

VS Code 内建的合并编辑器（3-way merge editor）是 2025 年解决复杂冲突的最佳交互式工具。对于 `src/source-parser.ts`、`src/cli.ts` 等双方大量修改的文件，需要人工逐段审查。

**置信度: HIGH** — VS Code 合并编辑器是成熟稳定功能。

### 工具 4: `git log --cherry-mark`（可选辅助）

**用途:** 如果未来某些上游提交已通过 cherry-pick 引入过，用于识别重复。

```bash
git log --cherry-mark --oneline upstream/main...HEAD
```

当前场景不需要（BMC 的修改是独立开发，不是从上游 cherry-pick 来的），但未来同步时可能有用。

**置信度: MEDIUM** — 有用但当前场景不适用。

## 不推荐的方案

### 不要用 `git subtree`

Subtree 适合"将外部仓库作为子目录引入"的场景，不适合"整个仓库是 fork"的情况。

### 不要用 `git submodule`

架构完全不匹配。fork 是同一个代码库的分支，不是两个独立项目的组合。

### 不要用 GitHub "Sync fork" 按钮

该功能会用上游覆盖所有 BMC 定制内容，没有选择性合并能力。

### 不要写自动化脚本

项目 PROJECT.md 明确标注"自动化同步工具/脚本"在 Out of Scope。这是一次性操作，手动 merge 最可控。

## 完整操作流程

```bash
# 1. 准备：确保工作区干净
git stash  # 如有未提交修改

# 2. 配置 .gitattributes 保护 BMC 文件
# （创建 .gitattributes 文件，内容见上方）
git config merge.ours.driver true

# 3. 创建同步分支（不在 master 上直接操作）
git checkout -b sync/upstream-v1.4.7

# 4. 预览冲突
git merge --no-commit --no-ff upstream/main
git diff --name-only --diff-filter=U  # 查看冲突列表
git merge --abort

# 5. 正式合并
git merge upstream/main --no-edit

# 6. 解决冲突（优先保留 BMC 定制）
# 对每个冲突文件：
#   - BMC 定制文件：git checkout --ours <file>
#   - 上游新功能文件：手动合并，保留双方有价值的修改
#   - 测试文件：合并双方测试用例

# 7. 验证
pnpm install
pnpm build
pnpm test

# 8. 提交合并
git add .
git commit  # 使用默认合并信息

# 9. 合并到 master
git checkout master
git merge sync/upstream-v1.4.7
```

## 冲突文件分类预判

基于 `comm -12` 分析的 16 个双方修改文件：

| 文件 | 冲突策略 | 原因 |
|------|---------|------|
| `package.json` | 保留 BMC | 包名、版本、脚本都是 BMC 定制的 |
| `README.md` | 保留 BMC | BMC 有自己的中文文档 |
| `AGENTS.md` | 保留 BMC | BMC 已改名为 CLAUDE.md |
| `src/cli.ts` | 手动合并 | 核心文件，上游可能有新命令需要引入 |
| `src/find.ts` | 手动合并 | BMC 有 market 搜索定制，上游有排序修复 |
| `src/source-parser.ts` | 手动合并 | 双方都大量修改，上游有分支引用支持 |
| `src/installer.ts` | 手动合并 | 上游有 symlink 修复和错误处理改进 |
| `src/skill-lock.ts` | 手动合并 | 上游有 XDG 路径支持 |
| `src/types.ts` | 手动合并 | 双方都扩展了类型 |
| `src/install.ts` | 手动合并 | 上游有小修复 |
| `src/local-lock.ts` | 手动合并 | 双方都有小改动，冲突概率低 |
| `src/add.ts` | 手动合并 | 需要看具体差异 |
| `src/list.test.ts` | 合并双方测试 | 双方都新增测试用例 |
| `src/source-parser.test.ts` | 合并双方测试 | 同上 |
| `tests/source-parser.test.ts` | 合并双方测试 | 同上 |
| `skills/find-skills/SKILL.md` | 手动合并 | 上游有文档改进 |

## 来源

- Git 官方文档: merge strategies, gitattributes merge drivers（内建知识，稳定 API）
- 项目分析: `git log`, `git diff --stat`, `comm -12` 实际数据
- PROJECT.md: 项目约束和范围定义
