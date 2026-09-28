# agent-install-targets Specification

## Purpose
TBD - created by archiving change fix-openclaw-skills-dir. Update Purpose after archive.

## Requirements

### Requirement: OpenClaw 安装目标（开发版与正式版一致）

`openclaw` agent 未指定 `--global`/`-g` 时，CLI SHALL 将 skill 安装到 `<cwd>/.agents/skills/<skill-name>/`，而非 `<cwd>/skills/<skill-name>/`。指定 `-g` 时 SHALL 写入 agent 专属全局目录。上述行为对开发版与正式版构建一致，不区分构建类型。

#### Scenario: 容器内非 root 用户项目级安装

- **WHEN** 用户在容器内以非 root 用户执行 `blueai-skills add <skill> --agent openclaw --copy`（未加 `-g`）
- **THEN** 文件写入 `<cwd>/.agents/skills/<skill-name>/`，不触及 `<cwd>/skills`（OpenClaw bundled skill 目录），不产生 `EACCES` 权限错误

#### Scenario: 项目级安装计入通用 `.agents` 列表

- **WHEN** CLI 按 `skillsDir === ".agents/skills"` 判定 agent 是否归入通用 `.agents` 安装列表
- **THEN** `openclaw` 被归入该列表，与其余采用 `.agents/skills` 约定的 agent 一致处理，不再产生 `./.agents/skills/` 与 `/app/skills/` 两次独立写入

#### Scenario: 全局安装路径不受影响

- **WHEN** 用户执行 `blueai-skills add <skill> --agent openclaw --copy -g`
- **THEN** 文件写入 `~/.openclaw/skills/<skill-name>/`（`globalSkillsDir`），行为与修复前一致

#### Scenario: 开发版全局安装与正式版一致

- **WHEN** 用户在开发版构建下执行 `blueai-skills add <skill> -g`
- **THEN** 技能文件写入真实 canonical `~/.agents/skills/<skill-name>/` 与真实 agent 专属全局目录，不写入任何状态根路径
