# bmc-skills CLI

`bmc-skills` 是 `vercel-labs/skills` 的**定制化 fork**，经改造后供内部使用。

- **包名**: `bmc-skills`（上游: `skills`）
- **版本**: 1.4.3-bmc1.1.x
- **构建工具**: obuild
- **包管理器**: pnpm

## BMC Fork 定制内容

| 领域 | 上游 | BMC Fork |
|------|------|----------|
| 包名 | `skills` | `bmc-skills` |
| Market API | `https://skills.sh` | `http://localhost:3000` |
| 遥测 | 默认开启 | 默认**关闭** |
| COS Provider | 无 | 新增（`providers/cos.ts`） |
| Market Provider | 无 | 新增（`providers/market.ts`） |

**重要**: 从上游同步代码时，务必保留 `branding.ts`、`providers/cos.ts`、`providers/market.ts` 和 `telemetry.ts` 中的定制内容。

## 命令

| 命令 | 说明 |
|------|------|
| `skills` | 显示 banner 和可用命令 |
| `skills add <pkg>` | 从 Git 仓库、URL 或本地路径安装技能 |
| `skills experimental_install` | 从 skills-lock.json 恢复技能 |
| `skills experimental_sync` | 从 node_modules 同步技能到 agent 目录 |
| `skills list` | 列出已安装的技能（别名: `ls`） |
| `skills check` | 检查可用的技能更新 |
| `skills update` | 将所有技能更新到最新版本 |
| `skills init [name]` | 创建新的 SKILL.md 模板 |

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

| 功能 | 实现 |
|------|------|
| `skills add` | `src/add.ts` - 完整实现 |
| `skills experimental_sync` | `src/sync.ts` - 扫描 node_modules |
| `skills check` | `POST /check-updates` API |
| `skills update` | `POST /check-updates` + 逐个重新安装 |

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

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/auth/feishu` | GET | 飞书 OAuth 登录跳转 |
| `/api/auth/feishu/callback` | GET | 飞书 OAuth 回调 |
| `/api/auth/logout` | POST | 登出 |
| `/api/auth/me` | GET | 获取当前用户信息 |
| `/api/skills` | GET | 获取技能列表（支持分页/筛选） |
| `/api/skills` | POST | 创建新技能 |
| `/api/skills/[id]` | GET/PUT/DELETE | 技能 CRUD |
| `/api/skills/[id]/publish` | POST | 提交技能审核 |
| `/api/skills/[id]/versions` | GET | 获取版本历史 |
| `/api/skills/[id]/files/[...path]` | GET | 获取技能文件内容 |
| `/api/reviews` | GET/POST | 审核列表 / 执行审核 |
| `/api/users` | GET | 用户列表 |

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

| 文件 | 说明 |
|------|------|
| `../skills-market/CLAUDE.md` | Market 项目完整架构文档 |
| `../skills-market/prisma/schema.prisma` | 数据库模型定义 |
| `../skills-market/lib/types.ts` | 前端共享类型（SkillListItem, SkillDetail 等） |
| `../skills-market/app/api/skills/route.ts` | 技能列表 API（GET/POST） |
| `../skills-market/app/api/skills/[id]/route.ts` | 技能详情 API（GET/PUT/DELETE） |
| `../skills-market/lib/cos.ts` | COS 文件存储逻辑 |
| `../skills-market/lib/validations/index.ts` | Zod 校验规则 |

### 共享概念对照

| 概念 | skills-market | skills-cli |
|------|--------------|------------|
| 技能数据结构 | Prisma Skill 模型 | `src/types.ts` Skill/RemoteSkill 接口 |
| 技能内容 | COS 存储 + fileTree JSON | SKILL.md 文件 + 附属文件 |
| Agent 类型 | 无（平台无关） | `src/types.ts` AgentType |
| 搜索 | `/api/search` 或 `/api/skills` | `src/find.ts` 调用 SEARCH_API_BASE |
| 品牌/URL | 部署在 skills.sh | `src/branding.ts` 中 SKILLS_SITE |

### 开发注意事项

1. **修改 find 命令时**: 如果变更搜索请求格式，需确认 market 的 `/api/search` 是否兼容
2. **修改 Skill/RemoteSkill 类型时**: 需检查 market 的 Prisma 模型和 `lib/types.ts` 是否需同步
3. **修改 branding.ts 中的 URL 时**: 确保 market 端的对应路由存在
4. **修改安装文件结构时**: market 端的技能文件存储格式（COS + fileTree）需保持一致
