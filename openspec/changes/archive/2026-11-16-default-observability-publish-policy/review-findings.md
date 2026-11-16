# default-observability-publish-policy Review Findings

## 方案审查

- 执行轮次: 3
- 记录时间: 2026-11-16 14:51:23 CST
- 基线: propose commit `a8a786d0d836759d269cba0ddcbbc02706dc62b6`
- 记录内容: 第 3 轮（最后一轮）未自动修复的 Warning 原文

### Warning

1. [design.md:风险与权衡、迁移计划] — 默认发送 `collectEnabled: true` 的既有私有 Skill 影响仍未明确。旧语义下未传参数可能表示“新建用服务端默认、更新保持原值”；新语义会在用户未显式选择时请求开启可观测。迁移计划只说请求开始发送 `true`，没有明确“原本关闭的私有 Skill 在不带参数更新时会被请求开启”。
   建议：在风险与迁移计划中明确上述既有 Skill 更新场景，并要求 README 与 companion skill 的 BREAKING 说明覆盖该后果。
   可自动修复：是
   影响落地：否

2. [tasks.md:2.2、2.3] — 用户文档验证条件仍偏弱。2.2 只检查旧表述消失，没有正向确认默认开启、`--public --no-collect` 兼容语义和不可逆提示已写入；2.3 只有文件存在检查和人工判断“命令一致”，缺少章节、命令和 README 链接的可重复验收清单。
   建议：为 README 增加三条正向检查项，分别对应默认值、参数组合和不可逆提示；为 `docs/check-update.md` 列出必须覆盖的章节、命令和 README 链接检查方式。
   可自动修复：否
   影响落地：否

3. [tasks.md:3. 集成验证] — 集成验证仍未包含 `openspec validate --changes default-observability-publish-policy`。本 change 修改 delta spec，实施后的任务验收应显式确认 OpenSpec 结构仍有效。
   建议：在任务 3.2 或单独集成验证项中加入该命令，预期通过且失败数为 0。
   可自动修复：是
   影响落地：否
