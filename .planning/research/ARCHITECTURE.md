# Architecture: 上游 Fork 同步工作流

**项目:** blueai-skills 上游同步
**研究日期:** 2026-04-01
**整体置信度:** HIGH

## 推荐架构：分层分类同步工作流

上游 vercel-labs/skills (v1.4.7, main 分支) 与 BMC fork (v1.4.3-bmc1.1.12, master 分支) 之间存在显著分歧。同步不能用简单的 `git merge`，必须采用**分类审查 + 选择性 cherry-pick/手动合并**的策略。

### 为什么不能直接 `git merge upstream/main`

1. **分支基点不同**: BMC fork 的 master 分支包含大量定制 commit，upstream 的 main 从 v1.4.3 之后已经演进到 v1.4.7，中间有数十个 commit
2. **文件级冲突不可避免**: `source-parser.ts`、`find.ts`、`cli.ts`、`add.ts` 等核心文件两边都有修改
3. **新增文件**: upstream 新增了 `update-source.ts`、`add-prompt.test.ts`、`update-source.test.ts`，BMC 新增了 `providers/cos.ts`、`providers/market.ts`
4. **Provider 架构差异**: upstream 有 `providers/registry.ts`（完整注册系统），BMC 移除了 registry 改为直接导入

---

## 文件分类体系

### 第一类：BMC 保护文件（绝不合并上游变更）

这些文件包含 BMC 核心定制，上游的任何变更都必须忽略。

| 文件 | 保护原因 | 处理方式 |
|------|---------|---------|
| `src/branding.ts` | BMC 品牌常量（包名、URL、遥测端点） | **完全跳过**，保留 BMC 版本 |
| `src/providers/cos.ts` | BMC 独有的腾讯云 COS 提供者 | **完全跳过**，upstream 无此文件 |
| `src/providers/market.ts` | BMC 独有的技能市场提供者 | **完全跳过**，upstream 无此文件 |
| `src/providers/index.ts` | 导出了 COS 和 Market 提供者 | **完全跳过**，BMC 版本含额外导出 |
| `package.json` | 包名 `blueai-skills`、版本号、bin 字段 | **手动选择性合并**，仅更新 devDependencies 版本 |
| `src/telemetry.ts` | 遥测默认关闭 (`return false`) | **完全跳过**，但检查 upstream 是否新增了接口类型 |

### 第二类：BMC 深度定制文件（需逐行审查合并）

这些文件两边都有修改，需要逐行对比，选择性引入上游改进。

| 文件 | BMC 定制内容 | 上游可能有的改进 | 合并策略 |
|------|-------------|-----------------|---------|
| `src/source-parser.ts` | Market 优先解析、`isMarketInstallCommand()`、`isBareSkillName()`、`parseMarketInstallCommand()` | `sanitizeSubpath()` 防目录遍历、`looksLikeGitSource()` 辅助函数 | 保留 BMC 定制，cherry-pick 新增的安全函数 |
| `src/find.ts` | 使用 `SKILLS_SITE` 替代 `skills.sh`、Market API 信封解包 | 搜索结果按安装量排序、技能质量验证、排行榜检查 | 保留 BMC API 调用方式，引入排序和质量验证逻辑 |
| `src/add.ts` | 导入 cosProvider/marketProvider、Market 技能安装流程 | 跳过 symlink 提示优化、停止排除下划线前缀文件 | 保留 BMC provider 集成，引入 UX 改进 |
| `src/cli.ts` | BMC 命令路由（含 find 命令接入 Market） | 新命令支持、帮助文本更新 | 保留 BMC 路由，引入新命令 |
| `src/types.ts` | `ParsedSource` 含 `market` 类型和 market 字段 | 新增 AgentType（bob, firebender, deep-agents 等） | 保留 market 类型，合入新 agent 类型 |
| `src/agents.ts` | 无重大定制（可能有微调） | 新增多个 agent 定义（bob, firebender, deep-agents 等） | 直接合入新 agent，保留任何 BMC 微调 |
| `src/installer.ts` | 可能有微调 | 停止排除下划线前缀文件、symlink 提示优化 | 需对比，引入改进 |
| `src/skill-lock.ts` | XDG 路径可能不同 | XDG_STATE_HOME 支持（避免硬编码 ~/.agents） | 引入 XDG 改进 |
| `src/local-lock.ts` | `authorId` 字段支持 | 可能有其他改进 | 保留 authorId，合入其他改进 |

