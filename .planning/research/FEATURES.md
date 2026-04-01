# Feature Landscape: vercel-labs/skills 上游变更分析

**域:** Agent Skills CLI 上游 fork 同步
**研究日期:** 2026-04-01
**基准版本:** BMC fork v1.4.3 → 上游 v1.4.7
**置信度:** HIGH（基于 GitHub 仓库直接分析）

## 版本跨度总览

BMC fork 基于上游 v1.4.3，上游当前为 v1.4.7。中间经历了 4 个版本：

| 版本 | 发布日期 | 主题 |
|------|----------|------|
| v1.4.4 | 2026-03-05 | 安全加固 + SSH/auth 支持 |
| v1.4.5 | 2026-03-13 | Bug 修复合集 + JSON 输出 + 搜索排序 |
| v1.4.6 | 2026-03-23 | Agent 支持扩展 + 更新失败提示 |
| v1.4.7 | 2026-03-31 | Branch ref 支持 + 新 agent |

---

## Table Stakes（必须同步的 Bug 修复和安全补丁）

缺少这些修复会导致 BMC fork 存在已知问题或安全漏洞。

| 变更 | 版本 | 复杂度 | 说明 | 冲突风险 |
|------|------|--------|------|----------|
| **防止子路径遍历攻击** | v1.4.4 | Low | `sanitizeSubpath()` 函数阻止 `..` 段逃逸仓库根目录。新增 `subpath-traversal.test.ts` | 低 - BMC fork 已有 `sanitize-name.test.ts`，但缺少专门的子路径遍历防护 |
| **修复 Windows spawnSync ENOENT** | v1.4.4 | Low | `fix: pass auth token to fetchSkillFolderHash and fix Windows spawnSync ENOENT (#487)` | 低 - 纯 bug 修复 |
| **跳过安装时的损坏 symlink** | v1.4.5 | Low | `fix: skip broken symlinks during skill installation (#583)` | 低 - installer.ts 修复 |
| **保留 lock 文件中的 SSH 源 URL** | v1.4.5 | Low | `fix: preserve SSH source URLs in lock files (#588)` | 中 - 涉及 skill-lock.ts，需检查 BMC 的 lock 文件定制 |
| **修复 lock 文件中硬编码的 ~/.agents 路径** | v1.4.5 | Low | `fix: avoid hardcoded ~/.agents for skill lock file (#517)` | 中 - 路径处理，需验证与 BMC 的路径策略兼容 |
| **停止排除下划线前缀文件** | v1.4.5 | Low | `fix: stop excluding underscore-prefixed files during skill installation (#548)` | 低 - 安装逻辑修复 |
| **跳过所有 agent 共享目录时的提示** | v1.4.5 | Low | `fix: skip symlink/copy prompt when all agents share one directory (#582)` | 低 - UX 改进 |
| **列出未检测到 agent 的已安装技能** | v1.4.6 | Low | `fix: list skills installed for undetected agents (#656)` | 低 - list.ts 修复 |
| **传递 auth token 到 fetchSkillFolderHash** | v1.4.4 | Low | 修复私有仓库的更新检查鉴权问题 | 中 - 涉及 check/update 逻辑 |
| **支持 lock 文件中的 SSH URL** | v1.4.4 | Low | `feat: support ssh urls in lock file (#346)` | 中 - 涉及 lock 文件格式 |

### Table Stakes 同步建议

**优先级 P0（安全相关）：**
1. 子路径遍历防护 - 安全漏洞修复
2. Auth token 传递 - 私有仓库安全

**优先级 P1（功能完整性）：**
3. 损坏 symlink 跳过
4. Windows ENOENT 修复
5. 下划线文件排除修复
6. Lock 文件路径硬编码修复

**优先级 P2（体验优化）：**
7. SSH URL 支持（lock 文件 + 源解析）
8. 共享目录提示跳过
9. 未检测 agent 的技能列出

---

## Differentiators（值得集成的新功能）

这些功能为用户提供新价值，但不是缺失即破损的修复。

