## Context

`skills` CLI（包名 `blueai-skills`）现有架构：`src/providers/market.ts` 已有 `MarketProvider`，只封装了 `resolve`/`fetchById`/`check` 三个只读方法，消费 skills-market 的只读/安装类接口。市场侧已经存在一套面向"程序化推送"的接口 `/api/skill/push`（JSON upsert，支持 API Key Bearer 鉴权），此前只被 `liyang-skills` 仓库里的一次性脚本 `blueai-skills-market-push/scripts/push.mjs` 消费，CLI 本身从未集成。

CLI 现有的 `check`/`update` 已经支持 market source 的更新检测/安装（消费方向），本次要补的是反方向：本地 Skill → 市场。

密钥管理现状：用户本机已有 `~/.blueai/secrets.json`，是多个本地 skill 脚本共享的密钥文件，键名格式 `{skill-name}.{key-name}`，目前存的是 `blueai-skills-market-push.apiKey`。CLI 侧要复用这把已生成的 Key，而不是发明新的存储位置/键名，避免用户为同一个市场账号重复登录两处。

## Goals / Non-Goals

**Goals:**
- CLI 新增三个命令：`login`、`publish`、`withdraw`，覆盖"本地 Skill 发布/更新/团队分发/审核撤回"全链路
- `publish` 命令语义等价 `npm publish`：单命令 upsert，不拆首发/更新两个子命令
- 复用市场侧已有接口（`/api/skill/push`、`/api/skill/publishToTeam`、`/api/skill/withdraw`、`/api/skill/resolve`），不新增/不修改服务端接口行为
- 复用现有密钥存储惯例（`~/.blueai/secrets.json`），不引入新的凭证文件或新键名

**Non-Goals:**
- 不做浏览器 OAuth / device flow 登录（内部工具，飞书企业域内账号，投入产出比低）
- 不支持 CLI 更新已公开（PUBLIC）的 Skill——`/api/skill/push` 本身写死 visibility 固定 PRIVATE，遇到同名 PUBLIC Skill 服务端返回 409，CLI 不做绕过或特殊处理，直接转述错误消息
- 不支持 files 里的二进制文件（Skill 目录场景通常只有 SKILL.md + 少量文本文件，二进制编码问题不在本次范围）
- 不做 HTTP 错误的精细分类文案（除 401 外，其余统一走 "HTTP status + message + exit 1"）
- 不实现 SkillTeam 层（团队审核）的独立撤回能力——代码里未找到对应服务实现，`withdraw` 命令只处理 Skill 主体（`SKILL_STATUS`）层

## Decisions

### 1. 命令形态：单命令 upsert，不拆 publish/push

`/api/skill/push` 本身按 `skillMd` 里的 `name` 做 upsert（同名更新、不同名创建），CLI 侧再拆出"首次发布"和"后续更新"两个命令只是徒增心智负担，没有对应的服务端语义差异。采用单一 `skills publish [path]` 命令。

### 2. 认证凭证：复用 `~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]`

**备选方案**：
- a) CLI 自建 `~/.agents/.skills-auth.json`（比照现有 `skill-lock.ts` 的 `~/.agents/` 目录惯例）
- b) 复用 `~/.blueai/secrets.json`，但开自己的键名（如 `blueai-skills.apiKey`），读取时兜底旧键名
- c)（采用）直接复用现成键名 `blueai-skills-market-push.apiKey`，不新增键名

**理由**：这把 Key 在市场侧就是同一个账号生成的同一个 API Key，`skills-cli` 和 `push.mjs` 都只是"调用 `/api/skill/push` 的消费者"，不是两个需要区分身份的独立密钥用途。按"消费者名字"命名密钥（惯例 `{skill-name}.{key-name}` 的原始设计意图）在"多个消费者共享同一密钥"的场景下会造成不必要的重复配置。选 c）让已经配置过 `push.mjs` 的用户零成本直接用上 `skills publish`。

**读取优先级**：`process.env.SKILLS_API_KEY` > `~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]`（无 `gh auth token` 那一层代理登录，因为市场侧没有对应的设备码/CLI 登录网关）。