### 第三类：上游新增文件（直接引入）

| 文件 | 功能 | 引入难度 | 注意事项 |
|------|------|---------|---------|
| `src/update-source.ts` | 构建更新安装源、支持分支 ref | 低 | 纯工具函数，无外部依赖冲突 |
| `src/update-source.test.ts` | 上述文件的测试 | 低 | 直接引入 |
| `src/add-prompt.test.ts` | add 命令提示测试 | 低 | 检查是否依赖 upstream 特有的 mock |
| `src/source-parser.test.ts` | 可能有新测试用例 | 中 | BMC 有同名文件在 `tests/`，需合并测试 |

### 第四类：可直接同步的文件（无 BMC 定制）

| 文件 | 说明 |
|------|------|
| `src/git.ts` | Git clone 操作，BMC 无定制 |
| `src/skills.ts` | 技能发现解析，BMC 无定制 |
| `src/plugin-manifest.ts` | 插件清单，BMC 无定制 |
| `src/sync.ts` | node_modules 同步，BMC 无定制 |
| `src/install.ts` | lock 恢复，BMC 无定制 |
| `src/constants.ts` | 共享常量，BMC 无定制 |
| `src/prompts/search-multiselect.ts` | 交互提示，BMC 无定制 |
| `src/list.ts` | 列表命令，可能有 upstream 改进（列出未检测 agent 的技能） |
| `src/remove.ts` | 移除命令，BMC 无定制 |
| `tests/*.test.ts` | 测试文件，BMC 无定制的部分 |

### 第五类：配置和元数据文件

| 文件 | 处理方式 |
|------|---------|
| `package.json` | 手动合并：保留 BMC name/version/bin/author/repository，更新 devDependencies 版本、keywords、scripts |
| `tsconfig.json` | 对比合入 |
| `vitest.config.ts` | 对比合入 |
| `.prettierrc` / `prettier.config.*` | 对比合入 |
| `README.md` | **跳过**，BMC 有自己的 README |
| `.github/` | **跳过**，BMC 有自己的 CI/CD |
| `.husky/` | 对比合入 |

---

## 分步同步工作流

### Phase 1: 准备（预计 30 分钟）

**目标**: 建立上游追踪，获取差异全景。

```bash
# 1. 添加上游 remote
git remote add upstream https://github.com/vercel-labs/skills.git

# 2. 拉取上游代码（不合并）
git fetch upstream

# 3. 创建同步分支
git checkout -b sync/upstream-v1.4.7 master
```

**验证检查点**:
- [ ] `git remote -v` 显示 upstream remote
- [ ] `git log upstream/main --oneline -5` 可见上游最新 commit
- [ ] 在 sync 分支上工作，master 安全

### Phase 2: 差异分析（预计 1-2 小时）

**目标**: 生成完整的文件级差异报告，标注每个变更的类别和风险。

```bash
# 1. 生成完整差异（upstream main vs 当前 master）
git diff master..upstream/main --stat > .planning/research/diff-stat.txt

# 2. 逐文件差异（关键文件）
git diff master..upstream/main -- src/agents.ts
git diff master..upstream/main -- src/types.ts
git diff master..upstream/main -- src/source-parser.ts
git diff master..upstream/main -- src/add.ts
git diff master..upstream/main -- src/cli.ts
git diff master..upstream/main -- src/find.ts
git diff master..upstream/main -- src/installer.ts
git diff master..upstream/main -- src/skill-lock.ts
git diff master..upstream/main -- src/list.ts

# 3. 上游新增文件
git diff master..upstream/main --diff-filter=A --name-only

# 4. 上游删除文件
git diff master..upstream/main --diff-filter=D --name-only
```

