## ADDED Requirements

### Requirement: `skills publish [path]` 推送本地 Skill 到市场（私有 upsert）

系统 SHALL 提供 `skills publish [path]` 命令，读取 `path`（缺省为当前工作目录）下的 `SKILL.md` 及同目录附属文本文件，调用市场接口 `POST /api/skill/push` 完成 upsert：同名则更新已有私有 Skill，不同名则创建新私有 Skill。

#### Scenario: 缺省路径使用当前目录

- **WHEN** 用户在某 Skill 目录内执行 `skills publish`（不传 path）
- **THEN** 系统读取当前工作目录下的 `SKILL.md` 作为 `skillMd`

#### Scenario: 指定路径

- **WHEN** 用户执行 `skills publish ./my-skill`
- **THEN** 系统读取 `./my-skill/SKILL.md` 作为 `skillMd`

#### Scenario: 目标路径下 SKILL.md 不存在

- **WHEN** 目标目录下没有 `SKILL.md` 文件
- **THEN** 系统输出错误提示（路径 + 缺失文件名），以非零状态码退出，不发起网络请求

#### Scenario: 打包附属文本文件

- **WHEN** 目标目录下除 `SKILL.md` 外还有其他文本文件（含子目录）
- **THEN** 系统将这些文件按相对路径读取为文本，组装进请求体的 `files: [{ path, content }]` 数组

#### Scenario: 跳过隐藏文件

- **WHEN** 目标目录下存在以 `.` 开头的文件或目录（如 `.git`）
- **THEN** 系统在遍历时跳过这些条目，不纳入 `files`

#### Scenario: 跳过符号链接，不跟随

- **WHEN** 目标目录内存在符号链接（`lstat` 判定 `isSymbolicLink()` 为真）
- **THEN** 系统跳过该条目，不解引用、不读取其指向的目标内容，不纳入 `files`

#### Scenario: 跳过非常规文件

- **WHEN** 目标目录内存在非常规文件（FIFO、socket、设备文件等，既非目录也非普通文件）
- **THEN** 系统跳过该条目，不纳入 `files`

#### Scenario: 拒绝路径穿越出发布根目录

- **WHEN** 某文件条目经 `realpath` 解析后，其真实路径不在发布根目录的 realpath 范围内
- **THEN** 系统跳过该条目并输出警告，不静默、不纳入 `files`

#### Scenario: 检测并跳过二进制文件

- **WHEN** 目标目录下存在二进制文件（以 Buffer 读取后检出 NUL 字节，或严格 UTF-8 解码校验失败）
- **THEN** 系统判定为二进制，跳过该文件，不纳入 `files`，不因此中断整体推送

### Requirement: 版本号策略

系统 SHALL 支持 `--version <x.y.z>` 参数覆盖版本号；未提供时不在请求体中传递 `version` 字段，交由服务端按既有逻辑自动递增。

#### Scenario: 未指定 --version

- **WHEN** 用户执行 `skills publish` 不带 `--version`
- **THEN** 请求体不包含 `version` 字段，版本号由服务端自动决定

#### Scenario: 指定 --version

- **WHEN** 用户执行 `skills publish --version 2.0.0`
- **THEN** 请求体包含 `version: "2.0.0"`，覆盖服务端自动递增逻辑

### Requirement: 鉴权与请求头

系统 SHALL 使用 `Authorization: Bearer <api-key>` 请求头调用 `/api/skill/push`，API Key 按 `cli-auth` capability 定义的优先级读取。

#### Scenario: 携带有效 Key 发起请求

- **WHEN** 系统读取到有效 API Key
- **THEN** 请求头包含 `Authorization: Bearer <api-key>`

### Requirement: 团队分发（`--team`）

系统 SHALL 支持 `--team <id1,id2,...>` 参数，逗号分隔多个团队 ID。当该参数存在且 `/api/skill/push` 成功返回 `skillId` 后，系统 SHALL 调用一次 `POST /api/skill/publishToTeam`，请求体为 `{ id: skillId, teamIds: [id1, id2, ...] }`，将该 Skill 分发到所有指定团队。

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

### Requirement: 错误处理

`marketProvider.push`/`publishToTeam` SHALL 返回统一的 `ApiResult<T>` 判别联合结果（`{ ok: true, data } | { ok: false, status, code?, message, issues? }`），不使用现有只读方法那种"失败即返回 `null`、错误信息被吞掉"的模式。命令层 SHALL 在 `ok: false` 时输出 HTTP 状态码与服务端 `message`（如存在 `issues` 字段，一并输出），并通过设置 `process.exitCode = 1` 标记失败退出（不使用 `process.exit()` 硬退出）。当 `status === 401` 时，SHALL 额外提示用户运行 `skills login <api-key>`。

#### Scenario: 通用错误（非 401）

- **WHEN** 请求返回 `{ ok: false, status: 409, message: "..." }`（如同名公开 Skill 已存在）或其他非 401 错误
- **THEN** 系统输出 `HTTP <status>: <message>`，设置 `process.exitCode = 1`，不做额外分类提示

#### Scenario: 401 未鉴权

- **WHEN** 请求返回 `{ ok: false, status: 401, message: "..." }`（Key 缺失、无效或已撤销）
- **THEN** 系统在输出错误信息之外，额外提示"请运行 `skills login <api-key>`"

#### Scenario: 网络异常

- **WHEN** 请求因网络原因失败，返回 `{ ok: false, status: 0, message: "..." }`
- **THEN** 系统输出异常信息，设置 `process.exitCode = 1`
