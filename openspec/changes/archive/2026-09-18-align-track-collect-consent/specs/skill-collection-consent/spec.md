## MODIFIED Requirements

### Requirement: 安装接口携带 report 参数

CLI SHALL 在安装 / 重装请求携带 `report`（boolean）控制采集改造产物：需要采集时 `report=true`，不采集时 `report=false`。接口响应含 `collect: { config: { collectEnabled }, meta: { blueai_signature } }` 表示改造成功，`files` 为服务端已生成好的产物；该产物可能仅含身份签名，也可能额外含 `.blueai-skills-market/obs-manifest.yaml` 与 `.blueai-skills-market/obs-run`，并由服务端决定 `SKILL.md` 内容。CLI SHALL 只按 `files` 目录结构落盘，不解析签名、不拼装结构化改造产物。`collect: { reason }` 表示服务端改造失败降级，`files` 为原样产物，CLI SHALL 按无有效采集配置处理。响应不含 `collect` 表示原样产物。

#### Scenario: report=true 返回改造版

- **WHEN** CLI 以 report=true 请求安装某「作者开启采集」的 skill 且服务端改造成功
- **THEN** 响应含 collect.config 与 collect.meta.blueai_signature，files 为服务端生成的改造版副本；CLI 原样落盘

#### Scenario: report=true 返回结构化改造产物

- **WHEN** CLI 以 report=true 请求安装的 skill 在目标版本存在成功的结构化改造快照
- **THEN** 响应 files 中可额外包含 `.blueai-skills-market/obs-manifest.yaml` 与 `.blueai-skills-market/obs-run`，CLI 仍只按目录结构落盘

#### Scenario: 改造失败降级原样

- **WHEN** report=true 但服务端改造失败（如 SKILL.md frontmatter 解析失败）
- **THEN** 响应 collect 仅含 reason，files 为原样产物，CLI 按无有效采集配置处理

### Requirement: 作者撤回采集声明不影响已装副本（跨仓边界一致）

作者将已发布 skill 的 collectEnabled 改为 false 后，本仓口径与 market 侧一致：仅新安装（无有效 collect 响应）按不可采集处理；已装用户的本地采集状态由 `cli-skill-collection-consent` 的 lock 三态规则管理，CLI SHALL NOT 因作者撤回声明自动改写该状态；用户可通过 `track off` 停止采集。

#### Scenario: 撤回声明后已装副本仍采集

- **WHEN** 作者关闭采集声明后，已安装该 Skill 的用户执行更新
- **THEN** CLI SHALL 按更新语义处理：作者撤回 SHALL NOT 自动改写用户 lock 中的采集状态，用户可通过 `track off` 停采

## REMOVED Requirements

### Requirement: 采集状态由安装的包类型决定

**Reason**: 当前 CLI 采集状态唯一来源为 `.agents/.skill-lock.json` 的 `collectConsent`，该旧要求同时依赖已删除的 `blueai-track.js`，与现状冲突。

**Migration**: 使用 `cli-skill-collection-consent` 的「lock 三态判定采集状态」Requirement；包文件仅作为服务端下发产物落盘，不作为状态判定依据。

### Requirement: 首次安装改造版前询问采集意向

**Reason**: 首次安装询问行为已由 `cli-skill-collection-consent` 的「首次安装知情同意」完整定义；旧文本包含 `blueai-track.js` 与插文字等已废弃产物。

**Migration**: 使用 `cli-skill-collection-consent` 的「首次安装知情同意」与「有效采集配置判定」Requirement。

### Requirement: track 命令反悔 / 恢复采集

**Reason**: `track list/on/off` 的用户侧行为已由 `cli-skill-collection-consent` 的「track 命令组」完整定义；旧文本包含 `blueai-track.js` 且未覆盖改造失败降级。

**Migration**: 使用 `cli-skill-collection-consent` 的「track 命令组」Requirement。

### Requirement: blueai-track.js 与签名仅为采集通道载体（不在 CLI 解析）

**Reason**: `blueai-track.js` 与插文字产物已从 market 改造链路移除；当前产物只保留身份签名，结构化执行埋点由 `obs-run` 承接。

**Migration**: CLI 继续不解析 `meta.blueai_signature`，并只按 `files` 落盘服务端下发的签名与可选 `obs-run` 产物；状态判定见 `cli-skill-collection-consent`。
