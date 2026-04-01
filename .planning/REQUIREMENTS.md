# Requirements: blueai-skills 上游同步

**Defined:** 2026-04-01
**Core Value:** 安全地引入上游新功能和 bug 修复，不破坏 BMC 定制化的任何内容

## v1 Requirements

Requirements for this sync. Each maps to roadmap phases.

### 准备 (PREP)

- [x] **PREP-01**: 添加 vercel-labs/skills 作为 upstream remote
- [x] **PREP-02**: 配置 .gitattributes merge=ours 驱动保护 BMC 定制文件
- [x] **PREP-03**: 在独立分支 sync/upstream 上操作，不直接修改 master

### 安全修复 (SEC)

- [x] **SEC-01**: 合并子路径遍历防护（sanitize-name 改进）
- [x] **SEC-02**: 合并 auth token 安全处理

### Bug 修复 (BUG)

- [x] **BUG-01**: 合并 Windows ENOENT 修复
- [x] **BUG-02**: 合并损坏 symlink 跳过逻辑
- [x] **BUG-03**: 合并 SSH URL 解析修复
- [x] **BUG-04**: 合并 lock 文件路径硬编码修复
- [x] **BUG-05**: 合并 check-updates 安全限制
- [x] **BUG-06**: 合并分叉检测修复

### 新功能 (FEAT)

- [x] **FEAT-01**: 合并 branch ref 支持（owner/repo#branch 格式）
- [x] **FEAT-02**: 合并 --json 输出 flag
- [x] **FEAT-03**: 合并新 agent 定义（warp/deepagents/firebender/bob）
- [x] **FEAT-04**: 合并 update-source.ts 模块

### 定制保护 (PROT)

- [x] **PROT-01**: branding.ts 保持 BMC 定制版本不变
- [x] **PROT-02**: providers/cos.ts 保持不变
- [x] **PROT-03**: providers/market.ts 保持不变
- [x] **PROT-04**: telemetry.ts 保持 BMC 定制版本不变
- [x] **PROT-05**: find.ts 保持 BMC Market API 实现不变
- [x] **PROT-06**: package.json 保持 BMC 名称/版本/依赖不变

### 验证 (VAL)

- [x] **VAL-01**: 合并后 pnpm build 通过
- [x] **VAL-02**: 合并后 pnpm test 通过
- [x] **VAL-03**: BMC 定制功能冒烟测试（market install, COS provider, find 命令）
- [x] **VAL-04**: 搜索确认无上游硬编码品牌名泄露

## v2 Requirements

Deferred to future sync cycles.

### 可选功能

- **OPT-01**: XDG 路径支持（取决于 BMC 用户操作系统分布）
- **OPT-02**: 上游 providers/registry.ts 动态注册模式

## Out of Scope

| Feature | Reason |
|---------|--------|
| 上游 find.ts 变更 | BMC 有自己的 Market API 实现 |
| 上游 branding 变更 | BMC 有完全不同的品牌标识 |
| 上游 telemetry 变更 | BMC 默认关闭遥测 |
| 自动化同步工具 | 这是一次性任务 |
| 上游 CI/CD 配置 | BMC 有自己的部署流程 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PREP-01 | Phase 1 | Complete |
| PREP-02 | Phase 1 | Complete |
| PREP-03 | Phase 1 | Complete |
| SEC-01 | Phase 2 | Complete |
| SEC-02 | Phase 2 | Complete |
| BUG-01 | Phase 2 | Complete |
| BUG-02 | Phase 2 | Complete |
| BUG-03 | Phase 2 | Complete |
| BUG-04 | Phase 2 | Complete |
| BUG-05 | Phase 2 | Complete |
| BUG-06 | Phase 2 | Complete |
| FEAT-01 | Phase 2 | Complete |
| FEAT-02 | Phase 2 | Complete |
| FEAT-03 | Phase 2 | Complete |
| FEAT-04 | Phase 2 | Complete |
| PROT-01 | Phase 2 | Complete |
| PROT-02 | Phase 2 | Complete |
| PROT-03 | Phase 2 | Complete |
| PROT-04 | Phase 2 | Complete |
| PROT-05 | Phase 2 | Complete |
| PROT-06 | Phase 2 | Complete |
| VAL-01 | Phase 3 | Complete |
| VAL-02 | Phase 3 | Complete |
| VAL-03 | Phase 3 | Complete |
| VAL-04 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after initial definition*
