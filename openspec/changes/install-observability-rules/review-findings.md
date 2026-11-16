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

## 代码审查

- 执行轮次：3
- 记录时间：2026-11-16
- 基线：`19ce40788d82d1e7aa05de5df71bc63185e91790`

1. [src/cli.ts:749; src/cli.ts:843; src/cli.ts:938; src/add.ts:3427] — 旧内部参数 `--recheck-collect-consent` 仍由 update 子进程传入，但 `parseAddOptions` 已不再识别它，参数会被静默忽略；logo 隐藏逻辑仍依赖这个失效参数。当前 update 行为正常，属于后续清理和回归风险。
   问题细节：update 内部参数接口与解析器不一致。
   建议: 移除两个 `spawnSync` 参数中的旧 flag，并为嵌套 add 的 logo 隐藏定义独立、受支持的内部机制；补测试核对实际 spawn 参数。
   可自动修复：否
   影响落地：否

2. [openspec/specs/cli-skill-collection-consent/spec.md:23; openspec/changes/install-observability-rules/specs/cli-skill-collection-consent/spec.md:5] — Requirement 标题仍为“安装时确定并重新确认 consent”，但现有选择在 lock 为 `true`/`false` 时直接复用，只有缺失时才询问，标题中的“重新确认”已不符合正文和代码。
   问题细节：标题术语与实际行为不一致。
   建议: 将两处标题统一改为“安装时确定并复用 consent”或“consent 三态确定与复用”。
   可自动修复：是
   影响落地：否
