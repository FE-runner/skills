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
