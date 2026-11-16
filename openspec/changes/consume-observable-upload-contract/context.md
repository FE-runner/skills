# 方案上下文

## 核心决策

- `--public --no-collect` 在本地参数解析阶段直接失败，不发送 Market 请求。
- `--public` 在请求前统一发送 `collectEnabled=true`；Market 仍是不可绕过的最终权威。
- CLI 保留 Market 返回的签名/公开强制布尔字段和原因码，只在成功输出中解释，不参与落库判断。
- 安装和更新不新增第二条链路，继续只消费 Market active build，并在不可用或构建变化时失败。

## 已否决方案

- 依赖服务端覆盖公开 `collectEnabled=false` 而不做本地冲突：会发送矛盾请求并掩盖用户参数错误，否决。
- CLI 扫描 `SKILL.md` 判断上传包是否可观测：与 Market 单一权威冲突，否决。
- 为安装/更新新增 fallback 或二次改造：违反 fail-closed 契约，否决。

## 范围边界

- 只修改 skills-cli 的 publish/provider 及相关测试。
- 不改 Market API、安装文件格式、lock schema 或 collectConsent 状态机。
- `blueai-skills-cli` 使用说明中的 publish 选项在本 change 完成后单独同步。

## 已知注意事项

- 旧 Market 若不返回强制字段，Provider 必须默认 false/null，不阻断发布。
- 签名和公开同时命中时两个布尔均为 true，但原因码只表达签名优先。

## 实施决策

- 参数冲突在 `parsePublishOptions` 返回 `error`，`runPublish` 在读取 SKILL.md、凭证和网络请求前退出。
- `runPublish` 计算 `collectEnabled: isPublic ? true : collectEnabled`，PUBLIC 不再受三态透传影响。
- Provider 对缺失强制字段运行期归一为 false/false/null，响应类型保留可选字段以兼容已有测试替身和旧 Market。
- README 只说明公开采集约束；外部 companion skill 文档继续作为独立 follow-up。
