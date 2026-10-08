## Why

`skills` CLI 已支持 40+ 个 agent 的安装目标，但缺少 WorkBuddy（腾讯桌面 agent，内核为 CodeBuddy CLI）。WorkBuddy 的技能约定已核实：用户级 `<配置目录>/skills/`（默认 `~/.workbuddy/skills/`），项目级 `<工作区>/.workbuddy/skills/`，且只认「子目录 + `SKILL.md`」这一种布局。当前用户必须手工把技能拷进这些目录，无法用 `skills add --agent workbuddy`。

同时，仓库在 `master` HEAD 上 `pnpm type-check` 已失败（`src/git.ts` 的 `simpleGit` 调用），而归档前的完整验证关卡会跑类型检查，不修则本次改动无法通过完整验证。

## What Changes

- 新增 `workbuddy` agent 支持：`AgentType` 增加 `workbuddy`，`agents.ts` 增加对应 `AgentConfig`（项目级 `.workbuddy/skills`、用户级 `~/.workbuddy/skills`、探测信号 `~/.workbuddy`）。
- 用户级目录解析尊重 `WORKBUDDY_CONFIG_DIR` 环境变量覆盖，与既有 `codex`（`CODEX_HOME`）/`claude-code`（`CLAUDE_CONFIG_DIR`）的处理模式一致。
- `src/skills.ts` 的技能发现路径（`prioritySearchDirs`）增加 `.workbuddy/skills`，使 `skills add <本地路径/仓库>` 能发现存放在该目录下的技能。
- 文档同步：`README.md`（agent 列表、数量、Available Agents 表、技能发现路径）与 `package.json`（keywords）由 `scripts/sync-agents.ts` 重新生成，不手工编辑生成段。
- `CHANGELOG.md` 增加一条本次改动的 Added 记录。
- 修复既有类型错误：`src/git.ts` 的 `simpleGit({ env })` 改为实例方法 `.env(...)`，使 `pnpm type-check` 恢复通过（运行行为不变）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-install-targets`: 新增 WorkBuddy 的项目级/用户级安装目标路径要求，以及把 `.workbuddy/skills` 纳入技能发现路径的要求。

## Impact

- 代码：`src/types.ts`（`AgentType`）、`src/agents.ts`（`workbuddy` 条目 + 目录解析常量）、`src/skills.ts`（发现路径）、`src/git.ts`（类型修复）。
- 生成物：`README.md`、`package.json`（keywords）——由 `scripts/sync-agents.ts` 产出。
- 文档：`README.md`、`CHANGELOG.md`。
- 兼容性：纯新增，不影响既有 agent 的安装路径与行为；`workbuddy` 未显式选中时不会出现在安装目标中。
- 无新增运行时依赖，无市场接口/锁文件格式变更。