**`skills login <api-key>` 命令**：写入该文件该键，若目录/文件不存在则创建（权限限制到当前用户）。

### 3. 内容打包：纯文本目录遍历，服务端负责打 ZIP

CLI 不在本地打 ZIP（`/api/skill/push` 接口本身接受 JSON `{ skillMd, files }`，服务端内存打包）。遍历逻辑参照 `push.mjs` 现成实现：跳过以 `.` 开头的条目、跳过 `SKILL.md`（单独取出作为 `skillMd` 字段）、读取失败（多半是二进制）的文件静默跳过不报错。

### 4. 版本策略：默认交给服务端自动递增

不传 `--version` 时不传该字段给服务端，由服务端按现有 spec（`skill-push`）逻辑自动 patch bump；传了 `--version` 则透传覆盖，服务端会忽略 frontmatter 里的 version。CLI 侧不做本地 semver 计算（不提供 `--bump major|minor|patch` 这类需要 CLI 自己读旧版本号再算的选项）。

### 5. 团队分发：`--team` 参数，逗号分隔，链式调用一次 `publishToTeam`

`/api/skill/publishToTeam` 原生接受 `teamIds` 数组（`body: { id, teamIds: [...] }`），CLI 侧只需把 `--team a,b` 解析成数组透传，不需要循环调用多次（避免了"多次调用导致 push 端版本重复递增"的顾虑，因为 `publishToTeam` 和 `push` 是两个独立接口，一次 `push` 换来的 `skillId` 之后一次 `publishToTeam` 分发给所有目标团队）。

**flag 命名**：`--team`（裸名词，跟现有 CLI flag 惯例 `--agent`/`--skill`/`--force` 保持 kebab-case + 无修饰前缀一致，不用 `--team-id`/`--with-team` 等变体）。

### 6. 撤回命令：补齐审核死锁的出口

市场侧 `updateSkill` service 逻辑（若未来 push 更新逻辑复用该 service）在 `skill.status === PENDING` 时直接 400 拒绝任何更新（"Skill 正在审核中，无法更新"），这是既有且不打算改的行为。若无撤回手段，CLI 用户在公开 Skill 进入审核后会卡死，只能切到网页操作，等于"CLI 闭环"这个目标半途而废。因此新增 `skills withdraw <name>`，直接映射到已有的 `/api/skill/withdraw`（三场景由服务端自动判断，CLI 不需要分支处理）。

**明确排除**：`withdraw` 不支持 `--team` 参数。团队审核（`SkillTeam.status`）和 Skill 主体审核（`SKILL_STATUS`）是两个独立状态机，混进同一个命令语义会模糊；且代码中未找到 SkillTeam 层的撤回服务实现，不在本次范围。

### 7. 错误处理：复用 `push.mjs` 模式 + 401 特化提示

不做按状态码分类的精细文案（409/400/5xx 统一处理），因为服务端 `message` 字段本身已经是可读的中文提示（如 409 场景已经写"请通过 Web 界面管理"）。唯一的特化：401（未鉴权/Key 失效或缺失）时追加提示"请运行 `skills login <api-key>`"，因为这是 CLI 侧能主动引导修复的场景，其余错误无法靠 CLI 自身动作解决。

### 8. Provider 返回值契约：不能复用现有 `unwrapEnvelope` + `null` 模式

现有 `MarketProvider`（`resolve`/`fetchById`/`check`）统一用 `try { ... } catch { return null }` 包裹，`unwrapEnvelope` 只在响应"看起来像信封"（含 `data` 且含 `code`）时才解出 `data`，失败响应里的 `code`/`message`/`issues` 全部被吞掉，外部只看到 `null`——分不清"资源不存在"、"未鉴权"、"网络异常"、"校验失败"。

`push`/`publishToTeam`/`withdraw` 三个新方法**不能**沿用这个模式，因为 CLI 侧的错误处理要求（`cli-publish` spec 的"错误处理"requirement）明确要输出服务端 `message`、区分 401、以及可能存在的 validation issues——这些信息在旧模式下已经在 provider 层被丢弃了。

