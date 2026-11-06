## Why

Skill 市场将同一产品版本可能对应多个不可变观测构建。CLI 当前只比较产品版本号，且安装目录采用先删除后写入，无法发现同版本新构建，也无法保证升级失败时保留旧版本。

## What Changes

- lock 增加 `releaseSeq`，Market Skill 的更新判断统一使用 `version + releaseSeq`；`buildHash` 只在安装响应中校验，不长期保存。
- `add`、`check`、`update` 对普通、私有和团队 Skill 都调用 Skill 市场的批量构建检测能力，单条检查使用一个 item。
- 安装响应只接受当前目标版本的 active observability build；无产物或 release 序列已变化时 fail-closed，不回退原版。
- 安装改为 staging 写入、`buildHash` 校验和原子替换；失败时保留旧安装目录。
- 安装成功后才推进 lock 中的 `version/releaseSeq`；失败不更新本地构建状态。
- CLI 不增加 daemon、常驻进程或系统定时任务；自动巡检由 BlueFlare 外部触发。
- 本地源码 upgrade、`instrument` 和本地改造发布链路不在本期范围。
- **BREAKING**：lock 增加构建序列字段，并把 Market 更新判定从版本号升级为 `version + releaseSeq`。

## Capabilities

### New Capabilities

- `observability-build-pull`: 定义 Market Skill 的批量构建检测、`version + releaseSeq` 更新判断、`buildHash` 产物校验和原子安装。

### Modified Capabilities

- `private-skill-lifecycle`: 移除旧的普通 Market `check/update` 专用调用要求，由新构建拉取能力统一承接。
- `team-release-install`: 移除旧的团队 check/update 判定要求，由新构建拉取能力承接团队目标。

## Impact

- CLI lock 的全局与项目级 schema、Market Provider 类型和请求体。
- `add`、`check`、`update`、团队安装与安装器落盘流程。
- `skills-cli` 的团队安装、私有更新和二进制安全安装测试。
- 依赖 `skills-market` 的批量构建检测与安装响应契约；不依赖 BlueFlare 代码先上线。
