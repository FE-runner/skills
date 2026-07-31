## ADDED Requirements

### Requirement: `skills withdraw <name>` 撤回审核中的公开 Skill

系统 SHALL 提供 `skills withdraw <name>` 命令，先通过带鉴权的名称解析（见"带鉴权的名称解析"requirement）解出 `skillId`，再调用 `POST /api/skill/withdraw`（请求体 `{ id: skillId }`），撤回该 Skill 当前处于 PENDING 状态的审核。命令本身不判断具体撤回场景（draft 更新撤回 / 私有发布到市场撤回 / 首次公开创建撤回），由服务端按已有逻辑自动处理。

#### Scenario: 成功撤回

- **WHEN** 用户执行 `skills withdraw my-skill`，且该 Skill 存在且处于 PENDING 状态
- **THEN** 系统先解析出 `skillId`，再调用 `/api/skill/withdraw`，成功后输出撤回后的状态（如"已撤回，当前状态：私有/APPROVED"）

#### Scenario: 名称无法解析

- **WHEN** 用户执行 `skills withdraw unknown-name`，且该名称在当前用户名下无法解析出 Skill
- **THEN** 系统输出错误提示（名称不存在），设置 `process.exitCode = 1`，不调用 withdraw 接口

#### Scenario: Skill 不处于 PENDING 状态

- **WHEN** 用户执行 `skills withdraw my-skill`，该 Skill 存在但当前状态不是 PENDING
- **THEN** 系统输出服务端返回的错误消息，设置 `process.exitCode = 1`

#### Scenario: 未提供 name 参数

- **WHEN** 用户执行 `skills withdraw` 不带参数
- **THEN** 系统输出用法提示，设置 `process.exitCode = 1`，不发起任何网络请求

### Requirement: 带鉴权的名称解析

系统 SHALL 使用携带 `Authorization: Bearer <api-key>` header 的名称解析方法（`resolveMine`），不复用现有无鉴权的 `resolve()` 方法。该方法 SHALL 返回 `ApiResult<T>` 判别联合结果，区分"未鉴权（401）"、"未找到（404 或服务端语义上的不存在）"、"网络异常"三种失败情况，不将三者统一折叠成单一的"查不到"。

若实现阶段发现 skills-market 侧 `/api/skill/resolve` 现有实现在带 `Authorization` 且不传 `author` 参数时，并不会自动限定为"仅查当前用户名下的技能"（即仍按全局 `name` 查找，可能解出他人的同名公开技能），SHALL 在继续实现前记录该发现并重新评估 `withdraw` 命令的名称解析方式（例如要求技能名全局唯一、或改为要求用户传入技能 ID 而非名称），不得在未确认该行为的情况下直接假设"带了 Token 就等于按当前用户过滤"。

#### Scenario: 401 时明确提示重新登录

- **WHEN** `resolveMine` 返回 `{ ok: false, status: 401, ... }`
- **THEN** 系统提示"请运行 `skills login <api-key>`"，不将其误判为"技能名称不存在"

#### Scenario: 未找到时提示名称不存在

- **WHEN** `resolveMine` 返回 `{ ok: false, status: 404, ... }` 或服务端语义上表示未找到
- **THEN** 系统提示该名称对应的技能不存在

#### Scenario: 网络异常时明确提示，不误判为不存在

- **WHEN** `resolveMine` 因网络原因返回 `{ ok: false, status: 0, ... }`
- **THEN** 系统提示网络/连接异常，不将其误判为"技能名称不存在"

### Requirement: 不支持团队维度的撤回

`skills withdraw` 命令 SHALL 仅处理 Skill 主体（`SKILL_STATUS`）层的撤回。命令的参数解析 SHALL 显式校验：除位置参数 `name` 外，不接受任何 `--` 开头的选项；遇到未声明的选项时 SHALL 输出错误提示并设置 `process.exitCode = 1`，不静默忽略、不继续执行撤回逻辑。

#### Scenario: 命令拒绝未声明的选项

- **WHEN** 用户执行 `skills withdraw my-skill --team team-a`
- **THEN** 系统识别出 `--team` 不是 `withdraw` 命令声明的选项，输出错误提示，设置 `process.exitCode = 1`，不发起任何网络请求

