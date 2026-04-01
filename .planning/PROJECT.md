# blueai-skills 上游同步

## What This Is

将 vercel-labs/skills 上游仓库的最新变更同步到 BMC fork（blueai-skills CLI），分析新功能和改动，选择性合并有价值的更新，同时保护 BMC 定制内容。

## Core Value

安全地引入上游新功能和 bug 修复，不破坏 BMC 定制化的任何内容。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 添加 vercel-labs/skills 作为 upstream remote
- [ ] 拉取上游最新代码并分析差异
- [ ] 识别所有新功能、bug 修复和破坏性变更
- [ ] 生成差异分析报告，标注每个改动的价值和风险
- [ ] 选择性合并有价值的上游改动
- [ ] 保护 BMC 定制文件不被覆盖（branding.ts, providers/cos.ts, providers/market.ts, telemetry.ts, find.ts 等）
- [ ] 保护 package.json 中的 BMC 定制字段（name, version 等）
- [ ] 合并后通过 build + test 验证

### Out of Scope

- 自动化同步工具/脚本 — 这是一次性任务
- 上游的 CI/CD 配置 — BMC 有自己的部署流程
- 上游的文档变更 — BMC 有自己的 CLAUDE.md 和 README

## Context

- **上游仓库**: vercel-labs/skills (GitHub)
- **BMC fork**: blueai-skills (origin: git.domob-inc.cn)
- **中间 fork**: FE-runner/skills (old-origin，GitHub)
- **当前版本**: 1.4.3-bmc1.1.12
- **构建工具**: obuild + pnpm
- **BMC 定制文件**: `src/branding.ts`, `src/providers/cos.ts`, `src/providers/market.ts`, `src/telemetry.ts`, `src/find.ts`

### 冲突策略

当上游变更与 BMC 定制内容冲突时，**始终保留 BMC 定制版本**，仅引入不冲突的新功能和修复。

## Constraints

- **定制保护**: BMC 定制文件必须完整保留
- **版本兼容**: 合并后版本号继续使用 BMC 版本格式 (x.y.z-bmcA.B.C)
- **构建通过**: 合并后必须 `pnpm build` 和 `pnpm test` 通过

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 直接从 vercel-labs/skills 拉取 | 确保获取最新上游代码，不依赖中间 fork 同步状态 | — Pending |
| BMC 优先冲突策略 | 保护定制内容是首要目标 | — Pending |
| 先分析再选择性合并 | 避免盲目合并引入不需要的变更 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-01 after initialization*
