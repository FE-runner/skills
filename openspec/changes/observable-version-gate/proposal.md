## Why

市场端已将“安装哪个文件版本”和“用户是否同意下游统计”拆开：可观测 Skill 的安装接口始终返回 active artifact，用户同意只记录在 CLI lock。现有 CLI 仍通过 `report` 切换原版/改造版，并让 `track on/off` 重装文件，已无法与新市场契约安全配套。

## What Changes

- **BREAKING**：Market 安装请求移除 `report`。CLI 不再主动选择原版或改造版，只按服务端返回文件安装。
- 可观测 Skill 始终安装服务端 active artifact；市场返回 `409 OBS_VERSION_UNAVAILABLE` 时明确报错，不回退原版、GitHub 或其他来源。
- `collectConsent` 只决定是否统计和是否引导安装 LoongSuite Pilot，不再决定安装包类型。
- 首次安装且 consent 未定夺时仍询问；同意写 `true`，拒绝写 `false`。非交互首次默认 `false`。两种选择安装同一份文件。
- `add --observability` 只强制写本次 consent=true，不切换包来源。`track on/off` 只修改全局 lock，不请求 Market、不重新下载或覆盖文件。
- 团队安装只在安装前统一询问一次 consent；团队内存在可观测 Skill 时，所有 Skill 都安装各自服务端产物。
- 移除依赖 `collect.reason` 的失败降级分支；保留 `collect.config`/签名校验用于识别可观测 Skill 和 Pilot 引导。

## Capabilities

### New Capabilities

### Modified Capabilities

- `skill-collection-consent`: 从 `report` 双包契约改为“始终返回 active artifact + lock-only consent”，并定义 `OBS_VERSION_UNAVAILABLE`。
- `cli-skill-collection-consent`: 首次询问、`--observability` 与 `track on/off` 改为只管理 consent，不改变安装文件。
- `cli-observability-agent`: 仅在 consent=true 时为可观测 Skill 引导 Pilot；拒绝统计仍安装可观测文件但不引导采集插件。
- `team-release-install`: 团队安装移除 `report` 预检，保留 release 绑定、一次 consent 询问和 fail-closed 错误语义。

## Impact

- `src/providers/market.ts`：安装请求与响应类型、稳定错误码传递。
- `src/add.ts`、`src/add-prompt.ts`、`src/track.ts`、`src/collect.ts`：原版先行、探测替换和重装切换逻辑移除。
- `src/skill-lock.ts`、`src/local-lock.ts`：继续使用现有 `collectConsent` 字段，不提升 lock schema。
- 测试：Market provider、单 Skill/团队安装、交互与非交互 consent、track 不重装、409 fail-closed。
- 发布：必须与 `skills-market` 新契约配套发布；旧 CLI 的 `report` 请求不再受支持。
