## 1. 鉴权基础设施

- [ ] 1.1 新增 `src/auth.ts`：实现读取 `~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]`、写入该键（保留其他键不变）、创建目录/文件（若不存在）的工具函数
- [ ] 1.2 实现 API Key 解析优先级函数：`process.env.SKILLS_API_KEY` > 文件中的值，均缺失时返回 `null`
- [ ] 1.3 新增 `skills login <api-key>` 命令路由（`src/cli.ts`），未传参数时打印用法提示并设置 `process.exitCode = 1`
- [ ] 1.4 创建目录时设置权限 `0700`，创建文件时设置权限 `0600`；文件已存在但权限过宽时输出一次性警告，不强制修改
- [ ] 1.5 定义 `ApiResult<T>` 判别联合类型（`{ ok: true, data } | { ok: false, status, code?, message, issues? }`），放在共享类型文件（如 `src/types.ts`）供 provider 新方法使用

## 2. Market Provider 扩展

- [ ] 2.1 在 `src/providers/market.ts` 新增 `push(skillMd, files, version, apiKey): Promise<ApiResult<{ skillId: string; ... }>>` 方法，POST `/api/skill/push`，携带 `Authorization: Bearer <api-key>` 头，失败时保留 `status`/`code`/`message`/`issues`，不吞进 `null`
- [ ] 2.2 新增 `publishToTeam(skillId, teamIds, apiKey): Promise<ApiResult<null>>` 方法，POST `/api/skill/publishToTeam`
- [ ] 2.3 新增 `withdraw(skillId, apiKey): Promise<ApiResult<{ status: string; visibility: string }>>` 方法，POST `/api/skill/withdraw`
- [ ] 2.4 新增 `resolveMine(name, apiKey): Promise<ApiResult<ResolveResponse>>` 方法，携带 `Authorization` header 调用 `/api/skill/resolve`，不使用现有无鉴权的 `resolve()`
- [ ] 2.5 **确认任务（先做，阻塞 2.4 的最终实现）**：读取 skills-market 侧 `/api/skill/resolve` 路由实现，确认带 `Authorization` header 且不传 `author` 参数时，服务端是否已按当前登录身份过滤查询范围；若未过滤，记录该发现，重新评估 `withdraw` 命令的名称解析方式（详见 `specs/cli-withdraw/spec.md` "带鉴权的名称解析"requirement 的开放问题）

## 3. `skills publish` 命令

- [ ] 3.1 新增 `src/publish.ts`：实现目录遍历逻辑
  - 用 `lstat` 判断类型，跳过符号链接（`isSymbolicLink()`）与非常规文件
  - 跳过以 `.` 开头的条目
  - 对每个候选文件做 `realpath` 校验，确认仍在发布根目录 realpath 范围内，越界跳过并输出警告
  - 二进制检测：以 `Buffer` 读取，检查是否含 NUL 字节或严格 UTF-8 解码失败，命中则跳过
  - 跳过 `SKILL.md` 本身（单独取出作为 `skillMd` 字段）
- [ ] 3.2 解析命令行参数：`path`（位置参数，缺省 cwd）、`--version`、`--team`（逗号分隔解析为数组）
- [ ] 3.3 校验目标目录下 `SKILL.md` 存在，不存在时输出错误并设置 `process.exitCode = 1`
- [ ] 3.4 组装请求体调用 `marketProvider.push`，传入命令层读取到的 API Key
- [ ] 3.5 push 返回 `ok: true` 且提供了 `--team` 时，调用 `marketProvider.publishToTeam`；push 失败时不触发
- [ ] 3.6 实现错误处理：`ok: false` 时输出 `HTTP <status>: <message>`（含 `issues` 时一并输出），`status === 401` 时追加登录提示，统一设置 `process.exitCode = 1`（不使用 `process.exit()`）
- [ ] 3.7 在 `src/cli.ts` 注册 `publish` 命令路由

## 4. `skills withdraw` 命令

- [ ] 4.1 新增 `src/withdraw.ts`：解析 `name` 参数，调用 `marketProvider.resolveMine` 拿 `skillId`，再调用 `marketProvider.withdraw`
- [ ] 4.2 显式校验命令参数：仅接受一个位置参数 `name`，遇到任何 `--` 开头的选项（包括但不限于 `--team`）输出错误并设置 `process.exitCode = 1`，不静默忽略、不继续执行
- [ ] 4.3 `resolveMine` 返回 `status === 401` 时提示重新登录；返回其他失败时提示"技能不存在"或转述服务端消息（区分网络异常 `status === 0` 与真正的未找到）
- [ ] 4.4 复用与 `publish` 一致的错误处理逻辑（`process.exitCode = 1`、401 提示登录）
- [ ] 4.5 在 `src/cli.ts` 注册 `withdraw` 命令路由

## 5. 文档与测试

- [ ] 5.1 更新 `AGENTS.md` 命令表格，补充 `login`/`publish`/`withdraw` 三行及其选项说明
- [ ] 5.2 更新 `AGENTS.md` 中 "Key Integration Points" 表格，补充新命令对应的实现文件
- [ ] 5.3 更新 `README.md`（若含命令列表）
- [ ] 5.4 编写 `src/publish.test.ts`：覆盖目录遍历（隐藏文件跳过、符号链接跳过、路径穿越拒绝、二进制检测——用真实含 NUL 字节的 fixture 而非依赖"读取抛异常"）、`--version` 透传、`--team` 解析与链式调用、401/409/网络异常错误路径、`process.exitCode` 断言（不只断言输出文本）
- [ ] 5.5 编写 `src/withdraw.test.ts`：覆盖成功撤回、name 无法解析、401 与"未找到"区分、非 PENDING 状态报错、未声明选项被拒绝
- [ ] 5.6 编写 `src/auth.test.ts`：覆盖文件不存在时创建（并断言权限 `0700`/`0600`）、已存在时仅更新目标键、环境变量优先级、已存在文件权限过宽时的警告输出
- [ ] 5.7 运行 `pnpm type-check` 与 `pnpm test`，确保全部通过
- [ ] 5.8 运行 `pnpm format` 格式化新增文件

## 6. 显式排除（记录，不实现）

- [ ] 6.1 确认未实现浏览器 OAuth / device flow 登录
- [ ] 6.2 确认未修改 skills-market 服务端 `/api/skill/push` 行为（本次仅 CLI 侧改动）
- [ ] 6.3 确认未添加二进制文件的 base64 编码支持
- [ ] 6.4 确认 `withdraw` 命令未添加 `--team` 或其他团队维度参数
- [ ] 6.5 确认现有 `resolve`/`fetchById`/`check` 三个只读方法的返回契约未被改动（新方法各自独立，不影响 `add`/`check`/`update` 现有调用方）
