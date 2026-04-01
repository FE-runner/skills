# blueai-skills CLI

`blueai-skills` 是 `vercel-labs/skills` 的**定制化 fork**，经改造后供内部使用。

- **包名**: `blueai-skills`（上游: `skills`）
- **版本**: 1.4.3-bmc1.1.x
- **构建工具**: obuild
- **包管理器**: pnpm

## BMC Fork 定制内容

| 领域            | 上游                | BMC Fork                      |
| --------------- | ------------------- | ----------------------------- |
| 包名            | `skills`            | `blueai-skills`               |
| Market API      | `https://skills.sh` | `http://localhost:3000`       |
| 遥测            | 默认开启            | 默认**关闭**                  |
| COS Provider    | 无                  | 新增（`providers/cos.ts`）    |
| Market Provider | 无                  | 新增（`providers/market.ts`） |

**重要**: 从上游同步代码时，务必保留 `branding.ts`、`providers/cos.ts`、`providers/market.ts` 和 `telemetry.ts` 中的定制内容。

## 命令

| 命令                          | 说明                                  |
| ----------------------------- | ------------------------------------- |
| `skills`                      | 显示 banner 和可用命令                |
| `skills add <pkg>`            | 从 Git 仓库、URL 或本地路径安装技能   |
| `skills experimental_install` | 从 skills-lock.json 恢复技能          |
| `skills experimental_sync`    | 从 node_modules 同步技能到 agent 目录 |
| `skills list`                 | 列出已安装的技能（别名: `ls`）        |
| `skills check`                | 检查可用的技能更新                    |
| `skills update`               | 将所有技能更新到最新版本              |
| `skills init [name]`          | 创建新的 SKILL.md 模板                |

别名: `skills a` 等同于 `add`。`skills i`、`skills install`（无参数）从 `skills-lock.json` 恢复。`skills ls` 等同于 `list`。`skills experimental_install` 从 `skills-lock.json` 恢复。`skills experimental_sync` 扫描 `node_modules` 中的技能。

## 架构

```
src/
├── cli.ts           # 主入口，命令路由，init/check/update
├── cli.test.ts      # CLI 测试
├── add.ts           # 核心 add 命令逻辑
├── add.test.ts      # Add 命令测试
├── list.ts          # 列出已安装技能命令
├── list.test.ts     # List 命令测试
├── agents.ts        # Agent 定义和检测
├── installer.ts     # 技能安装逻辑（symlink/copy）+ listInstalledSkills
├── skills.ts        # 技能发现和解析
├── skill-lock.ts    # 全局 lock 文件管理（~/.agents/.skill-lock.json）
├── local-lock.ts    # 本地 lock 文件管理（skills-lock.json，需提交到版本控制）
├── sync.ts          # Sync 命令 - 扫描 node_modules 中的技能
├── source-parser.ts # 解析 Git URL、GitHub 简写、本地路径
├── git.ts           # Git clone 操作
├── telemetry.ts     # 匿名使用统计
├── types.ts         # TypeScript 类型定义
├── mintlify.ts      # Mintlify 技能获取（旧版）
├── providers/       # 远程技能提供者（GitHub, HuggingFace, Mintlify）
│   ├── index.ts
│   ├── registry.ts
│   ├── types.ts
│   ├── huggingface.ts
│   └── mintlify.ts
├── init.test.ts     # Init 命令测试
└── test-utils.ts    # 测试工具

tests/
├── sanitize-name.test.ts     # sanitizeName 测试（路径遍历防护）
├── skill-matching.test.ts    # filterSkills 测试（多词技能名匹配）
├── source-parser.test.ts     # URL/路径解析测试
├── installer-symlink.test.ts # symlink 安装测试
├── list-installed.test.ts    # 列出已安装技能测试
├── skill-path.test.ts        # 技能路径处理测试
├── wellknown-provider.test.ts # well-known provider 测试
└── dist.test.ts              # 构建产物测试
```

## 更新检查系统

### `skills check` 和 `skills update` 的工作原理

1. 读取 `~/.agents/.skill-lock.json` 获取已安装技能
2. 对于每个技能，从 lock 文件获取 `skillFolderHash`
3. POST 请求到 `https://add-skill.vercel.sh/check-updates`，请求体:
   ```json
   {
     "skills": [{ "name": "...", "source": "...", "skillFolderHash": "..." }],
     "forceRefresh": true
   }
   ```
