## MODIFIED Requirements

### Requirement: 团队分发（`--team`）

系统 SHALL 支持 `--team <id1,id2,...>` 参数，逗号分隔多个团队 ID。当该参数存在时，系统 SHALL 将解析出的 `teamIds` 数组随同一次 `POST /api/skill/push` 请求一并发出（写入请求体 `teamIds` 字段），由服务端在 push 成功后于同一请求内完成团队分发，不再由 CLI 额外发起 `POST /api/skill/publishToTeam` 请求。`--team` 与 `--public` 可以同时提供，二者不互斥：团队分发只依赖服务端返回的 `skillId` 与调用者的作者身份，与本次 push 是 PRIVATE 还是 PUBLIC、结果是否处于 PENDING 无关（由服务端保证）。

#### Scenario: 未提供 --team

- **WHEN** 用户执行 `skills publish` 不带 `--team`
- **THEN** 请求体不包含 `teamIds` 字段

#### Scenario: 提供单个团队 ID

- **WHEN** 用户执行 `skills publish --team team-a`
- **THEN** `push()` 调用的请求体包含 `teamIds: ["team-a"]`

#### Scenario: 提供多个团队 ID

- **WHEN** 用户执行 `skills publish --team team-a,team-b`
- **THEN** `push()` 调用的请求体包含 `teamIds: ["team-a", "team-b"]`，不对每个团队分别发起请求

#### Scenario: push 失败时不触发团队分发

- **WHEN** 用户执行 `skills publish --team team-a`，且 `/api/skill/push` 请求失败
- **THEN** 系统按错误处理流程退出（`process.exitCode = 1`），因团队分发已内嵌在同一次请求中，服务端不会在 Skill 创建/更新失败时执行分发

#### Scenario: --public 与 --team 同时提供

- **WHEN** 用户执行 `skills publish --public --team team-a`
- **THEN** `push()` 调用的请求体同时包含 `visibility: "PUBLIC"` 与 `teamIds: ["team-a"]`，一次请求完成公开发布与团队分发
