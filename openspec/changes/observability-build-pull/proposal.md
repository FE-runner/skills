## Why

Skill 市场将同一产品版本可能对应多个不可变观测构建。CLI 当前只比较产品版本号，无法发现同版本新构建；安装目录继续沿用先清理后写入，升级失败时允许目标目录残缺，但不得推进 lock。

## What Changes

- lock 增加 `releaseSeq`，Market 已开启观测的 Skill 使用 `version + releaseSeq` 更新判断；`buildHash` 只在安装响应中校验，不长期保存。
- `add`、`check`、`update` 对普通、私有和团队 Skill 都调用 Skill 市场的批量构建检测能力，单条检查使用一个 item。
- 检测返回 `observabilityEnabled=false` 时继续走未开启观测的原版安装；已开启观测的 Skill 只接受当前目标版本 active build，无产物或 release 序列已变化时 fail-closed。
- 团队 Skill 是源个人 Skill 的引用副本：`teamId + releaseId` 只用于权限和 approved release 校验，`releaseSeq/buildHash` 读取该 release 引用的源 `skillId + version`，不维护团队级观测序列。
- 安装前先用 `buildHash` 校验完整下载内容，再按原逻辑清理目标目录并直接写入；不引入 staging、backup、完成标记、崩溃恢复或跨 Agent 回滚。
- 多个 Agent 逐个安装；任一目标失败即返回失败且不推进 lock，失败目标允许缺文件或残缺，下一次检测到新构建的 update 会重新安装。
- 全局和项目 lock 保持普通读取、修改和写回；并发执行 CLI 不是支持场景，不增加 sidecar lock。
- 安装成功后才推进 lock：已开启观测目标更新 `version/releaseSeq`，未开启目标只更新原版字段；失败不更新本地构建状态。
- CLI 不增加 daemon、常驻进程或系统定时任务；自动巡检由 BlueFlare 外部触发。
- 本地源码 upgrade、`instrument` 和本地改造发布链路不在本期范围。
- **BREAKING**：lock 增加构建序列字段，并把 Market 已开启观测 Skill 的更新判定从版本号升级为 `version + releaseSeq`。

## Capabilities

### New Capabilities

- `observability-build-pull`: 定义 Market Skill 的批量构建检测、源版本 `version + releaseSeq` 更新判断、`buildHash` 写盘前校验、直接写入和安装成功后的 lock 推进。

### Modified Capabilities

- `private-skill-lifecycle`: 移除旧的普通 Market `check/update` 专用调用要求，由新构建拉取能力统一承接。
- `team-release-install`: 移除旧的团队 check/update 判定要求，由新构建拉取能力承接团队目标。
- `skill-install-file-content`: 旧 Market 响应兼容规则收窄为非观测构建路径；观测构建缺少 `buildHash` 时 fail-closed。

## Impact

- CLI lock 的全局与项目级 schema、Market Provider 类型和请求体。
- `add`、`check`、`update`、团队安装与安装器落盘流程。
- `skills-cli` 的团队安装、私有更新、构建校验、部分目标失败和 lock 不推进测试。
- 依赖 `skills-market` 的批量构建检测与安装响应契约；不依赖 BlueFlare 代码先上线。
