# AGENTS.md

This file provides guidance to AI coding agents working on the `skills` CLI codebase.

## Project Overview

`skills` is the CLI for the open agent skills ecosystem.

## Commands

| Command                       | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `skills`                      | Show banner with available commands                 |
| `skills add <pkg>`            | Install skills from git repos, URLs, or local paths |
| `skills experimental_install` | Restore skills from skills-lock.json                |
| `skills experimental_sync`    | Sync skills from node_modules into agent dirs       |
| `skills list`                 | List installed skills (alias: `ls`)                 |
| `skills check`                | Check for available skill updates                   |
| `skills update`               | Update all skills to latest versions                |
| `skills init [name]`          | Create a new SKILL.md template                      |

Aliases: `skills a` works for `add`. `skills i`, `skills install` (no args) restore from `skills-lock.json`. `skills ls` works for `list`. `skills experimental_install` restores from `skills-lock.json`. `skills experimental_sync` crawls `node_modules` for skills.

## Architecture

```
src/
├── cli.ts           # Main entry point, command routing, init/check/update
├── cli.test.ts      # CLI tests
├── add.ts           # Core add command logic
├── add.test.ts      # Add command tests
├── list.ts          # List installed skills command
├── list.test.ts     # List command tests
├── agents.ts        # Agent definitions and detection
├── installer.ts     # Skill installation logic (symlink/copy) + listInstalledSkills
├── skills.ts        # Skill discovery and parsing
├── skill-lock.ts    # Global lock file management (~/.agents/.skill-lock.json)
├── local-lock.ts    # Local lock file management (skills-lock.json, checked in)
├── sync.ts          # Sync command - crawl node_modules for skills
├── source-parser.ts # Parse git URLs, GitHub shorthand, local paths
├── git.ts           # Git clone operations
├── telemetry.ts     # Anonymous usage tracking
├── types.ts         # TypeScript types
├── mintlify.ts      # Mintlify skill fetching (legacy)
├── providers/       # Remote skill providers (GitHub, HuggingFace, Mintlify)
│   ├── index.ts
│   ├── registry.ts
│   ├── types.ts
│   ├── huggingface.ts
│   └── mintlify.ts
├── init.test.ts     # Init command tests
└── test-utils.ts    # Test utilities

tests/
├── sanitize-name.test.ts     # Tests for sanitizeName (path traversal prevention)
├── skill-matching.test.ts    # Tests for filterSkills (multi-word skill name matching)
├── source-parser.test.ts     # Tests for URL/path parsing
├── installer-symlink.test.ts # Tests for symlink installation
├── list-installed.test.ts    # Tests for listing installed skills
├── skill-path.test.ts        # Tests for skill path handling
├── wellknown-provider.test.ts # Tests for well-known provider
└── dist.test.ts              # Tests for built distribution
```

## Update Checking System

### How `skills check` and `skills update` Work

1. Read `~/.agents/.skill-lock.json` for installed skills
2. For each skill, get `skillFolderHash` from lock file
3. POST to `https://add-skill.vercel.sh/check-updates` with:
   ```json
   {
     "skills": [{ "name": "...", "source": "...", "skillFolderHash": "..." }],
     "forceRefresh": true
   }
   ```
4. API fetches fresh content from GitHub, computes hash, compares
5. Returns list of skills with different hashes (updates available)

### Why `forceRefresh: true`?

Both `check` and `update` always send `forceRefresh: true`. This ensures the API fetches fresh content from GitHub rather than using its Redis cache.

**Without forceRefresh:** Users saw phantom "updates available" due to stale cached hashes. The fix was to always fetch fresh.

**Tradeoff:** Slightly slower (GitHub API call per skill), but always accurate.

### Lock File Compatibility

The lock file format is v3. Key field: `skillFolderHash` (GitHub tree SHA for the skill folder).

If reading an older lock file version, it's wiped. Users must reinstall skills to populate the new format.

## Key Integration Points

| Feature                    | Implementation                              |
| -------------------------- | ------------------------------------------- |
| `skills add`               | `src/add.ts` - full implementation          |
| `skills experimental_sync` | `src/sync.ts` - crawl node_modules          |
| `skills check`             | `POST /check-updates` API                   |
| `skills update`            | `POST /check-updates` + reinstall per skill |

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Test locally
pnpm dev add vercel-labs/agent-skills --list
pnpm dev experimental_sync
pnpm dev check
pnpm dev update
pnpm dev init my-skill

# Run all tests
pnpm test

# Run specific test file(s)
pnpm test tests/sanitize-name.test.ts
pnpm test tests/skill-matching.test.ts tests/source-parser.test.ts

# Type check
pnpm type-check

# Format code
pnpm format
```

## Code Style

This project uses Prettier for code formatting. **Always run `pnpm format` before committing changes** to ensure consistent formatting.

```bash
# Format all files
pnpm format

# Check formatting without fixing
pnpm prettier --check .
```

CI will fail if code is not properly formatted.

## Publishing

```bash
# 1. Bump version in package.json
# 2. Build
pnpm build
# 3. Publish
npm publish
```

## Adding a New Agent

1. Add the agent definition to `src/agents.ts`
2. Run `pnpm run -C scripts validate-agents.ts` to validate
3. Run `pnpm run -C scripts sync-agents.ts` to update README.md

## 关联项目

本项目与 `../skills-market`（全栈 Web 平台）是上下游关系。

### 项目概述
- **路径**: `../skills-market`
- **用途**: agent skills 生态的全栈 Web 平台，提供技能发布、审核、管理和发现功能
- **技术栈**: Next.js 16 (App Router), React 19, Prisma 7 (MySQL), TypeScript, Tailwind CSS 4

### 交互方式
- CLI 的 `find` 命令通过 `GET /api/search?q=<query>&limit=10` 搜索 market 上的技能
- CLI 的 `add` 命令安装技能到本地 agent 目录
- CLI 的 `check`/`update` 命令通过 GitHub API 检查更新

### 关键对照

| 概念 | skills-market | skills-cli |
|------|--------------|------------|
| 技能数据结构 | `prisma/schema.prisma` Skill 模型 | `src/types.ts` Skill/RemoteSkill 接口 |
| 技能内容 | COS 存储 + fileTree JSON | SKILL.md 文件 + 附属文件 |
| Agent 类型 | 无（平台无关） | `src/types.ts` AgentType（40+ agent） |
| 搜索 API | `/api/search` 或 `/api/skills` | `src/find.ts` 调用 SEARCH_API_BASE |
| 品牌/URL | 部署在 skills.sh | `src/branding.ts` 中 SKILLS_SITE |

### 开发注意事项
1. **修改 find 命令**: 如果变更搜索请求格式，需确认 market 的 `/api/search` 是否兼容
2. **修改 Skill/RemoteSkill 类型**: 需检查 market 的 Prisma 模型和 `lib/types.ts` 是否需同步
3. **修改 branding.ts 中的 URL**: 确保 market 端的对应路由存在

### Market 关键文件（需要了解时可读取）
- `../skills-market/AGENTS.md` — Market 完整架构文档
- `../skills-market/prisma/schema.prisma` — 数据库模型定义
- `../skills-market/lib/types.ts` — 前端共享类型
- `../skills-market/app/api/skills/route.ts` — 技能列表 API
- `../skills-market/lib/cos.ts` — COS 文件存储逻辑