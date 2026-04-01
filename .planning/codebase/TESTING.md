# 测试模式

**分析日期:** 2026-04-01

## 测试框架

### 运行工具

- **Framework**: Vitest 4.0.17
- **配置**: 无专用配置文件（使用默认配置）
- **Node.js 要求**: >= 18

### 运行命令

```bash
pnpm test                        # 运行所有测试
pnpm test [pattern]              # 运行匹配的测试文件
pnpm test tests/sanitize-name    # 运行特定测试
pnpm type-check                  # TypeScript 类型检查
```

### 断言库

- **Library**: Vitest 内置 `expect()`
- **导入**: `import { describe, it, expect } from 'vitest'`

## 测试文件组织

### 位置

- **单元测试**: 与源文件在同目录（collocated）
  - 格式: `[filename].test.ts`
  - 例如: `src/add.test.ts`, `src/cli.test.ts`, `src/source-parser.test.ts`

- **集成测试**: 在 `tests/` 目录
  - 例如: `tests/sanitize-name.test.ts`, `tests/installer-symlink.test.ts`
  - 例如: `tests/list-installed.test.ts`, `tests/dist.test.ts`

### 命名规范

- **文件**: `{name}.test.ts` 或 `{name}.spec.ts`
- **测试套件**: `describe('{Feature}', () => { ... })`
- **测试用例**: `it('should {behavior}', () => { ... })`

## 测试结构

### 基本套件模式

```typescript
import { describe, it, expect } from 'vitest';

describe('sanitizeName', () => {
  describe('basic transformations', () => {
    it('converts to lowercase', () => {
      expect(sanitizeName('MySkill')).toBe('myskill');
    });

    it('replaces spaces with hyphens', () => {
      expect(sanitizeName('my skill')).toBe('my-skill');
    });
  });

  describe('special character handling', () => {
    it('replaces special characters with hyphens', () => {
      expect(sanitizeName('skill@name')).toBe('skill-name');
    });
  });
});
```

见文件: `tests/sanitize-name.test.ts`

### 设置和清理

