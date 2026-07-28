## Context

`src/agents.ts` 中 `openclaw` agent 的 `skillsDir: "skills"` 是纯静态配置值。该值在 `join(options.cwd || process.cwd(), agent.skillsDir)` 处被消费，决定项目级安装的目标目录；`--global`/`-g` 场景走 `globalSkillsDir`，不受影响。同一文件中另有 `hermes` 使用同样的裸值 `"skills"`，本次不处理。

## Goals / Non-Goals

**Goals:**

- 将 `openclaw.skillsDir` 改为 `.agents/skills`，匹配 OpenClaw 上游项目级 skill 加载路径
- 消除 `<cwd>/skills` 与 OpenClaw bundled skill 目录（`/app/skills`）的写入冲突
- 修复后 `openclaw` 自动落入按 `skillsDir === ".agents/skills"` 判定的通用 `.agents` 列表，去除重复写入两份文件的副作用
- 同步更新 README.md 中对应文档行

**Non-Goals:**

- 不处理 `hermes` 的同类配置（未核实其真实加载约定）
- 不做已安装技能的自动迁移（`<cwd>/skills` → `<cwd>/.agents/skills`）
- 不改动 `globalSkillsDir` 或 `-g` 安装流程

## Decisions

- **改为 `.agents/skills` 而非其他路径**：OpenClaw 官方文档标注 `.agents/skills` 为项目级 skill 加载路径的第 2 优先级（高于 managed 与 bundled），且与其余 44 个 agent 的点前缀约定一致，改动成本最小（一行配置值）。
- **只改配置值，不改消费逻辑**：`join(cwd, agent.skillsDir)` 的拼接逻辑本身正确，问题只在传入的 `skillsDir` 字符串错误，无需触及 `dist/cli.mjs` 中的路径拼接或通用列表判定代码。
- **不做自动迁移**：历史安装数量未知，静默迁移文件有覆盖用户数据风险；改为在文档中提示用户重新安装并用 `openclaw skills list` 验证。

## Risks / Trade-offs

- [已安装到旧路径 `<cwd>/skills` 的技能在修复后不会被自动发现] → 升级说明中提示用户对已装 skill 重新执行 `add --agent openclaw`，安装后用 `openclaw skills list` 核实
- [未在真实 OpenClaw 容器环境中实测新路径下的安装+加载全流程] → 合入前在容器内手动验证一次：项目级安装 → `openclaw skills list` 确认技能被加载
- [hermes 是否有同类问题未验证，可能被误认为已随本次修复一并解决] → proposal 与 README 明确注明 hermes 不在本次范围内
