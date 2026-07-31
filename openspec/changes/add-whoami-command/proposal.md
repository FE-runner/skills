## Why

`skills login <api-key>` 只负责把 API Key 写入本地文件，从不校验这个 Key 对不对、对应哪个账号。用户改密钥后经常搞不清"我现在算不算登录了、登的是谁"，只能靠跑一次 `publish`/`withdraw` 真实碰一次网络、命中 401 才能间接确认。需要一个轻量命令直接查询当前 Key 对应的身份。

## What Changes

- 新增 `skills whoami` 命令：读取本地 API Key（复用 `cli-auth` 已有的读取优先级），调用 skills-market 的 `GET /api/auth/me`（`Authorization: Bearer <api-key>`），打印当前用户的 `name`/`email`/`role`。
- Key 缺失时，输出与 `publish`/`withdraw` 一致的提示（"请先运行 `skills login <api-key>` 或设置 `SKILLS_API_KEY` 环境变量"），非零退出，不发起网络请求。
- Key 无效/过期（服务端返回 401）时，复用既有的 `reportApiFailure`，追加"请运行 `skills login <api-key>`"提示。

## Capabilities

### New Capabilities

（无——本次不引入新的顶层能力域，`whoami` 是对既有 `cli-auth` 能力的补充）

### Modified Capabilities

- `cli-auth`：新增"查询当前登录身份"的 requirement（`skills whoami` 命令），不改变既有 `login`/API Key 读取优先级/权限限制的行为。

## Impact

- 影响代码：`src/cli.ts`（新增命令路由）、`src/providers/market.ts`（新增 `whoami(apiKey): Promise<ApiResult<{...}>>` 方法）
- 依赖的外部接口（不修改，仅消费）：skills-market 的 `GET /api/auth/me`（已确认支持 `Authorization: Bearer sk-xxx`，见 `lib/api/auth.ts` 的 `getCurrentUserFromBearer`）
- 不影响：`login`/`publish`/`withdraw` 现有行为不变