| 功能 | 版本 | 复杂度 | 价值 | 冲突风险 |
|------|------|--------|------|----------|
| **`--json` flag for `list` 命令** | v1.4.5 | Low | 支持机器可读输出，便于脚本集成和自动化 | 低 - 新增参数，不影响现有逻辑 |
| **搜索结果按安装量排序** | v1.4.5 | Low | `fix: sort search results by install count (#546)` | 高 - BMC 的 find.ts 已大幅定制，使用 Market API |
| **更新失败时指明具体技能** | v1.4.6 | Med | `feat: indicate which skills failed to update (#387)` | 中 - 涉及 cli.ts 的 update 逻辑 |
| **支持 branch ref 安装/更新** | v1.4.7 | Med | `feat: support branch refs in skill install/update sources (#814)` - 允许 `owner/repo#branch` 安装指定分支 | 高 - 涉及 source-parser.ts，BMC 已大幅定制（新增 market/cos 类型） |
| **新增 `update-source.ts` 模块** | v1.4.7 | Low | 构建更新安装源的辅助函数，配合 branch ref 支持 | 低 - 全新文件，无冲突 |
| **新增 `github:` 协议前缀解析** | v1.4.4 | Low | 支持 `github:owner/repo` 语法 | 高 - source-parser.ts 已定制 |
| **搜索结果安装量格式化显示** | v1.3.9-v1.4.5 | Low | 显示 "1.2M installs" 等可读格式 | 高 - find.ts 已定制 |
| **`support-agent-skills-path`** | v1.4.6 | Low | 支持 agent 自定义技能路径 | 中 - 涉及 agents.ts |

### 新 Agent 支持

上游新增 4 个 agent，BMC fork 尚未包含：

| Agent | 版本 | 说明 |
|-------|------|------|
| `warp` | v1.4.5 | Warp terminal AI agent（universal agent） |
| `deepagents` | v1.4.6 | Deep Agents 支持 |
| `firebender` | v1.4.7 | Firebender agent |
| `bob` | v1.4.7 | IBM Bob agent |

**同步建议:** 新 agent 定义主要在 `agents.ts` 和 `types.ts` 中添加，冲突风险低，建议全量同步。同时需更新 `package.json` 的 keywords 字段。

### Differentiator 同步建议

**推荐集成（价值高、冲突低）：**
1. `--json` flag for list - 自动化友好，BMC 未定制 list.ts 的参数解析
2. 新 agent 支持 - 纯新增，无冲突
3. `update-source.ts` - 全新文件
4. 更新失败具体提示 - UX 改进

**选择性集成（需手动合并）：**
5. Branch ref 支持 - 很有价值但 source-parser.ts 冲突大，需手动移植逻辑
6. `github:` 协议支持 - 同上

**暂不集成（BMC 已有替代实现）：**
7. 搜索排序/格式化 - BMC 的 find.ts 使用 Market API，搜索逻辑完全不同

---

## Anti-Features（与 BMC 目标冲突的上游变更）

明确不应引入的变更，或需要特别小心处理的。

| 变更 | 原因 | 处理方式 |
|------|------|----------|
| **上游 `find.ts` 变更** | BMC 的 find.ts 已完全重写为 Market API 搜索，上游的 skills.sh API 变更无意义 | 忽略上游 find.ts 所有变更，保持 BMC 版本 |
| **上游 `source-parser.ts` 核心结构** | BMC 新增了 `cos`/`market` 类型、`isMarketInstallCommand()`、`isBareSkillName()`、`parseMarketInstallCommand()` 等大量定制 | 仅手动移植新的解析逻辑（如 branch ref、github: 前缀），保持 BMC 定制结构 |
| **上游 telemetry 默认行为** | BMC 要求遥测默认关闭 | 忽略上游 telemetry.ts 变更 |
| **上游 branding（包名、URL 等）** | BMC 使用 `blueai-skills` 品牌和自有 Market URL | 忽略上游 branding 相关变更 |
| **上游 package.json 的 name/version/bin** | BMC 有独立的包名和版本策略 | 仅同步 devDependencies 版本更新和新的 keywords |
| **上游 `constants.ts` 的路径常量** | 上游定义 `.agents/skills` 等路径，BMC 可能有不同约定 | 需验证后决定 |
| **docs(find-skills) 文档变更** | 上游有质量验证和排行榜文档，不适用于 BMC 生态 | 忽略 |

