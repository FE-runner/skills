## ADDED Requirements

### Requirement: `skills whoami` 查询当前登录身份

系统 SHALL 提供 `skills whoami` 命令：按 `cli-auth` 已有的 API Key 读取优先级取得 Key，携带 `Authorization: Bearer <api-key>` 调用 skills-market 的 `GET /api/auth/me`，成功时打印当前用户的 `name`、`email`、`role`；若 `isSuperAdmin` 为 `true`，额外提示一行"超级管理员"。该命令不修改任何本地文件或远端状态。

#### Scenario: 已登录且 Key 有效

- **WHEN** 用户执行 `skills whoami`，且本地能读到有效 API Key
- **THEN** 系统调用 `GET /api/auth/me`，成功后打印该 Key 对应用户的 `name`/`email`/`role`

#### Scenario: 超级管理员额外提示

- **WHEN** `GET /api/auth/me` 返回 `isSuperAdmin: true`
- **THEN** 系统在用户信息之外额外打印一行"超级管理员"提示

#### Scenario: 本地无可用 Key

- **WHEN** 用户执行 `skills whoami`，且环境变量 `SKILLS_API_KEY` 未设置、`~/.blueai/secrets.json` 中也没有 `blueai-skills-market-push.apiKey`
- **THEN** 系统输出错误提示"请先运行 `skills login <api-key>` 或设置 `SKILLS_API_KEY` 环境变量"，设置 `process.exitCode = 1`，不发起网络请求

#### Scenario: Key 已失效（401）

- **WHEN** `GET /api/auth/me` 返回 `{ ok: false, status: 401, ... }`
- **THEN** 系统输出 `HTTP 401: <message>`，并追加提示"请运行 `skills login <api-key>`"，设置 `process.exitCode = 1`

#### Scenario: 网络异常

- **WHEN** 请求因网络原因失败，返回 `{ ok: false, status: 0, ... }`
- **THEN** 系统输出异常信息，设置 `process.exitCode = 1`
