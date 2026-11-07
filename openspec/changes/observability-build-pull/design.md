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

全局 `SkillLockEntry` 与项目 `LocalSkillLockEntry` 增加可选 `releaseSeq`。现有 schema version 不提升：字段可选，旧 lock 可直接读取；已开启观测目标首次成功安装后补齐。`buildHash` 不写入 lock，未开启观测条目只保存原版 `version`。

普通/私有已开启目标保存 `skillId + authorId + version + releaseSeq`；团队已开启目标保留 `teamId + releaseId + version + releaseSeq`，其中 `releaseSeq` 来自 release 引用的源个人 Skill 版本，`skillTeamId` 只用于 `ts_` source 路由。`observabilityEnabled=false` 的目标不要求 `releaseSeq`，继续原版安装语义。

### D2: check/update 使用批量构建检测

Market provider 新增批量检测方法。`check` 收集当前 scope 的 Market 条目，按普通与团队目标组成 `items` 数组，一次或按技术上限分批调用 `POST /api/skill/build/checkBatch`。响应必须携带显式 `observabilityEnabled`：为 true 时比较 `version + releaseSeq`，为 false 时按普通 Market 原版版本判断，不能把缺少 `releaseSeq` 当作构建冲突。

`update` 对版本或已开启目标的 releaseSeq 不一致条目重新执行 `add`。旧 lock 缺失 releaseSeq 时，CLI 先用批量检测确认该目标当前是否开启观测：已开启则重新拉取并补齐序列；未开启则按原版版本判断，不要求 `releaseSeq`。

### D3: add 在安装前重新获取当前 releaseSeq

`add` 完成 ID/团队 release 解析后，调用批量检测（单项数组）。团队目标由 Market 校验 approved release 后解析其引用的源个人 Skill `version`；检测返回 `observabilityEnabled=true` 时取得源版本序列，再以该序列请求安装；返回 false 时使用原版安装，不携带 `releaseSeq`。Market 对已开启目标返回 `BUILD_CHANGED` 时终止本次安装，不自动使用新序列重试；调用方可重新执行 check/update。批内单项错误只标记该项；整批网络/接口失败必须报告检查失败，不能显示为无更新，失败项不得由 update 自动安装。

### D4: buildHash 使用与 Market 相同的文件 hash

CLI 对安装响应的 `files` 与 `binaryFiles` 解码为原始字节。路径统一为 `/`，必须是相对路径，禁止 `.`、`..` 和绝对路径；按 UTF-8 路径字节序排序。每项编码为 `<utf8 path 的十进制字节长度>:<utf8 path>:<64 位 lowercase hex sha256(raw bytes)>`，项之间用单个 `\n` 连接，末尾不加换行；对外层 UTF-8 字节串取 SHA-256，输出固定加 `sha256:` 前缀。长度前缀使包含 `:`、换行或其他控制字符的合法文件路径仍可无歧义重建。该算法以 Market 已发布的 buildHash 契约为权威。`observabilityEnabled=true` 时，hash 不一致或响应缺少 `buildHash` 安装失败；`observabilityEnabled=false` 或非 Market 原版响应继续旧兼容路径，不要求 `buildHash`。

### D5: staging 与原子替换

安装器在目标 canonical 目录同级创建唯一 staging 目录，写入全部文件并完成路径安全检查。成功后：

1. 旧目录存在时 rename 为 backup；
2. staging rename 为 canonical；
3. 失败时恢复 backup；
4. 成功清理 backup。

symlink 模式继续让 agent 链接指向 canonical；copy 模式先为全部 Agent 目标完成 staging 与校验，再逐个切换并保留 backup。任一目标切换失败时，按相反顺序回滚所有已切换目标；只有全部成功后才清理 backup 与推进 lock。若回滚失败，返回部分成功并保留可恢复目录，lock 不推进。

staging/backup 使用包含 pid+随机值的唯一名称；每一步失败按 backup 恢复。获得目标 sidecar lock 后，进程按以下崩溃状态执行恢复：

1. canonical 存在、backup 不存在、staging 存在：旧版本仍有效，只删除 staging；
2. canonical 不存在、backup 存在：旧目录已 rename、新目录未切换，先把 backup rename 回 canonical；
3. canonical 存在、backup 存在：新目录已完成 rename 且 staging 在切换前已完整校验，确认 canonical 可读后删除 backup；
4. canonical 与 backup 均不存在、staging 存在：staging 尚未完成首次安装，删除 staging 并保持目标不存在；
5. 其他组合或无法确认 canonical 完整：不删除任何目录，报告需要人工恢复。

