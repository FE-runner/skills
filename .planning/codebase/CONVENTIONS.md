# 代码规范

**分析日期:** 2026-04-01

## 命名规范

### 文件

- **源文件**: 使用 kebab-case + `.ts` 扩展名
  - 例如: `source-parser.ts`, `skill-lock.ts`, `local-lock.ts`
  - 测试文件: 使用 `.test.ts` 或 `.spec.ts` 后缀
  - 例如: `add.test.ts`, `cli.test.ts`, `sanitize-name.test.ts`

- **目录**: 使用 kebab-case（如需要）或特定功能名称
  - 例如: `providers/`, `scripts/`, `tests/`

### 函数

- **camelCase**: 所有函数使用 camelCase
  - 导出函数: `parseSkillMd()`, `discoverSkills()`, `sanitizeName()`
  - 私有函数: `hasSkillMd()`, `findSkillDirs()`, `isPathSafe()`
  - 异步函数: `async function cloneRepo()`, `async function readLocalLock()`

- **谓词函数**: 使用 `is/has/should` 前缀表示返回布尔值
  - `isLocalPath()`, `hasSkillMd()`, `shouldInstallInternalSkills()`
  - `isPathSafe()`, `isUniversalAgent()`, `isSourcePrivate()`

### 变量

- **常量**: 使用 UPPER_SNAKE_CASE
  - 源文件中: `SKIP_DIRS`, `CLONE_TIMEOUT_MS`, `AGENTS_DIR`, `SKILLS_SUBDIR`
  - ANSI 颜色代码: `RESET`, `BOLD`, `DIM`, `TEXT`, `CYAN`, `YELLOW`, `MAGENTA`
  - 见文件: `src/cli.ts`, `src/constants.ts`, `src/list.ts`

- **常规变量**: 使用 camelCase
  - `let tempDir`, `let results`, `let selectedIndex`, `let query`

- **布尔变量**: 使用 `is/has/should` 前缀
  - `let isGlobal`, `let hasSkill`, `let shouldInstall`

### 类型

- **类型定义**: 使用 PascalCase（通常在 `types.ts` 或对应文件中定义）
  - `AgentType`, `AgentConfig`, `ParsedSource`, `Skill`, `RemoteSkill`
  - `InstallResult`, `LocalSkillLockEntry`, `LocalSkillLockFile`
  - `SkillLockEntry`, `SkillLockFile`

- **接口**: 使用 PascalCase，通常带 `I` 前缀或直接 PascalCase
  - `interface Skill { ... }`
  - `interface AgentConfig { ... }`
  - `interface ParsedSource { ... }`

- **联合类型**: 使用字符串字面量或类型别名
  - `type AgentType = 'amp' | 'claude-code' | 'cursor' | ...` （见 `src/types.ts`）
  - `type InstallMode = 'symlink' | 'copy'`

## 代码风格

### 格式化工具

- **Prettier**: 3.8.1 版本
- **配置**: `.prettierrc`
  ```json
  {
    "semi": true,
    "singleQuote": true,
    "trailingComma": "es5",
    "printWidth": 100,
    "tabWidth": 2
  }
  ```
  - 必须使用单引号（`'...'`）
  - 最大宽度 100 字符
  - 尾随逗号仅在 ES5（对象/数组）中使用
  - 缩进 2 个空格

- **使用**: 提交代码前必须运行 `pnpm format`
  - 检查格式: `pnpm format:check`

### TypeScript 配置

- **编译选项**（`tsconfig.json`）:
  - `target: ESNext` - 使用最新 ECMAScript 特性
  - `module: ESNext` - 输出 ES 模块
  - `strict: true` - 启用所有严格检查
  - `moduleResolution: bundler` - 使用 bundler 模式
  - `skipLibCheck: true` - 跳过库类型检查
  - `noUncheckedIndexedAccess: true` - 对索引访问进行类型检查

- **类型安全**:
  - 所有参数和返回值需要类型注解
  - 避免使用 `any` 类型
  - 使用联合类型表示多个可能值

## 导入组织

### 导入顺序

1. **Node.js 内置模块**: `fs`, `path`, `os`, `crypto` 等
   ```typescript
   import { readFile, writeFile } from 'fs/promises';
   import { join, basename, dirname } from 'path';
   import { homedir } from 'os';
   ```

2. **第三方包**: npm 包和外部依赖
   ```typescript
   import simpleGit from 'simple-git';
   import matter from 'gray-matter';
   import * as p from '@clack/prompts';
   ```

3. **本地模块**: 相对路径导入
   ```typescript
   import { parseSource } from './source-parser.ts';
   import { discoverSkills } from './skills.ts';
   import type { Skill, AgentType } from './types.ts';
   ```

4. **类型导入**: 使用 `import type` 分离类型
   ```typescript
   import type { Skill, AgentType, RemoteSkill } from './types.ts';
   import type { WellKnownSkill } from './providers/wellknown.ts';
   ```

### 路径别名

- 不使用路径别名（项目使用相对路径）
- 使用 `.ts` 扩展名导入 TypeScript 文件
- 例如: `import { parseSource } from './source-parser.ts'`（不是 `.js`）

## 错误处理

### 自定义错误类

定义特定的错误类用于特定情况：

```typescript
export class GitCloneError extends Error {
  readonly url: string;
  readonly isTimeout: boolean;
  readonly isAuthError: boolean;

  constructor(message: string, url: string, isTimeout = false, isAuthError = false) {
    super(message);
    this.name = 'GitCloneError';
    this.url = url;
    this.isTimeout = isTimeout;
    this.isAuthError = isAuthError;
  }
}
```

