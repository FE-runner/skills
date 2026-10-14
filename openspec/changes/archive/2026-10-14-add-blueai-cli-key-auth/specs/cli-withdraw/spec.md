## MODIFIED Requirements

### Requirement: 带鉴权的名称解析

系统 SHALL 使用携带 `Authorization: Bearer <api-key>` header 的名称解析方法（`resolveMine`），不复用现有无鉴权的 `resolve()` 方法。该方法 SHALL 返回 `ApiResult<T>` 判别联合结果，区分"未鉴权（401）"、"权限失败（403）"、"未找到（404 或服务端语义上的不存在）"、"服务端错误（500）"、"服务不可用（503）"、"网络异常"六种失败情况，不将它们统一折叠成单一的"查不到"；其中只有 404 输出"名称不存在"，其余非网络失败 SHALL 走 `cli-auth` 定义的分级输出。

对 `503`，SHALL 遵循 `cli-auth` capability 定义的 `503` 有界重试与最终提示语义；重试耗尽后 SHALL 提示"服务暂不可用，请稍后重试"，SHALL NOT 误判为"技能名称不存在"或"鉴权失败"。

`/api/skill/resolve` 为可选鉴权接口：完全不携带 `Authorization` 时为匿名解析（行为不变）；一旦携带 Key，遇到无效/已撤销/已过期 Key 时服务端返回 401/403（fail-loud，不降级为匿名），系统 SHALL 按鉴权失败分支处理。

若实现阶段发现 skills-market 侧 `/api/skill/resolve` 现有实现在带 `Authorization` 且不传 `author` 参数时，并不会自动限定为"仅查当前用户名下的技能"（即仍按全局 `name` 查找，可能解出他人的同名公开技能），SHALL 在继续实现前记录该发现并重新评估 `withdraw` 命令的名称解析方式（例如要求技能名全局唯一、或改为要求用户传入技能 ID 而非名称），不得在未确认该行为的情况下直接假设"带了 Token 就等于按当前用户过滤"。

#### Scenario: 401 时明确提示重新登录

- **WHEN** `resolveMine` 返回 `{ ok: false, status: 401, ... }`
- **THEN** 系统提示"请运行 `skills login <api-key>`"，不将其误判为"技能名称不存在"

#### Scenario: 未找到时提示名称不存在

- **WHEN** `resolveMine` 返回 `{ ok: false, status: 404, ... }` 或服务端语义上表示未找到
- **THEN** 系统提示该名称对应的技能不存在

#### Scenario: 权限失败（403）时不误判为名称不存在

- **WHEN** `resolveMine` 返回 `{ ok: false, status: 403, ... }`
- **THEN** 系统输出 `HTTP 403` 与服务端 message，设置 `process.exitCode = 1`，不提示"技能名称不存在"、也不提示重新登录

#### Scenario: 服务端错误（500）时不误判为名称不存在

- **WHEN** `resolveMine` 返回 `{ ok: false, status: 500, ... }`
- **THEN** 系统输出 `HTTP 500` 与服务端 message 并标注为服务端错误，设置 `process.exitCode = 1`，不提示"技能名称不存在"

#### Scenario: 服务不可用时明确提示，不误判为不存在

- **WHEN** `resolveMine` 连续返回 `{ ok: false, status: 503, ... }`，重试次数达到上限
- **THEN** 系统提示"服务暂不可用，请稍后重试"，不将其误判为"技能名称不存在"或"鉴权失败"

#### Scenario: 网络异常时明确提示，不误判为不存在

- **WHEN** `resolveMine` 因网络原因返回 `{ ok: false, status: 0, ... }`
- **THEN** 系统提示网络/连接异常，不将其误判为"技能名称不存在"

### Requirement: 不支持团队维度的撤回

`skills withdraw` 命令 SHALL 仅处理 Skill 主体（`SKILL_STATUS`）层的撤回。命令的参数解析 SHALL 显式校验：除位置参数 `name` 与单次覆盖凭证的 `--api-key <key>` 外，不接受任何 `--` 开头的选项；遇到其他未声明的选项时 SHALL 输出错误提示并设置 `process.exitCode = 1`，不静默忽略、不继续执行撤回逻辑。

#### Scenario: 命令拒绝未声明的选项

- **WHEN** 用户执行 `skills withdraw my-skill --team team-a`
- **THEN** 系统识别出 `--team` 不是 `withdraw` 命令声明的选项，输出错误提示，设置 `process.exitCode = 1`，不发起任何网络请求

#### Scenario: 命令接受 --api-key 选项

- **WHEN** 用户执行 `skills withdraw my-skill --api-key sk-xxx`
- **THEN** 系统使用 `sk-xxx` 进行带鉴权的名称解析与撤回，不报"不支持选项"
