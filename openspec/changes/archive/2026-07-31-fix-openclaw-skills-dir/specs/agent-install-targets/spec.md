## ADDED Requirements

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