见文件: `src/git.ts`

### 异常捕获模式

- **try-catch 块**: 捕获具体错误类型
  ```typescript
  try {
    // 操作
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // 处理错误
  }
  ```

- **安静失败**: 某些操作捕获异常后返回默认值
  ```typescript
  export async function parseSkillMd(skillMdPath: string): Promise<Skill | null> {
    try {
      // 解析逻辑
    } catch {
      return null;
    }
  }
  ```

- **错误处理特异化**: 区分错误类型
  ```typescript
  if (isTimeout) {
    throw new GitCloneError('Clone timed out...', url, true, false);
  }
  if (isAuthError) {
    throw new GitCloneError('Authentication failed...', url, false, true);
  }
  ```

## 日志和输出

### 颜色和格式化

使用 ANSI 转义码进行终端输出格式化：

```typescript
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[38;5;102m';      // 深灰色（不可见背景）
const TEXT = '\x1b[38;5;145m';      // 浅灰色（主要文本）
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
```

见文件: `src/cli.ts`, `src/list.ts`, `src/find.ts`

### 输出模式

- **标准消息**: 使用 `${TEXT}...${RESET}`
- **辅助文本**: 使用 `${DIM}...${RESET}`
- **警告**: 使用 `${YELLOW}...${RESET}`
- **logo**: 使用渐进灰色数组

```typescript
function formatInstalls(count: number): string {
  if (!count || count <= 0) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M installs`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K installs`;
  return `${count} install${count === 1 ? '' : 's'}`;
}
```

### 日志级别

- **跟踪**: `track()` 函数用于遥测数据
  见文件: `src/telemetry.ts`

## 注释风格

### JSDoc 注释

对公共函数和类型使用 JSDoc：

```typescript
/**
 * Sanitizes a filename/directory name to prevent path traversal attacks
 * and ensures it follows kebab-case convention
 * @param name - The name to sanitize
 * @returns Sanitized name safe for use in file paths
 */
export function sanitizeName(name: string): string {
  // ...
}
```

### 行内注释

解释复杂逻辑或非显而易见的代码行为：

```typescript
// Replace any sequence of characters that are NOT lowercase letters (a-z),
// digits (0-9), dots (.), or underscores (_) with a single hyphen.
// This converts spaces, special chars, and path traversal attempts (../) into hyphens.
.replace(/[^a-z0-9._]+/g, '-')
```

见文件: `src/installer.ts`

### 部分注释

用于标记代码段：

```typescript
// ─── Security Advisory ───

// ============================================
// Check and Update Commands
// ============================================
```

见文件: `src/cli.ts`

## 函数设计

### 尺寸

- **目标**: 大多数函数应该 < 50 行
- **意图**: 每个函数应该有单一、清晰的责任
- **复杂函数**: 长于 100 行的函数应该分解为更小的辅助函数

### 参数

- **选项对象**: 使用对象参数处理多个相关参数
  ```typescript
  interface InstallOptions {
    cwd?: string;
    mode?: InstallMode;
    global?: boolean;
  }

  async function installSkillForAgent(
    skill: Skill,
    agent: AgentType,
    options: InstallOptions
  ): Promise<InstallResult>
  ```

- **避免布尔参数**: 尽量使用选项对象
  - 坏的: `function install(skill, agent, true, false, true)`
  - 好的: `function install(skill, agent, { global: true, mode: 'symlink' })`

### 返回值

- **接口定义**: 返回类型必须定义接口
  ```typescript
  interface InstallResult {
    success: boolean;
    path: string;
    canonicalPath?: string;
    mode: InstallMode;
    symlinkFailed?: boolean;
    error?: string;
  }
  ```

- **可选字段**: 使用 `?` 表示可选属性

- **联合返回**: 使用联合类型或返回对象
  ```typescript
  async function parseSkillMd(path: string): Promise<Skill | null>
  ```

## 模块设计

### 导出

- **单一默认导出**: 避免使用，优先使用命名导出
- **导出接口**: 导出公共类型定义
  ```typescript
  export interface Skill { ... }
  export function discoverSkills(...): Promise<Skill[]>
  ```

- **导出常量**: 集中在顶部
  见文件: `src/constants.ts`, `src/branding.ts`

### 私有函数

- 使用 `function` 关键字前缀（不需要 `export`）
- 或使用清晰的名称指示意图

## ESM 模块

- **模块类型**: `"type": "module"` 在 `package.json` 中
- **导入扩展名**: 必须包含 `.ts` 扩展名
  ```typescript
  import { parseSource } from './source-parser.ts';
  import packageJson from '../package.json' with { type: 'json' };
  ```

- **获取元数据**:
  ```typescript
  const __dirname = dirname(fileURLToPath(import.meta.url));
  ```

见文件: `src/cli.ts` 第 1-28 行

## 异步编程

### Promise 使用

- **优先 async/await**: 避免原始 Promise 链
  ```typescript
  // 好的
  try {
    const content = await readFile(path, 'utf-8');
  } catch (error) {
    // 处理
  }

  // 避免
  readFile(path).then(content => {
    // 处理
  }).catch(error => {
    // 处理
  });
  ```

- **并行执行**: 使用 `Promise.all()`
  ```typescript
  const [hasSkill, entries] = await Promise.all([
    hasSkillMd(dir),
    readdir(dir, { withFileTypes: true }).catch(() => []),
  ]);
  ```

### 超时管理

- 使用 `setTimeout` 处理超时（见 `src/git.ts`）
- 明确记录超时时间

---

*规范分析: 2026-04-01*
