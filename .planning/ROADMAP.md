# Roadmap: blueai-skills 上游同步

## Overview

将 vercel-labs/skills 上游仓库的 29 个新提交（v1.4.3 -> v1.4.7）安全同步到 BMC fork。工作流程分三步：准备合并环境、在独立分支上执行选择性合并（引入安全修复/Bug修复/新功能，同时保护 BMC 定制内容）、最后验证构建和功能完整性。

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: 合并准备** - 配置 upstream remote、合并保护和工作分支
- [ ] **Phase 2: 选择性合并** - 执行合并，引入上游改进，保护 BMC 定制内容
- [ ] **Phase 3: 验证与收尾** - 构建测试通过，BMC 功能冒烟测试，品牌检查

## Phase Details

### Phase 1: 合并准备
**Goal**: 合并环境就绪，BMC 定制文件有自动保护，工作在安全的独立分支上进行
**Depends on**: Nothing (first phase)
**Requirements**: PREP-01, PREP-02, PREP-03
**Success Criteria** (what must be TRUE):
  1. `git remote -v` 显示 upstream 指向 vercel-labs/skills
  2. `.gitattributes` 中配置了 `merge=ours` 驱动，覆盖 branding.ts、cos.ts、market.ts、telemetry.ts、find.ts
  3. 当前工作在 `sync/upstream` 分支上，master 未被修改
**Plans**: 1 plan

Plans:
- [x] 01-01-PLAN.md — 配置 upstream remote、.gitattributes 合并保护、创建 sync 工作分支

### Phase 2: 选择性合并
**Goal**: 上游的安全修复、Bug 修复和新功能已合并到 sync 分支，BMC 所有定制内容完整保留
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02, BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06, FEAT-01, FEAT-02, FEAT-03, FEAT-04, PROT-01, PROT-02, PROT-03, PROT-04, PROT-05, PROT-06
**Success Criteria** (what must be TRUE):
  1. `git log` 显示上游合并提交存在于 sync 分支
  2. `src/branding.ts`、`src/providers/cos.ts`、`src/providers/market.ts`、`src/telemetry.ts`、`src/find.ts` 内容与合并前完全一致
  3. `package.json` 中 name 为 `blueai-skills`，version 为 BMC 格式
  4. 上游新增的 agent 定义（warp/deepagents/firebender/bob）存在于 `src/agents.ts`
  5. 上游的 branch ref 支持（owner/repo#branch）和 --json flag 功能代码已引入
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — 执行 git merge，解决保护文件和中等冲突文件（agents/types/installer/skill-lock/local-lock/add）
- [ ] 02-02-PLAN.md — 解决高冲突文件（source-parser.ts, cli.ts），提交合并

### Phase 3: 验证与收尾
**Goal**: 合并后的代码通过所有自动化检查，BMC 定制功能经冒烟测试确认可用
**Depends on**: Phase 2
**Requirements**: VAL-01, VAL-02, VAL-03, VAL-04
**Success Criteria** (what must be TRUE):
  1. `pnpm build` 零错误完成
  2. `pnpm test` 全部测试通过
  3. `skills find <keyword>` 正确调用 BMC Market API（非 skills.sh）
  4. 代码中无 "skills.sh" 或上游品牌名硬编码泄露（branding.ts 中的配置除外）
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 合并准备 | 1/1 | Complete | 2026-04-01 |
| 2. 选择性合并 | 0/2 | Planning complete | - |
| 3. 验证与收尾 | 0/0 | Not started | - |
