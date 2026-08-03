## Context

见 `proposal.md - Why`。当前 `src/providers/market.ts` 的 `push()` 只接受 `skillMd`/`files`/`version`/`apiKey`，请求体不携带 `visibility`；`src/publish.ts` 的 `parsePublishOptions` 只识别 `--version`/`--team`。skills-market 侧的 `skill-push-public` 变更让 `/api/skill/push` 接受可选 `visibility` 字段，`PUBLIC` 场景返回 `status: PENDING` 而非 `APPROVED`。CLI 侧要做的是最小接入：透传新字段、按返回状态调整输出、给已知失败场景补文案。

## Goals / Non-Goals

**Goals:**

- `--public` flag 透传 `visibility: PUBLIC` 到 push 请求体，不改变不带该 flag 时的任何行为。
- PUBLIC 场景的成功/失败输出让用户能一眼看出"进入审核"而非"已生效"。
- `--team` 与 `--public` 组合时两条调用链路互不干扰。

**Non-Goals:**

- 不在 CLI 侧做审核结果查询/轮询（用户需要另外用 Web 界面或飞书通知感知审核结果，CLI 只负责提交）。
- 不支持 PRIVATE ↔ PUBLIC 切换的专门命令（这本来就不是 push 的职责，跟 market 侧一致）。
- 不改动 `skills withdraw`：它已经是通用实现，天然支持撤回公开 Skill 审核。

## Decisions

### 1. `visibility` 参数放在 `push()` 最后一个可选参数位置，不用 options 对象重构签名

`push(skillMd, files, version, apiKey, visibility?)`。备选方案是把 `push()` 签名整体改成一个 options 对象（更符合项目"避免布尔/多参数、优先选项对象"的惯例）。但 `push()` 当前已有 4 个位置参数且只被 `publish.ts` 单处调用，改成 options 对象属于超出本次变更范围的签名重构，容易在同一个 PR 里混入不相关的改动。这里选择追加一个可选参数，保持最小 diff；如果未来 `push()` 还要加更多可选字段，再一起重构成 options 对象。

### 2. 成功输出文案判定：`options.public && pushResult.data.status === 'PENDING'`，两个条件都要

`runPublish` 判断"是否要输出已提交审核"文案时，SHALL 同时满足两个条件：本地 `options.public` 为真，且 `pushResult.data.status === 'PENDING'`。只看 `status === 'PENDING'` 不够——理论上不带 `--public` 的 PRIVATE upsert 请求，服务端字段也不该是 PENDING，但 CLI 不应该依赖"服务端永远不会在 PRIVATE 分支返回 PENDING"这个隐含假设来保证"不带 `--public` 输出不变"的契约；显式加上 `options.public` 这个本地已知条件，才能保证不带 `--public` 时输出逐字节不变，不受服务端未来行为变化影响。

### 3. 错误场景提示按 status code 区分，不依赖精确匹配服务端 message 文本

Market 侧目前的错误响应用 `message` 描述具体原因（如"Skill 正在审核中，无法更新"），没有为这几个 PUBLIC 场景单独定义结构化 `code`。CLI 侧在 `--public` 分支对 403/409/400 状态码分别追加一行固定提示，只按 status code 区分，不解析 message 文本。这意味着同一个 status code 下（比如两种 409：命中同名 PRIVATE / 全局同名 PUBLIC 冲突）暂时给不出更细分的提示——如果后续市场侧补充结构化 `code` 字段，CLI 可以再细化。

## Risks / Trade-offs

- **[Risk]** 409 状态码在 PUBLIC 场景下对应两种不同原因，CLI 目前只能按 status code 给出通用提示，可能文案不够精确。→ **Mitigation**：提示文案覆盖两种可能原因，让用户自行判断；服务端原始 `message` 仍然会被输出，不会丢失细节。
- **[Trade-off]** CLI 端到端行为依赖 skills-market 的 `skill-push-public` 部署，本地开发阶段只能靠 mock 响应验证，无法针对真实 PENDING/403/409 场景跑集成测试。→ 已在 proposal 的 Impact 里注明，上线后需手动补一轮真实验证。
