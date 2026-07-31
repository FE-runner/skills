## Why

`src/agents.ts:79` 中 `openclaw` agent 的 `skillsDir` 配置为裸目录名 `"skills"`。项目级安装时 `join(cwd, "skills")` 会撞上 OpenClaw 安装产物自带的 bundled skill 目录（`/app/skills`，root 所有），导致容器内非 root 用户执行安装时 `EACCES: permission denied`。更严重的是，即便修复权限，该路径也不在 OpenClaw 实际的项目级 skill 加载路径里——OpenClaw 项目级路径是 `<workspace>/.agents/skills`，相对 agent workspace 解析而非 shell cwd，写进 `<cwd>/skills` 的内容不会被 OpenClaw 加载。全部 46 个 agent 配置中 44 个使用点前缀专属子目录，仅 `openclaw` 与 `hermes` 两个使用裸 `"skills"`，此为孤立的配置缺陷，来自 skills-cli issue #1。

## What Changes

- 将 `src/agents.ts` 中 `openclaw.skillsDir` 由 `"skills"` 改为 `".agents/skills"`
- `openclaw.globalSkillsDir`（`~/.openclaw/skills`）保持不变
- 修复后 `openclaw` 会被 `isUniversalAgentsDir`（`src/agents.ts` 中按 `skillsDir === ".agents/skills"` 判定）正确归入通用 `.agents` 列表，消除此前项目级安装同时写入 `./.agents/skills/` 与 `/app/skills/` 两份文件的副作用
- README.md 中 OpenClaw 行的项目级路径列由 `skills/` 更新为 `.agents/skills/`
- `hermes` 的 `skillsDir` 是否为同类问题不在本次改动范围内，需另行核实 Hermes 的实际加载约定后再处理

## Capabilities

### New Capabilities

- `agent-install-targets`: 各 agent 项目级 skill 安装目标路径的约定，本次首次为该主题建立 spec，聚焦 OpenClaw 的路径由 `<cwd>/skills` 改为 `<cwd>/.agents/skills`，以匹配 OpenClaw 上游实际加载路径并消除与其 bundled skill 目录的写入冲突

### Modified Capabilities

（无）

## Impact

- **代码**: `src/agents.ts`（`openclaw.skillsDir` 配置值）
- **文档**: `README.md`（OpenClaw 行的项目级路径说明）
- **行为变更**: 已有用户若曾以 `--agent openclaw`（未加 `-g`）安装到 `<cwd>/skills` 的技能，不会自动迁移到新路径，需重新安装；建议安装后以 `openclaw skills list` 验证技能是否被实际加载
- **未验证项**: 修复后未在真实 OpenClaw 容器环境中实测安装与加载行为，也未核实 `hermes` 是否存在同类问题
