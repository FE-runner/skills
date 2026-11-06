## Context

CLI 当前以 `version` 判断 Market 更新，`skillFolderHash` 只记录原包 hash；`installWellKnownSkillForAgent` 会先删除 canonical/agent 目录再写入。新增 releaseSeq 需要在现有 Market provider、全局/项目 lock、check/update 和安装器之间贯通。

## Goals / Non-Goals

**Goals:**

- 用 `version + releaseSeq` 发现新版本和同版本新构建。
- 用最终产物 `buildHash` 防止下载内容损坏或构建错配。
- 安装失败时保留旧目录，成功后一次性推进 lock。
- 普通、私有、团队目标共用一套检测和安装校验。

**Non-Goals:**

- 不实现本地源码 instrument/publish。
- 不实现 BlueFlare 定时器。
- 不增加 CLI daemon 或后台更新。
- 不提供回滚命令。

## Decisions

### D1: lock 增补 releaseSeq，不新建状态文件

全局 `SkillLockEntry` 与项目 `LocalSkillLockEntry` 增加可选 `releaseSeq`。现有 schema version 不提升：字段可选，旧 lock 可直接读取；首次成功安装后补齐。`buildHash` 不写入 lock。

普通/私有目标保存 `skillId + authorId + version + releaseSeq`；团队目标保留 `teamId + releaseId + version + releaseSeq`，`skillTeamId` 只用于 `ts_` source 路由。

### D2: check/update 使用批量构建检测

Market provider 新增批量检测方法。`check` 收集当前 scope 的 Market 条目，按普通与团队目标组成 `items` 数组，一次或按技术上限分批调用 `POST /api/skill/build/checkBatch`。

`update` 对版本或 releaseSeq 不一致的条目重新执行 `add`。旧 lock 缺失 releaseSeq 时视为需要重新检测/拉取，不删除旧文件，成功后再补齐。

### D3: add 在安装前重新获取当前 releaseSeq

`add` 完成 ID/团队 release 解析后，调用批量检测（单项数组）取得当前序列，再以该序列请求安装。Market 返回 `BUILD_CHANGED` 时终止本次安装，不自动使用新序列重试；调用方可重新执行 check/update。

### D4: buildHash 使用与 Market 相同的文件 hash

CLI 对安装响应的 `files` 与 `binaryFiles` 解码为原始字节，按最终文件路径计算与 Market 相同的 `sha256(path:sha256(bytes))` 外层 hash。hash 不一致或响应缺少 `buildHash` 时安装失败。

### D5: staging 与原子替换

安装器在目标 canonical 目录同级创建唯一 staging 目录，写入全部文件并完成路径安全检查。成功后：

1. 旧目录存在时 rename 为 backup；
2. staging rename 为 canonical；
3. 失败时恢复 backup；
4. 成功清理 backup。

symlink 模式继续让 agent 链接指向 canonical；copy 模式对每个 agent 目录执行同样的 staging/backup 恢复。该实现优先保证失败保留旧版本，不承诺所有平台零毫秒目录可见性。

### D6: lock 由成功安装结果驱动

安装器返回 completed build metadata；只有全部目标写入成功后才更新当前 scope lock。`add` 仍负责采集 consent 询问，但 `collectConsent` 与 `releaseSeq` 独立写入。

### D7: 旧包与团队上下文兼容

缺少 releaseSeq 的旧 lock 不报错，只视为待刷新。团队 entry 继续使用 teamId/skillTeamId/releaseId；普通私有 entry 继续保存 authorId。没有团队上下文的 `t_` 历史 entry 保持旧检查兼容并在下一次安装后补齐。

## Risks / Trade-offs

- [一次批量检查条目过多导致请求过大] → Client 使用固定分片大小，逐片合并结果；单条 CLI 仍使用一项。
- [atomic rename 在 Windows 覆盖目录行为不同] → 使用 backup/restore 状态机，失败不丢失旧目录；测试覆盖 Windows 语义或用平台分支。
- [旧 Market 不返回 releaseSeq/buildHash] → 新 CLI 对 Market 安装契约 fail-closed，文档要求 Market 先行发布。
- [安装成功但 lock 写入失败] → 文件已是新版本但 lock 仍旧，下一次 check 会再次拉取；输出明确警告且保留 consent 字段。
- [同版本 releaseSeq 变化频繁] → 每个 Agent 通过 BlueFlare 限频，CLI check 只读元数据，不拉包。

## Migration Plan

1. 先发布 Market additive 字段和批量检测接口。
2. CLI 读取旧 lock 时保持兼容，首次安装成功补 releaseSeq。
3. 切换安装器 staging/atomic 流程，并保留旧目录备份。
4. 切换 check/update 到批量接口；团队和普通目标同一个批次处理。
5. 验证失败安装、BUILD_CHANGED、hash mismatch、旧 lock 和 copy/symlink 模式。

回滚 CLI 版本可恢复旧读取逻辑；新 lock 的 releaseSeq 是可选字段，旧版本忽略后仍按 version 维持基本兼容，但无法识别同版本新构建。
