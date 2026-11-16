# 提案

## 为什么

Market 已统一返回公开可见性与上传签名的采集强制来源，但 `skills publish` 目前丢弃这些字段，公开 Skill 仍可能发送相互矛盾的 `--public --no-collect`。CLI 需要显式消费服务端契约，让用户在发布前得到确定行为，同时继续由 Market 作为最终权威。

## 变更内容

- `skills publish --public --no-collect` 在本地直接报参数冲突，不发送请求。
- `skills publish --public` 未显式指定采集时，请求体发送 `collectEnabled=true`；`--public --collect` 保持 `true`。
- Market push 响应的 `collectForcedBySignature`、`collectForcedByVisibility`、`collectForcedReason` 由 `marketProvider.push` 保留并在命令输出中解释。
- CLI 不自行扫描 `SKILL.md` 判断可观测版本，完全以 Market 返回结果为准。
- 复核 `add/update` 已对 `OBS_VERSION_UNAVAILABLE`、`BUILD_CHANGED`、`buildHash` 和不一致响应保持 fail-closed，不新增回退路径。

## 能力

### 新增能力

无。

### 修改能力

- `cli-publish`: 增加公开 Skill 强制采集、参数冲突和强制作业来源输出契约。

## 影响

- CLI 参数解析：`src/publish.ts`。
- Market Provider 响应映射：`src/providers/market.ts`。
- 测试：`src/publish.test.ts`、`src/providers/market.test.ts`，以及现有 `add/update` fail-closed 回归。
- 文档：`blueai-skills-cli` 使用说明中的 publish 选项。
- Market API 不新增调用；仅消费已有字段。无依赖升级或本地状态格式变更。