**输出**: 差异分析报告，按文件分类标注：
- 每个变更的价值评级（HIGH/MEDIUM/LOW）
- 冲突风险评级（HIGH/MEDIUM/LOW/NONE）
- 建议的合并方式（skip/cherry-pick/manual-merge/direct-copy）

**验证检查点**:
- [ ] 所有 src/ 文件已分类
- [ ] 每个变更有价值和风险评级
- [ ] 保护文件确认为 skip

### Phase 3: 安全文件同步（预计 30 分钟）

**目标**: 先处理无冲突风险的文件（第三类新增 + 第四类无定制）。

**处理顺序**（按依赖关系）:

1. **新增工具文件**: `src/update-source.ts` + 测试
2. **无定制的核心文件**: `src/git.ts`, `src/skills.ts`, `src/constants.ts`, `src/plugin-manifest.ts`
3. **无定制的命令文件**: `src/sync.ts`, `src/install.ts`, `src/list.ts`, `src/remove.ts`
4. **无定制的 UI 文件**: `src/prompts/search-multiselect.ts`
5. **测试文件**: `tests/` 下无冲突的测试

```bash
# 对每个安全文件，从 upstream 直接检出
git checkout upstream/main -- src/update-source.ts
git checkout upstream/main -- src/update-source.test.ts
# ... 其他安全文件

# 每批文件后验证
pnpm type-check  # TypeScript 编译检查
```

**验证检查点**:
- [ ] `pnpm type-check` 通过
- [ ] 无导入错误（新文件的导入路径正确）

### Phase 4: Agent 和类型同步（预计 1 小时）

**目标**: 合入新 agent 支持和类型扩展。

**处理顺序**:

1. **`src/types.ts`**: 合入新 AgentType（bob, firebender, deep-agents 等），保留 market 相关类型
2. **`src/agents.ts`**: 合入新 agent 定义，保留 BMC 微调
3. **`package.json` keywords**: 添加新 agent 关键词

```
手动合并方法:
1. 用 diff 工具（VS Code）并排对比
2. 在 BMC 版本基础上，手动添加上游新增的代码块
3. 不删除 BMC 独有的代码
```

**验证检查点**:
- [ ] `pnpm type-check` 通过
- [ ] 新 agent 类型在 types.ts 和 agents.ts 中一致
- [ ] `pnpm test` 通过

### Phase 5: 核心逻辑合并（预计 2-3 小时）

**目标**: 合入核心文件的上游改进，这是最复杂也最高风险的阶段。

**处理顺序**（按风险从低到高）:

1. **`src/skill-lock.ts`** — 引入 XDG_STATE_HOME 支持
2. **`src/local-lock.ts`** — 引入任何上游改进，保留 authorId
3. **`src/installer.ts`** — 引入 symlink 提示优化、停止排除下划线文件
4. **`src/source-parser.ts`** — 引入 `sanitizeSubpath()`，保留全部 Market 解析逻辑
5. **`src/find.ts`** — 引入搜索排序和质量验证，保留 Market API 集成
6. **`src/add.ts`** — 引入 UX 改进，保留 COS/Market provider 集成
7. **`src/cli.ts`** — 引入新命令路由，保留 BMC 路由

**每个文件的合并方法**:

```
1. 生成 3-way diff（base: fork 点, ours: BMC, theirs: upstream）
2. 在 VS Code 中逐块审查:
   - 仅 upstream 修改 → 接受（除非触及 BMC 定制区域）
   - 仅 BMC 修改 → 保留
   - 两边都修改 → 逐行决策，BMC 优先
3. 每个文件合并后立即运行 type-check
```

**验证检查点**（每个文件后）:
- [ ] `pnpm type-check` 通过
- [ ] `pnpm test` 通过
- [ ] BMC 定制功能未被破坏（手动检查关键导入和调用链）

### Phase 6: Provider 架构对齐（预计 1 小时）

**目标**: 决定是否引入 upstream 的 registry.ts 模式。

**关键决策**: upstream 使用 `providers/registry.ts` 做动态 provider 注册，BMC 目前直接导入。

