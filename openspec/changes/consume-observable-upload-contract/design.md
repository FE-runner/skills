# 设计

## 背景

参见 `proposal.md`。Market push 已经返回采集强制来源，CLI 当前 Provider 类型未保留这些字段；同时 `publish` 的 --public 与 collectEnabled 仍按互相独立的参数处理，导致本地可以构造公开且拒绝采集的矛盾命令。

## 目标与非目标

**目标：**

- 让公开发布命令在 CLI 层就表达“必须采集”，并用 Market 返回值解释服务端强制来源。
- 保持私有发布的 collectEnabled 三态语义和现有参数兼容。
- 确保 add/update 继续只消费 Market 安装响应，遇到不可用或构建变化时 fail-closed。

**非目标：**

- 不扫描本地 SKILL.md 判断上传包是否已可观测。
- 不在 CLI 安装阶段改写 Skill 文件或触发 Market 改造。
- 不改变 skill lock schema、安装器写盘语义或 collectConsent 状态机。

## 决策

### D1：参数层直接拒绝 --public --no-collect

`parsePublishOptions` 在完成参数解析后检查组合；该组合在读取文件或请求 Market 前返回错误。这样既保证快速失败，也避免命令层维护一套重复校验。

替代方案是发送给 Market 后依赖 409/强制覆盖，但这会制造一次无意义写请求，且用户看到的是服务端成功而不是参数错误，已否决。

### D2：--public 在请求前归一化为 collectEnabled=true

`runPublish` 基于最终 visibility 计算有效采集值：PUBLIC 始终为 true；PRIVATE 继续使用 undefined/true/false 三态。Market 仍是不可绕过的最终权威，CLI 的归一化只负责表达确定性意图。

### D3：Provider 保留强制来源字段，命令层负责展示

`MarketProvider.push` 响应类型增加：

- `collectForcedBySignature: boolean`
- `collectForcedByVisibility: boolean`
- `collectForcedReason: 'SIGNATURE_FIELD_PRESENT' | 'PUBLIC_VISIBILITY' | null`

字段缺失时按 false/null 兼容旧 Market。`runPublish` 只在任一布尔为 true 时追加提示，不改变原有成功/审核输出结构。

### D4：安装/更新只补验证，不改现有 fail-closed 实现

现有 `marketProvider.installById`、`collect.ts`、`build-hash.ts` 和 `add.ts` 已实现 install 响应字段校验、buildHash 校验、releaseSeq 冲突和 OBS_VERSION_UNAVAILABLE fail-closed。本 change 仅通过定向测试确认这些行为，不新增第二条安装链路。

## 风险与权衡

- [旧 Market 不回传新增字段] → Provider 将缺失字段归一为 false/null，不阻断发布；强制结果仍以 Market 落库为准。
- [公开 Skill 未显式传 --collect] → CLI 强制发送 true，和产品规则一致；私有行为不变。
- [两个强制来源同时命中，单一原因码信息不足] → 同时展示两个布尔来源，并说明原因码优先来自签名。

## 迁移计划

无数据迁移和依赖升级。发布新 CLI 后生效；旧 CLI 仍可调用 Market，由服务端继续强制采集。
