# 外部集成

**分析日期:** 2026-04-01

## API 和外部服务

**GitHub API:**
- 用途: Git 仓库克隆、技能文件夹哈希值获取（树 SHA）、私有仓库检测
- SDK/Client: `simple-git` 3.27.0（克隆操作）、Native `fetch()` API（REST 调用）
- Auth: `GITHUB_TOKEN` 或 `GH_TOKEN` 环境变量，或从 `gh` CLI 读取
- 实现: `src/git.ts`（Git 克隆）、`src/skill-lock.ts`（树 SHA API）
- 端点: `https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1`

**Skills Market (内部 API):**
- 用途: 技能搜索、解析、安装、版本检查
- API 基地址: `https://blueai-skills-market.bluemediagroup.cn`（可通过 `SKILLS_SITE` 配置）
- 实现: `src/providers/market.ts`、`src/find.ts`
- 主要端点:
  - `GET /api/search?q={query}&limit=10` - 搜索技能
  - `GET /api/skills/resolve?name={name}&author={userId}` - 解析技能名称到 ID
  - `POST /api/skills/{skillId}/install?version=&author=` - 获取技能内容和文件
  - `GET /api/skills/{skillId}/check?author=` - 检查版本更新
- 返回格式: API 信封 `{ code, message, data }` 或直接 JSON（`unwrapEnvelope()` 处理两种格式）
- Auth: 私有技能需要 `author` (userId) 参数

**Tencent COS (对象存储):**
- 用途: 存储和分发技能文件
- 实现: `src/providers/cos.ts`
- 支持 URL 格式:
  - `cos://bucket-region/skills/skill-id/version/` (推荐)
  - `https://bucket-region.cos.{region}.myqcloud.com/skills/skill-id/version/`
- 操作: 列表对象 (XML 响应)、获取文件内容
- 特性: 支持版本控制、分页遍历、自动选择最新版本

**Well-Known Skills Endpoint (RFC 8615):**
- 用途: 标准化的公开技能发布端点
- 实现: `src/providers/wellknown.ts`
- 支持 URL 格式:
  - `https://example.com` → `https://example.com/.well-known/skills/`
  - `https://example.com/docs` → `https://example.com/docs/.well-known/skills/`
  - `https://example.com/.well-known/skills/` 或 `/skill-name`
- 索引文件: `index.json` 列出所有可用技能
- 每个技能作为独立目录，包含 `SKILL.md` 和附属文件

**HuggingFace Hub (旧版本，可能弃用):**
- 用途: 备选技能来源
- 实现: `src/providers/` (旧)
- 备注: 代码中引用但在当前流程中可能不活跃

**安全审计 API:**
- 用途: 获取技能安全风险评分（Socket API 集成）
- Endpoint: `https://add-skill.vercel.sh/audit?source={source}&skills={ids}`
- 超时: 3 秒（不阻止安装）
- 返回: `{ [source]: { [skillId]: { risk, alerts, score, analyzedAt } } }`
- 实现: `src/telemetry.ts` - `fetchAuditData()`
- 集成: `src/add.ts` 在安装时并发调用

## 数据存储

**全局 Skill Lock 文件:**
- 位置: `~/.agents/.skill-lock.json`
- 用途: 跟踪已安装技能、版本、文件夹哈希、更新时间戳
- 格式: JSON，v3 schema（支持 SHA-256 文件夹哈希）
- 实现: `src/skill-lock.ts`

**本地 Skill Lock 文件:**
- 位置: `skills-lock.json`（项目根目录，需提交到版本控制）
- 用途: 项目级技能声明和同步管理
- 实现: `src/local-lock.ts`

**Git 临时目录:**
- 用途: 克隆技能仓库时的临时存储
- 位置: `${os.tmpdir()}/skills-*` (通过 `fs.mkdtemp()` 创建)
- 清理: 自动删除（`src/git.ts`）
- 实现: `simpleGit` 管理

## 认证和身份

**认证提供者:**
- 类型: 多种源认证
- GitHub: 通过 GITHUB_TOKEN/GH_TOKEN 环境变量或 `gh` CLI
- Market Skills: 通过 `author` 参数（userId）用于私有技能验证
- 实现: `src/skill-lock.ts` - `getGitHubToken()`、`src/providers/market.ts` - 私有技能支持

**权限模型:**
- 公开技能: 无认证需要
- 私有技能: 需要 `author` (userId) 参数，Market API 验证
- GitHub 私有仓库: 需要 GITHUB_TOKEN 访问

## 监控和可观测性

