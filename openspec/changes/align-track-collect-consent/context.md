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
