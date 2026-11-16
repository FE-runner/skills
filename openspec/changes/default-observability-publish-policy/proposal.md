# 提案

## 为什么

当前 `publish` 将可观测采集保持为可选三态，并依赖 Market 返回的强制来源解释结果。新的发布策略要求 CLI 默认表达“开启可观测”，同时明确可观测一旦开启后不可关闭，避免用户误以为 `--no-collect` 可以撤销已开启能力。

## 变更内容

- **BREAKING**：`skills publish` 未传采集参数时默认发送 `collectEnabled: true`，公开、私有和团队发布均使用该默认值。
- **BREAKING**：允许 `--public --no-collect`，不再在本地报告参数冲突；`--no-collect` 仅用于请求尚未开启可观测的 Skill 保持关闭。
- 删除对 `collectForcedBySignature`、`collectForcedByVisibility`、`collectForcedReason` 的响应消费，不再输出 Market 强制来源提示。
- `--no-collect` 发布成功后提示可观测不可逆：已开启的 Skill 不会被本次更新关闭。
- 同步 `publish` 参数解析、Provider 类型、CLI 帮助、README 与 `cli-publish` 行为规范。
- 补齐 `docs/check-update.md` 与 README 链接。

## 能力

### 新增能力

无。

### 修改能力

- `cli-publish`: 修改采集参数的默认值、可逆性语义、公开发布参数组合和成功输出契约，并移除 Market 强制来源字段消费要求。

## 影响

- CLI 参数解析与请求组装：`src/publish.ts`。
- Market Provider 响应类型：`src/providers/market.ts`。
- 命令帮助与用户文档：`src/cli.ts`、`README.md`、`docs/check-update.md`。
- 测试：`src/publish.test.ts`、`src/cli.test.ts`。
- 不修改 Market API、请求路径、鉴权、团队分发或安装更新流程；现有 `check/update` 行为保持不变，仅补充使用文档。