使用 `beforeEach` 和 `afterEach` 钩子：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('add command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skills-add-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should process files', () => {
    // 测试逻辑
  });
});
```

见文件: `src/add.test.ts` 第 1-21 行

### 异步测试

```typescript
it('does not create self-loop when canonical and agent paths match', async () => {
  const root = await mkdtemp(join(tmpdir(), 'add-skill-'));
  const skillDir = await makeSkillSource(root, skillName);

  try {
    const result = await installSkillForAgent(...);
    expect(result.success).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

见文件: `tests/installer-symlink.test.ts` 第 30-57 行

## 断言模式

### 常用断言

```typescript
// 相等性
expect(value).toBe(expected)
expect(value).toEqual(expected)

// 布尔值
expect(result).toBe(true)
expect(result).toBe(false)

// 字符串
expect(output).toContain('expected text')
expect(output).toMatch(/regex/)

// 数组和对象
expect(array).toHaveLength(5)
expect(result).toMatchObject({ key: value })

// 抛出异常
expect(() => fn()).toThrow()

// 回调和异步
expect(callback).toHaveBeenCalled()
```

### 提取 ANSI 代码

测试中移除 ANSI 转义码进行断言：

```typescript
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export function stripLogo(str: string): string {
  return str
    .split('\n')
    .filter((line) => !line.includes('███') && !line.includes('╔') && !line.includes('╚'))
    .join('\n')
    .replace(/^\n+/, '');
}

// 使用
it('should display help message', () => {
  const output = runCliOutput(['--help']);
  expect(output).toContain('Usage:');
});
```

见文件: `src/test-utils.ts` 第 7-17 行

## 模拟模式

### 虚拟文件系统

使用真实的临时目录进行测试，而非模拟 fs：

```typescript
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';

// 创建临时测试目录
const tempDir = await mkdtemp(join(tmpdir(), 'test-'));

try {
  // 在真实文件系统中创建测试数据
  await writeFile(join(tempDir, 'SKILL.md'), skillContent, 'utf-8');

  // 测试代码
  const result = await discoverSkills(tempDir);

  expect(result).toHaveLength(1);
} finally {
  // 清理
  await rm(tempDir, { recursive: true, force: true });
}
```

见文件: `tests/installer-symlink.test.ts`

### 虚拟 CLI 执行

使用 `execSync` 在子进程中运行 CLI：

```typescript
export function runCli(
  args: string[],
  cwd?: string,
  env?: Record<string, string>,
  timeout?: number
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const output = execSync(`node "${CLI_PATH}" ${args.join(' ')}`, {
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env ? { ...process.env, ...env } : undefined,
      timeout: timeout ?? 30000,
    });
    return { stdout: stripAnsi(output), stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: stripAnsi(error.stdout || ''),
      stderr: stripAnsi(error.stderr || ''),
      exitCode: error.status || 1,
    };
  }
}
```

见文件: `src/test-utils.ts` 第 23-45 行

使用示例:

```typescript
it('should show error when no source provided', () => {
  const result = runCli(['add'], testDir);
  expect(result.stdout).toContain('ERROR');
  expect(result.stdout).toContain('Missing required argument: source');
  expect(result.exitCode).toBe(1);
});
```

见文件: `src/add.test.ts` 第 23-28 行

### 避免模拟

- **避免 vi.mock()**: 使用真实的文件系统和模块
- **原因**: CLI 工具需要测试实际行为
- **异常**: 网络调用可能需要模拟（见下面的 API 测试）

## Vitest 特定功能

### 超时处理

```typescript
// 默认超时 5000ms
it('should list skills', async () => {
  // 测试
});

// 指定超时 60 秒
it('should check for updates', async () => {
  // 测试
}, 60000);
```

见文件: `src/cli.test.ts` 第 74-84 行

### 跳过测试

```typescript
// 暂时跳过
it.skip('should do something', () => {
  // 被跳过
});

// 仅运行此测试
it.only('should focus on this', () => {
  // 仅运行此测试
});
```

## 测试覆盖范围

### 测试类型

**单元测试:**
- 功能性: `sanitizeName()`, `parseSource()`, `formatInstalls()`
- 解析逻辑: SKILL.md 前置处理解析
- 验证: 路径安全性、技能名称清理

**集成测试:**
- CLI 命令: `add`, `list`, `remove`, `find`
- 安装流程: 文件系统操作、symlink/copy 模式
- 技能发现: 目录遍历、SKILL.md 检测

**End-to-End 测试:**
- 完整工作流: 从源代码到安装
- 多个 agent 支持
- 全局和项目级别安装

### 覆盖的关键领域

见文件: `tests/` 目录中的测试列表

- `sanitize-name.test.ts` - 文件名清理和路径遍历防护
- `skill-matching.test.ts` - 多词技能名称匹配
- `source-parser.test.ts` - URL/路径解析
- `installer-symlink.test.ts` - symlink 安装回归测试
- `list-installed.test.ts` - 列出已安装技能
- `dist.test.ts` - 构建产物检查
- `plugin-grouping.test.ts` - 插件清单分组

## 测试助手

### 来自 test-utils.ts 的实用函数

```typescript
// 移除 ANSI 颜色代码
stripAnsi(str)

// 移除 logo（ASCII 艺术）
stripLogo(str)

// 检查是否存在 logo
hasLogo(str)

// 运行 CLI 命令
runCli(args, cwd?, env?, timeout?)
runCliOutput(args, cwd?)           // 仅返回 stdout
runCliWithInput(args, input, cwd?) // 提供标准输入
```

见文件: `src/test-utils.ts`

### 文件系统测试助手

```typescript
// 创建测试技能源
async function makeSkillSource(root: string, name: string): Promise<string> {
  const dir = join(root, 'source-skill');
  await mkdir(dir, { recursive: true });
  const skillMd = `---\nname: ${name}\ndescription: test\n---\n`;
  await writeFile(join(dir, 'SKILL.md'), skillMd, 'utf-8');
  return dir;
}
```

见文件: `tests/installer-symlink.test.ts` 第 21-27 行

## 最佳实践

### 测试隔离

- 每个测试应该是独立的
- 使用 `beforeEach`/`afterEach` 进行清理
- 不依赖其他测试的状态

```typescript
beforeEach(() => {
  testDir = join(tmpdir(), `skills-add-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});
```

### 描述性测试名称

```typescript
// 好的 - 清晰的行为描述
it('should not create self-loop when canonical and agent paths match', async () => {
  // ...
});

// 避免 - 不清晰
it('should work', () => {
  // ...
});
```

### 真实数据

- 使用真实的 SKILL.md 格式进行测试
- 使用真实的文件系统操作
- 测试真实的错误场景

```typescript
const skillContent = `---
name: ${skillName}
description: A test skill for testing
---

# Test Skill

This is a test skill.
`;
```

### 清理资源

始终清理临时文件和目录：

```typescript
try {
  // 测试代码
} finally {
  await rm(root, { recursive: true, force: true });
}
```

## 运行测试

### 执行全套测试

```bash
cd skills-cli
pnpm test
```

### 运行特定测试文件

```bash
pnpm test tests/sanitize-name.test.ts
pnpm test tests/skill-matching.test.ts tests/source-parser.test.ts
pnpm test src/cli.test.ts
```

### 监视模式

```bash
pnpm test -- --watch
```

### 生成覆盖报告

```bash
pnpm test -- --coverage
```

### TypeScript 验证

```bash
pnpm type-check
```

## CI/CD 集成

- 测试在提交前由 husky 钩子运行
- `lint-staged` 在 `src/**/*.ts` 和 `tests/**/*.ts` 上运行格式化
- 代码提交前必须通过所有测试

见文件: `package.json` 第 32-36 行

---

*测试分析: 2026-04-01*
