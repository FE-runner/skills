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

系统 SHALL 在需要鉴权的命令（`publish`、`withdraw`、`whoami`）中，按以下优先级读取 API Key，取第一个非空值：

1. `--api-key <key>` 命令行参数（单次调用临时覆盖，不落盘）
2. 环境变量 `SKILLS_API_KEY`
3. `~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]`
4. 工作区凭据：从当前工作目录向上逐级查找最近的 `.blueai/credentials.json`，取其 `[activeProfile].apiKey`
5. 环境变量 `BLUEAI_API_KEY`
6. 用户级凭据：`<configDir>/credentials.json`，取其 `[activeProfile].apiKey`

其中 `activeProfile` 取自 `<configDir>/config.json` 的 `activeProfile` 字段，字段缺失或文件不可解析时取 `"default"`；`<configDir>` 默认为 `~/.blueai`，被环境变量 `BLUEAI_CONFIG_DIR` 覆盖。当 `BLUEAI_CONFIG_DIR` 已设置时，系统 SHALL 跳过工作区凭据查找（与 blueai-cli 的语义保持一致）。凭据文件缺失、不可解析或对应 `activeProfile` 无 `apiKey` 时，该来源视为未命中，不报错。

#### Scenario: --api-key flag 存在时优先使用

- **WHEN** 用户执行 `skills publish --api-key sk-flag`，且本地同时存在其他来源的 Key
- **THEN** 系统使用 `sk-flag` 发起请求，不读取也不修改任何持久化来源

#### Scenario: 环境变量存在时优先使用

- **WHEN** `process.env.SKILLS_API_KEY` 已设置，且其他来源也存在
- **THEN** 系统使用环境变量的值发起请求，忽略其余来源

#### Scenario: 仅文件中存在

- **WHEN** `process.env.SKILLS_API_KEY` 未设置，且 `~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]` 存在
- **THEN** 系统使用文件中的值发起请求

#### Scenario: 两者均不存在

- **WHEN** `process.env.SKILLS_API_KEY` 未设置，且 `~/.blueai/secrets.json` 不存在或其中无 `blueai-skills-market-push.apiKey`
- **THEN** 系统不直接报错，而是按优先级继续向更低级别的来源解析（工作区凭据、`BLUEAI_API_KEY`、用户级凭据），任一命中即使用该值

#### Scenario: 命中工作区凭据

- **WHEN** 前三个来源均为空，且从当前工作目录向上能找到含 `[activeProfile].apiKey` 的 `.blueai/credentials.json`
- **THEN** 系统使用该工作区凭据的值发起请求

#### Scenario: 命中 BLUEAI_API_KEY 环境变量

- **WHEN** 前四个来源均为空，且 `process.env.BLUEAI_API_KEY` 已设置
- **THEN** 系统使用 `BLUEAI_API_KEY` 的值发起请求

#### Scenario: 命中用户级 credentials.json

- **WHEN** 前五个来源均为空，且 `<configDir>/credentials.json[activeProfile].apiKey` 存在
- **THEN** 系统使用该用户级凭据的值发起请求

#### Scenario: BLUEAI_CONFIG_DIR 设置时跳过工作区查找

- **WHEN** `process.env.BLUEAI_CONFIG_DIR` 已设置，且当前工作目录向上存在 `.blueai/credentials.json`
- **THEN** 系统不读取该工作区凭据，仅从其余来源解析

#### Scenario: 全部来源均无 Key

- **WHEN** 六个来源均解析不到非空 Key
- **THEN** 系统在实际发起需要鉴权的请求前输出错误提示（列明可用来源，包含 `skills login <api-key>`、`SKILLS_API_KEY`、`BLUEAI_API_KEY`），并以非零状态码退出，不发起网络请求

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

系统 SHALL 提供 `skills whoami` 命令：按本 capability 定义的 API Key 读取优先级取得 Key，携带 `Authorization: Bearer <api-key>` 调用 skills-market 的 `GET /api/auth/me`，成功时打印当前用户的 `name`、`email`、`role`；若 `isSuperAdmin` 为 `true`，额外提示一行"超级管理员"。该命令不修改任何本地文件或远端状态。

