## Context

上一期 change（`cli-dev-distribution`）为开发版引入了完整状态隔离：凭证、全局锁、canonical 技能目录都收拢到 `~/.blueai-skills-dev/`，且不向真实 agent 目录写入。落地使用后发现隔离切断了真实使用链路——开发版安装的技能 Claude / Codex 读不到，且与正式版的技能状态、登录态割裂。见 `proposal.md` 获取动机与范围。

## Goals / Non-Goals

**Goals:**

- 开发版与正式版共用同一套本地状态路径，开发版安装的技能可被真实 agent 使用。
- 开发版只保留两处差异：默认市场端点与命令提示中的 npx tag。
- 移除只为隔离服务的开关与分支，减少两个构建之间的行为分叉面。

**Non-Goals:**

- 不做两个市场 skillId 体系差异的代码层规避。
- 不迁移或清理用户已经生成的 `~/.blueai-skills-dev/` 目录。
- 不改变 dev 预发布通道（`dev-v*` 标签、`--tag dev`、跳过 GitHub Release）。
- 不改 `skills-lock.json`（项目级锁）schema。

## Decisions

### D1：删除状态根与隔离模式，只保留市场端点差异

`src/paths.ts` 移除 `IS_DEV_ISOLATION`、`getStateRoot()`、`getGlobalBaseDir()`；`getCredentialDir()` 固定返回 `~/.blueai`；`getGlobalSkillLockPath()` 固定走既有 XDG / `~/.agents` 规则。

备选：保留状态根但让它默认指向真实 home。否决原因：留一个恒等于真实路径的间接层只会增加阅读成本。

### D2：删除 `BLUEAI_SKILLS_HOME` 与 `BLUEAI_SKILLS_DEV`

两个变量只服务于已移除的隔离模式，删除后开发版的运行时覆盖只剩 `SKILLS_SITE`（市场端点）与既有的 `SKILLS_API_KEY`。

备选：保留为无操作变量。否决原因：静默忽略会给使用者错误预期，不如直接移除并在文档说明。

### D3：`src/paths.ts` 保留，作为全局锁路径的唯一来源

上一期已把 `src/cli.ts` 与 `src/skill-lock.ts` 的重复 `getSkillLockPath()` 收口到 `paths.ts`，本次保留该收口成果，只删除其中的隔离分支。

### D4：`build.config.mjs` 只保留市场地址与 npx tag 注入

删除 `BLUEAI_SKILLS_DEV_BUILD` 注入；保留 `SKILLS_DEFAULT_SITE` 与 `BLUEAI_NPX_TAG` 的 dev/prod 双向显式注入（避免运行时环境变量改变默认值）。

### D5：隔离相关测试改为"两个构建共用真实路径"断言

删除 `tests/dev-isolation.test.ts`；`src/paths.test.ts` 收缩为全局锁路径的 XDG 与默认路径断言，并断言 `BLUEAI_SKILLS_HOME` / `BLUEAI_SKILLS_DEV` 不再影响路径。`src/remove.test.ts` 与 `tests/list-installed.test.ts` 回归真实目录断言。

### D6：两个市场 skillId 差异只做文档明示，不做代码规避

开发版与正式版共用全局锁后，开发市场写入的 `skillId` 在正式市场查不到，表现为正式版 `check` 对这些条目匹配不上；同名技能在两个市场之间互相覆盖。这两点是共用状态的必然结果，本次不引入按市场分区的锁结构（那会重新引入分叉），改由使用说明明示。

### D7：涉及既有 capability 的 Purpose 在 apply 阶段直接修正

OpenSpec delta 不支持修改既有 capability 的 Purpose。`cli-dev-distribution` 的 Purpose 写有"以独立状态根隔离本地凭证与安装状态"，`cli-skill-collection-consent` 的 Purpose 写有"开发隔离模式下为状态根下的同名文件"，两处都需要在 apply 阶段直接改主 spec，不进入 propose 阶段 change-dir-only commit。

## Risks / Trade-offs

- [正式版 `check` 对开发版装的技能匹配不上] → 属已知行为，文档明示；测试期结束用同名正式技能重装即可恢复。
- [同名技能互相覆盖] → 文档明示；建议测试用不冲突的技能名或测试后重装正式版本。
- [登录态共享导致切市场需重新 `login`] → 文档明示，并提示可用 `SKILLS_API_KEY` 临时区分。
- [删除环境变量属行为破坏] → 变量只存在于上一期未广泛使用的开发版，属可接受范围；在 CHANGELOG 与使用说明中标注。
- [真实 agent 目录被开发版写入] → 这是本次要达成的效果；使用说明中保留"测试后如何清理"的提示。

## Migration Plan

1. 正式版用户：完全不受影响，正式构建的注入值与路径均未改变。
2. 开发版使用者：升级到新 dev 版本后，凭证、技能、全局锁自动回到真实路径，无需手工迁移。
3. 此前生成的 `~/.blueai-skills-dev/` 不再被读取，可选择手动删除；本 change 不自动删除。
4. 回滚策略：恢复 `src/paths.ts` 的隔离分支与两个环境变量即可；不涉及持久化格式变化。