复制模式对每个 Agent 目标执行同一恢复状态机；回滚或恢复失败时终止整次安装、保留所有可恢复目录，下一次持锁安装继续收敛到同一构建。

并发控制使用项目内 `src/process-lock.ts` 的 sidecar lock，不增加运行时依赖：

1. 每个 canonical/Agent 目标使用 `<target>.install.lock`；
2. copy 一次涉及多个目标时，先对规范化绝对路径去重并按字节序排序，再一次性依序获取全部目标 sidecar lock；全部锁持续持有到 staging、切换、失败回滚和崩溃恢复动作结束；
3. 全局 lock 使用 `<getGlobalSkillLockPath()>.lock`，项目 lock 使用 `<cwd>/skills-lock.json.lock`；目标锁全部获得后才获取 scope lock；
4. 所有 lock 字段更新必须在 scope lock 内完成“读取文件 -> 修改目标字段 -> 临时文件写入 -> rename”，不能让安装一个 Skill 的流程整体覆盖另一个进程刚写入的条目；
5. 释放顺序为 scope lock 后、目标 canonical lock 按获取顺序反向释放；等待超时则明确失败，不静默跳过；
6. sidecar 内容记录 pid 与创建时间；持有者已退出或超过安全窗口时可接管，未超时则等待。

### D6: lock 由成功安装结果驱动

安装器返回 completed build metadata；只有全部目标写入成功后才更新当前 scope lock。`add` 仍负责采集 consent 询问，`collectConsent` 与 `releaseSeq` 通过同一个串行化读改写入口独立更新字段，禁止调用方直接 `readSkillLock()` 后整体 `writeSkillLock()`。

### D7: 旧包与团队上下文兼容

缺少 releaseSeq 的旧 lock 不报错。CLI 先调用批量检测：`observabilityEnabled=true` 时视为待刷新并在成功安装后补齐；false 时只按原版版本判断且不写入 `releaseSeq`。团队 entry 继续使用 teamId/skillTeamId/releaseId；普通私有 entry 继续保存 authorId。历史 `t_` entry 缺少 `teamId`、`releaseId` 或 `skillId` 时，不调用批量检测、不标记无更新，只提示该条目需要重新 `add` 后才能继续自动检查；下一次成功 add 补齐字段。

## Risks / Trade-offs

- [一次批量检查条目过多导致请求过大] → Client 使用固定分片大小，逐片合并结果；单条 CLI 仍使用一项。
- [atomic rename 在 Windows 覆盖目录行为不同] → 使用 backup/restore 状态机，失败不丢失旧目录；测试覆盖 Windows 语义或用平台分支。
- [旧 Market 不返回 releaseSeq/buildHash] → 新 CLI 仅对 `observabilityEnabled=true` 的观测安装 fail-closed；未开启观测的原版 Market 安装保持旧响应兼容。
- [两个进程安装不同 Skill 时覆盖同一 lock 文件] → sidecar scope lock 串行化完整读改写，安装文件切换使用独立 canonical lock，二者按固定顺序获取。
- [进程在 canonical 已备份但 staging 未切换时退出] → 下次持锁安装先识别 backup-only 状态并恢复旧 canonical，绝不把唯一备份当普通残留删除。
- [安装成功但 lock 写入失败] → 文件已是新版本但 lock 仍旧，下一次 check 会再次拉取；输出明确警告且保留 consent 字段。
- [同版本 releaseSeq 变化频繁] → 每个 Agent 通过 BlueFlare 限频，CLI check 只读元数据，不拉包。

## Migration Plan

1. 先发布 Market additive 字段和批量检测接口。
2. CLI 读取旧 lock 时保持兼容；已开启目标首次安装成功补 releaseSeq，未开启目标保持原版版本字段。
3. 切换安装器 staging/atomic 流程，并保留旧目录备份。
4. 切换 check/update 到批量接口；团队和普通目标同一个批次处理。
5. 切换全局/项目 lock 到 sidecar 串行化读改写。
6. 验证失败安装、BUILD_CHANGED、hash mismatch、旧 lock、未开启原版、跨 Skill 并发和 copy/symlink 模式。

回滚 CLI 版本可恢复旧读取逻辑；新 lock 的 releaseSeq 是可选字段，旧版本忽略后仍按 version 维持基本兼容，但无法识别同版本新构建。
