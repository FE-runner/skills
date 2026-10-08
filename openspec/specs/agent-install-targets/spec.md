# agent-install-targets Specification

## Purpose
TBD - created by archiving change fix-openclaw-skills-dir. Update Purpose after archive.
## Requirements
### Requirement: OpenClaw 项目级 skill 安装目标路径

`openclaw` agent 未指定 `--global`/`-g` 时，CLI SHALL 将 skill 安装到 `<cwd>/.agents/skills/<skill-name>/`，而非 `<cwd>/skills/<skill-name>/`。

#### Scenario: 容器内非 root 用户项目级安装

- **WHEN** 用户在容器内以非 root 用户执行 `blueai-skills add <skill> --agent openclaw --copy`（未加 `-g`）
- **THEN** 文件写入 `<cwd>/.agents/skills/<skill-name>/`，不触及 `<cwd>/skills`（OpenClaw bundled skill 目录），不产生 `EACCES` 权限错误

#### Scenario: 项目级安装计入通用 `.agents` 列表

- **WHEN** CLI 按 `skillsDir === ".agents/skills"` 判定 agent 是否归入通用 `.agents` 安装列表
- **THEN** `openclaw` 被归入该列表，与其余采用 `.agents/skills` 约定的 agent 一致处理，不再产生 `./.agents/skills/` 与 `/app/skills/` 两次独立写入

#### Scenario: 全局安装路径不受影响

- **WHEN** 用户执行 `blueai-skills add <skill> --agent openclaw --copy -g`
- **THEN** 文件写入 `~/.openclaw/skills/<skill-name>/`（`globalSkillsDir`），行为与修复前一致

### Requirement: WorkBuddy agent 安装目标路径

CLI SHALL 支持 `workbuddy` agent：项目级安装写入 `<cwd>/.workbuddy/skills/<skill-name>/`，全局安装写入 WorkBuddy 配置目录下的 `skills/<skill-name>/`（默认 `~/.workbuddy/skills/`）。WorkBuddy 用户级技能目录 SHALL 尊重 `WORKBUDDY_CONFIG_DIR` 环境变量覆盖。

#### Scenario: 项目级安装到工作区数据目录

- **WHEN** 用户在工作区目录内执行 `blueai-skills add <skill> --agent workbuddy --copy`（未加 `-g`）
- **THEN** 文件写入 `<cwd>/.workbuddy/skills/<skill-name>/`，不写入用户级目录

#### Scenario: 全局安装到用户级技能目录

- **WHEN** 用户执行 `blueai-skills add <skill> --agent workbuddy --copy -g`，且未设置 `WORKBUDDY_CONFIG_DIR`
- **THEN** 文件写入 `~/.workbuddy/skills/<skill-name>/`

#### Scenario: 配置目录被环境变量覆盖

- **WHEN** 用户设置了 `WORKBUDDY_CONFIG_DIR` 并执行 `blueai-skills add <skill> --agent workbuddy -g`
- **THEN** 全局安装 SHALL 写入 `$WORKBUDDY_CONFIG_DIR/skills/<skill-name>/`，而非 `~/.workbuddy/skills/`

#### Scenario: workbuddy 未被选中时不影响其他 agent

- **WHEN** 用户执行 `blueai-skills add <skill> --agent codex`（未选择 `workbuddy`）
- **THEN** 不产生任何对 `.workbuddy/skills` 或 `~/.workbuddy/skills` 的写入

### Requirement: WorkBuddy 技能目录纳入技能发现路径

当 `skills add` 以目录或仓库为来源扫描技能时，CLI SHALL 把来源根目录下的 `.workbuddy/skills` 纳入候选发现路径，识别其中「子目录 + `SKILL.md`」形态的技能。

#### Scenario: 从本地来源发现 WorkBuddy 技能

- **WHEN** 用户执行 `blueai-skills add <本地路径>`，且该路径下存在 `.workbuddy/skills/<skill-name>/SKILL.md`
- **THEN** 该技能 SHALL 出现在候选技能列表中

### Requirement: WorkBuddy agent 安装状态探测

CLI SHALL 在探测已安装 agent 时，把 WorkBuddy 配置目录存在视为 `workbuddy` 已安装；配置目录解析 SHALL 与安装目标一致，即优先 `WORKBUDDY_CONFIG_DIR`，否则默认 `~/.workbuddy`。

#### Scenario: 配置目录存在时探测到 WorkBuddy

- **WHEN** 用户执行需要探测已安装 agent 的命令（例如 `blueai-skills add -y` 的自动选择），且默认 `~/.workbuddy` 或 `WORKBUDDY_CONFIG_DIR` 指向的目录存在
- **THEN** `workbuddy` SHALL 出现在已安装 agent 集合中

#### Scenario: 配置目录不存在时不探测到 WorkBuddy

- **WHEN** 默认 `~/.workbuddy` 不存在，且未设置有效的 `WORKBUDDY_CONFIG_DIR`
- **THEN** `workbuddy` SHALL NOT 出现在已安装 agent 集合中