**推荐**: **不引入 registry.ts**。理由：
- BMC 的 provider 列表是固定的（WellKnown + COS + Market），不需要动态注册
- 直接导入更简单、类型安全、tree-shakable
- 引入 registry 需要改动 add.ts 中的 provider 调用方式，风险大收益小

但需检查: upstream 的 `add.ts` 是否已完全依赖 registry 模式。如果是，则需要在 BMC 的 add.ts 中保持直接导入方式而不合入上游 add.ts 中 registry 相关的改动。

**验证检查点**:
- [ ] `src/providers/index.ts` 保留 BMC 导出
- [ ] `src/providers/types.ts` 合入任何接口变更
- [ ] `src/providers/wellknown.ts` 从 upstream 更新（如有改进）

### Phase 7: 配置和依赖同步（预计 30 分钟）

**目标**: 更新构建配置和依赖版本。

1. **`package.json`**:
   - 保留: name, version, bin, author, repository
   - 更新: devDependencies 版本（如有升级）
   - 添加: 新 keywords（新 agent 名称）
   - 检查: scripts 是否有新增

2. **`tsconfig.json`**, **`vitest.config.ts`**: 对比合入任何改进

3. **`pnpm-lock.yaml`**: 运行 `pnpm install` 重新生成

**验证检查点**:
- [ ] `pnpm install` 无错误
- [ ] `pnpm build` 成功
- [ ] `pnpm test` 全部通过

### Phase 8: 全面验证（预计 1 小时）

**目标**: 确保合并后的代码库完全功能正常。

```bash
# 1. 编译检查
pnpm type-check

# 2. 构建
pnpm build

# 3. 运行所有测试
pnpm test

# 4. 格式化
pnpm format

# 5. 功能性冒烟测试
pnpm dev                    # 显示 banner
pnpm dev add --help         # help 输出
pnpm dev list               # 列出技能
pnpm dev find test          # 搜索测试（验证 Market API）
```

**BMC 定制验证清单**:
- [ ] `pnpm dev` 显示 `blueai-skills` 品牌
- [ ] Market 搜索 API 指向 `blueai-skills-market.bluemediagroup.cn`
- [ ] COS URL 解析正常
- [ ] Market 技能名安装正常
- [ ] 遥测默认关闭
- [ ] 版本号仍为 BMC 格式

**验证检查点**:
- [ ] 上述所有检查通过
- [ ] 没有引入上游的 `skills.sh` 硬编码 URL

---

## 组件边界图

```
上游变更流向:

  upstream/main (v1.4.7)
       │
       ▼
  ┌─────────────────────────────┐
  │      差异分析 (Phase 2)      │
  │   分类为 5 类文件            │
  └─────────┬───────────────────┘
            │
  ┌─────────▼───────────────────┐
  │   第一类: 保护文件 ──────── SKIP
  │   第二类: 定制文件 ──────── 手动逐行合并
  │   第三类: 新增文件 ──────── 直接引入
  │   第四类: 无定制文件 ────── 直接同步
  │   第五类: 配置文件 ──────── 选择性合并
  └─────────┬───────────────────┘
            │
            ▼
  ┌─────────────────────────────┐
  │   sync/upstream-v1.4.7 分支  │
  │   逐阶段 commit + 验证      │
  └─────────┬───────────────────┘
            │
            ▼
  ┌─────────────────────────────┐
  │   全面验证 (Phase 8)         │
  │   build + test + 冒烟测试    │
  └─────────┬───────────────────┘
            │
            ▼
  merge 到 master, 打新版本标签
```

---

## 数据流：冲突解决决策树

```
对于每个有差异的文件:

  该文件是否在保护列表中？
  ├─ YES → 跳过，保留 BMC 版本
  └─ NO
      │
      该文件是否有 BMC 定制？
      ├─ NO → 直接从 upstream 检出
      └─ YES
          │
          上游变更是否触及 BMC 定制区域？
          ├─ NO → 在 BMC 版本上追加上游变更
          └─ YES
              │
              BMC 定制是否为核心业务逻辑？
              ├─ YES → 保留 BMC 版本，放弃该区域的上游变更
              └─ NO → 尝试融合两边变更，BMC 优先
```