4. API 从 GitHub 获取最新内容，计算哈希值，进行比较
5. 返回哈希值不同的技能列表（即有可用更新）

### 为什么总是使用 `forceRefresh: true`？

`check` 和 `update` 命令始终发送 `forceRefresh: true`。这确保 API 从 GitHub 获取最新内容，而非使用 Redis 缓存。

**不使用 forceRefresh 的问题**: 用户曾因过期的缓存哈希值看到虚假的"有可用更新"提示。修复方案是始终获取最新数据。

**代价**: 稍慢（每个技能需要一次 GitHub API 调用），但结果始终准确。

### Lock 文件兼容性

Lock 文件格式为 v3。关键字段: `skillFolderHash`（技能文件夹的 GitHub tree SHA）。

如果读取到旧版本的 lock 文件，会被清空。用户需要重新安装技能以填充新格式。

## 关键集成点

| 功能                       | 实现                                 |
| -------------------------- | ------------------------------------ |
| `skills add`               | `src/add.ts` - 完整实现              |
| `skills experimental_sync` | `src/sync.ts` - 扫描 node_modules    |
| `skills check`             | `POST /check-updates` API            |
| `skills update`            | `POST /check-updates` + 逐个重新安装 |

## 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 本地测试
pnpm dev add vercel-labs/agent-skills --list
pnpm dev experimental_sync
pnpm dev check
pnpm dev update
pnpm dev init my-skill

# 运行所有测试
pnpm test

# 运行指定测试文件
pnpm test tests/sanitize-name.test.ts
pnpm test tests/skill-matching.test.ts tests/source-parser.test.ts

# 类型检查
pnpm type-check

# 格式化代码
pnpm format
```

## 代码风格

本项目使用 Prettier 进行代码格式化。**提交代码前务必运行 `pnpm format`** 以确保格式一致。

```bash
# 格式化所有文件
pnpm format

