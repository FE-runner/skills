## MODIFIED Requirements

### Requirement: 团队分发（`--team`）

系统 SHALL 支持 `--team <id1,id2,...>` 参数，逗号分隔多个团队 ID。当该参数存在且 `/api/skill/push` 成功返回 `skillId` 后，系统 SHALL 调用一次 `POST /api/skill/publishToTeam`，请求体为 `{ id: skillId, teamIds: [id1, id2, ...] }`，将该 Skill 分发到所有指定团队。`--team` 与 `--public` 可以同时提供，二者不互斥：团队分发只依赖 `skillId` 与调用者的作者身份，与 push 本次是 PRIVATE 还是 PUBLIC、结果是否处于 PENDING 无关。

#### Scenario: 未提供 --team

- **WHEN** 用户执行 `skills publish` 不带 `--team`
- **THEN** 系统仅调用 `/api/skill/push`，不调用 `/api/skill/publishToTeam`

#### Scenario: 提供单个团队 ID

- **WHEN** 用户执行 `skills publish --team team-a`
- **THEN** push 成功后系统调用一次 `publishToTeam`，`teamIds: ["team-a"]`

#### Scenario: 提供多个团队 ID

- **WHEN** 用户执行 `skills publish --team team-a,team-b`
- **THEN** push 成功后系统调用一次 `publishToTeam`，`teamIds: ["team-a", "team-b"]`，不对每个团队分别发起请求

#### Scenario: push 失败时不触发团队分发

- **WHEN** 用户执行 `skills publish --team team-a`，且 `/api/skill/push` 请求失败
- **THEN** 系统不调用 `publishToTeam`，直接按错误处理流程退出

#### Scenario: --public 与 --team 同时提供

- **WHEN** 用户执行 `skills publish --public --team team-a`
- **THEN** 系统以 `visibility: PUBLIC` 调用 push，push 成功后仍调用一次 `publishToTeam`，`teamIds: ["team-a"]`；两次调用互不影响对方结果

### Requirement: 错误处理

`marketProvider.push`/`publishToTeam` SHALL 返回统一的 `ApiResult<T>` 判别联合结果（`{ ok: true, data } | { ok: false, status, code?, message, issues? }`），不使用现有只读方法那种"失败即返回 `null`、错误信息被吞掉"的模式。命令层 SHALL 在 `ok: false` 时输出 HTTP 状态码与服务端 `message`（如存在 `issues` 字段，一并输出），并通过设置 `process.exitCode = 1` 标记失败退出（不使用 `process.exit()` 硬退出）。当 `status === 401` 时，SHALL 额外提示用户运行 `skills login <api-key>`。当请求携带 `visibility: PUBLIC` 且返回已知的 403/409/400 场景时，SHALL 在通用输出之外追加一行针对该场景的提示。

#### Scenario: 通用错误（非 401，非下列已知 PUBLIC 场景）

- **WHEN** 请求返回 `{ ok: false, status, message: "..." }`，且不属于下列已知 PUBLIC 场景
- **THEN** 系统输出 `HTTP <status>: <message>`，设置 `process.exitCode = 1`，不做额外分类提示

#### Scenario: 401 未鉴权

- **WHEN** 请求返回 `{ ok: false, status: 401, message: "..." }`（Key 缺失、无效或已撤销）
- **THEN** 系统在输出错误信息之外，额外提示"请运行 `skills login <api-key>`"

#### Scenario: 网络异常

- **WHEN** 请求因网络原因失败，返回 `{ ok: false, status: 0, message: "..." }`
- **THEN** 系统输出异常信息，设置 `process.exitCode = 1`

#### Scenario: --public 请求因角色权限被拒绝（403）

- **WHEN** 用户执行 `skills publish --public`，且请求返回 `{ ok: false, status: 403, ... }`
- **THEN** 系统在通用错误输出之外，额外提示当前账号角色无权发布公开 Skill

#### Scenario: --public 命中 409 冲突（同名 PRIVATE 或全局同名 PUBLIC）

- **WHEN** 用户执行 `skills publish --public`，且请求返回 `{ ok: false, status: 409, ... }`（可能是命中同名 PRIVATE Skill，也可能是全局同名 PUBLIC Skill 冲突——两种原因均返回相同 HTTP 409，服务端未提供可区分的结构化 code）
- **THEN** 系统在通用错误输出之外，额外追加一句同时覆盖两种原因的提示（如"名称冲突：可能是已有同名私有 Skill，需改走 Web 发布流程；或名称已被其他作者占用，需更换名称"），并原样输出服务端 `message` 供用户判断具体是哪一种

#### Scenario: --public 命中审核中的同名公开 Skill（400）

- **WHEN** 用户执行 `skills publish --public`，且请求返回 `{ ok: false, status: 400, ... }`，服务端提示 Skill 正在审核中
- **THEN** 系统在通用错误输出之外，额外提示先执行 `skills withdraw <name>` 撤回或等待审核完成

## ADDED Requirements

### Requirement: `--public` flag 新建/更新公开 Skill

系统 SHALL 支持 `skills publish [path] --public` 参数。带该 flag 时，`marketProvider.push()` 调用请求体 SHALL 携带 `visibility: 'PUBLIC'`；不带该 flag 时请求体不携带 `visibility` 字段，行为与现状（隐式 PRIVATE upsert）完全一致。

#### Scenario: 不带 --public

- **WHEN** 用户执行 `skills publish`（不带 `--public`）
- **THEN** 请求体不包含 `visibility` 字段

#### Scenario: 带 --public

- **WHEN** 用户执行 `skills publish --public`
- **THEN** 请求体包含 `visibility: "PUBLIC"`

### Requirement: PUBLIC 场景响应输出

系统 SHALL 依据 `/api/skill/push` 响应中的 `status` 字段区分输出文案：当请求携带 `visibility: PUBLIC` 且响应 `status` 为 `PENDING` 时，输出"已提交审核"及提醒用户结果非立即生效；其余场景（包含未带 `--public` 的既有 PRIVATE upsert）保持现有"推送成功"输出不变。

#### Scenario: --public 请求成功且进入待审核

- **WHEN** 用户执行 `skills publish --public`，请求成功且响应 `data.status === "PENDING"`
- **THEN** 系统输出"已提交审核"，并提示等待审核后生效，不输出"推送成功"

#### Scenario: 不带 --public 的现有成功场景保持不变

- **WHEN** 用户执行 `skills publish`（不带 `--public`），请求成功
- **THEN** 系统按现有格式输出"推送成功"及名称/版本/状态，不受本次变更影响
