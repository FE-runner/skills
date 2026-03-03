# bmc-skills

> 本项目 fork 自 [vercel-labs/skills](https://github.com/vercel-labs/skills)，为公司内部定制版本，仅供内部使用。

开放式 AI Agent 技能生态系统的 CLI 工具。

<!-- agent-list:start -->

支持 **OpenCode**、**Claude Code**、**Codex**、**Cursor** 以及 [37 个以上](#可用-agent) 的 Agent。

<!-- agent-list:end -->

## 安装技能

```bash
npx bmc-skills add vercel-labs/agent-skills
```

### 来源格式

```bash
# GitHub 简写格式 (owner/repo)
npx bmc-skills add vercel-labs/agent-skills

# 完整 GitHub URL
npx bmc-skills add https://github.com/vercel-labs/agent-skills

# 指向仓库中某个技能的直接路径
npx bmc-skills add https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines

# GitLab URL
npx bmc-skills add https://gitlab.com/org/repo

# 任意 git URL
npx bmc-skills add git@github.com:vercel-labs/agent-skills.git

# 本地路径
npx bmc-skills add ./my-local-skills
```

### 选项

| 选项                      | 说明                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `-g, --global`            | 安装到用户目录而非项目目录                                                                                                    |
| `-a, --agent <agents...>` | <!-- agent-names:start -->指定目标 Agent（如 `claude-code`、`codex`）。参见 [可用 Agent](#可用-agent)<!-- agent-names:end --> |
| `-s, --skill <skills...>` | 按名称安装指定技能（使用 `'*'` 安装所有技能）                                                                                 |
| `-l, --list`              | 列出可用技能但不安装                                                                                                          |
| `--copy`                  | 复制文件到 Agent 目录而非使用符号链接                                                                                         |
| `-y, --yes`               | 跳过所有确认提示                                                                                                              |
| `--all`                   | 将所有技能安装到所有 Agent，无需确认                                                                                          |

### 示例

```bash
# 列出仓库中的技能
npx bmc-skills add vercel-labs/agent-skills --list

# 安装指定技能
npx bmc-skills add vercel-labs/agent-skills --skill frontend-design --skill skill-creator

# 安装名称含空格的技能（需加引号）
npx bmc-skills add owner/repo --skill "Convex Best Practices"

# 安装到指定 Agent
npx bmc-skills add vercel-labs/agent-skills -a claude-code -a opencode

# 非交互式安装（适用于 CI/CD）
npx bmc-skills add vercel-labs/agent-skills --skill frontend-design -g -a claude-code -y

# 将仓库中所有技能安装到所有 Agent
npx bmc-skills add vercel-labs/agent-skills --all

# 将所有技能安装到指定 Agent
npx bmc-skills add vercel-labs/agent-skills --skill '*' -a claude-code

# 将指定技能安装到所有 Agent
npx bmc-skills add vercel-labs/agent-skills --agent '*' --skill frontend-design
```

### 安装范围

| 范围       | 标志     | 路径                | 用途                     |
| ---------- | -------- | ------------------- | ------------------------ |
| **项目级** | （默认） | `./<agent>/skills/` | 提交到项目中，与团队共享 |
| **全局**   | `-g`     | `~/<agent>/skills/` | 在所有项目中可用         |

### 安装方式

交互式安装时可选择：

| 方式                 | 说明                                                        |
| -------------------- | ----------------------------------------------------------- |
| **符号链接**（推荐） | 从各 Agent 创建到规范副本的符号链接。单一数据源，便于更新。 |
| **复制**             | 为每个 Agent 创建独立副本。适用于不支持符号链接的环境。     |

## 其他命令

| 命令                             | 说明                           |
| -------------------------------- | ------------------------------ |
| `npx bmc-skills list`            | 列出已安装的技能（别名：`ls`） |
| `npx bmc-skills find [query]`    | 交互式搜索或按关键词搜索技能   |
| `npx bmc-skills remove [skills]` | 从 Agent 中移除已安装的技能    |
| `npx bmc-skills check`           | 检查可用的技能更新             |
| `npx bmc-skills update`          | 将所有已安装技能更新到最新版本 |
| `npx bmc-skills init [name]`     | 创建新的 SKILL.md 模板         |

### `bmc-skills list`

列出所有已安装的技能，类似于 `npm ls`。

```bash
# 列出所有已安装技能（项目级和全局）
npx bmc-skills list

# 仅列出全局技能
npx bmc-skills ls -g

# 按指定 Agent 筛选
npx bmc-skills ls -a claude-code -a cursor
```

### `bmc-skills find`

交互式搜索或按关键词搜索技能。

```bash
# 交互式搜索（fzf 风格）
npx bmc-skills find

# 按关键词搜索
npx bmc-skills find typescript
```

### `bmc-skills check` / `bmc-skills update`

```bash
# 检查已安装技能是否有更新
npx bmc-skills check

# 将所有技能更新到最新版本
npx bmc-skills update
```

### `bmc-skills init`

```bash
# 在当前目录创建 SKILL.md
npx bmc-skills init

# 在子目录中创建新技能
npx bmc-skills init my-skill
```

### `bmc-skills remove`

从 Agent 中移除已安装的技能。

```bash
# 交互式移除（从已安装技能中选择）
npx bmc-skills remove

# 按名称移除指定技能
npx bmc-skills remove web-design-guidelines

# 移除多个技能
npx bmc-skills remove frontend-design web-design-guidelines

# 从全局范围移除
npx bmc-skills remove --global web-design-guidelines

# 仅从指定 Agent 移除
npx bmc-skills remove --agent claude-code cursor my-skill

# 移除所有已安装技能，无需确认
npx bmc-skills remove --all

# 从指定 Agent 移除所有技能
npx bmc-skills remove --skill '*' -a cursor

# 从所有 Agent 移除指定技能
npx bmc-skills remove my-skill --agent '*'

# 使用 'rm' 别名
npx bmc-skills rm my-skill
```

| 选项           | 说明                                     |
| -------------- | ---------------------------------------- |
| `-g, --global` | 从全局范围（~/）移除而非项目范围         |
| `-a, --agent`  | 从指定 Agent 移除（使用 `'*'` 表示全部） |
| `-s, --skill`  | 指定要移除的技能（使用 `'*'` 表示全部）  |
| `-y, --yes`    | 跳过确认提示                             |
| `--all`        | `--skill '*' --agent '*' -y` 的简写      |

## 什么是 Agent 技能？

Agent 技能是可复用的指令集，用于扩展编程 Agent 的能力。它们定义在 `SKILL.md` 文件中，包含带有 `name` 和 `description` 的 YAML 前置数据。

技能可以让 Agent 执行专门的任务，例如：

- 从 git 历史生成发布说明
- 按照团队约定创建 PR
- 与外部工具集成（Linear、Notion 等）

在 **[skills.sh](https://skills.sh)** 探索更多技能

## 支持的 Agent

技能可安装到以下任意 Agent：

<!-- supported-agents:start -->

| Agent                                 | `--agent`                                | 项目路径               | 全局路径                        |
| ------------------------------------- | ---------------------------------------- | ---------------------- | ------------------------------- |
| Amp, Kimi Code CLI, Replit, Universal | `amp`, `kimi-cli`, `replit`, `universal` | `.agents/skills/`      | `~/.config/agents/skills/`      |
| Antigravity                           | `antigravity`                            | `.agent/skills/`       | `~/.gemini/antigravity/skills/` |
| Augment                               | `augment`                                | `.augment/skills/`     | `~/.augment/skills/`            |
| Claude Code                           | `claude-code`                            | `.claude/skills/`      | `~/.claude/skills/`             |
| OpenClaw                              | `openclaw`                               | `skills/`              | `~/.openclaw/skills/`           |
| Cline                                 | `cline`                                  | `.agents/skills/`      | `~/.agents/skills/`             |
| CodeBuddy                             | `codebuddy`                              | `.codebuddy/skills/`   | `~/.codebuddy/skills/`          |
| Codex                                 | `codex`                                  | `.agents/skills/`      | `~/.codex/skills/`              |
| Command Code                          | `command-code`                           | `.commandcode/skills/` | `~/.commandcode/skills/`        |
| Continue                              | `continue`                               | `.continue/skills/`    | `~/.continue/skills/`           |
| Cortex Code                           | `cortex`                                 | `.cortex/skills/`      | `~/.snowflake/cortex/skills/`   |
| Crush                                 | `crush`                                  | `.crush/skills/`       | `~/.config/crush/skills/`       |
| Cursor                                | `cursor`                                 | `.agents/skills/`      | `~/.cursor/skills/`             |
| Droid                                 | `droid`                                  | `.factory/skills/`     | `~/.factory/skills/`            |
| Gemini CLI                            | `gemini-cli`                             | `.agents/skills/`      | `~/.gemini/skills/`             |
| GitHub Copilot                        | `github-copilot`                         | `.agents/skills/`      | `~/.copilot/skills/`            |
| Goose                                 | `goose`                                  | `.goose/skills/`       | `~/.config/goose/skills/`       |
| Junie                                 | `junie`                                  | `.junie/skills/`       | `~/.junie/skills/`              |
| iFlow CLI                             | `iflow-cli`                              | `.iflow/skills/`       | `~/.iflow/skills/`              |
| Kilo Code                             | `kilo`                                   | `.kilocode/skills/`    | `~/.kilocode/skills/`           |
| Kiro CLI                              | `kiro-cli`                               | `.kiro/skills/`        | `~/.kiro/skills/`               |
| Kode                                  | `kode`                                   | `.kode/skills/`        | `~/.kode/skills/`               |
| MCPJam                                | `mcpjam`                                 | `.mcpjam/skills/`      | `~/.mcpjam/skills/`             |
| Mistral Vibe                          | `mistral-vibe`                           | `.vibe/skills/`        | `~/.vibe/skills/`               |
| Mux                                   | `mux`                                    | `.mux/skills/`         | `~/.mux/skills/`                |
| OpenCode                              | `opencode`                               | `.agents/skills/`      | `~/.config/opencode/skills/`    |
| OpenHands                             | `openhands`                              | `.openhands/skills/`   | `~/.openhands/skills/`          |
| Pi                                    | `pi`                                     | `.pi/skills/`          | `~/.pi/agent/skills/`           |
| Qoder                                 | `qoder`                                  | `.qoder/skills/`       | `~/.qoder/skills/`              |
| Qwen Code                             | `qwen-code`                              | `.qwen/skills/`        | `~/.qwen/skills/`               |
| Roo Code                              | `roo`                                    | `.roo/skills/`         | `~/.roo/skills/`                |
| Trae                                  | `trae`                                   | `.trae/skills/`        | `~/.trae/skills/`               |
| Trae CN                               | `trae-cn`                                | `.trae/skills/`        | `~/.trae-cn/skills/`            |
| Windsurf                              | `windsurf`                               | `.windsurf/skills/`    | `~/.codeium/windsurf/skills/`   |
| Zencoder                              | `zencoder`                               | `.zencoder/skills/`    | `~/.zencoder/skills/`           |
| Neovate                               | `neovate`                                | `.neovate/skills/`     | `~/.neovate/skills/`            |
| Pochi                                 | `pochi`                                  | `.pochi/skills/`       | `~/.pochi/skills/`              |
| AdaL                                  | `adal`                                   | `.adal/skills/`        | `~/.adal/skills/`               |

<!-- supported-agents:end -->

> [!NOTE]
> **Kiro CLI 用户：** 安装技能后，需手动将其添加到自定义 Agent 的 `resources` 中，
> 位于 `.kiro/agents/<agent>.json`：
>
> ```json
> {
>   "resources": ["skill://.kiro/skills/**/SKILL.md"]
> }
> ```

CLI 会自动检测已安装的编程 Agent。如果未检测到任何 Agent，将提示你选择要安装到哪些 Agent。

## 创建技能

技能是包含 `SKILL.md` 文件的目录，文件带有 YAML 前置数据：

```markdown
---
name: my-skill
description: 这个技能的用途及使用时机
---

# My Skill

Agent 激活此技能时应遵循的指令。

## 使用时机

描述应使用此技能的场景。

## 步骤

1. 首先，执行这个
2. 然后，执行那个
```

### 必填字段

- `name`：唯一标识符（小写，允许使用连字符）
- `description`：简要说明技能的功能

### 可选字段

- `metadata.internal`：设为 `true` 可将技能从常规发现中隐藏。内部技能仅在设置 `INSTALL_INTERNAL_SKILLS=1` 时可见和可安装。适用于开发中的技能或仅供内部工具使用的技能。

```markdown
---
name: my-internal-skill
description: 默认不显示的内部技能
metadata:
  internal: true
---
```

### 技能发现

CLI 在仓库中的以下位置搜索技能：

<!-- skill-discovery:start -->

- 根目录（如果包含 `SKILL.md`）
- `skills/`
- `skills/.curated/`
- `skills/.experimental/`
- `skills/.system/`
- `.agents/skills/`
- `.agent/skills/`
- `.augment/skills/`
- `.claude/skills/`
- `./skills/`
- `.codebuddy/skills/`
- `.commandcode/skills/`
- `.continue/skills/`
- `.cortex/skills/`
- `.crush/skills/`
- `.factory/skills/`
- `.goose/skills/`
- `.junie/skills/`
- `.iflow/skills/`
- `.kilocode/skills/`
- `.kiro/skills/`
- `.kode/skills/`
- `.mcpjam/skills/`
- `.vibe/skills/`
- `.mux/skills/`
- `.openhands/skills/`
- `.pi/skills/`
- `.qoder/skills/`
- `.qwen/skills/`
- `.roo/skills/`
- `.trae/skills/`
- `.windsurf/skills/`
- `.zencoder/skills/`
- `.neovate/skills/`
- `.pochi/skills/`
- `.adal/skills/`
<!-- skill-discovery:end -->

### 插件清单发现

如果存在 `.claude-plugin/marketplace.json` 或 `.claude-plugin/plugin.json`，其中声明的技能也会被发现：

```json
// .claude-plugin/marketplace.json
{
  "metadata": { "pluginRoot": "./plugins" },
  "plugins": [
    {
      "name": "my-plugin",
      "source": "my-plugin",
      "skills": ["./skills/review", "./skills/test"]
    }
  ]
}
```

这使得与 [Claude Code 插件市场](https://code.claude.com/docs/en/plugin-marketplaces) 生态系统的兼容成为可能。

如果在标准位置未找到技能，将执行递归搜索。

## 兼容性

技能通常在各 Agent 之间兼容，因为它们遵循共享的 [Agent Skills 规范](https://agentskills.io)。但某些功能可能是特定 Agent 独有的：

| 功能            | OpenCode | OpenHands | Claude Code | Cline | CodeBuddy | Codex | Command Code | Kiro CLI | Cursor | Antigravity | Roo Code | Github Copilot | Amp | OpenClaw | Neovate | Pi  | Qoder | Zencoder |
| --------------- | -------- | --------- | ----------- | ----- | --------- | ----- | ------------ | -------- | ------ | ----------- | -------- | -------------- | --- | -------- | ------- | --- | ----- | -------- |
| 基础技能        | 是       | 是        | 是          | 是    | 是        | 是    | 是           | 是       | 是     | 是          | 是       | 是             | 是  | 是       | 是      | 是  | 是    | 是       |
| `allowed-tools` | 是       | 是        | 是          | 是    | 是        | 是    | 是           | 否       | 是     | 是          | 是       | 是             | 是  | 是       | 是      | 是  | 是    | 否       |
| `context: fork` | 否       | 否        | 是          | 否    | 否        | 否    | 否           | 否       | 否     | 否          | 否       | 否             | 否  | 否       | 否      | 否  | 否    | 否       |
| Hooks           | 否       | 否        | 是          | 是    | 否        | 否    | 否           | 否       | 否     | 否          | 否       | 否             | 否  | 否       | 否      | 否  | 否    | 否       |

## 故障排除

### "No skills found"（未找到技能）

确保仓库包含有效的 `SKILL.md` 文件，且前置数据中包含 `name` 和 `description`。

### 技能未在 Agent 中加载

- 验证技能是否安装到了正确的路径
- 查阅 Agent 的文档了解技能加载要求
- 确保 `SKILL.md` 的前置数据是有效的 YAML

### 权限错误

确保你对目标目录有写入权限。

## 环境变量

| 变量                      | 说明                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `INSTALL_INTERNAL_SKILLS` | 设为 `1` 或 `true` 以显示和安装标记为 `internal: true` 的技能 |
| `DISABLE_TELEMETRY`       | 设置此变量以禁用匿名使用遥测                                  |
| `DO_NOT_TRACK`            | 禁用遥测的替代方式                                            |

```bash
# 安装内部技能
INSTALL_INTERNAL_SKILLS=1 npx bmc-skills add vercel-labs/agent-skills --list
```

## 遥测

此 CLI 已禁用遥测功能，不会收集或发送任何使用数据。

如需重新启用，修改 `src/branding.ts` 中的 `TELEMETRY_URL` 和 `AUDIT_URL` 为你自己的端点，然后取消 `src/telemetry.ts` 中 `isEnabled()` 函数的注释。

## 相关链接

- [Agent Skills 规范](https://agentskills.io)
- [技能目录](https://skills.sh)
- [Amp 技能文档](https://ampcode.com/manual#agent-skills)
- [Antigravity 技能文档](https://antigravity.google/docs/skills)
- [Factory AI / Droid 技能文档](https://docs.factory.ai/cli/configuration/skills)
- [Claude Code 技能文档](https://code.claude.com/docs/en/skills)
- [OpenClaw 技能文档](https://docs.openclaw.ai/tools/skills)
- [Cline 技能文档](https://docs.cline.bot/features/skills)
- [CodeBuddy 技能文档](https://www.codebuddy.ai/docs/ide/Features/Skills)
- [Codex 技能文档](https://developers.openai.com/codex/skills)
- [Command Code 技能文档](https://commandcode.ai/docs/skills)
- [Crush 技能文档](https://github.com/charmbracelet/crush?tab=readme-ov-file#agent-skills)
- [Cursor 技能文档](https://cursor.com/docs/context/skills)
- [Gemini CLI 技能文档](https://geminicli.com/docs/cli/skills/)
- [GitHub Copilot Agent 技能](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
- [iFlow CLI 技能文档](https://platform.iflow.cn/en/cli/examples/skill)
- [Kimi Code CLI 技能文档](https://moonshotai.github.io/kimi-cli/en/customization/skills.html)
- [Kiro CLI 技能文档](https://kiro.dev/docs/cli/custom-agents/configuration-reference/#skill-resources)
- [Kode 技能文档](https://github.com/shareAI-lab/kode/blob/main/docs/skills.md)
- [OpenCode 技能文档](https://opencode.ai/docs/skills)
- [Qwen Code 技能文档](https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/)
- [OpenHands 技能文档](https://docs.openhands.ai/modules/usage/how-to/using-skills)
- [Pi 技能文档](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md)
- [Qoder 技能文档](https://docs.qoder.com/cli/Skills)
- [Replit 技能文档](https://docs.replit.com/replitai/skills)
- [Roo Code 技能文档](https://docs.roocode.com/features/skills)
- [Trae 技能文档](https://docs.trae.ai/ide/skills)
- [Vercel Agent Skills 仓库](https://github.com/vercel-labs/agent-skills)

## 许可证

MIT
