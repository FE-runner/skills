# 审查未修项

## 方案审查

- 执行轮次：3
- 记录时间：2026-11-16
- 基线：`f77aaddfe095f26ad1347d86fe702ba3d9eb2147`

1. [openspec/changes/install-observability-rules/specs/cli-skill-collection-consent/spec.md:5; openspec/changes/install-observability-rules/specs/cli-skill-collection-consent/spec.md:79; openspec/specs/cli-skill-collection-consent/spec.md:23; openspec/specs/cli-skill-collection-consent/spec.md:94] — 上一轮 `影响落地=否` 的 Warning 仍存在。Requirement 标题继续使用“安装时确定并重新确认 consent”，团队场景继续叫“团队已拒绝项重新确认”；但正文和 THEN 都规定已有 `false` 直接复用、不重新询问。标题与实际行为不一致，容易误导后续维护者。
   问题细节：标题语义与正文规定的“直接复用、不重新询问”不一致。
   建议: 使用 OpenSpec `RENAMED Requirements` 将标题改为“安装时确定并复用 consent”，同时把团队场景改为“团队已拒绝项保持拒绝”。当前文件已说明直接复用，因此不需要改变行为口径。
   可自动修复：否
   影响落地：否

2. [../../learn/liyang-skills/src/blueai-skills-cli/references/troubleshooting.md:21-23] — 标题仍写“`publish --public --no-collect` 后采集仍然开启”，但正文已经说明该组合不会发起请求、CLI 会在参数解析阶段直接报错。标题描述的是已废弃的旧行为，与新 CLI 规则及同段正文冲突，会让按错误信息搜索的用户误以为命令仍会执行。
   问题细节：故障排查标题描述旧行为，与同段新行为冲突。
   建议: 将标题改为“`publish --public --no-collect` 为什么直接报错”或等价表述，正文继续说明不读文件、不请求 Market、不创建版本。
   可自动修复：否
   影响落地：否
