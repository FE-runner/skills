# Tasks

## 1. CLI 安装规则

- [x] 1.1 修改 `src/add.ts`，实现无预选交互选择、开发者改进计划声明、lock true/false 复用、不可观测 `--observability` no-op。
- [x] 1.2 修改团队安装预取流程，使用一次无预选团队选择，裸 `-y` 默认关闭，显式 `--observability` 仅对可观测 Skill 写 true。
- [x] 1.3 修改 `src/cli.ts`、README 和 CLI 文档，说明 `--observability`、静默默认关闭和交互必选。
- [x] 1.4 修改 `src/publish.ts`，在参数解析后拒绝 `--public --no-collect`，保证读取文件前退出。
- [x] 1.5 补充 `src/add.test.ts`、`src/add-market-paths.test.ts`、`src/add-team-observability.test.ts`、`src/publish.test.ts` 覆盖新规则。
- [x] 1.6 同步 `/Users/ly/codes/learn/liyang-skills/src/blueai-skills-cli/SKILL.md` 与 install/publish/troubleshooting/agents references 的新安装和发布口径。
- [x] 1.7 更新 `openspec/specs/cli-skill-collection-consent/spec.md` 的 Purpose，统一首次必选、true/false 直接复用和不可观测 no-op 口径。

## 2. 验证

- [x] 2.1 运行 `pnpm test -- --run src/add.test.ts src/add-market-paths.test.ts src/add-team-observability.test.ts src/publish.test.ts`。
- [x] 2.2 运行 `pnpm exec tsc --noEmit`、`openspec validate --changes install-observability-rules` 和 `git diff --check`。
