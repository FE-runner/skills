## Context

CLI 当前以 `version` 判断 Market 更新，`skillFolderHash` 只记录原包 hash；`installWellKnownSkillForAgent` 会先删除 canonical/agent 目录再写入。新增 releaseSeq 需要在现有 Market provider、全局/项目 lock、check/update 和安装器之间贯通。

## Goals / Non-Goals

**Goals:**

- 用 `version + releaseSeq` 发现新版本和同版本新构建。
- 用最终产物 `buildHash` 防止下载内容损坏或构建错配。
- 保持原有直接写入流程，所有目标成功后才推进 lock。
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

### D5: 直接写入与失败语义

`buildHash` 在任何目标目录被修改前完成校验。校验通过后沿用原安装逻辑：

1. copy 模式对每个 Agent 目标先清理并重建目录，再逐个写文件；
2. symlink 模式清理并重建 canonical 目录后写文件，再维护 Agent 链接；建链失败时回退到 copy；
3. 多个 Agent 按目标顺序逐个安装，不预写 staging，不保留 backup，不设完成标记；
4. 不提供目录级原子替换、崩溃恢复、跨 Agent 全量回滚或 `partialSuccess`；
5. 某个目标写入失败时，该目标目录允许为空或残缺，后续目标仍继续尝试；最终只要有任一目标失败，整次安装返回失败且不推进 lock。

该取舍降低安装器复杂度；代价是写入中断后不能恢复旧目录，需要用下一次同构建 update 重装覆盖残缺内容。当前 change 不解决同一目标目录的并发写入。

全局和项目 lock 保持原有普通读改写与直接写入，不增加 sidecar lock。并发执行多个 CLI 不是受支持场景；CLI 不做跨进程并发合并承诺。

### D6: lock 由成功安装结果驱动

安装器返回每个目标的成功或失败结果；只有全部目标写入成功后才更新全局或项目 lock。`add` 仍负责采集 consent 询问，`collectConsent` 与 `releaseSeq` 通过同一个普通读改写入口独立更新字段。

文件已经全部安装但 lock 写入失败时，CLI 输出明确警告并保持安装成功结果；lock 保留旧值，下一次检测到尚未记录的 `releaseSeq` 时会重新安装。

### D7: 旧包与团队上下文兼容

缺少 releaseSeq 的旧 lock 不报错。CLI 先调用批量检测：`observabilityEnabled=true` 时视为待刷新并在成功安装后补齐；false 时只按原版版本判断且不写入 `releaseSeq`。团队 entry 继续使用 teamId/skillTeamId/releaseId；普通私有 entry 继续保存 authorId。历史 `t_` entry 缺少 `teamId`、`releaseId` 或 `skillId` 时，不调用批量检测、不标记无更新，只提示该条目需要重新 `add` 后才能继续自动检查；下一次成功 add 补齐字段。

## Risks / Trade-offs

- [一次批量检查条目过多导致请求过大] → Client 使用固定分片大小，逐片合并结果；单条 CLI 仍使用一项。
- [直接写入过程中失败会留下残缺目标] → CLI 返回失败且不推进 lock；下一次检测到同版本新构建或未记录序列时重新安装覆盖。
- [旧 Market 不返回 releaseSeq/buildHash] → 新 CLI 仅对 `observabilityEnabled=true` 的观测安装 fail-closed；未开启观测的原版 Market 安装保持旧响应兼容。
- [安装成功但 lock 写入失败] → 文件已是新版本但 lock 仍旧，下一次 check 会再次拉取；输出明确警告且保留 consent 字段。
- [同版本 releaseSeq 变化频繁] → 每个 Agent 通过 BlueFlare 限频，CLI check 只读元数据，不拉包。

## Migration Plan

1. 先发布 Market additive 字段和批量检测接口。
2. CLI 读取旧 lock 时保持兼容；已开启目标首次安装成功补 releaseSeq，未开启目标保持原版版本字段。
3. 在现有直接写入流程前增加 `buildHash` 校验，并保持全部目标成功后推进 lock。
4. 切换 check/update 到批量接口；团队和普通目标同一个批次处理。
5. 验证失败安装、BUILD_CHANGED、hash mismatch、旧 lock、未开启原版和 copy/symlink 模式。

回滚 CLI 版本可恢复旧读取逻辑；新 lock 的 releaseSeq 是可选字段，旧版本忽略后仍按 version 维持基本兼容，但无法识别同版本新构建。
