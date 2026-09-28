# cli-dev-market-only Context

## 范围边界

- 本次把开发版的隔离范围收窄到只剩市场端点与 npx 提示 tag。
- 明确不做：两个市场 skillId 差异的代码层规避、`~/.blueai-skills-dev/` 的自动清理与迁移、dev 预发布通道改动、项目级 `skills-lock.json` schema 改动。
- 正式构建行为必须零变化。

## 关键决策

- 直接删除状态根与隔离模式，不留一个恒等于真实路径的间接层。
- 删除 `BLUEAI_SKILLS_HOME` / `BLUEAI_SKILLS_DEV`：静默忽略会给使用者错误预期，运行时覆盖只保留 `SKILLS_SITE` 与既有 `SKILLS_API_KEY`。
- 保留 `src/paths.ts` 作为全局锁路径的唯一来源，承接上一期把 `cli.ts` / `skill-lock.ts` 重复实现去重的成果。
- `build.config.mjs` 只保留 `SKILLS_DEFAULT_SITE` 与 `BLUEAI_NPX_TAG` 的 dev/prod 双向显式注入，删除 dev 构建标记。
- 两个市场的 skillId 差异不做代码规避：共用锁是本次刻意选择的状态，改为文档明示其影响。

## 已否决备选

- 保留状态根但默认指向真实 home：恒等间接层只增加阅读成本，否决。
- 保留两个环境变量为无操作：静默忽略会让使用者以为仍然生效，否决。
- 在锁里按市场分区记录（例如 dev 单独存 skillId）：会重新引入状态分叉，违背本次目标，否决。
- 自动删除 `~/.blueai-skills-dev/`：属于用户数据，不擅自删除，改为文档提示。

## 已知坑与注意事项

- 共用真实锁后，开发市场写入的 `skillId` 在正式市场查不到，正式版 `check -g` 对这些条目匹配不上；重装同名正式技能可恢复。
- 同名技能在开发版与正式版之间互相覆盖。
- 登录态共享：切换市场需要重新 `login`，或临时用 `SKILLS_API_KEY` 指定。
- 移除两个环境变量属破坏性变更；上一期 dev 版本的使用者若显式设置过，需要自行删除。
- 两个主 spec 的 Purpose 只能由 apply 阶段直接修改，见 design D7 与 tasks 3.5 / 3.6。
- 开发版写入真实 agent 目录是本次要达成的效果，使用说明中需保留"测试后如何清理"的提示。

## 实施决策（apply）

- 隔离机制整体删除：`src/paths.ts` 只保留 `getCredentialDir()` 与 `getGlobalSkillLockPath()`；`src/installer.ts` 恢复 `homedir()` 基准与 `isGlobal && isUniversalAgent(agentType)` 判断，删除 `isCanonicalOnlyGlobalInstall` helper；`src/remove.ts` 恢复真实 agent 目录的扫描与清理。
- `build.config.mjs` 删除 dev 构建标记注入，只保留 `SKILLS_DEFAULT_SITE` 与 `BLUEAI_NPX_TAG` 的 dev/prod 双向显式注入。
- 测试：删除 `tests/dev-isolation.test.ts`；`src/paths.test.ts` 收缩为凭证目录 / 全局锁路径断言，并新增“已移除的隔离开关不再影响任何路径”用例。
- 按 design D7 直接修正两个主 spec 的 Purpose（`cli-dev-distribution`、`cli-skill-collection-consent`）。
- 文档：`README.md`、`CLAUDE.md`、`CHANGELOG.md`、`DEV_VERSION_USAGE.md` 已同步；新增「测试市场（网页端）」章节，写入市场入口与可观测页面 `.../dashboard/observability` 的用途，并附界面截图（`assets/dev-market-observability.png`）。飞书文档以 `overwrite` 重写（revision 8，含图片 block，无 warning），回查确认仅保留“变量已移除”与“旧状态根目录不再读取”两处刻意提及。
- 披露风险（待用户确认）：截图含真实主机名、serviceName（BSM-…）与团队名称；仓库的 GitHub 镜像 `FE-runner/skills` 是 public，若把该图片随 `develop` 推到该镜像会公开这些信息。本次仅本地提交，未 push。
- 验证结果：`pnpm test` 531 passed；`pnpm type-check`、`pnpm format:check` 通过；dev 构建产物含 `domob-inc.cn` 与 `@dev` 且无 `BLUEAI_SKILLS_DEV_BUILD` / 状态根引用，正式构建产物含 `bluemediagroup.cn` 与 `@latest`；同一命令在 dev / prod 构建下的 HOME 文件树 `diff` 为空；状态根目录不再生成。
