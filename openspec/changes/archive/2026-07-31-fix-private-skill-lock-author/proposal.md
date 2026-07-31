## Why

私有技能安装时，`author` 参数通过 `source-parser.ts` 正确解析并传递给 Market API 完成安装，但锁文件 (`SkillLockEntry`) 中未记录 `author` 信息。这导致后续的 `skills check` 和 `skills update` 命令无法为私有技能正确调用 Market API（缺少必要的 author 参数），用户无法检查或更新已安装的私有技能。

## What Changes

- 在 `SkillLockEntry` 接口中新增 `author?: string` 字段
- 安装私有技能时将 `author` 写入锁文件
- `skills check` / `skills update` 流程中从锁文件读取 `author` 并传递给 Market API
- 确保 `skills list` 显示私有技能时包含作者信息

## Capabilities

### New Capabilities
- `private-skill-lifecycle`: 私有技能的完整生命周期支持，包括安装后的更新检查、版本升级和作者信息持久化

### Modified Capabilities

（无已有 spec 需要修改）

## Impact

- **代码**: `src/skill-lock.ts`（锁文件接口和读写逻辑）、`src/add.ts`（安装时写入 author）、`src/cli.ts`（check/update 流程中传递 author）
- **数据**: 锁文件 `~/.agents/.skill-lock.json` 格式变更（向后兼容，新增可选字段）
- **API 调用**: `market.ts` 的 `check()` 方法将从锁文件获取 author 参数
- **依赖**: 无外部依赖变更
