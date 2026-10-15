> 发布与推 tag 不在本清单内（它属于 apply/review 之后的发布动作），见 `design.md` 的 Migration Plan。

## 1. Provider 层：接收并解码 binaryFiles

- [x] 1.1 `src/providers/market.ts`：`InstallResponse` 增加可选 `binaryFiles?: Record<string, string>`；`MarketSkill.files` 值类型放宽为 `Map<string, string | Uint8Array>`；`toMarketSkill()` 先按现有逻辑写入 `files`，再把 `binaryFiles` 的每项 `Buffer.from(content, 'base64')` 合并进同一张 map（同名覆盖）；验证：`pnpm type-check` 通过
- [x] 1.2 新增 `tests/market-install-binary.test.ts`：①响应含 `binaryFiles` 时断言解码字节等于原始 PNG 文件头 `89 50 4e 47 0d 0a 1a 0a`；②响应不含该字段时 `files` 全为字符串且与现状一致；验证：`pnpm vitest run tests/market-install-binary.test.ts` 全绿

## 2. Installer 层：前置校验与按类型落盘

- [x] 2.1 `src/installer.ts`：`FileBasedSkill.files` 值类型同步放宽；`writeSkillFiles()` 按值类型分支——`string` 按 `'utf-8'` 写，字节 `writeFile(fullPath, bytes)` 不传 encoding；验证：对应写盘单测通过
- [x] 2.2 `installWellKnownSkillForAgent()` 入口新增一次前置校验（整张 map 一次校验完）：严格标准 Base64（`^[A-Za-z0-9+/]*={0,2}$`、长度 `% 4 === 0`、解码后回编码与输入一致、解码结果非空），任一不通过即 `return { success: false, path, mode, error }`；校验必须早于第一次 `cleanAndCreateDirectory()`；验证：非法 base64 与空内容两个用例断言安装失败、且目标目录未被创建或清空
- [x] 2.3 扩展 `tests/installer-symlink.test.ts`：二进制内容落盘后用 `readFile` 取 Buffer 比对字节（不用 `readFile(path, 'utf-8')`），并断言文件确实存在于安装目录；验证：该文件用例全绿

## 3. 兼容、锁与回归

- [x] 3.1 断言 `skillFolderHash` 原样写入锁文件、未基于本地文件内容重算（含二进制技能的安装路径）；验证：对应单测或人工核对锁文件取值与响应一致
- [x] 3.2 全量回归：`pnpm type-check`、`CI=1 pnpm test`、`pnpm build` 三项全绿；验证：命令退出码为 0