---

## 关键上游改进价值评估

| 改进 | 来源 commit | 价值 | 引入风险 |
|------|------------|------|---------|
| 新 agent 支持（bob, firebender, deep-agents 等） | 多个 commit | HIGH | LOW — 纯增量 |
| 分支 ref 支持（skill install/update） | Bernd Strehl, Mar 31 | HIGH | MEDIUM — 涉及 source-parser 和 lock |
| `update-source.ts` 更新源构建 | 新文件 | MEDIUM | LOW — 独立模块 |
| XDG_STATE_HOME 支持 | Connor Welsh, Mar 13 | MEDIUM | LOW — 改动范围小 |
| 技能质量验证和排行榜 | Elliot Liu, Mar 13 | MEDIUM | MEDIUM — 涉及 find.ts（BMC 有定制） |
| 列出未检测 agent 的技能 | Elliot Liu, Mar 16 | MEDIUM | LOW — list.ts 无 BMC 定制 |
| 跳过 symlink 提示优化 | Elliot Liu, Mar 13 | LOW | LOW — installer 改动小 |
| 停止排除下划线前缀文件 | Elliot Liu, Mar 13 | LOW | LOW — installer 改动小 |
| 更新失败提示改进 | EDM115, Mar 17 | LOW | LOW — 仅 UI 文本 |

---

## 反模式：避免的做法

### 反模式 1: 盲目 `git merge`
**问题**: 会产生大量冲突，且自动合并可能在保护文件中引入上游代码
**正确做法**: 逐文件手动审查和选择性合并

### 反模式 2: 一次性合并所有文件
**问题**: 如果中间出错，无法定位是哪个文件引入的问题
**正确做法**: 按 Phase 分批处理，每批后验证

### 反模式 3: 忘记检查 import 链
**问题**: 合入新文件后，该文件的 import 可能指向 BMC 已修改的模块
**正确做法**: 每次引入新文件后立即 `pnpm type-check`

### 反模式 4: 仅依赖自动化测试
**问题**: 测试可能不覆盖 BMC 定制功能（Market 安装、COS 解析）
**正确做法**: 自动化测试 + 手动冒烟测试 BMC 独有功能

---

## Roadmap 建议的阶段结构

基于依赖关系和风险分析，建议将同步拆分为以下里程碑阶段:

1. **Phase 1-2: 准备和分析** — 添加 remote，生成差异报告，完成文件分类
2. **Phase 3: 安全文件同步** — 新增文件和无定制文件，低风险快速推进
3. **Phase 4: Agent 和类型扩展** — 合入新 agent，中低风险
4. **Phase 5: 核心逻辑合并** — 最高风险阶段，需逐文件处理
5. **Phase 6: Provider 架构决策** — 决定是否对齐 registry 模式
6. **Phase 7-8: 配置更新和全面验证** — 收尾验证

**阶段排序理由**:
- 先处理安全文件建立信心和基线
- Agent/类型是独立增量，不影响核心逻辑
- 核心逻辑放在中后段，此时对上游变更已有充分理解
- 验证放在最后，确保所有变更协同工作

---

## 置信度评估

| 区域 | 置信度 | 说明 |
|------|--------|------|
| 文件分类 | HIGH | 基于对两边代码库的完整审查 |
| 合并策略 | HIGH | BMC 优先是明确的策略，文件分类清晰 |
| 工作量估算 | MEDIUM | 取决于上游实际 diff 大小，Phase 2 后可校准 |
| Provider 架构决策 | MEDIUM | 需要看 upstream add.ts 对 registry 的实际依赖程度 |

## 来源

- BMC fork 本地代码库完整审查
- GitHub API: vercel-labs/skills 仓库结构和最近 20 个 commit
- upstream 关键文件原始内容对比（source-parser.ts, find.ts, telemetry.ts, package.json, providers/）

---

*架构研究: 2026-04-01*