**遥测:**
- Endpoint: `https://add-skill.vercel.sh/t`（当前禁用）
- 事件类型: install, remove, check, update, find, experimental_sync
- 实现: `src/telemetry.ts`
- 特点: 非阻塞（fire-and-forget），CI 检测，CLI 版本跟踪
- 状态: 默认 DISABLED（`isEnabled()` 返回 false）

**错误处理:**
- 审计 API 失败不阻止安装（3 秒超时）
- Telemetry 失败无声捕获（不影响 CLI）
- 网络错误返回 null（提供者回退）
- 实现: `src/telemetry.ts`、`src/add.ts`

**Logging:**
- 使用: `console.log/error`（彩色输出通过 picocolors）
- 位置: CLI 命令处理代码（`src/cli.ts`、`src/find.ts`、`src/add.ts`）
- 颜色编码: ANSI 256-color 支持浅色和深色背景

## CI/CD 和部署

**托管:**
- NPM Registry（`npm publish`）
- 包名: `blueai-skills`
- Bin 目标: `blueai-skills` 命令

**构建管道:**
- 工具: obuild
- 输出: `dist/cli.mjs` → `bin/cli.mjs`（symlink）
- 发布前检查: `pnpm run prepublishOnly` (生成许可证 + 构建)

**版本管理:**
- 格式: `{major}.{minor}.{patch}-{prerelease}`
- 当前: 1.4.3-bmc1.1.12
- 命令: `pnpm release` / `pnpm release:patch/minor/major`
- Snapshot 发布: `pnpm publish:snapshot`

**Git Hooks:**
- 工具: husky + lint-staged
- Pre-commit: Prettier 格式化检查
- 配置: `.husky/pre-commit`

## 环境配置

**必需的环境变量:**
- `GITHUB_TOKEN` 或 `GH_TOKEN` - 访问私有 GitHub 仓库和提高 API 速率限制
- `DISABLE_TELEMETRY` - 可选，禁用远程遥测

**可选环境变量:**
- `CI` - CI 环境检测（GitHub Actions、GitLab CI 等自动设置）

**品牌配置:** `src/branding.ts`
- `PACKAGE_NAME` - 'blueai-skills'
- `BIN_NAME` - 'blueai-skills'
- `SKILLS_SITE` - 'https://blueai-skills-market.bluemediagroup.cn'
- `TELEMETRY_URL` - 'https://add-skill.vercel.sh/t'
- `AUDIT_URL` - 'https://add-skill.vercel.sh/audit'

**Secrets 位置:**
- GitHub: 环境变量（`GITHUB_TOKEN`）
- Market: 通过 `author` 参数，在 lock 文件中作为 `authorId` 字段

## Webhooks 和回调

**传入:**
- 无 webhook 端点（CLI 是客户端）

**传出:**
- 遥测 API 调用（当启用时）
- 安全审计 API 调用（非阻塞）

## 关键外部 URL 映射

| 组件 | URL 模式 | 说明 |
|------|---------|------|
| GitHub API | `https://api.github.com/repos/{owner}/{repo}/...` | 树 SHA、私有检测 |
| GitHub Raw | `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/...` | SKILL.md 内容 |
| Market API | `https://blueai-skills-market.bluemediagroup.cn/api/...` | 技能搜索、解析、安装 |
| Market Web | `https://blueai-skills-market.bluemediagroup.cn/{skillId}` | 技能详情页面 |
| COS | `https://{bucket}-{accountId}.cos.{region}.myqcloud.com/...` | 技能文件 |
| Well-Known | `https://{host}/.well-known/skills/...` | RFC 8615 端点 |
| 遥测 | `https://add-skill.vercel.sh/t` | 使用统计（禁用）|
| 审计 | `https://add-skill.vercel.sh/audit` | 安全评分 |

## 提供者架构

**Provider 接口** (`src/providers/types.ts`):
```typescript
interface HostProvider {
  readonly id: string;           // 'github', 'market', 'well-known', 'cos', 等
  readonly displayName: string;  // 用户可读的名称
  match(url: string): ProviderMatch;
  fetchAllSkills(url: string): Promise<RemoteSkill[]>;
}
```

**已实现的提供者:**
- `MarketProvider` - Skills Market（本地私有 fork）
- `WellKnownProvider` - RFC 8615 端点
- `CosProvider` - Tencent COS 存储
- `wellknownProvider` - 单例实例
- `cosProvider` - 单例实例
- `marketProvider` - 单例实例

---

*集成审计: 2026-04-01*
