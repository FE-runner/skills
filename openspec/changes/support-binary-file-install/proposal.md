## Why

市场侧安装接口（`POST /api/skill/install`、`/api/skill/installByName`）已改为按文件内容分流：文本文件仍放在
`files`（UTF-8 字符串，形状不变），二进制文件（png/ico/字体/pyc/wasm/zip 等）放入新增字段
`binaryFiles`（原始字节的标准 Base64）；`skillFolderHash` 同步改为按每个文件的原始字节计算。

而 CLI 目前只读 `files`，并统一按 `'utf-8'` 写盘。服务端切换后，含二进制资产的技能会被**漏装**
（比损坏好，但文件确实缺失），用户拿到的是不完整的技能。需要在 CLI 侧支持新字段并无损落盘，同时对
未返回该字段的旧服务端保持行为完全不变。

## What Changes

- `InstallResponse` 新增可选字段 `binaryFiles?: Record<string, string>`（标准 Base64，带 `=` padding，无
  data URI 前缀）。
- `MarketSkill.files` 与 `FileBasedSkill.files` 的值类型从 `string` 放宽为 `string | Uint8Array`。
- `toMarketSkill()` 只做「解码 + 存字节」：先按现有逻辑写入 `files`，再把 `binaryFiles` 的每项
  `Buffer.from(content, 'base64')` 合并进**同一张 map**（同名覆盖，作防御式写法）。保持单 map 是为了让
  `add.ts` 中 `skill.files = probed.files` / `monitored.files` 这类整表替换不会漏掉二进制。
- `installWellKnownSkillForAgent()` **入口**新增一次前置校验：整张 map 一次校验完毕，任一不通过即
  `return { success: false, error }`，**早于**第一次 `cleanAndCreateDirectory()`，因此失败时不碰磁盘、
  不留半成品。校验口径为严格 Base64：`^[A-Za-z0-9+/]*={0,2}$`、长度 `% 4 === 0`、解码后回编码与输入
  一致、解码结果非空。
- `writeSkillFiles()` 按值类型写盘：字符串按 `'utf-8'` 写；字节直接 `writeFile(fullPath, bytes)`，不传
  encoding。
- `skillFolderHash` 原样写入 lock，不做二次计算或改写。
- **不做**：`publish` / `push` 方向的二进制支持（CLI 发布时仍跳过二进制文件并打警告），即本次之后存在
  「能装不能发」的已知不对称；`src/providers/cos.ts` / `src/providers/wellknown.ts` 的 `files` 类型维持
  不动（它们只产字符串）。

## Capabilities

### New Capabilities

- `skill-install-file-content`: 安装时按文件内容类型无损落盘（文本按 UTF-8、二进制按原始字节），并对服务端
  下发的二进制内容做前置校验与明确失败语义。

### Modified Capabilities
<!-- 无：本次不改变既有 capability 的 Requirement。安装目标路径由 agent-install-targets 覆盖，
     与「文件内容如何落盘」是两件事。 -->

## Impact

- 代码：`src/providers/market.ts`（响应类型、`toMarketSkill`）、`src/installer.ts`（`FileBasedSkill`、
  入口校验、`writeSkillFiles`）。
- 测试：新增 `tests/market-install-binary.test.ts`（install 方向的 provider 测试当前为空白）；
  扩展 `tests/installer-symlink.test.ts` 覆盖二进制落盘（用 `readFile` 取 Buffer 比对字节）。
- 跨仓库依赖：依赖市场侧 `binaryFiles` 契约（服务端 change `binary-safe-skill-install`，提交
  `74c0a84c` / `7df9cd07`）。服务端已就绪但未推线上；CLI 需先发布，服务端再切。
- 兼容性：老服务端响应不含 `binaryFiles` 时，不报错、不提示，行为与现状完全一致。
- 发布顺序：`develop` 发 `@dev` → 线下验证 → `master` 发 `@latest` → 服务端切换生效。正式版发布前需先把
  `package.json` 校正到 `1.4.7-bmc1.6.5` 再 patch（否则会与 npm 上已发布的 `bmc1.6.5` 撞车）。
