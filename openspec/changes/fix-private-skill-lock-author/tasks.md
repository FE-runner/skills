## 1. sourceIdentifier 生成逻辑

- [x] 1.1 修改 `src/add.ts:1551` 的 `sourceIdentifier` 生成逻辑，当有 author 时格式为 `market/author/skillName`
- [x] 1.2 同步修改本地锁文件写入时的 source 生成逻辑（如有对应代码）

## 2. source 解析工具函数

- [x] 2.1 在 `src/cli.ts` 中添加 `parseMarketSource(source)` 工具函数，从 `market/[author/]skillName` 解析出 `{ author?, skillName }`

## 3. check 命令传递 author

- [x] 3.1 修改 `src/cli.ts` 的 `runCheck()` 全局模式，从 `entry.source` 解析 author 并传递给 `marketProvider.check()`（约第 418 行）
- [x] 3.2 修改 `src/cli.ts` 的 `runCheck()` 本地模式，从 `entry.source` 解析 author 并传递给 `marketProvider.check()`（约第 440 行）

## 4. update 命令传递 author

- [x] 4.1 修改 `src/cli.ts` 的 `runUpdate()` 全局模式，从 `entry.source` 解析 author 传给 `marketProvider.check()`（约第 520 行）
- [x] 4.2 修改 `src/cli.ts` 的 `runUpdate()` 全局模式，installUrl 改为 `entry.source.replace('market/', '')`（约第 522 行）
- [x] 4.3 修改 `src/cli.ts` 的 `runUpdate()` 本地模式，同步传递 author 和生成带 author 前缀的 installUrl

## 5. 验证

- [x] 5.1 运行 `pnpm test` 确保所有现有测试通过
- [x] 5.2 运行 `pnpm type-check` 确保类型检查通过
- [x] 5.3 运行 `pnpm format` 确保代码格式一致
