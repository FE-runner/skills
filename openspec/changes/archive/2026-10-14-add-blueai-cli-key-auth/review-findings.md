# add-blueai-cli-key-auth 审查未修项快照

## 方案审查

- 执行轮次：1
- 记录时间：2026-10-14 17:12:26 CST
- 基线：propose commit `2a48a752`；工作区无额外未提交改动
- Critical：0

### Warning

1. [`tasks.md` §2.1/§2.2 与 `proposal.md` What Changes] — proposal 明确 `--api-key` 作用于 `whoami`，但 tasks 只写了 `cli.ts` 透传 `restArgs`，未把 `runWhoami` 的参数解析、未声明选项行为和 `whoami --api-key` 单测列为明确验收点。
   建议: 补一条明确的 `whoami` 参数解析与单测任务，覆盖"接受 `--api-key`""透传后生效""无其他参数时行为不变"。
   - 解决：本 change 内修复（commit 602625f）— `tasks.md` 2.1/2.2 明确写出 `whoami` 自行解析 `--api-key`（其余参数沿用既有忽略行为，不新增未知选项报错）、透传后在解析层生效、未传时行为不变，并作为验收点。
2. [`tasks.md` §3.2-§3.4 与 `design.md` D5、`specs/cli-auth/spec.md` ADDED Requirement] — 方案声明 `401/403` 都不可重试，但 tasks 只要求断言"401 不重试"，未要求覆盖 `403`，也没有明确 `403` 在 `withdraw`/`whoami` 中的输出分级。
   建议: 补 403 不重试、403 输出与 `process.exitCode` 的单测；在 D5 或 spec 中写清非 PUBLIC 场景下 403 的通用输出语义。
   - 解决：本 change 内修复（commit bdb4b82）— 补 403 不重试与 403 输出/`process.exitCode` 的单测，`withdraw` 的 403/500 不再误报"未找到"。
   - 解决：本 change 内修复（commit dff1229）— 在 `cli-auth` / `cli-publish` / `cli-withdraw` delta spec 中写清非 `--public` 场景 403（及 `withdraw` 的 500）的输出语义。
3. [`design.md` D3 与 `tasks.md` §2.1/§2.2] — 新增的 `--api-key <key>` 属于命令行参数，可能进入 shell history、process listing 或被工具捕获，但方案只写了"不落盘"，没有安全边界说明。
   建议: 在 design/risk 中明确"不打印、不写 telemetry、不进错误输出"，并说明推荐生产环境优先用 env/credential 文件而非 CLI flag。
   - 解决：本 change 内修复（commit 602625f）— `design.md` D3 增补安全边界：值不打印、不写 telemetry、不进错误输出、不落盘；额外暴露面仅 shell history / process listing，生产推荐 env 或 credentials 文件。
4. [`design.md` D4 与 `tasks.md` §3.1/§3.2] — `Retry-After` 只要求支持秒数和 HTTP-date，未定义缺失、非法、过期 HTTP-date 时的 fallback；同时"抖动"没有定义算法或范围，后续实现与测试可能漂移。
   建议: 明确"无效/缺失 Retry-After 回退默认退避""过期 HTTP-date 视为立即重试或按默认退避"，并定义 jitter 的上限或算法。
   - 解决：本 change 内修复（commit 602625f）— `design.md` D4 增补退避细则：基线 500ms→1s（超出取最后一档）、缺失/空白/不可解析回退基线、过期 HTTP-date 视为立即重试、10s 封顶后叠加 0~250ms 抖动；判定与计算抽为 `parseRetryAfterMs` / `computeRetryDelayMs` 并已由单测锚定。

## 代码审查

- 执行轮次：1
- 记录时间：2026-10-14 17:25:51 CST
- 基线：apply commit `5e3db569`；工作区无额外未提交改动
- Critical：0

### Warning

1. [`src/publish.ts:128`、`src/withdraw.ts:25`、`src/whoami.ts:12`] — `--api-key` 缺值或下一个参数是 `--` 选项时会被静默当成 Key 或跳过。例如 `publish --api-key --public` 会把 `--public` 当作 Key，`withdraw --api-key --team x` 会把 `--team` 当作 Key、`x` 当作技能名；`--api-key` 放在末尾时会静默回退到持久化凭证。对 publish/withdraw 这类写操作，可能导致用户在非预期身份下执行。
   建议: 解析 `--api-key` 后要求下一个参数存在、非空且不是 `--` 开头；否则立即输出参数错误并退出。补充缺失值、空值、`--api-key --xxx` 的测试。
   - 解决：本 change 内修复（commit bdb4b82）— 三个命令的 `--api-key` 解析要求值存在、非空且不以 `--` 开头，否则报参数错误退出、不发起网络请求。
2. [`src/withdraw.ts:70`] — `resolveMine` 的失败分支只显式处理 `401`、`0`、`503`；`403` 和 `500` 会落入通用 `else`，输出"未找到名为 ... 的技能"。这与 `cli-auth` 中 `403` 属鉴权/权限失败、`500` 属服务端错误的分级语义不一致，也会误导用户以为是技能名不存在。
   建议: `resolveMine` 返回 `403` 或 `500` 时改走 `reportApiFailure()`，或增加明确的鉴权/服务端错误分支；补充对应测试。
   - 解决：本 change 内修复（commit bdb4b82）— `resolveMine` 失败分支改为 404→名称不存在、0→网络异常、其余（含 401/403/500/503）→ `reportApiFailure` 分级输出，并补对应测试。
