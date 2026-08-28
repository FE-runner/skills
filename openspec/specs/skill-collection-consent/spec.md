# skill-collection-consent Specification

## Purpose

为 Skill 数据采集的用户侧合规闭环（与 skills-market 侧「作者声明」对称）：CLI 在安装、反悔、查询采集状态上的行为契约。本 spec 为 **skills-market ↔ blueai-skills 双仓端到端契约**——market 侧 spec（`openspec/specs/skill-collection-consent/spec.md`，skills-market 仓）定义作者声明与安装接口的 `report` 载荷，本仓按同 spec 落地用户侧，供双仓维护对账。采集数据直达阿里云可观测插件，平台不落使用数据。

## Requirements

### Requirement: 采集状态由安装的包类型决定

CLI SHALL 以本机已装 skill 是**改造版还是原版**判定采集状态：改造版（frontmatter `meta.blueai_signature` 存在 **且** 同目录有 `blueai-track.js` 文件）= 具备采集能力；原版（两者都无）= 不具备。判定依据 = 包构成（有签名 + 有 track.js），不依赖签名内容解析，不读写 skills-lock.json 的字段。

#### Scenario: track list 按包类型判定三态

- **WHEN** 用户执行 `track list`
- **THEN** CLI 逐个检查本机已装 skill 的包构成，展示 on（改造版）/ off（原版）/ 未装 三种状态

### Requirement: 首次安装改造版前询问采集意向

CLI SHALL 在收到采集改造版（install 响应含 `collect`）且该 skill 首次安装改造版前，询问「是否采集」：同意 → 落盘改造版（含签名与 blueai-track.js）；拒绝 → 按 `report=false` 请求原版并落盘，不采集、不阻塞。装了改造版或原版后，该 skill 的采集状态即由所装包类型决定，不重复询问。原版安装（响应无 `collect`，作者未开启采集）SHALL NOT 询问。

#### Scenario: 同意采集安装改造版

- **WHEN** 用户首次安装某 skill 且选择采集
- **THEN** CLI 落盘改造版副本（SKILL.md 含 meta.blueai_signature + 插文字 + blueai-track.js），该 skill 处于 on 状态

#### Scenario: 拒绝采集安装原版

- **WHEN** 用户首次安装某 skill 但拒绝采集
- **THEN** CLI 以 report=false 重取原版落盘（无签名、无 blueai-track.js），该 skill 处于 off 状态

#### Scenario: 作者未开启采集则无需询问

- **WHEN** 安装的 skill 作者未开启采集（响应不含 collect）
- **THEN** CLI 不询问，直接落盘原样产物

### Requirement: track 命令反悔 / 恢复采集

CLI SHALL 提供 `track <skill> off` 反悔：按 `report=false` 重新请求安装原版包覆盖已装的改造副本——原版无签名、无 blueai-track.js，从而停止采集（新包覆盖旧包，不改签名）。`track <skill> on` SHALL 按 `report=true` 重新请求安装改造版覆盖原版，恢复采集。反悔不追溯历史埋点，仅反悔时间点后生效。

#### Scenario: track off 停采

- **WHEN** 用户对改造版 skill 执行 `track <skill> off`
- **THEN** CLI 以 report=false 重装原版覆盖改造副本，采集停止，用户数据不丢失

#### Scenario: track on 恢复采集

- **WHEN** 用户对原版 skill 执行 `track <skill> on`
- **THEN** CLI 以 report=true 重装改造版覆盖原版，恢复采集

### Requirement: 安装接口携带 report 参数

CLI SHALL 在安装 / 重装请求携带 `report`（boolean）控制采集改造产物：需要采集时 `report=true`，不采集时 `report=false`。接口响应含 `collect: { config, meta: { blueai_signature } }` 表示改造成功（SKILL.md 已被服务端注入签名+插文字并附 blueai-track.js，CLI 只落盘不改造）；`collect: { reason }` 表示服务端改造失败降级（以原样产物落盘，CLI 按无采集处理）；响应不含 `collect` 表示原样产物。改造由服务端完成，CLI 不接触签名 / 不解析 SKILL.md 结构。

#### Scenario: report=true 返回改造版

- **WHEN** CLI 以 report=true 请求安装某「作者开启采集」的 skill
- **THEN** 响应含 collect.config 与 collect.meta.blueai_signature，files 为改造版副本

#### Scenario: 改造失败降级原样

- **WHEN** report=true 但服务端改造失败（frontmatter 损坏 / 插文字行号非法等）
- **THEN** 响应 collect 仅含 reason，files 为原样产物，CLI 按无采集落盘

### Requirement: blueai-track.js 与签名仅为采集通道载体（不在 CLI 解析）

CLI SHALL NOT 解析 `meta.blueai_signature` 内容（Base64(JSON{skillName,skillId,version})，纯身份、无密钥、不加密，服务于阿里云插件侧身份读取）。blueai-track.js 为采集钩子（每次 LLM 调用向 /tmp 全局共享埋点文件写入最简埋点日志，不含 skillId / 签名），由改造版携带；CLI 仅负责按目录结构落盘，不注入、不修改该脚本。

#### Scenario: CLI 不解析签名

- **WHEN** CLI 安装改造版副本
- **THEN** 按 files 目录结构落盘 SKILL.md 与 blueai-track.js，不解析签名内容、不校验其正确性

### Requirement: 作者撤回采集声明不影响已装副本（跨仓边界一致）

作者将已发布 skill 的 collectEnabled 改为 false 后，本仓口径与 market 侧一致：仅新安装（无 collect 响应）按不可采集处理；已装用户的改造副本不受影响（仍有签名与 track.js），由用户 `track off` 自行停采。

#### Scenario: 撤回声明后已装副本仍采集

- **WHEN** 作者关闭采集声明后，已装改造版的用户执行更新
- **THEN** 本仓按升级语义处理：已装改造副本不被自动移除，用户可 `track off` 停采（默认保持上次选择，见 Open Questions）

## Open Questions

- **升级/重装默认包类型边界**：已 track off（装原版）的 skill 在升级重装时默认装哪种包——本仓当前倾向「保持用户上次选择（装原版则不采集，reinstall 继续原版）」，需与 blueai-skills 侧确认后写死语义。本 spec 先行记录，不阻塞两端落地。
- 插件就绪探测的监测脚本命令与返回协议（CLI 探测阿里云采集插件是否安装、未装时引导）——由后续提供，落地时按脚本 + 阻塞式引导实现。