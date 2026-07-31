## Context

`cli-auth` 已经建立了 `getApiKey()` 读取优先级（`SKILLS_API_KEY` 环境变量 > `~/.blueai/secrets.json`）和 `reportApiFailure()`（统一的 `ApiResult` 失败处理，含 401 追加登录提示）这两个可直接复用的基础设施（见 `add-publish-command`）。`src/providers/market.ts` 里的 `requestApiResult<T>` 辅助函数也已经封装了"发请求 → 解析信封 → 转 `ApiResult<T>`"的逻辑，`push`/`publishToTeam`/`withdraw`/`resolveMine` 四个方法都是薄封装。

skills-market 侧 `GET /api/auth/me` 返回：`{ id, name, email, avatar, role, status, isSuperAdmin, feishuUnionId }`（见 `lib/validations/index.ts` 的 `AuthMeApiResponse`）。该路由内部调用 `getCurrentUser()`，Cookie 缺失时 fallback 到 `getCurrentUserFromBearer()`，已确认支持 `sk-` 前缀 API Key（`lib/api/auth.ts:35`）。

## Goals / Non-Goals

**Goals:**
- `skills whoami` 一次请求打印当前 API Key 对应的用户身份，不修改任何本地状态
- 复用 `cli-auth` 现有的 Key 读取与错误处理基础设施，不重新发明

**Non-Goals:**
- 不做本地缓存/离线校验——每次执行都是一次实时网络请求
- 不展示 `feishuUnionId`（内部字段，普通用户看到意义不大，也避免意外泄露给截图分享）
- 不新增独立的 `ApiEnvelope`/`requestApiResult` 变体——直接复用 `market.ts` 现成的辅助函数

## Decisions

### 1. 落地位置：独立 `src/whoami.ts`（实现阶段调整）

原计划把 `runWhoami` 直接写在 `src/cli.ts` 里（参照 `runInit`/`runCheck` 的既有模式）。实现阶段发现这样不可单测：`cli.ts` 顶层有一行 `main()` 立即执行——任何测试文件只要 `import` 它，就会以 vitest 的 `process.argv` 触发一次真实的命令分发，无法安全地只拿到 `runWhoami` 这一个函数做 mock 测试（`check`/`update` 现有测试因此只能走子进程 + 真实网络请求这种较重的方式）。改为跟 `publish.ts`/`withdraw.ts` 一致：单独开 `src/whoami.ts` 导出 `runWhoami`，`src/cli.ts` 只做路由注册。provider 方法 `whoami(apiKey)` 仍按原计划加进 `src/providers/market.ts`。

### 2. 复用 `ApiResult<T>` + `reportApiFailure`，不新增专属错误分支

401/网络异常的处理跟 `publish`/`withdraw`完全一致（提示重新登录 / 转述 message），直接调用已有的 `reportApiFailure`，不重复实现。

### 3. 展示字段：`name`/`email`/`role`，不含 `id`/`avatar`/`feishuUnionId`

`whoami` 面向"我是谁"这个问题，`id`（cuid）和 `avatar`（URL）对人类可读性没有帮助；`isSuperAdmin` 为 `true` 时额外提示一行（"超级管理员"），因为这会影响用户对自己权限范围的预期。

## Risks / Trade-offs

- **[风险] `GET /api/auth/me` 未加 `authGuard()`，而是手写 `getCurrentUser()` 判空** → 不影响本次实现：该路由已确认支持 Bearer API Key（跟 `push`/`withdraw`/`publishToTeam` 用的是同一条 `getCurrentUserFromBearer` 路径），行为与其他鉴权路由一致，只是没有复用 `authGuard()` 这层薄封装而已，不构成风险。
- **[Trade-off] 不显示 `feishuUnionId`** → 若未来需要用它做本地缓存/排查，需要单独评估是否展示；当前场景不需要。
