# context.md — add-blueai-cli-key-auth

本文件只记录 artifacts 之外的讨论结论（决策理由、否决备选、范围边界、已知坑）。
需求与实现细节见 proposal.md / design.md / tasks.md / specs/。

## 关键决策与理由

- **解析链定序：原生优先，blueai 来源补充**（`SKILLS_API_KEY` → `secrets.json` 保持在
  `credentials.json` / `BLUEAI_API_KEY` 之上）。理由：现有 spec 的 `SKILLS_API_KEY > secrets.json`
  相对顺序零改动，既有用户零回归。
- **标准档：完整复刻 blueai-cli 的文件与 profile 语义**。理由：真实多 profile 开发机上，工作区/用户
  `credentials.json` 是唯一生效路径；只读环境变量打不通这些机器。
- **`--api-key` 只在需要鉴权的三个命令上提供**（`publish` / `withdraw` / `whoami`）。理由：与
  "只有这三个命令读 Key" 的既有边界一致。
- **503 重试下沉到 `requestApiResult`**。理由：三条命令共用一条 Market 请求路径，集中一处避免三份
  漂移；market 已确认 503 发生在 `authGuard()`（业务处理前、无写入），含非幂等 `push` 在内均可安全重试。
- **`skills login` 只写 `secrets.json`，不做双向写入**。理由：blueai-cli 的 `saveCredentials` 是整文件
  覆盖写，若由 login 写 `credentials.json` 需自行合并，否则会冲掉 profile 配置；`secrets.json` 键名是
  既有约定（push.mjs 等脚本同用一把 Key）。

## 已否决的备选方案

- **定序 B（工作区 `credentials.json` 压过 `SKILLS_API_KEY`）**：否决。会把已显式设置
  `SKILLS_API_KEY` 的用户静默改道到项目文件，属行为回归；而目标场景（只注入 `BLUEAI_API_KEY` 的
  容器）在 A/B 两版结果相同。
- **最小档（只加 `BLUEAI_API_KEY`）**：否决。用户明确选择标准档，要求与 blueai-cli 完全对齐。
- **在命令层实现 503 重试**：否决。三处重复且易漂移。
- **`skills login` 与 blueai-cli 双向写入 `credentials.json`**：否决。整文件覆盖风险（见上）。
- **`cli.ts` 全局 `--api-key` flag**：否决。会被其他命令静默忽略，语义模糊。

## 范围边界

**做**：`src/auth.ts` 解析链、`--api-key` flag、503 有界重试、401/403/500/503 分级、相应测试与
spec 更新。

**不做**：不改请求头/endpoint；不扩鉴权命令集合；不引入对 `@bluefocus-ai/blueai-cli` 的运行时依赖
（不 shell out、不 import）；不改 market 侧代码；不改 login 写入行为。

## 已知坑与注意事项

- **`BLUEAI_CONFIG_DIR` 设置时会跳过工作区凭据查找**——这是镜像 blueai-cli 的测试隔离语义，不是
  bug；两套 CLI 在同一环境下必须给出一致解析结果（"兼容"的核心不变量）。
- **原生优先的副作用**：机器上残留 `secrets.json` 会盖过注入的 `BLUEAI_API_KEY`（本机当前即如此）。
  属预期语义，不静默处理。
- **`withdraw` 的选项解析**必须只新增 `--api-key` 白名单，仍拒绝其余 `--` 选项，否则回归
  `cli-withdraw` 的"不支持团队维度"requirement。
- **`Retry-After` 需同时支持秒数与 HTTP-date**，且单次等待上限 10s。
- **真机端到端验收依赖 market 侧 `central-openapi-user-auth` 上线**（统一 key → 200）；在此之前
  实现与单测可完成，验收延后，以 503 分支为新增验收点。

## 实施决策（apply 阶段）

- **503 退避细则在实现层定死**（proposal/design 只给了大方向）：
  - 基线退避 `500ms → 1s`，尝试序号超出后取最后一档 1s；
  - `Retry-After` 缺失、空白或不可解析 → 回退基线退避；
  - `Retry-After` 为已过期的 HTTP-date → 视为立即重试（0）；
  - 单次等待先按 10s 封顶，再叠加 `0~250ms` 抖动（故上限为 10.25s）；
  - 判定与计算抽成 `parseRetryAfterMs` / `computeRetryDelayMs` 两个纯函数，便于单测锚定。
- **`--api-key` 只做读取侧覆盖**：不打印、不写 telemetry、不进错误输出，也不落盘；因此该 flag
  的安全边界与 `SKILLS_API_KEY` 一致，仅有的额外暴露面是 shell history / process listing，
  生产环境仍推荐 env 或 credentials 文件。
- **`whoami` 参数解析保持"忽略未知参数"的既有行为**，只额外识别 `--api-key`，不引入新的未知选项
  报错分支（其 spec 未要求）。
- **`retryAfterSeconds` 作为 `ApiResult` 失败分支的可选字段暴露**，供 `reportApiFailure` 在 503
  提示中附带"建议 N 秒后重试"。
- **真机校验（已在开发机执行）**：`BLUEAI_CONFIG_DIR` 设置时跳过工作区、未设置时工作区优先均符合
  预期；本机同时存在 `secrets.json` 与 `BLUEAI_API_KEY` 时解析到 `secrets.json`（35 位市场 key），
  确认"原生优先"零回归。
