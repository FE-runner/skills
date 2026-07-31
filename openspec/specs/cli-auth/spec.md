# cli-auth Specification

## Purpose
TBD - created by archiving change add-publish-command. Update Purpose after archive.
## Requirements
### Requirement: `skills login <api-key>` 保存市场 API Key

系统 SHALL 提供 `skills login <api-key>` 命令，将传入的 API Key 写入 `~/.blueai/secrets.json`，键名为 `blueai-skills-market-push.apiKey`（复用既有惯例键名，不新增独立键名）。若该文件或其所在目录不存在，SHALL 自动创建。

#### Scenario: 首次登录，文件不存在

- **WHEN** 用户执行 `skills login sk-xxxx`，且 `~/.blueai/secrets.json` 不存在
- **THEN** 系统创建 `~/.blueai/` 目录（若不存在）和 `secrets.json` 文件，写入 `{ "blueai-skills-market-push.apiKey": "sk-xxxx" }`

#### Scenario: 文件已存在，仅更新该键

- **WHEN** 用户执行 `skills login sk-yyyy`，且 `~/.blueai/secrets.json` 已存在且包含其他键
- **THEN** 系统仅更新 `blueai-skills-market-push.apiKey` 的值为 `sk-yyyy`，保留文件中其他键不变

#### Scenario: 未提供 API Key 参数

- **WHEN** 用户执行 `skills login` 不带参数
- **THEN** 系统输出用法提示并以非零状态码退出，不修改任何文件

### Requirement: API Key 读取优先级

系统 SHALL 在需要鉴权的命令（`publish`、`withdraw`）中，按以下优先级读取 API Key：环境变量 `SKILLS_API_KEY` 优先于 `~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]`。

#### Scenario: 环境变量存在时优先使用

- **WHEN** `process.env.SKILLS_API_KEY` 已设置，且 `~/.blueai/secrets.json` 中也存在该键
- **THEN** 系统使用环境变量的值发起请求，忽略文件中的值

#### Scenario: 仅文件中存在

- **WHEN** `process.env.SKILLS_API_KEY` 未设置，`~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]` 存在
- **THEN** 系统使用文件中的值发起请求

#### Scenario: 两者均不存在

- **WHEN** 环境变量未设置且文件不存在或文件中无该键
- **THEN** 系统在实际发起需要鉴权的请求前输出错误提示"请先运行 `skills login <api-key>` 或设置 `SKILLS_API_KEY` 环境变量"，并以非零状态码退出，不发起网络请求

### Requirement: 凭证文件权限限制

系统 SHALL 在创建 `~/.blueai/` 目录时设置权限为 `0700`，在创建或写入 `~/.blueai/secrets.json` 文件时设置权限为 `0600`，避免同机其他用户读取。

#### Scenario: 首次创建目录

- **WHEN** `skills login` 执行时 `~/.blueai/` 目录不存在
- **THEN** 系统创建该目录并设置权限为 `0700`

#### Scenario: 首次创建文件

- **WHEN** `skills login` 执行时 `~/.blueai/secrets.json` 文件不存在
- **THEN** 系统创建该文件并设置权限为 `0600`

#### Scenario: 已存在文件权限过宽

- **WHEN** `~/.blueai/secrets.json` 已存在，且当前权限比 `0600` 更宽（如其他用户可读）
- **THEN** 系统正常完成写入，同时输出一次性警告提示当前文件权限过宽，不强制修改已有文件权限

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

