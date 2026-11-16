# 设计

## 上下文

参见 `proposal.md`。当前 `parsePublishOptions` 将 `collectEnabled` 表示为 `undefined | true | false`，`runPublish` 对公开发布强制归一为 `true`，并在成功响应中读取三个 Market 强制来源字段。新策略要求请求默认表达开启，并将“不可关闭”作为统一成功提示，而不是依赖服务端强制来源解释。

## 目标与非目标

**目标：**

- 让未传采集参数的所有 `publish` 请求确定发送 `collectEnabled: true`。
- 保留 `--no-collect` 作为“请求尚未开启的 Skill 保持关闭”的显式选项。
- 移除仅服务于旧强制来源输出的 Provider 响应字段。
- 将 stash 中仍有效的 `check/update` 使用文档和 README 链接纳入仓库。

**非目标：**

- 不修改 `/api/skill/push` 请求路径、鉴权、团队分发或错误分级。
- 不修改 `add`、`check`、`update` 或 `collectConsent` 状态机。
- 不恢复 `.tmp-npx-prod-probe/` 临时探测文件。

## 决策

### D1：参数解析默认值改为 true

`parsePublishOptions` 将 `collectEnabled` 初始化为 `true`；`--collect` 显式写 `true`，`--no-collect` 显式写 `false`。删除 `--public --no-collect` 的冲突分支，使可见性和采集参数相互独立。

替代方案是保留三态并在 `runPublish` 中按可见性归一化，但这会让公开发布和私有发布拥有不同默认语义，与本次统一策略不符，已否决。

### D2：请求统一透传解析后的采集值

`runPublish` 直接向 `marketProvider.push` 传递解析后的 `collectEnabled`，不再因 `--public` 改写为 `true`。这样默认开启、显式 `--collect` 和显式 `--no-collect` 在所有发布范围内只有一套行为。

### D3：Provider 不再保留强制来源字段

从 `marketProvider.push` 的请求结果类型和响应映射中删除 `collectForcedBySignature`、`collectForcedByVisibility`、`collectForcedReason`。Market 即使返回这些字段，CLI 也忽略，避免两套采集结果解释并存。

替代方案是保留字段但不再输出，这会留下未消费的契约和测试替身噪音，已否决。

### D4：仅在 `--no-collect` 成功后提示不可逆语义

`runPublish` 在 push 成功后检查本次请求的 `collectEnabled === false`，输出统一说明：已开启可观测的 Skill 不会被关闭，本次更新后仍保持开启。提示不代表服务端必然关闭尚未开启的 Skill，只解释 `--no-collect` 的请求语义。

### D5：文档作为独立工作项

`docs/check-update.md` 描述当前已实现的 `check/update` 行为，README 只增加链接。这些改动不与 publish 行为逻辑混在同一实现函数中，但随本次 change 的任务拆分和验证一起管理。当前 `.gitignore` 已覆盖 `.agents/` 与 `.claude/`，无需重复修改。

### D6：companion skill 必须随 publish 契约同步

项目 `AGENTS.md` 要求命令、参数、输出或工作流变化时同步 `blueai-skills-cli` companion skill。`SKILL.md` 负责入口和快速影响提示，`references/publish.md` 负责完整参数与示例；若其中已有采集失败排查说明，`references/troubleshooting.md` 也同步更新。外部仓库 `liyang-skills/AGENTS.md` 规定 skill 内容变更必须升级 `metadata.version`，破坏性行为使用 major；本次应先用 `npm run check:market -- blueai-skills-cli` 确认 Market 基准，再按仓库规则升级 major，并运行 `npm run check -- blueai-skills-cli` 与 `npm run pack -- blueai-skills-cli`。外部仓库改动单独提交，不混入当前仓库的 apply commit。

## 风险与权衡

- [`--no-collect` 无法撤销服务端已开启状态] → 成功输出明确说明不可逆语义，避免用户把该参数理解为撤销开关。
- [`--public --no-collect` 不再本地失败，服务端可能拒绝或忽略 false] → 保持参数透传，由 Market 返回实际错误或状态，不重复建立本地可见性规则。
- [移除强制来源字段会减少诊断信息] → 新策略不再区分来源；服务端不可关闭状态由统一提示覆盖，后续若产品重新要求来源展示，应以新契约提案恢复。
- [文档与行为改动同处一个 change] → tasks 将代码、测试、文档和仓库配置拆开，方便 review 和后续回滚定位。
- [旧测试 mock 仍包含已删除字段] → 删除定向测试，并保留现有发布成功、审核、团队和错误路径回归。

## 迁移计划

无数据迁移和依赖升级。发布新 CLI 后，未传采集参数的用户请求将开始显式发送 `collectEnabled: true`；旧 Market 对额外或未知响应字段无需调整。回滚只需恢复上一版 CLI 参数默认值和 Provider 字段映射，不涉及本地状态。
