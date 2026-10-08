# context.md（软上下文）

本文件只记录文档之外、审查/实施 subagent 需要知道的讨论结论。与 proposal/design/tasks/delta spec 重复的内容以引用指路，不整段摘抄。

## 关键决策与理由

- **WorkBuddy 路径事实来源**：直接读本机 `/Applications/WorkBuddy.app` 的 `app.asar` 得到 `getWorkbuddySkillsDir() = getWorkbuddyConfigDir()/skills`、`WORKBUDDY_CONFIG_DIR` 与 `WORKBUDDY_DATA_FOLDER_NAME`（默认 `.workbuddy`）；项目级约定由用户实机确认是 `<工作区>/.workbuddy/skills`。详见 `design.md` Context / D1 / D2。
- **只做路径接入，不碰 WorkBuddy 自身**：内置、插件缓存、插件市场三类目录都归 WorkBuddy 管，本次只写入用户级与项目级两个目录（proposal Non-Goals 对应 `design.md` Non-Goals）。
- **类型修复并入本次**：`pnpm type-check` 在 master HEAD 已失败（`src/git.ts` 的 `simpleGit({ env })`），而归档前完整验证关卡会跑类型检查。用户明确"顺手修"。CI 实际只跑 `build` + `test`，所以该错误此前未被拦截。

## 已否决的备选方案

- **复用 `codebuddy` 的 `.codebuddy/skills`**：否决。WorkBuddy 与 CodeBuddy 是不同产品，共用目录无法归属安装结果，且与已核实约定不符。（`design.md` D1）
- **写死 `~/.workbuddy/skills`，忽略 `WORKBUDDY_CONFIG_DIR`**：否决。与 `codex`/`claude-code` 的既有环境变量覆盖模式不一致。（`design.md` D2）
- **`detectInstalled` 兼看 `<cwd>/.workbuddy`**：否决。项目级目录通常尚未创建，会造成"未安装"误判。（`design.md` D3）
- **用 `as any` 绕过类型错误**：否决。`env` 本就是 simple-git 的实例方法，断言只会掩盖真实 API 误用。（`design.md` D5）

## 范围边界

- 做：`workbuddy` agent 注册、两个安装目标路径、`WORKBUDDY_CONFIG_DIR` 覆盖、`.workbuddy/skills` 发现路径、生成物文档与 CHANGELOG、`src/git.ts` 类型修复。
- 不做：WorkBuddy 内置/插件/市场目录写入、WorkBuddy 加载逻辑改动、市场发布/锁文件格式、`WORKBUDDY_INSTANCE_NUMBER` 多实例目录（见 `design.md` Open Questions）。

## 已知坑与注意事项

- `~/.workbuddy/skills/` 里存在散落文件 `_bm_skillid_migration.json`（非技能），扫描/列表逻辑必须只按「子目录 + `SKILL.md`」收集，避免误判（task 2.1 有覆盖）。
- `src/git.ts` 当前没有单测；以 `pnpm type-check` 恢复通过 + 既有全量 `vitest` 兜底，不为 clone 引入网络依赖测试。
- 真机加载确认依赖 WorkBuddy 客户端，可能无法在自动流水线内完成（task 5.3 允许如实标注未验证）。
- baseline 状态：`pnpm install` 正常、`pnpm exec vitest run` 31 文件 461 测试全绿、`pnpm type-check` 失败（本次任务 3.1 修）。

## 实施阶段新增（apply）

- **`pnpm run -C scripts validate-agents.ts` 在本 checkout 不可用**（`scripts/` 无 package.json，报 `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`）。实际改用 `node scripts/validate-agents.ts` 与 `node scripts/sync-agents.ts`（Node v26 原生支持 TS 类型剥离）。AGENTS.md 里记录的该命令形式在本仓库不可直接执行。
- **README 生成结果反向验证了审查方那条 Critical 的误判**：`sync-agents.ts` 实际把 `.workbuddy/skills` 生成为 `- \`.workbuddy/skills/\``，agent 计数 42→43，表格与发现路径均正确。
- **`detectInstalled` 的单测策略**：不做 fs mock，而是把 `WORKBUDDY_CONFIG_DIR` 指向临时目录/不存在的子路径，断言探测结果 true/false，并在 `finally` 恢复原 env。这样既 hermetic 又覆盖了 spec 的两个探测 Scenario。
- **`src/git.ts` 修复方式**：`simpleGit({ timeout }).env(...)` 链式设置，并补一行注释说明 `env` 是实例方法而非构造选项（避免后人再写回去）。
- **task 5.3（真机加载确认）未在流水线内执行**：WorkBuddy 是 GUI 客户端，无法在自动流水线内启动验证。以两道证据替代——(a) app 包内加载器源码：`getWorkbuddySkillsDir() = <configDir>/skills` 且按「子目录 + `SKILL.md`」扫描；(b) 端到端落点实测（项目级与 `WORKBUDDY_CONFIG_DIR` 覆盖的全局级均产出 `SKILL.md`）。**用户侧运行时确认仍待补做**。
- **e2e 临时目录残留**：`/tmp/wb-e2e-8r4NMi`（清理命令 `rm -rf` 被本会话安全策略拦截，未强删；位于系统临时目录，无害）。