---

## Feature Dependencies（功能依赖关系图）

```
branch ref 支持 (#814) → update-source.ts (新文件)
                       → source-parser.ts 的 parseFragmentRef()
                       → skill-lock.ts 的 ref 字段存储
                       → cli.ts 的 update 逻辑

subpath 遍历防护 → source-parser.ts 的 sanitizeSubpath()
                 → subpath-traversal.test.ts (新测试文件)

--json flag → list.ts 的 parseListOptions() + runList()

新 agent 支持 → agents.ts (agent 定义)
             → types.ts (AgentType 联合类型)
             → package.json (keywords)
```

---

## MVP 同步建议

### Phase 1: 安全和关键 Bug 修复
1. 子路径遍历防护（安全）
2. Windows ENOENT 修复
3. Auth token 传递修复
4. 损坏 symlink 跳过

### Phase 2: 低风险功能集成
5. 新 agent 支持（warp, deepagents, firebender, bob）
6. `--json` flag for list 命令
7. `update-source.ts` 新文件
8. Lock 文件 SSH URL 支持
9. 下划线文件排除修复

### Phase 3: 高冲突手动合并
10. Branch ref 支持（手动移植到 BMC 的 source-parser.ts）
11. `github:` 协议前缀支持（同上）
12. 更新失败具体提示

### 明确跳过
- 上游 find.ts 所有变更
- 上游 branding/telemetry 变更
- 上游文档变更

---

## 上游依赖版本变化

| 依赖 | BMC fork 版本 | 上游版本 | 需要更新 |
|------|--------------|----------|---------|
| TypeScript | ^5.9.3 | 5.9.3 | 相同 |
| Vitest | ^4.0.17 | 4.0.17 | 相同 |
| Prettier | ^3.8.1 | 3.8.1 | 相同 |
| obuild | ^0.4.22 | 0.4.22 | 相同 |
| pnpm | 10.17.1 | 10.17.1 | 相同 |
| Node.js | >=18 | >=18 | 相同 |

**结论:** 依赖版本完全一致，无需额外升级。

---

## 上游文件结构变化

### 新增文件（BMC fork 没有）
| 文件 | 用途 |
|------|------|
| `src/update-source.ts` | Branch ref 支持的辅助函数 |
| `src/update-source.test.ts` | 对应测试 |
| `tests/subpath-traversal.test.ts` | 子路径遍历防护测试 |

### BMC 独有文件（上游没有）
| 文件 | 用途 |
|------|------|
| `src/branding.ts` | BMC 品牌定制 |
| `src/providers/cos.ts` | 腾讯 COS 存储支持 |
| `src/providers/market.ts` | Skills Market API 集成 |

### 双方都有但差异大的文件（需手动合并）
| 文件 | 差异程度 | 说明 |
|------|----------|------|
| `src/source-parser.ts` | **极大** | BMC 新增 market/cos 类型，上游新增 branch ref/github: 前缀 |
| `src/find.ts` | **极大** | BMC 完全重写为 Market API |
| `src/cli.ts` | **大** | BMC 有品牌定制 + Market 集成 |
| `src/types.ts` | **中** | BMC 新增 ParsedSource 的 market 字段；上游新增 agent 类型 |
| `src/list.ts` | **小** | 上游新增 --json flag |
| `src/agents.ts` | **中** | 上游新增 4 个 agent |
| `src/skill-lock.ts` | **中** | 上游修复路径硬编码和 SSH URL |
| `src/installer.ts` | **小** | 上游修复 symlink 和下划线文件 |
| `package.json` | **大** | 包名、版本、bin 字段不同 |

---

## Sources

- [vercel-labs/skills GitHub 仓库](https://github.com/vercel-labs/skills) - 主仓库页面，12.6k stars
- [vercel-labs/skills 提交历史](https://github.com/vercel-labs/skills/commits/main) - v1.4.4 到 v1.4.7 的完整提交列表
- [vercel-labs/skills 发布页面](https://github.com/vercel-labs/skills/releases) - 版本发布说明
- 本地 BMC fork 代码直接分析（`C:\Users\LY\Code\skill2\skills-cli\src\`）
