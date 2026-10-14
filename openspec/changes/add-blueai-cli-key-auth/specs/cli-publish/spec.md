## MODIFIED Requirements

### Requirement: 错误处理

`marketProvider.push`/`publishToTeam` SHALL 返回统一的 `ApiResult<T>` 判别联合结果（`{ ok: true, data } | { ok: false, status, code?, message, issues? }`），不使用现有只读方法那种"失败即返回 `null`、错误信息被吞掉"的模式。命令层 SHALL 在 `ok: false` 时输出 HTTP 状态码与服务端 `message`（如存在 `issues` 字段，一并输出），并通过设置 `process.exitCode = 1` 标记失败退出（不使用 `process.exit()` 硬退出）。当 `status === 401` 时，SHALL 额外提示用户运行 `skills login <api-key>`。当请求携带 `visibility: PUBLIC` 且返回已知的 403/409/400 场景时，SHALL 在通用输出之外追加一行针对该场景的提示。

对 `503`，命令层 SHALL 遵循 `cli-auth` capability 定义的 `503` 有界重试与最终提示语义（重试耗尽后输出"服务暂不可用，请稍后重试"），不将其并入"通用错误"分支、不提示重新登录。对 `500`，命令层 SHALL 标注为服务端错误，SHALL NOT 表述为"Key 无效"。

#### Scenario: 通用错误（非 401，非下列已知 PUBLIC 场景）

- **WHEN** 请求返回 `{ ok: false, status, message: "..." }`，且不属于下列已知 PUBLIC 场景
- **THEN** 系统输出 `HTTP <status>: <message>`，设置 `process.exitCode = 1`，不做额外分类提示

#### Scenario: 401 未鉴权

- **WHEN** 请求返回 `{ ok: false, status: 401, message: "..." }`（Key 缺失、无效或已撤销）
- **THEN** 系统在输出错误信息之外，额外提示"请运行 `skills login <api-key>`"

#### Scenario: 网络异常

- **WHEN** 请求因网络原因失败，返回 `{ ok: false, status: 0, message: "..." }`
- **THEN** 系统输出异常信息，设置 `process.exitCode = 1`

#### Scenario: 503 重试耗尽

- **WHEN** `/api/skill/push` 连续返回 `{ ok: false, status: 503, ... }`，重试次数达到上限
- **THEN** 系统输出"服务暂不可用，请稍后重试"，设置 `process.exitCode = 1`，不提示"请运行 `skills login <api-key>`"

#### Scenario: 500 服务端错误

- **WHEN** 请求返回 `{ ok: false, status: 500, ... }`
- **THEN** 系统输出 `HTTP 500: <message>`，标注为服务端错误，设置 `process.exitCode = 1`，不提示重新登录

#### Scenario: --public 请求因角色权限被拒绝（403）

- **WHEN** 用户执行 `skills publish --public`，且请求返回 `{ ok: false, status: 403, ... }`
- **THEN** 系统在通用错误输出之外，额外提示当前账号角色无权发布公开 Skill

#### Scenario: --public 命中 409 冲突（同名 PRIVATE 或全局同名 PUBLIC）

- **WHEN** 用户执行 `skills publish --public`，且请求返回 `{ ok: false, status: 409, ... }`（可能是命中同名 PRIVATE Skill，也可能是全局同名 PUBLIC Skill 冲突——两种原因均返回相同 HTTP 409，服务端未提供可区分的结构化 code）
- **THEN** 系统在通用错误输出之外，额外追加一句同时覆盖两种原因的提示（如"名称冲突：可能是已有同名私有 Skill，需改走 Web 发布流程；或名称已被其他作者占用，需更换名称"），并原样输出服务端 `message` 供用户判断具体是哪一种

#### Scenario: --public 命中审核中的同名公开 Skill（400）

- **WHEN** 用户执行 `skills publish --public`，且请求返回 `{ ok: false, status: 400, ... }`，服务端提示 Skill 正在审核中
- **THEN** 系统在通用错误输出之外，额外提示先执行 `skills withdraw <name>` 撤回或等待审核完成
