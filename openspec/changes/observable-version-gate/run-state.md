# 运行状态

- 变更名: observable-version-gate
- 阶段: propose-complete
- 源分支: develop
- 开发分支: feature/observable-version-gate-cli
- 最后成功 commit: c07af41
- 下一步安全动作: 运行 `@lyx-review-plan observable-version-gate`

## 任务证据

- 已完成任务: 0/20

## 基线评测

- `pnpm install --frozen-lockfile`: passed — 144 个依赖复用完成，Prisma 无关
- `pnpm type-check`: passed — exit 0
- `pnpm exec vitest run`: passed — 43 files / 650 tests
- `pnpm build`: passed — obuild 完成
- `pnpm format:check`: passed — exit 0

## 修改后评测（中间）

- `openspec validate --changes observable-version-gate --strict`: passed — 1 passed, 0 failed

## 修改后评测（最终）

- not-executed — propose 阶段不实施代码

## 审查状态

- propose commit 待创建
- 方案自审已完成，待 review-plan

## 验证

- `git diff --check -- openspec/changes/observable-version-gate`: passed

## 裁决

- 裁决：保留现有 `fetchById(): MarketSkill | null` 兼容包装，安装主流程改用 `ApiResult` 方法；理由：避免一次性改动所有只读调用点，同时保留 409 稳定错误码；如果判断错误：可统一迁移到单一 `ApiResult` 签名。
- 裁决：`--observability` 在首次 `add` 中只写 consent=true，不额外请求；理由：安装文件已与 consent 解耦；如果判断错误：需恢复第二次安装请求。