# 仅检查格式（不自动修复）
pnpm prettier --check .
```

CI 在代码格式不规范时会失败。

## 发布

```bash
# 1. 修改 package.json 中的版本号
# 2. 构建
pnpm build
# 3. 发布
npm publish
```

## 添加新 Agent

1. 在 `src/agents.ts` 中添加 agent 定义
2. 运行 `pnpm run -C scripts validate-agents.ts` 进行验证
3. 运行 `pnpm run -C scripts sync-agents.ts` 更新 README.md

## 关联项目：skills-market (全栈 Web 平台)

本项目 `skills-cli` 与 `../skills-market` 是上下游关系。

### 项目概述

- **路径**: `../skills-market`
- **用途**: agent skills 生态的全栈 Web 平台，提供技能发布、审核、管理和发现功能
- **技术栈**: Next.js 16 (App Router), React 19, Prisma 7 (MySQL), TypeScript, Tailwind CSS 4
- **仓库**: http://git.domob-inc.cn/bmc/skills/skills-market.git

### 上下游关系

```
skills-market (全栈 Web 平台)        skills-cli (npm CLI 工具)
┌─────────────────────────┐          ┌──────────────────────────┐
│ - 技能发布/审核/管理      │          │ - 技能安装/卸载/更新       │
│ - 用户认证/权限管理       │  ◄────►  │ - 技能搜索 (find 命令)    │
│ - API: /api/skills/*    │          │ - 多 agent 支持            │
│ - API: /api/reviews/*   │          │ - skills-lock.json 管理   │
│ - COS 文件存储           │          │ - 检查更新/同步            │
└─────────────────────────┘          └──────────────────────────┘
```

### Market 平台 API 路由

| 路由                               | 方法           | 说明                          |
| ---------------------------------- | -------------- | ----------------------------- |
| `/api/auth/feishu`                 | GET            | 飞书 OAuth 登录跳转           |
| `/api/auth/feishu/callback`        | GET            | 飞书 OAuth 回调               |
| `/api/auth/logout`                 | POST           | 登出                          |
| `/api/auth/me`                     | GET            | 获取当前用户信息              |
| `/api/skills`                      | GET            | 获取技能列表（支持分页/筛选） |
| `/api/skills`                      | POST           | 创建新技能                    |
| `/api/skills/[id]`                 | GET/PUT/DELETE | 技能 CRUD                     |
| `/api/skills/[id]/publish`         | POST           | 提交技能审核                  |
| `/api/skills/[id]/versions`        | GET            | 获取版本历史                  |
| `/api/skills/[id]/files/[...path]` | GET            | 获取技能文件内容              |
| `/api/reviews`                     | GET/POST       | 审核列表 / 执行审核           |
| `/api/users`                       | GET            | 用户列表                      |

#### CLI 直接调用的 API

- **搜索 API**: `GET /api/search?q=<query>&limit=10`
  - 返回: `{ skills: [{ id, name, installs, source }] }`
  - CLI 中在 `src/find.ts` 的 `searchSkillsAPI()` 函数调用
  - API 基地址: `SEARCH_API_BASE`（默认 `https://skills.sh`）

### Market 数据模型

核心模型在 `../skills-market/prisma/schema.prisma`：

```
User     → id, email, name, avatar, feishuOpenId, role(ADMIN/REVIEWER/USER), status(ACTIVE/DISABLED)
Skill    → id, name, category, visibility(PRIVATE/PUBLIC), status(PENDING/APPROVED/REJECTED), version, filePath, fileTree, changelog, currentVersion
SkillVersion → id, skillId, version, filePath, fileTree, changelog
Review   → id, skillId, reviewerId, action(APPROVE/REJECT), comment
```

### Market 关键文件（需要了解时可读取）

| 文件                                            | 说明                                          |
| ----------------------------------------------- | --------------------------------------------- |
| `../skills-market/CLAUDE.md`                    | Market 项目完整架构文档                       |
| `../skills-market/prisma/schema.prisma`         | 数据库模型定义                                |
| `../skills-market/lib/types.ts`                 | 前端共享类型（SkillListItem, SkillDetail 等） |
| `../skills-market/app/api/skills/route.ts`      | 技能列表 API（GET/POST）                      |
| `../skills-market/app/api/skills/[id]/route.ts` | 技能详情 API（GET/PUT/DELETE）                |
| `../skills-market/lib/cos.ts`                   | COS 文件存储逻辑                              |
| `../skills-market/lib/validations/index.ts`     | Zod 校验规则                                  |

### 共享概念对照

| 概念         | skills-market                  | skills-cli                            |
| ------------ | ------------------------------ | ------------------------------------- |
| 技能数据结构 | Prisma Skill 模型              | `src/types.ts` Skill/RemoteSkill 接口 |
| 技能内容     | COS 存储 + fileTree JSON       | SKILL.md 文件 + 附属文件              |
| Agent 类型   | 无（平台无关）                 | `src/types.ts` AgentType              |
| 搜索         | `/api/search` 或 `/api/skills` | `src/find.ts` 调用 SEARCH_API_BASE    |
| 品牌/URL     | 部署在 skills.sh               | `src/branding.ts` 中 SKILLS_SITE      |

### 开发注意事项

1. **修改 find 命令时**: 如果变更搜索请求格式，需确认 market 的 `/api/search` 是否兼容
2. **修改 Skill/RemoteSkill 类型时**: 需检查 market 的 Prisma 模型和 `lib/types.ts` 是否需同步
3. **修改 branding.ts 中的 URL 时**: 确保 market 端的对应路由存在
4. **修改安装文件结构时**: market 端的技能文件存储格式（COS + fileTree）需保持一致

<!-- GSD:project-start source:PROJECT.md -->
## Project

**blueai-skills 上游同步**

将 vercel-labs/skills 上游仓库的最新变更同步到 BMC fork（blueai-skills CLI），分析新功能和改动，选择性合并有价值的更新，同时保护 BMC 定制内容。

**Core Value:** 安全地引入上游新功能和 bug 修复，不破坏 BMC 定制化的任何内容。

### Constraints

- **定制保护**: BMC 定制文件必须完整保留
- **版本兼容**: 合并后版本号继续使用 BMC 版本格式 (x.y.z-bmcA.B.C)
- **构建通过**: 合并后必须 `pnpm build` 和 `pnpm test` 通过
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## 语言
- TypeScript 5.9.3 - 全量代码库和构建脚本
- JavaScript (ESM) - 包装脚本和输出文件
- Node.js 18+ - 运行时要求（`engines.node >= 18`）
## 运行环境
- Node.js 18+ (ESM modules)
- pnpm 10.17.1
- Lockfile: `pnpm-lock.yaml` (present)
## 框架和工具
- obuild 0.4.22 - ESM bundler for CLI (`src/cli.ts` → `dist/cli.mjs`)
- Configuration: `build.config.mjs`
- @clack/prompts 0.11.0 - Interactive terminal prompts (custom search, multiselect)
- picocolors 1.1.1 - Terminal color formatting (ANSI escape codes)
- simple-git 3.27.0 - Git clone/pull operations (`src/git.ts`)
- gray-matter 4.0.3 - YAML frontmatter parsing from SKILL.md files (`src/providers/wellknown.ts`, `src/providers/cos.ts`)
- xdg-basedir 5.1.0 - Cross-platform home directory detection
- crypto (Node.js native) - SHA-256 hashing for skill folder detection (`src/skill-lock.ts`)
- vitest 4.0.17 - Test runner
- Configuration: Inferred from `package.json` (no config file present)
- Test command: `pnpm test`
- TypeScript 5.9.3 - Type checking (`pnpm type-check`)
- Prettier 3.8.1 - Code formatting (`pnpm format`)
- husky 9.1.7 - Git hooks
- lint-staged 16.2.7 - Pre-commit linting (`.prettierrc` formatting)
- Prettier config: `.prettierrc` (2-space tabs, 100 char line width, single quotes, trailing commas)
- @types/node 22.10.0 - Node.js type definitions
- @types/bun latest - Bun compatibility (optional)
## 关键依赖
- 所有依赖为 devDependencies（运行时无第三方依赖）
- CLI 输出通过 obuild 打包成单个可执行文件 `bin/cli.mjs`
- `dist/` - 编译输出
- `bin/cli.mjs` - 可执行入口点（NPM bin script）
## 配置
- `GITHUB_TOKEN` - GitHub API 认证（从环境或 `gh` CLI 读取，`src/skill-lock.ts`）
- `GH_TOKEN` - 替代 GitHub 令牌
- `DISABLE_TELEMETRY` - 禁用遥测（当前遥测默认关闭）
- `CI` 环境变量用于检测 CI 环境
- 目标: ESNext
- Module resolution: bundler
- 严格模式启用
- noEmit: true（类型检查只）
- Entry: `src/cli.ts`
- Type: bundle
- Output: `dist/cli.mjs`
## 平台要求
- Node.js 18 或更高版本
- pnpm 10.17.1（工作区管理）
- Git（用于技能克隆）
- 可选: `gh` CLI（GitHub 认证）
- Node.js 18+
- NPM registry（通过 `npm install -g blueai-skills` 安装）
- 互联网连接（用于 GitHub/COS/Market API 调用）
- Git 和 GitHub 配置（技能克隆）
## 二进制输出
- 包名: `blueai-skills`
- 版本: 1.4.3-bmc1.1.12
- Bin 命令: `blueai-skills`
- 发布文件: `dist/`, `bin/`, `README.md`, `ThirdPartyNoticeText.txt`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## 命名规范
### 文件
- **源文件**: 使用 kebab-case + `.ts` 扩展名
- **目录**: 使用 kebab-case（如需要）或特定功能名称
### 函数
- **camelCase**: 所有函数使用 camelCase
- **谓词函数**: 使用 `is/has/should` 前缀表示返回布尔值
### 变量
- **常量**: 使用 UPPER_SNAKE_CASE
- **常规变量**: 使用 camelCase
- **布尔变量**: 使用 `is/has/should` 前缀
### 类型
- **类型定义**: 使用 PascalCase（通常在 `types.ts` 或对应文件中定义）
- **接口**: 使用 PascalCase，通常带 `I` 前缀或直接 PascalCase
- **联合类型**: 使用字符串字面量或类型别名
## 代码风格
### 格式化工具
- **Prettier**: 3.8.1 版本
- **配置**: `.prettierrc`
- **使用**: 提交代码前必须运行 `pnpm format`
### TypeScript 配置
- **编译选项**（`tsconfig.json`）:
- **类型安全**:
## 导入组织
### 导入顺序
### 路径别名
- 不使用路径别名（项目使用相对路径）
- 使用 `.ts` 扩展名导入 TypeScript 文件
- 例如: `import { parseSource } from './source-parser.ts'`（不是 `.js`）
## 错误处理
### 自定义错误类
### 异常捕获模式
- **try-catch 块**: 捕获具体错误类型
- **安静失败**: 某些操作捕获异常后返回默认值
- **错误处理特异化**: 区分错误类型
## 日志和输出
### 颜色和格式化
### 输出模式
- **标准消息**: 使用 `${TEXT}...${RESET}`
- **辅助文本**: 使用 `${DIM}...${RESET}`
- **警告**: 使用 `${YELLOW}...${RESET}`
- **logo**: 使用渐进灰色数组
### 日志级别
- **跟踪**: `track()` 函数用于遥测数据
## 注释风格
### JSDoc 注释
### 行内注释
### 部分注释
## 函数设计
### 尺寸
- **目标**: 大多数函数应该 < 50 行
- **意图**: 每个函数应该有单一、清晰的责任
- **复杂函数**: 长于 100 行的函数应该分解为更小的辅助函数
### 参数
- **选项对象**: 使用对象参数处理多个相关参数
- **避免布尔参数**: 尽量使用选项对象
### 返回值
- **接口定义**: 返回类型必须定义接口
- **可选字段**: 使用 `?` 表示可选属性
- **联合返回**: 使用联合类型或返回对象
## 模块设计
### 导出
- **单一默认导出**: 避免使用，优先使用命名导出
- **导出接口**: 导出公共类型定义
- **导出常量**: 集中在顶部
### 私有函数
- 使用 `function` 关键字前缀（不需要 `export`）
- 或使用清晰的名称指示意图
## ESM 模块
- **模块类型**: `"type": "module"` 在 `package.json` 中
- **导入扩展名**: 必须包含 `.ts` 扩展名
- **获取元数据**:
## 异步编程
### Promise 使用
- **优先 async/await**: 避免原始 Promise 链
- **并行执行**: 使用 `Promise.all()`
### 超时管理
- 使用 `setTimeout` 处理超时（见 `src/git.ts`）
- 明确记录超时时间
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Provider pattern for multi-source skill resolution (GitHub, Market, COS, well-known)
- Agent discovery and adaptive skill installation (symlink/copy)
- Dual lock system: global (`~/.agents/.skill-lock.json`) for installed skills, local (`skills-lock.json`) for committed skills
- Security-first with audit data display and sanitized file paths
- Cross-platform installation with universal agent concept
## Layers
- Purpose: Command routing, user I/O, banner/help rendering
- Location: `src/cli.ts`
- Contains: Main command dispatcher, help text, banner display
- Depends on: All command modules
- Used by: Entry point, shell execution
- Purpose: Implement individual CLI commands
- Location: `src/add.ts`, `src/list.ts`, `src/remove.ts`, `src/find.ts`, `src/install.ts`, `src/sync.ts`
- Contains: Command-specific logic, user prompts, validation
- Depends on: Installer, Provider, Lock files, Agents
- Used by: CLI dispatcher
- Purpose: Find and parse skills from various sources
- Location: `src/skills.ts`, `src/source-parser.ts`, `src/providers/`
- Contains: Skill discovery from directories, source URL parsing, provider matching
- Depends on: Types, Constants
- Used by: Add command, Find command
- Purpose: Abstract skill fetching from different hosts
- Location: `src/providers/index.ts`, `src/providers/types.ts`, `src/providers/wellknown.ts`, `src/providers/cos.ts`, `src/providers/market.ts`
- Contains: `HostProvider` interface, concrete implementations (WellKnown, COS, Market)
- Depends on: Source parser, Telemetry
- Used by: Add command, Discovery
- Purpose: Physical skill installation to agent directories
- Location: `src/installer.ts`, `src/git.ts`, `src/plugin-manifest.ts`
- Contains: Symlink/copy logic, security validation, path resolution, Git cloning
- Depends on: Agents, Types, Constants
- Used by: Add command, Sync command, Install-from-lock
- Purpose: Define agents and their skill locations
- Location: `src/agents.ts`, `src/constants.ts`
- Contains: AgentConfig for 40+ agent types (claude-code, cursor, cline, etc.), platform-specific paths
- Depends on: Types
- Used by: Installer, List command
- Purpose: Track installed skills and enable updates/recovery
- Location: `src/skill-lock.ts` (global), `src/local-lock.ts` (project-scoped)
- Contains: Lock file read/write, hash computation, GitHub hash fetching
- Depends on: Git operations, Types
- Used by: Add command, Check/Update commands, List command
- Purpose: Cross-cutting concerns
- Location: `src/branding.ts`, `src/telemetry.ts`, `src/prompts/search-multiselect.ts`, `src/constants.ts`
- Contains: Branded URLs, telemetry tracking, custom prompts, shared constants
- Depends on: Types
## Data Flow
```
```
## Key Abstractions
- Purpose: Normalized representation of where a skill comes from
- Examples: `src/types.ts` lines 66-82
- Pattern: Discriminated union via `type` field ('github' | 'gitlab' | 'git' | 'local' | 'well-known' | 'cos' | 'market')
- Supports: GitHub URLs, owner/repo shorthand, local paths, well-known registry, Market platform, COS storage
- Purpose: Abstract interface for fetching skills from remote hosts
- Examples: `WellKnownProvider` (mintlify registry), `CosProvider` (Tencent COS), `MarketProvider` (internal platform)
- Pattern: Concrete implementations define `match()`, `fetchSkill()`, `toRawUrl()`, `getSourceIdentifier()`
- Used by: Add command to resolve skills without hardcoding host logic
- Purpose: Represent a skill with metadata and file contents
- Examples: `src/types.ts` lines 44-104
- Pattern: `Skill` (local filesystem), `RemoteSkill` (fetched from remote host)
- Contains: name, description, path/content, metadata from frontmatter
- Purpose: Define where an agent stores skills and how to detect it
- Examples: `src/agents.ts` lines 29-300+
- Pattern: Each agent has skillsDir (project), globalSkillsDir (user-level), detectInstalled() check
- Used by: Installer to choose symlink/copy targets
- Purpose: Strategy for putting skills where agents can find them
- Examples: `'symlink'` (default, saves space) or `'copy'` (for Windows/sandboxed agents)
- Pattern: Symlink attempted first, falls back to copy on Windows or if symlink fails
## Entry Points
- Location: `src/cli.ts` line 629, function `main()`
- Triggers: `blueai-skills <command> [args]` shell invocation
- Responsibilities: Parse command, route to handler, show banner/help
- Location: `bin/cli.mjs` (generated by obuild from `src/cli.ts`)
- Triggers: `npm install -g blueai-skills` installs to PATH
- Responsibilities: Shebang + require/import of compiled CLI
- Location: `src/add.ts` line 157+, function `runAdd(source, options)`
- Triggered by: `skills add <package> [options]`
- Responsibilities: Parse source, detect agents, fetch skills, prompt user, install
- Location: `src/find.ts` line 220+, function `runFind(args)`
- Triggered by: `skills find [query]`
- Responsibilities: Search API, interactive picker, install selected
- Location: `src/cli.ts` lines 690-694 (check/update)
- Functions: `runCheck()`, `runUpdate()`
- Responsibilities: Read locks, fetch updates, display results
## Error Handling
- **Symlink fallback** (`src/installer.ts` lines 149-240): If symlink fails (Windows, permissions), automatically try copy mode
- **Git clone errors** (`src/git.ts`): Wrap git errors in `GitCloneError`, cleanup temp directories
- **Lock file corruption** (`src/skill-lock.ts` lines 76-98): Return empty lock if parse/version fails, avoid crashing
- **Provider mismatches** (`src/providers/index.ts`): If URL doesn't match any provider, default to GitHub
- **Audit data missing** (`src/add.ts` lines 109-151): Gracefully degrade if security audit unavailable, show `--` placeholders
- **Path traversal** (`src/installer.ts` lines 45-60): `sanitizeName()` removes `../`, leading dots, special chars before filesystem operations
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