**决策**：新增方法返回统一的判别联合类型：

```ts
type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code?: string; message: string; issues?: unknown };
```

- HTTP 请求成功且 `code === 'SUCCESS'` → `{ ok: true, data }`
- HTTP 非 2xx，或 2xx 但 `code !== 'SUCCESS'` → `{ ok: false, status, code, message, issues }`（`status` 始终有值，`code`/`issues` 视响应体是否存在而定）
- 网络异常/JSON 解析异常 → `{ ok: false, status: 0, message: <异常信息> }`（`status: 0` 标记"未收到响应"，供上层区分"服务端拒绝"与"根本没连上"）

`resolve`/`fetchById`/`check` 这三个既有只读方法本次**不改动其现有 `null` 返回契约**（避免影响 `add`/`check`/`update` 现有调用方），只有新增的 `push`/`publishToTeam`/`withdraw`，以及为 `withdraw` 命令新增的鉴权版本查询方法，采用 `ApiResult<T>`。

### 9. `withdraw` 需要带鉴权的名称解析，不能直接复用现有 `resolve()`

现有 `resolve(name, author?)`（`src/providers/market.ts:66`）是无鉴权的公开查询接口：不带 `Authorization` header，只能按可选的 `author` query 参数手动指定要查哪个用户名下的技能，且内部 `catch { return null }` 把"确实不存在"和"网络/服务端故障"混为一谈。

`skills withdraw <name>` 语义上要撤回**当前登录用户自己**的技能（PENDING 状态、待作者本人操作），如果只传 `name` 不带身份，`resolve` 既无法确认"这是不是我的技能"，也无法在 401（Key 失效）时给出正确提示（会被误判为"名称不存在"）。

**决策**：新增 `resolveMine(name, apiKey): Promise<ApiResult<ResolveResponse>>` 方法，携带 `Authorization: Bearer <apiKey>` header 调用 `/api/skill/resolve`（服务端 `authGuard` 已支持 Bearer，见 `docs/claude/architecture.md` 鉴权约定），不再依赖 `author` query 参数手动指定，而是让服务端按 Token 解出的身份自动限定查询范围。若服务端当前 `resolve` 接口的鉴权/归属过滤行为不满足"仅返回当前用户自己名下的技能"，需要在实现阶段先确认 skills-market 侧 `/api/skill/resolve` 的实际权限模型（这是一个需要在 `tasks.md` 里加一步"确认"任务的开放问题，不能想当然认为现状已经满足）。

`withdraw` 命令流程改为：`resolveMine(name, apiKey)` → 若 `ok: false` 且 `status === 401` → 提示重新登录；若 `ok: false` 且其他 → 视为"未找到该技能"或转述服务端错误；若 `ok: true` → 用 `data.id` 调用 `withdraw(id, apiKey)`。

### 10. 目录遍历安全边界：symlink 与路径穿越

现有设计（决策 3）只提了"跳过隐藏文件、跳过读取失败的文件"，没有约束遍历不能逃出发布根目录。若 Skill 目录内存在指向根目录外的符号链接（无论是恶意还是误建），遍历会把链接目标的内容当作附属文件读出并上传——包括可能读到的凭证文件、系统文件等。

**决策**：遍历时对每个目录项：
- 使用 `lstat`（不是 `stat`）判断类型；遇到符号链接（`isSymbolicLink()`）直接跳过，不跟随
- 遇到非常规文件（FIFO、socket、设备文件等，`!isFile() && !isDirectory()`）直接跳过
- 对每个待读取文件，`realpath` 解析后校验其路径仍在发布根目录（`path.resolve(rootRealPath)` 前缀匹配）内，不在范围内的跳过并输出一条警告（不静默）

### 11. 二进制检测：不能靠 `readFile(..., 'utf8')` 是否抛异常判断