#### Scenario: 已登录且 Key 有效

- **WHEN** 用户执行 `skills whoami`，且本地能读到有效 API Key
- **THEN** 系统调用 `GET /api/auth/me`，成功后打印该 Key 对应用户的 `name`/`email`/`role`

#### Scenario: 超级管理员额外提示

- **WHEN** `GET /api/auth/me` 返回 `isSuperAdmin: true`
- **THEN** 系统在用户信息之外额外打印一行"超级管理员"提示

#### Scenario: 本地无可用 Key

- **WHEN** 用户执行 `skills whoami`，且本 capability 定义的六个来源均解析不到非空 Key
- **THEN** 系统输出错误提示（列明 `skills login <api-key>`、`SKILLS_API_KEY`、`BLUEAI_API_KEY` 等可用来源），设置 `process.exitCode = 1`，不发起网络请求

#### Scenario: Key 已失效（401）

- **WHEN** `GET /api/auth/me` 返回 `{ ok: false, status: 401, ... }`
- **THEN** 系统输出 `HTTP 401: <message>`，并追加提示"请运行 `skills login <api-key>`"，设置 `process.exitCode = 1`

#### Scenario: 网络异常

- **WHEN** 请求因网络原因失败，返回 `{ ok: false, status: 0, ... }`
- **THEN** 系统输出异常信息，设置 `process.exitCode = 1`

### Requirement: 鉴权守卫失败分级与 503 有界重试

系统 SHALL 对需要鉴权的 Market 请求按失败类型分级处理：

- `401`：鉴权失败，属于不可重试失败，输出后追加登录提示。
- `403`：权限失败（Key 已撤销/用户禁用，或角色无权），属于不可重试失败；系统 SHALL 输出 `HTTP 403` 与服务端 message 并以非零状态码退出，SHALL NOT 追加登录提示（`--public` 场景的角色权限提示见 `cli-publish`）。
- `503`：中央身份解析服务不可用或限流，属于**可重试**失败，SHALL NOT 表述为"Key 无效"或"鉴权失败"。
- `500`：服务端自身异常，属于服务端错误，SHALL NOT 表述为"Key 无效"。

对 `503`，系统 SHALL 进行有界重试：最多重试 2 次（共 3 次尝试），重试间隔依次为 500ms、1s（叠加抖动）；若响应携带 `Retry-After`（秒数或 HTTP-date），SHALL 优先按其等待，但单次等待上限为 10 秒。重试期间 SHALL 在 stderr 输出重试进度提示。重试全部失败后，SHALL 输出"服务暂不可用，请稍后重试"并以非零状态码退出，且不提示重新登录。

`503` 仅在请求携带 API Key 时可能出现；匿名请求不触发中央解析，因而不会返回 `503`。

#### Scenario: 503 后重试成功

- **WHEN** 某需要鉴权的请求首次返回 503，重试后返回成功
- **THEN** 系统输出重试进度提示后按成功路径继续，命令不报错退出

#### Scenario: 连续 503 达到重试上限

- **WHEN** 请求连续返回 503，且重试次数达到上限
- **THEN** 系统输出"服务暂不可用，请稍后重试"，设置 `process.exitCode = 1`，不提示"请运行 skills login"

#### Scenario: 按 Retry-After 退避且受上限约束

- **WHEN** 503 响应携带 `Retry-After: 30`
- **THEN** 系统等待不超过 10 秒后重试

#### Scenario: 401/403 不触发重试

- **WHEN** 请求返回 401 或 403
- **THEN** 系统不重试，按各命令既有的鉴权/权限失败分支处理

#### Scenario: 403 按权限失败输出，不提示重新登录

- **WHEN** 某需要鉴权的请求返回 403
- **THEN** 系统输出 `HTTP 403: <message>`，设置 `process.exitCode = 1`，不追加"请运行 skills login"提示

#### Scenario: 500 标注为服务端错误

- **WHEN** 请求返回 500
- **THEN** 系统输出 HTTP 状态与服务端 message，标注为服务端错误，不提示重新登录
