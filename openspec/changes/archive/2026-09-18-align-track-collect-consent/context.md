# align-track-collect-consent Context

## 范围边界

- 本次只做 P0 + P1：`track on` 对齐有效采集判定，以及 CLI 仓内采集同意 spec 的旧口径清理。
- 明确不做：market 仓代码/迁移、`skills obs` 链路、`skills publish --collect`、CLI 读取 `SkillObsManifest` / `obsTransformStatus`。
- 验收以 CLI 行为为准：`add` 与 `track` 对 `collect` 的判定必须一致；`collect={reason}` 不能产生 `collectConsent=true`。

## 关键决策

- 有效 collect 判定抽到共享模块，避免 `add` 与 `track` 再次分叉；判定要求 `collect.config` 与 `collect.meta.blueai_signature` 同时存在。
- `track on` 遇到无效 collect 时保持原安装和原 lock 状态，不把一次开启失败变成静默关闭。
- 团队批量安装的“带采集”计数只统计有效 collect，`{reason}` 不计入询问触发。
- `skill-collection-consent` 只保留跨仓接口契约；CLI 状态机、首次询问、`track` 行为统一归 `cli-skill-collection-consent`。

## 已否决备选

- 在 `track.ts` 复制一份判定：会让契约变化再次分叉，否决。
- 把 `{reason}` 当 hard error 并写 `collectConsent=false`：会替用户改变既有选择，否决。
- 让 CLI 读取 market 内部 `SkillObsManifest` / `obsTransformStatus`：把服务端数据模型耦进客户端，否决。
- 合并两份 spec 为一份：CLI 行为契约与跨仓接口契约职责不同，本次只消除重复，不合并。

## 已知坑与注意事项

- `Skill.collectEnabled`、`SkillObsManifest` / `obsSnapshot` 是 market 内部实现；CLI 只消费安装接口的 `collect` 与 `files`。
- `{reason}` 是改造失败降级响应，不是“作者未开启采集”；错误文案应尽量带出 reason，便于诊断。
- 存量用户若此前因 `{reason}` 被误写 `collectConsent=true`，本 change 不做自动修复；后续 `track off` 或用有效版本重新 `track on` 可纠正。
- OpenSpec delta 不能修改既有 capability 的 Purpose；主 spec Purpose 与 Open Questions 的直接更新放在 apply 阶段，见 `design.md` D5 与 `tasks.md` 2.1。
- propose 阶段 commit 只允许包含本 change 目录；不要把主 spec Purpose 修复混进 propose commit。

## 实施决策（apply）

- 共享模块落地为 `src/collect.ts`，导出 `hasValidCollect` 与 `getCollectFailureReason`；后者只用于 `track on` 的错误提示，不改变判定。
- `src/add.ts` 只删除本地判定并改为引用共享模块，未改首次探测、团队探测与非交互默认拒绝语义。
- `src/track.test.ts` 需要在 `beforeEach` 清理 mock 调用历史；否则 installer 调用会跨用例累积，导致失败路径断言误报。
- task 2.1 的验证已收窄为主 spec Purpose/Open Questions 检查：旧 requirement 由 delta spec 在 archive 阶段移除，apply 阶段直接删除会与 REMOVED delta 冲突。
- 验证结果：`pnpm test src/track.test.ts src/add.test.ts tests/market-observability-provider.test.ts`、`pnpm type-check`、`pnpm format:check`、`pnpm test` 均通过。

## Review Warning 修复

- `add` 在已同意采集（`collectConsent=true`）但当前版本返回无效 collect 时，改为本次安装原版、保留用户同意状态并输出告警；不把服务端降级误呈现为已安装监测版。
- delta spec 将有效采集判定收紧为“非空字符串 `meta.blueai_signature`”，与实现一致。
- CHANGELOG 改为“delta spec 已移除旧口径；归档后行为统一”，避免在主 spec 旧 requirement 尚未 archive 时过早宣称完全移除。
