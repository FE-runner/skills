## Context

- Agent 注册机制集中在 `src/agents.ts`：`agents: Record<AgentType, AgentConfig>`，每条只声明 `name` / `displayName` / `skillsDir` / `globalSkillsDir` / `detectInstalled`。安装逻辑（`src/add.ts`、`src/installer.ts`）全部由该表驱动，无硬编码 agent 清单。
- `AgentType` 是 `src/types.ts` 里的联合类型，新增 agent 必须同时扩展它。
- `README.md` 与 `package.json`(keywords) 含生成段，由 `scripts/sync-agents.ts` 重写；`scripts/validate-agents.ts` 目前只校验 `displayName` 唯一。
- 技能发现路径硬编码在 `src/skills.ts` 的 `prioritySearchDirs` 数组里，`.codebuddy/skills` 已在其中。
- WorkBuddy 已核实约定：用户级 `<配置目录>/skills/`（默认 `~/.workbuddy/skills/`，配置目录可被 `WORKBUDDY_CONFIG_DIR` 覆盖），项目级 `<工作区>/.workbuddy/skills/`；核心加载形态是「子目录 + `SKILL.md`」，同目录下的非技能散落文件（如 `_bm_skillid_migration.json`）不构成技能。
- `master` HEAD 上 `pnpm type-check` 已失败：`src/git.ts` 把 `env` 当作 `simpleGit()` 的构造选项传入，而 simple-git 的类型定义中 `env` 是实例方法 `env(env: object): this`。CI 只跑 `build` + `test`，所以该错误此前未被拦截。

## Goals / Non-Goals

**Goals:**

- 让 `workbuddy` 成为一等 agent：项目级与全局安装目标路径正确，且全局路径尊重 `WORKBUDDY_CONFIG_DIR`。
- 让本地来源扫描能发现 `.workbuddy/skills` 下的技能。
- 同步生成物文档与关键字，保持仓库自描述一致。
- 恢复 `pnpm type-check` 通过，使归档前的完整验证关卡可执行。

**Non-Goals:**

- 不接管 WorkBuddy 的 App 内置、插件缓存、插件市场技能目录（只读，不写入）。
- 不修改 WorkBuddy 自身的技能加载逻辑。
- 不改市场发布流程、锁文件格式、`skills` 命令语义。
- 不引入 `WORKBUDDY_INSTANCE_NUMBER` 的多实例目录后缀支持。

## Decisions

### D1: `workbuddy` 使用独立 `skillsDir` = `.workbuddy/skills`

已核实 WorkBuddy 项目级约定是 `<工作区>/.workbuddy/skills`，与其数据目录名（`WORKBUDDY_DATA_FOLDER_NAME` 默认 `.workbuddy`）一致。

- 备选：复用 `codebuddy` 的 `.codebuddy/skills`。否决——两者是不同产品，共用目录会让安装结果无法归属，且违背已核实的约定。
- 影响：`agent-install-targets` 能力新增一条 requirement。

### D2: 全局目录解析抽出可测试 helper，并支持 `WORKBUDDY_CONFIG_DIR`

新增 `getWorkbuddyGlobalSkillsDir(homeDir?, env?)`（导出），解析优先级：`WORKBUDDY_CONFIG_DIR`（trim 后非空）→ `<homeDir>/.workbuddy`，再拼 `skills`。与既有 `getOpenClawGlobalSkillsDir(homeDir, pathExists)` 一样可注入参数做单测。

- 备选：直接写死 `join(home, '.workbuddy/skills')`。否决——WorkBuddy 官方支持配置目录覆盖，与 `codex`(CODEX_HOME) / `claude-code`(CLAUDE_CONFIG_DIR) 的既有模式不一致。

### D3: `detectInstalled` 只看配置目录是否存在

判据为 `existsSync(getWorkbuddyConfigDir())`，即默认 `~/.workbuddy`。这与多数 agent 的「装过才探测到」语义一致。

- 备选：同时探测 `<cwd>/.workbuddy`。否决——项目级目录通常尚未创建，会让探测时有时无，产生"未安装"误判。

### D4: 发现路径采用「并列新增」，不替换 `.codebuddy/skills`

`prioritySearchDirs` 里同时保留 `.codebuddy/skills` 与新增 `.workbuddy/skills`，两个产品互不影响。

### D5: 类型错误用 `.env()` 实例方法修复，而非类型断言

`simpleGit({ timeout }).env({ ...process.env, GIT_TERMINAL_PROMPT: '0' })`：`env` 本就是 simple-git 的实例方法，改后语义等价（仍是把环境变量传给子进程），且有类型保证。

- 备选：`as any` / 扩展类型断言绕过。否决——掩盖真实 API 误用，后续升级仍会踩坑。

## Risks / Trade-offs

- [WorkBuddy 未来版本调整技能目录约定] → 项目级/全局两条路径都写入单一约定；若变化，只需改 `agents.ts` 的两处字面量。安装后仍建议一次真机验证（WorkBuddy 打开工作区能加载新装技能）。
- [`WORKBUDDY_INSTANCE_NUMBER` 导致的多实例目录 `~/.workbuddy-<n>`] → 本次不支持；用户可用 `WORKBUDDY_CONFIG_DIR` 显式覆盖。列为 Open Question，后续单独 change 处理。
- [技能目录内散落文件（如 `_bm_skillid_migration.json`）干扰 `list` / 扫描] → 扫描逻辑只收集「目录 + `SKILL.md`」，非目录条目跳过；用单测覆盖该场景。
- [`src/git.ts` 无既有单测，类型修复缺少回归网] → 修复保持运行语义不变，靠 `pnpm type-check` 恢复通过 + 既有全量 `vitest` 覆盖的 `add` 集成路径兜底；不额外为 clone 引入网络依赖测试。
- [新增 agent 改变 README 计数与 keywords] → 由 `scripts/sync-agents.ts` 统一生成，避免手改漂移；`validate-agents.ts` 保证 `displayName` 不冲突。

## Migration Plan

- 纯新增，无数据迁移、无破坏性变更。
- 回滚：revert 本次 propose/apply commit 即可，不残留状态。

## Open Questions

- 是否需要支持 WorkBuddy 多实例目录（`WORKBUDDY_INSTANCE_NUMBER` → `~/.workbuddy-<n>`）？本次不实现，可后续单独 change 评估。
