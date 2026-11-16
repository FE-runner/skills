# Proposal

## Why

CLI 当前在交互安装时使用普通确认，没有开发者改进计划声明；lock 已拒绝仍会重复询问；不可观测 Skill 显式传 `--observability` 还会写入虚假的同意状态。公开发布也允许发出与“公开必须开启”冲突的关闭请求。

## What Changes

- 可观测 Skill 首次交互安装必须无预选选择开启或关闭，并在选择前展示开发者改进计划声明。
- lock 已有 true/false 时直接复用。
- `--observability` 继续表示显式开启；关闭统一用不带参数表达，不新增关闭参数。
- `-y`、非 TTY、CI 无既有选择时默认关闭；团队批量使用一次团队级明确选择。
- 不可观测 Skill 显式传 `--observability` 时忽略参数，不写 consent、不修改既有同意、不报错。
- `publish --public --no-collect` 在本地参数阶段直接报错。
- 更新 CLI 帮助、README 和相关规范。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cli-skill-collection-consent`: 调整交互必选、lock 复用、不可观测 no-op 和团队批量规则。
- `cli-publish`: 禁止公开发布显式关闭采集。

## Impact

- 影响 `src/add.ts`、`src/publish.ts`、CLI 帮助、README、测试与 OpenSpec。
- 不修改服务端安装产物选择、团队发布模型或 trace 采集实现。
