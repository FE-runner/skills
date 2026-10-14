## Context

skills-cli 现有鉴权是单一函数 `getApiKey()`（`src/auth.ts`）：`SKILLS_API_KEY` 环境变量优先于
`~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]`。只有 `publish` / `withdraw` /
`whoami` 三个命令读 Key；`add` 装私有技能走匿名 `resolve(author/name)`，`list` / `check` /
`update` / `sync` 不读 Key。

blueai-cli（`@bluefocus-ai/blueai-cli`）的凭证解析在 `dist/lib/credential.js`：四级
`flag > 工作区 .blueai/credentials.json[activeProfile] > BLUEAI_API_KEY > 用户
~/.blueai/credentials.json[activeProfile]`，profile 名来自 `config.json.activeProfile`（默认
`default`），`BLUEAI_CONFIG_DIR` 覆盖配置目录并在设置时跳过工作区查找。

market 侧 central-openapi-user-auth 已冻结契约：客户端契约零变化（同 endpoint、同
`Authorization: Bearer`），统一 key 由服务端解析为用户身份；401/403 为鉴权失败，503 为中央解析
不可用（可重试、透传 `Retry-After`），500 为服务端异常。

## Goals / Non-Goals

**Goals:**

- 让"有 blueai-cli 授权"的环境（尤其是只注入 `BLUEAI_API_KEY`、key 不落盘的容器）能直接对
  Skill Market 鉴权。
- 与 blueai-cli 的凭证来源与优先级语义对齐，同时零回归地保留 skills-cli 原生来源。
- 按 market 冻结契约把 503 处理成可重试、把 500/503 与"key 无效"区分开。

**Non-Goals:**

- 不改请求头、endpoint、鉴权流程覆盖的命令集合。
- 不改 `skills login` 的写入行为（仍只写 `secrets.json`），不做与 blueai-cli 的双向写入。
- 不引入对 `@bluefocus-ai/blueai-cli` 包的运行时依赖（不 shell out、不 import）。
- 不在本 change 内改 market 侧任何代码。

## Decisions

### D1 解析链定序：原生优先，blueai 来源补充

```
1 --api-key flag
2 SKILLS_API_KEY
3 ~/.blueai/secrets.json[market key]
4 工作区 .blueai/credentials.json[activeProfile].apiKey
5 BLUEAI_API_KEY
6 用户 ~/.blueai/credentials.json[activeProfile].apiKey
```

**理由**：把原生两条整体放在前面，`SKILLS_API_KEY > secrets.json` 的相对顺序与现有 spec 一字
不改，既有用户行为零回归。

**否决的备选**：让工作区凭据压过 `SKILLS_API_KEY`（完全镜像 blueai-cli 的"工作区 > env"）。否决
原因是它会把已经显式设定 `SKILLS_API_KEY` 的用户静默改道到项目文件，属于行为回归；而目标场景
（只有 `BLUEAI_API_KEY` 的容器）在任何版本下都命中第 5 层，两版结果相同。

### D2 复刻 blueai-cli 的文件/profile 语义（而非只读环境变量）

读取 `config.json.activeProfile`（缺省 `default`）、工作区与用户级 `credentials.json`，并支持
`BLUEAI_CONFIG_DIR`。

**理由**：用户选定"标准档"，要求与 blueai-cli 完全对齐；这些来源在多 profile 开发机上是唯一生效
路径。

**代价**：形成对 blueai-cli 文件格式的隐式耦合，blueai-cli 若变更格式这边会失效。用单元测试锚定
格式来兜住。

### D3 `--api-key` 作为命令级参数，而非全局

只在 `publish` / `withdraw` / `whoami` 三个需要鉴权的命令上接受 `--api-key`。

**理由**：与既有"只有这三个命令读 Key"的边界一致；全局 flag 会被其他命令静默忽略，语义模糊。
`cli.ts` 需要把 `restArgs` 透传给 `whoami`（当前 `runWhoami()` 不接收参数）。

### D4 503 重试下沉到 provider 层（`requestApiResult`）

在 `src/providers/market.ts` 的 `requestApiResult` 内对 `503` 做有界重试（2 次 / 共 3 次尝试，
500ms → 1s + 抖动，`Retry-After` 优先但单次上限 10s），并把最终失败形态（含"服务不可用"语义）
交给命令层。

**理由**：这是所有需要鉴权的 Market 请求的公共路径；集中一处可避免三个命令各写一遍。market 已
确认 503 发生在 `authGuard()`（业务处理之前、无写入），因此包括非幂等的 `push` 在内都可安全重试。

**否决的备选**：在命令层实现重试。否决原因是重复三份且容易漂移。`requestApiResult` 目前只返回
`ApiResult`，需要额外暴露 `Retry-After`（从 `Response.headers` 读）。

### D5 错误分级统一在 `reportApiFailure` 扩展

`src/api-error.ts` 的 `reportApiFailure` 扩展：401 → 保留 login 提示；503 重试耗尽 → "服务暂不可用，
请稍后重试"；500 → 标注服务端错误；其余保持通用输出。

**理由**：`publish` / `withdraw` / `whoami` 已共用该函数，扩展单点即覆盖三处，且不改变既有 401 行为。

### D6 `skills login` 保持只写 `secrets.json`

**理由**：blueai-cli 的 `saveCredentials` 是整文件覆盖写 `credentials.json`；若让 `skills login`
也写它，需自行实现合并，否则会冲掉 blueai-cli 的 profile 配置。且 `secrets.json` 的键名是既有
约定，其他本地脚本（push.mjs）在用同一把 Key。因此本次只改读取侧。

### D7 `BLUEAI_CONFIG_DIR` 设置时跳过工作区查找

镜像 blueai-cli 的测试隔离语义。

**理由**：保持两套 CLI 在同一环境下解析结果一致（这是"兼容"的核心不变量）。

## Risks / Trade-offs

- [对 blueai-cli 文件格式的隐式耦合] → 用 `auth.test.ts` 覆盖 `config.json` 的 `activeProfile`
  解析、工作区向上查找、`BLUEAI_CONFIG_DIR` 跳过逻辑，作为格式漂移的哨兵。
- [原生优先导致残留 `secrets.json` 盖过注入的 `BLUEAI_API_KEY`] → 属预期语义；在代码注释与本
  capability 说明中写清，不静默处理。
- [重试增加交互式命令延迟] → 有界（最多 2 次、单次等待上限 10s），并输出重试进度提示；不做无限
  重试。
- [`Retry-After` 两种编码形式] → 解析需同时支持秒数与 HTTP-date。
- [真机验收依赖 market 未合并] → 实现与单测先行；真机端到端验收作为显式延后步骤，联调时以 503
  分支为新增验收点。

## Migration Plan

- 纯读取侧扩展，无数据迁移；`secrets.json` / `SKILLS_API_KEY` 继续生效，回滚只需回退本 change 的
  提交。
- 上线顺序：本 change 可先合入（对现有来源零回归）；统一 key 真机可用取决于 market 侧
  central-openapi-user-auth 上线。

## Open Questions

无。
