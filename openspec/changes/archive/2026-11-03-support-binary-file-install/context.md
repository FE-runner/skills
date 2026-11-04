# context.md — support-binary-file-install

本文件只记录 artifacts 之外的讨论结论（决策理由、否决备选、范围边界、已知坑）。
需求与实现细节见 proposal.md / design.md / tasks.md / specs/。

## 关键决策与理由

- **全部文件放同一张 map**（不让二进制另起一张）。理由：`add.ts` 存在整表替换
  （`skill.files = probed.files` / `= monitored.files`），第二张 map 会被整表替换漏掉。
  → 见 design D1。
- **解码在解析层、校验在安装入口**。理由：`fetchById` 是 `try{…}catch{return null}`，解析层抛错会被
  吞成 `null`，用户只看到"未找到"；installer 入口的 `{success:false,error}` 早返回是既有契约。
  → 见 design D2。
- **校验必须早于第一次 `cleanAndCreateDirectory()`**。该函数会先清空目标目录，校验若放在
  `writeSkillFiles` 里就变成"目录已清空 + 部分文件"。→ 见 design D3。
- **严格 Base64 口径**。`Buffer.from(x,'base64')` 不抛错、静默忽略非法字符，必须自己判。
  → 见 design D4。

## 已否决的备选

- **二进制放独立 map**：整表替换会漏，否决。
- **在 `toMarketSkill` 里校验并抛错**：被 `fetchById` 的 catch 吞成 `null`，否决。
- **改 `fetchById` 返回类型以携带错误**：波及 `add.ts` 多处调用点，超出本次范围，否决。
- **写临时目录再原子替换**：目录级原子性不是本需求，成本高，否决。
- **同步修改 `cos.ts` / `wellknown.ts` 的类型**：它们只产字符串，不必放大影响面，否决。

## 范围边界

**做**：provider 接收/解码 `binaryFiles`；installer 入口前置校验 + 按类型落盘；相应测试。

**不做**：`publish` / `push` 方向的二进制（接受"能装不能发"的已知不对称，收口属另一个 change）；
cos/wellknown provider；目录级原子写入；服务端任何代码。

## 已知坑与注意事项

- **跨仓库依赖**：服务端契约由市场侧 change `binary-safe-skill-install` 提供（提交 `74c0a84c` /
  `7df9cd07`，当时仍在 `dev-offline` 本地未推）。CLI 必须先发布，服务端再切线上，否则窗口期老 CLI
  会漏装二进制文件。
- **本次刻意留在 `develop` 分支开发，不切 feature 分支**：`src/providers/market.ts` 在 `.gitattributes`
  的 `merge=ours` 名单里，切分支再合并会让 develop 侧覆盖、静默丢掉本次改动（上一个 change 的
  `market.ts` 改动就是这样被吞掉的）。改这个文件时不要走"分支 + 合并"。
- **正式版发布前要校正 `package.json`**：master 上是 `1.4.7-bmc1.6.4`，直接 patch 会得到
  `1.4.7-bmc1.6.5`，与 npm 上已发布的 `latest` 撞车。需先校到 `bmc1.6.5` 再 patch → `bmc1.6.6`。
- **`skillFolderHash` 不要重算**：服务端已改为按原始字节计算，纯文本技能取值与旧版一致、含二进制技能会变；
  CLI 重算会与服务端漂移，导致 `check`/`update` 误判。
- **验收样本**：`cmmluoqvz000034faosun4oec/jq-research-mcp-suite`（含 `assets/BlueFocusAI.png` 与
  `scripts/__pycache__/*.pyc`）。

## 实施决策（apply 阶段）

- **严格 Base64 校验的落点与批准方案有一处偏差，原因必须记录**：批准方案写的是"`toMarketSkill` 只解码、
  校验放 installer 入口"。但**解码之后 Base64 合法性已不可复原**（`Buffer.from` 的宽松解码丢掉了原始
  字符串，回编码只能验证字节本身、无法判断输入是否合法），installer 拿不到可校验的原始值。因此实际落法为：
  - `toMarketSkill` 在**解码的同时**做严格校验（这是唯一还能看到原始字符串的地方）；不合法或解码为空的
    条目**不放进 map**，而是把 `"<path>: <原因>"` 记进新增字段 `MarketSkill.binaryFileErrors`。
  - `installWellKnownSkillForAgent` **入口**读取该字段：非空即
    `return { success: false, path, mode, error }`，位置与既有的 `isPathSafe` 早返回并列，**早于第一次
    `cleanAndCreateDirectory()`**。批准方案要的"失败在 installer 入口判定、不落半成品"这条语义完整保留。
  - `add.ts` 的两处整表替换（`probed` / `monitored`）各补一行 `skill.binaryFileErrors = …`，否则采集同意
    分支换表时会把校验失败信息丢掉、静默装成缺文件。
  - `fetchById` 的 `catch { return null }` 与返回类型未改动，调用点未新增 try/catch。
- **"解码结果非空"按任务要求保留**（方案审查 Warning 2 提到合法的 0 字节文件会被判失败）：0 字节内容在服务端
  会走文本分支（`isTextFileContent`），不会出现在 `binaryFiles`，因此不构成真实误伤。
- **新增了一条"目标目录已有旧内容时校验失败"的用例**（方案审查 Warning 1 关注的歧义）：断言失败时旧版本文件
  逐字节不变，即"不新增、不清空、不改写"，而不是"磁盘上不存在该技能的任何文件"。
- **`cos.ts` / `wellknown.ts` 实测无需改动**：`Map<string, string>` 赋给
  `Map<string, string | Uint8Array>` 在 TS 下通过（方法参数双变），`pnpm type-check` 无报错。
