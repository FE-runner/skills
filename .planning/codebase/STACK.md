# 技术栈

**分析日期:** 2026-04-01

## 语言

**主要:**
- TypeScript 5.9.3 - 全量代码库和构建脚本
- JavaScript (ESM) - 包装脚本和输出文件

**支持:**
- Node.js 18+ - 运行时要求（`engines.node >= 18`）

## 运行环境

**环境:**
- Node.js 18+ (ESM modules)

**包管理器:**
- pnpm 10.17.1
- Lockfile: `pnpm-lock.yaml` (present)

## 框架和工具

**构建:**
- obuild 0.4.22 - ESM bundler for CLI (`src/cli.ts` → `dist/cli.mjs`)
- Configuration: `build.config.mjs`

**CLI 框架:**
- @clack/prompts 0.11.0 - Interactive terminal prompts (custom search, multiselect)
- picocolors 1.1.1 - Terminal color formatting (ANSI escape codes)

**工具类:**
- simple-git 3.27.0 - Git clone/pull operations (`src/git.ts`)
- gray-matter 4.0.3 - YAML frontmatter parsing from SKILL.md files (`src/providers/wellknown.ts`, `src/providers/cos.ts`)
- xdg-basedir 5.1.0 - Cross-platform home directory detection
- crypto (Node.js native) - SHA-256 hashing for skill folder detection (`src/skill-lock.ts`)

**测试:**
- vitest 4.0.17 - Test runner
- Configuration: Inferred from `package.json` (no config file present)
- Test command: `pnpm test`

**代码质量:**
- TypeScript 5.9.3 - Type checking (`pnpm type-check`)
- Prettier 3.8.1 - Code formatting (`pnpm format`)
- husky 9.1.7 - Git hooks
- lint-staged 16.2.7 - Pre-commit linting (`.prettierrc` formatting)
- Prettier config: `.prettierrc` (2-space tabs, 100 char line width, single quotes, trailing commas)

**开发依赖:**
- @types/node 22.10.0 - Node.js type definitions
- @types/bun latest - Bun compatibility (optional)

## 关键依赖

**核心依赖:**
- 所有依赖为 devDependencies（运行时无第三方依赖）
- CLI 输出通过 obuild 打包成单个可执行文件 `bin/cli.mjs`

**构建产物:**
- `dist/` - 编译输出
- `bin/cli.mjs` - 可执行入口点（NPM bin script）

## 配置

**环境变量:**
- `GITHUB_TOKEN` - GitHub API 认证（从环境或 `gh` CLI 读取，`src/skill-lock.ts`）
- `GH_TOKEN` - 替代 GitHub 令牌
- `DISABLE_TELEMETRY` - 禁用遥测（当前遥测默认关闭）
- `CI` 环境变量用于检测 CI 环境

**TypeScript 配置:** `tsconfig.json`
- 目标: ESNext
- Module resolution: bundler
- 严格模式启用
- noEmit: true（类型检查只）

**Prettier 配置:** `.prettierrc`
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

**构建配置:** `build.config.mjs`
- Entry: `src/cli.ts`
- Type: bundle
- Output: `dist/cli.mjs`

## 平台要求

**开发环境:**
- Node.js 18 或更高版本
- pnpm 10.17.1（工作区管理）
- Git（用于技能克隆）
- 可选: `gh` CLI（GitHub 认证）

**生产环境:**
- Node.js 18+
- NPM registry（通过 `npm install -g blueai-skills` 安装）
- 互联网连接（用于 GitHub/COS/Market API 调用）
- Git 和 GitHub 配置（技能克隆）

## 二进制输出

**NPM 包:**
- 包名: `blueai-skills`
- 版本: 1.4.3-bmc1.1.12
- Bin 命令: `blueai-skills`
- 发布文件: `dist/`, `bin/`, `README.md`, `ThirdPartyNoticeText.txt`

---

*栈分析: 2026-04-01*