Node 的 `readFile(path, 'utf8')` 对无效字节序列使用 U+FFFD 替换字符解码，绝大多数情况下**不会抛异常**——原设计"读取为文本失败则跳过"这个判断条件在实践中几乎不会触发，二进制文件会被错误地当作"能读成文本"处理，内容被替换字符污染后仍会上传。

**决策**：改为显式检测——先以 `Buffer` 读取文件，检查前若干字节（如前 8000 字节，参考 Git 的二进制检测量级）内是否包含 NUL 字节（`0x00`），或使用严格模式解码校验（`TextDecoder('utf-8', { fatal: true })` 捕获真正的解码错误）。命中判定为二进制的文件跳过，不纳入 `files`。

## Risks / Trade-offs

- **[风险] 复用 `blueai-skills-market-push.apiKey` 键名将 CLI 的凭证存储耦合到另一个仓库（`liyang-skills`）的私有惯例，而非 skills-cli 自身文档化的约定** → 缓解：`skills login` 命令本身是可发现的入口（CLI 内置命令，不依赖用户知道那个键名怎么来的），且该键名已经是"Skills Market API Key"这一用途明确的通用键，风险主要是文档层面（需要在 skills-cli 的 `AGENTS.md`/`README.md` 里显式记录这个存储位置和键名，避免未来有人在 skills-cli 这边"重新发明"一个新键名）
- **[风险] 公开 Skill 无法通过 CLI 更新（只能创建/更新私有），用户可能误以为 `publish` 支持全部场景** → 缓解：命中 409 时把服务端 message 原样转述，且 CLI 帮助文本/文档中显式说明"仅操作私有技能"边界
- **[风险] `withdraw` 命令生效后，等待审核期间用户如果不知道要撤回就干等** → 缓解：`publish` 命中 400"正在审核中"错误时，可在错误提示里追加"如需修改，先运行 `skills withdraw <name>`"（后续实现时补充此提示文案，不在本次 goals 强制要求但建议顺手做）
- **[Trade-off] 不支持二进制附属文件** → 若未来出现需要图片/二进制资源的 Skill，需要单独一次改动扩展 `files` 的编码格式（如加 `encoding: 'base64'` 字段），当前场景暂不需要
- **[风险] `~/.blueai/secrets.json` 权限依赖创建时的默认 umask，且已存在的文件可能权限过宽** → 缓解：`skills login` 写入时显式 `chmod` 目录为 `0700`、文件为 `0600`；若文件已存在但权限更宽，不强制修改（避免破坏用户可能有意的多进程共享设置），但在权限过宽时输出一次性警告
- **[风险] CLI 目前没有统一的"命令失败即非零退出"机制，各命令各自处理** → 缓解：本次新增的三个命令统一约定：命令函数内部捕获到失败后设置 `process.exitCode = 1` 并 `return`（不用 `process.exit()` 硬退出，避免打断可能存在的清理逻辑/日志刷盘），跟现有 `check`/`update` 命令中"失败计数但仍走完流程"的模式保持兼容
- **[风险] `/api/skill/resolve` 当前的鉴权/归属过滤行为未经确认是否满足"仅返回当前用户自己名下技能"的假设** → 见 Open Questions

## Open Questions

- `/api/skill/resolve` 现有实现（`app/api/skill/resolve/route.ts`，skills-market 侧）在带 `Authorization: Bearer` 调用且不传 `author` 参数时，是否会自动限定为"当前登录用户名下的技能"？还是仍然是全局按 `name` 查找（可能查到别人的同名公开技能）？这决定了 `resolveMine` 的实现方式——如果服务端本身不支持"仅查自己"，`withdraw` 命令拿到的 `skillId` 就可能不是当前用户的，后续 `withdraw` 请求会在服务端因权限校验被拒（`withdrawSkill` service 内部理应有作者/管理员校验），属于"最终会被服务端拦住但体验绕了一圈"——需要在实现阶段先读 skills-market 侧代码确认，若不支持，需评估是否要求用户必须用**唯一**的技能名，或者在 CLI 侧要求显式传入 `--author`/依赖本地缓存的用户身份信息
