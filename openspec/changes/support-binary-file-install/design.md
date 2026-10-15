## Context

现状（改动前）：`src/providers/market.ts` 的 `toMarketSkill()` 把响应 `data.files` 的每一项原样塞进
`Map<string, string>`；`src/installer.ts` 的 `writeSkillFiles()` 统一用
`writeFile(fullPath, content, 'utf-8')` 落盘。二进制内容在这条链路上会被字符编码破坏。

服务端契约（已实现，市场侧 change `binary-safe-skill-install`，提交 `74c0a84c` / `7df9cd07`）：

- `files`：文本文件，UTF-8 字符串，形状不变。
- `binaryFiles`：二进制文件，值是原始字节的**标准 Base64**（`Buffer.toString('base64')`，带 `=` padding，
  无 data URI 前缀）；**没有二进制文件时该字段不出现**。
- 两者 key 同构（技能根相对路径），且服务端按内容判定走 if/else，**同一路径不会同时出现在两个字段**。
- `skillFolderHash` 已改为按每个文件的原始字节计算；纯文本技能取值与旧版一致，含二进制技能会变。

一个关键约束：`marketProvider.fetchById()` 外层是 `try { … } catch { return null }`——解析层的任何抛错
都会被吞成 `null`，调用方只能看到"未找到/安装失败"，拿不到原因。

## Goals / Non-Goals

**Goals:**

- 二进制文件按原始字节无损落盘，文本文件行为完全不变。
- 旧服务端（响应无 `binaryFiles`）行为零变化：不报错、不提示、文件集合一致。
- 二进制内容非法时**明确失败**，且不在磁盘上留下半成品。

**Non-Goals:**

- 不做 `publish` / `push` 方向的二进制支持（CLI 发布仍跳过二进制并打警告）。
- 不改 `src/providers/cos.ts`、`src/providers/wellknown.ts` 的 `files` 类型（它们只产字符串）。
- 不做"写临时目录再原子替换"的目录级原子性。

## Decisions

### D1 值类型放宽为 `string | Uint8Array`，且全部文件放**同一张 map**

`MarketSkill.files` 与 `FileBasedSkill.files` 的值类型放宽为 `string | Uint8Array`；`binaryFiles` 解码后的
字节与 `files` 的字符串合并进同一个 `Map`。

**理由**：`add.ts` 存在整表替换（`skill.files = probed.files` / `= monitored.files`，采集同意与监测版
分支）。若二进制放进独立的第二张 map，任何一处整表替换都会漏掉二进制。单 map 让"文件数量/文件名列举"
与写入天然一致，替换也是整体替换。

**否决的备选**：新增独立的 `binaryFiles` map。否决——整表替换会漏，且需要同步改动 `add.ts` 多处。

### D2 解码在解析层，校验在安装入口

- `toMarketSkill()`：只做「解码 + 存字节」（`Buffer.from(content, 'base64')`），不抛错、不校验。
- `installWellKnownSkillForAgent()`：**入口**一次性校验整张 map，不通过即
  `return { success: false, path, mode, error }`（与既有的 path-safety 早返回同款，见改动前的
  `installer.ts` 该函数开头两处 `isPathSafe` 分支）。

**理由**：`fetchById` 的 `catch { return null }` 会吞掉解析层抛出的任何错误，校验放解析层无法把失败原因
传给用户；而 installer 的早返回形状（`InstallResult`）已经是既有契约，`add.ts` 的失败分支无需改动。

**否决的备选**：① 在 `toMarketSkill` 校验并抛错 —— 被吞成 `null`，用户只看到"未找到"；② 改
`fetchById` 返回类型以携带错误 —— 波及 `add.ts` 多处调用点，超出本次范围。

### D3 校验必须早于第一次 `cleanAndCreateDirectory()`

`installWellKnownSkillForAgent` 在写盘前会先清空/创建目标目录（copy 模式与 symlink 模式各一处，另有
symlink 失败回退 copy 一次）。因此校验只能放在**函数入口**，不能放进 `writeSkillFiles()`——放进去就变成
"目录已清空 + 部分文件"，正是要避免的半成品形态。

### D4 严格 Base64 校验口径

字符集 `^[A-Za-z0-9+/]*={0,2}$`、长度 `% 4 === 0`、解码后回编码与输入一致、解码结果非空。

**理由**：`Buffer.from(str, 'base64')` **不抛错**，会静默忽略非法字符并返回可能被截断的结果，甚至返回空
buffer；不自己判定就会把坏数据当成功写盘。服务端产出形态确定（标准字母表 + `=` padding），严格判定不会
误伤合法数据。

### D5 写盘按值类型分支

`writeSkillFiles()` 内：`typeof content === 'string'` → `writeFile(fullPath, content, 'utf-8')`；否则
`writeFile(fullPath, content)`（不传 encoding）。

路径安全校验与父目录创建逻辑保持不变（仍逐文件 `isPathSafe` 判定并跳过越界项）。

### D6 `skillFolderHash` 原样写锁

锁文件里的 `skillFolderHash` 直接来自响应，不基于本地文件重算，也不做格式改写。

**理由**：服务端已改为按原始字节计算；CLI 重算会与服务端口径漂移，导致 `check`/`update` 误判。

### D7 本次不做 publish 方向的二进制

接受"能装不能发"的已知不对称。收口需要改 `POST /api/skill/push` 契约（其 `files` 目前只承载字符串，
服务端打包也只能拿到字符串），属于另一个 change。

## Risks / Trade-offs

- [`Buffer.from` 的宽松解码让坏数据看起来成功] → D4 严格校验 + 空结果判失败。
- [Base64 让响应体积增加约 1/3] → 接受；仅对含二进制的技能生效，纯文本技能无变化。
- [失败粒度是"不落任何文件"，但不是目录级原子] → 校验前置到入口即可满足本需求；不引入临时目录 + rename
  的复杂度。若目标目录此前已存在旧版本内容，校验失败时它保持不变（因为根本没走到清理）。
- [服务端未来若违背互斥约定] → 合并顺序固定为"先 `files` 后 `binaryFiles`"，同名以字节版本为准，属防御式
  写法；不需要服务端额外承诺。
- [老 CLI 在窗口期漏装二进制] → 发布顺序为 CLI 先发（`@dev`）→ 线下验证 → `@latest` → 服务端再切；
  窗口期为零。

## Migration Plan

- 无数据迁移；不改锁文件格式。
- 发布顺序：① `develop` 跑 `./scripts/publish-dev.sh` 发 `@dev`；② 线下验证（`xxd` 首字节
  `89 50 4e 47`、`file` 识别 PNG、`.pyc` 逐字节一致）；③ `master` 发布正式版（**发布前需把
  `package.json` 从 `1.4.7-bmc1.6.4` 校正到 `1.4.7-bmc1.6.5`，再 patch 到 `1.4.7-bmc1.6.6`**，否则会与
  npm 上已发布的 `bmc1.6.5` 撞车）；④ 两个 tag 都上架后，服务端才切线上。
- 回滚：回退本次提交即可；对已安装的技能无破坏性影响（漏装的文件需重新安装）。

## Open Questions

无。
