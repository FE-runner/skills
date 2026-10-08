## 1. Agent 注册与路径解析

- [x] 1.1 在 `src/types.ts` 的 `AgentType` 增加 `workbuddy`，并在 `src/agents.ts` 新增 `workbuddy` 条目（`displayName: 'WorkBuddy'`、`skillsDir: '.workbuddy/skills'`、`globalSkillsDir` 指向 helper、`detectInstalled` 判断配置目录存在）；完成标准：`pnpm type-check` 对该文件无新增报错，且 `agents.workbuddy` 可被 `getAgentConfig('workbuddy')` 取到
- [x] 1.2 在 `src/agents.ts` 导出 `getWorkbuddyConfigDir(homeDir?, env?)`（解析优先级 `WORKBUDDY_CONFIG_DIR`（trim 非空）→ `<homeDir>/.workbuddy`）与 `getWorkbuddyGlobalSkillsDir(homeDir?, env?)`（返回 `<configDir>/skills`）；完成标准：两个 helper 均可被单测注入参数调用
- [x] 1.3 新增 `tests/workbuddy-paths.test.ts`（参照 `tests/openclaw-paths.test.ts`），覆盖：默认回退到 `~/.workbuddy/skills`；`WORKBUDDY_CONFIG_DIR` 覆盖生效；空字符串/纯空白视为未设置；`detectInstalled` 在配置目录存在/不存在时的返回值；完成标准：`pnpm exec vitest run tests/workbuddy-paths.test.ts` 全绿

## 2. 技能发现路径

- [x] 2.1 在 `src/skills.ts` 的 `prioritySearchDirs` 增加 `join(searchPath, '.workbuddy/skills')`，保留既有 `.codebuddy/skills`；完成标准：新增/扩展单测能证明来源目录下 `.workbuddy/skills/<name>/SKILL.md` 会被发现，且目录内非目录文件（如 `_bm_skillid_migration.json`）不产生技能条目

## 3. 既有类型错误修复

- [x] 3.1 修改 `src/git.ts`，把 `simpleGit({ env: ... })` 改为 `simpleGit({ timeout: ... }).env(...)`，保持传入子进程的环境变量集合不变；完成标准：`pnpm type-check` 不再报 `src/git.ts` 错误，`pnpm exec vitest run` 全绿

## 4. 文档与生成物同步

- [x] 4.1 运行 `node scripts/validate-agents.ts` 与 `node scripts/sync-agents.ts`（`pnpm run -C scripts` 在本 checkout 不可用，scripts/ 无 package.json），确认 `README.md` 生成段与 `package.json` keywords 已包含 `workbuddy`；完成标准：`git diff` 中生成段变化可解释，validate 无报错
- [x] 4.2 核对 `README.md` 的 agent 计数、Available Agents 表格行、技能发现路径列表三处均已体现 WorkBuddy；完成标准：表格存在 `.workbuddy/skills/` 与 `~/.workbuddy/skills/` 行，发现路径列表含 `.workbuddy/skills/`
- [x] 4.3 在 `CHANGELOG.md` 增加一条本次改动的 Added 记录（新增 WorkBuddy agent 支持），并按仓库既有 Keep a Changelog 风格书写；完成标准：条目位于 Unreleased/最新段落的 Added 分类下

## 5. 验证

- [x] 5.1 依次运行 `pnpm type-check`、`pnpm exec vitest run`、`pnpm format:check`，全部通过；完成标准：三条命令退出码为 0（实测 0 / 32 文件 468 测试全绿 / prettier 全通过）
- [x] 5.2 端到端安装落点验证：在临时目录以 `--agent workbuddy`（项目级）与设置 `WORKBUDDY_CONFIG_DIR` 后 `-g`（全局）各安装一个测试技能；完成标准：技能分别落在 `<tmp>/.workbuddy/skills/<skill>/SKILL.md` 与 `$WORKBUDDY_CONFIG_DIR/skills/<skill>/SKILL.md`（实测两处均产出 SKILL.md）
- [x] 5.3 真机确认：让用户在 WorkBuddy 里打开一个含 `.workbuddy/skills/<skill>/SKILL.md` 的工作区，确认该技能可被加载；完成标准：用户明确反馈加载成功（若用户暂不可验证，任务如实标注未验证并保留证据）
