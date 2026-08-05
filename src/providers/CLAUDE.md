[根目录](../../CLAUDE.md) > [src](../) > **providers**

## 模块职责

抽象"从哪里/如何获取一个远程技能"，让 `add`/`find`/`check`/`update`/`publish` 等命令无需关心具体宿主（GitHub、腾讯云 COS、内部 Skills Market、RFC 8615 well-known 目录）的差异。所有 provider 实现统一的 `HostProvider` 接口，供 `src/source-parser.ts` 与 `src/add.ts` 按 URL/来源类型匹配调用。

## 入口与启动

本模块不含可执行入口，由上层命令（`src/add.ts`、`src/find.ts`、`src/publish.ts`、`src/withdraw.ts`、`src/whoami.ts`、`src/cli.ts` 的 check/update 分支）按需 `import` 使用：

```ts
import { wellKnownProvider, cosProvider, marketProvider } from './providers/index.ts';
```

`src/providers/index.ts` 是唯一的对外导出面（barrel file），外部代码不应直接 `import` `wellknown.ts`/`cos.ts`/`market.ts`。

## 对外接口

### `HostProvider`（`types.ts`）

统一接口，供"通用远程技能"场景（well-known、COS）实现：

| 方法 | 说明 |
| --- | --- |
| `match(url): ProviderMatch` | 判断 URL 是否属于该 provider，返回 `{ matches, sourceIdentifier? }` |
| `fetchSkill(url): Promise<RemoteSkill \| null>` | 拉取并解析 SKILL.md（含 frontmatter） |
| `toRawUrl(url): string` | 转换为原始内容 URL |
| `getSourceIdentifier(url): string` | 用于遥测/存储的稳定标识 |

实现方：`WellKnownProvider`（`wellknown.ts`）、`CosProvider`（`cos.ts`）。

### `MarketProvider`（`market.ts`，**BMC 定制**）

不实现通用 `HostProvider` 接口（职责已扩展至发布/审核/身份管理），核心方法：

| 方法 | 说明 |
| --- | --- |
| `resolve(name, author?)` | 按名称（+可选作者）解析技能，返回 `ResolveResponse \| null` |
| `fetchById(...)` | 按 ID 拉取技能内容 |
| `check(skillId, author?)` | 检查更新（供 `skills check` 使用） |
| `push(...)` | 推送 SKILL.md + 附属文件到 Market（`skills publish` 核心调用） |
| `publishToTeam(...)` | 发布后分发给团队（`publish --team <id1,id2>`） |
| `withdraw(...)` | 撤回 PENDING 审核（`skills withdraw`） |
| `resolveMine(name, apiKey)` | 带鉴权解析"我自己的"技能，返回 `ApiResult<ResolveResponse>`，供 withdraw 拿 `skillId` |
| `whoami(apiKey)` | 查询 API Key 对应用户身份，返回 `ApiResult<...>` |

失败分支统一走 `requestApiResult()` 内部封装，产出 `ApiResult<T>`（`{ ok: true, data } | { ok: false, status, code?, message, issues? }`），由调用方（`src/api-error.ts` 的 `reportApiFailure()`）统一处理。

## 关键依赖与配置

- `gray-matter` — 解析 SKILL.md 的 YAML frontmatter（`wellknown.ts`、`cos.ts`）
- `crypto`（Node 内置）— COS 相关哈希计算
- `../branding.ts` 的 `SKILLS_SITE` — Market API 基地址（BMC 定制为 `https://blueai-skills-market.bluemediagroup.cn`，可用 `SKILLS_SITE` 环境变量覆盖；上游默认 `https://skills.sh`）
- `../types.ts` 的 `ApiResult<T>` — Market 相关方法的统一返回类型

**BMC Fork 保护提醒**：`cos.ts` 与 `market.ts` 是上游没有的新增文件；`market.ts` 中的 `push`/`publishToTeam`/`withdraw`/`resolveMine`/`whoami` 是 BMC 在原有 `resolve`/`fetchById`/`check` 基础上新增的发布能力。从上游同步 `providers/` 目录时务必保留这两个文件与上述方法。

## 数据模型

- `RemoteSkill`（`types.ts`）：`name`、`description`、`content`、`installName`、`sourceUrl`、`metadata?`
- `CosSkill extends RemoteSkill`：附加 `files: Map<string, string>`、`skillId`、`version`
- `MarketSkill extends RemoteSkill`：Market 场景下的技能表示（详见 `market.ts` 定义）
- `CosUrlParts`：`{ bucket, region, skillsRoot }`，由 `parseCosUrl()` 解析 COS URL 得到
- `ProviderMatch`：`{ matches: boolean, sourceIdentifier?: string }`

## 测试与质量

- `tests/wellknown-provider.test.ts` — well-known provider 匹配/拉取逻辑
- `tests/market-push.test.ts` — Market 推送（publish）相关集成测试
- 目前没有独立的 `providers/*.test.ts` 单元测试文件；provider 相关行为主要通过 `tests/` 目录下的集成测试和 `src/add.test.ts`、`src/publish.test.ts`、`src/withdraw.test.ts`、`src/whoami.test.ts` 间接覆盖

## 常见问题 (FAQ)

**Q: 新增一个远程来源该怎么做？**
实现 `HostProvider` 接口（新建文件），在 `index.ts` 中导出，并在 `src/source-parser.ts` / `src/add.ts` 里注册匹配顺序。

**Q: 为什么 `MarketProvider` 不实现 `HostProvider`？**
因为它承担的职责已超出"拉取远程技能"，还包括发布、审核撤回、身份查询等写操作和鉴权流程，强行套用只读的 `HostProvider` 接口会削弱可读性。

**Q: `resolve()` 和 `resolveMine()` 的区别？**
`resolve()` 是公开只读解析（无需鉴权，`check`/`add` 场景使用）；`resolveMine()` 带 API Key 鉴权，仅返回当前用户自己名下的技能（`withdraw` 场景使用，避免越权撤回他人技能）。

## 相关文件清单

```
src/providers/
├── index.ts      # 对外导出面（barrel）
├── types.ts      # HostProvider / RemoteSkill / ProviderMatch 接口定义
├── wellknown.ts   # RFC 8615 well-known 注册表 provider
├── cos.ts         # 腾讯云 COS provider（BMC 新增）
└── market.ts      # Skills Market provider（BMC 新增，含发布/审核/身份能力）
```

关联测试：`tests/wellknown-provider.test.ts`、`tests/market-push.test.ts`
关联上层调用：`src/add.ts`、`src/find.ts`、`src/publish.ts`、`src/withdraw.ts`、`src/whoami.ts`、`src/cli.ts`（check/update 分支）

## 变更记录 (Changelog)

| 日期       | 说明                                                                 |
| ---------- | -------------------------------------------------------------------- |
| 2026-08-05 | 初始化架构师扫描：创建本模块文档，记录 `HostProvider` 接口、`MarketProvider` 发布/审核/身份方法、BMC 定制保护范围 |
