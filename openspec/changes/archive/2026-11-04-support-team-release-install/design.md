## Context

当前团队批量安装从 `/api/team/installAll` 取得 Skill 列表后，会再次把每个 Skill 当成普通 Market 名称处理：PUBLIC 走裸名 `resolve`，PRIVATE 走 `author/name`。`MarketProvider.fetchById` 已支持 `team` 参数，但团队批量路径没有把 teamId 和团队生效版本贯穿到 resolve、预检与正式安装。

参见 `proposal.md` 和 `specs/team-release-install/spec.md`。本设计只覆盖 CLI 消费新 Market 契约，不修改 Market 服务端。

## Goals / Non-Goals

**Goals:**

- 团队批量安装直接使用 Skill ID、teamId 和生效版本，不依赖名称重新解析。
- 采集预检和正式安装使用同一个团队 release 上下文。
- 兼容旧 Market 列表缺少 `installVersion` 的情况。
- 团队全局安装保存 teamId，使 `track on/off` 可以恢复同一团队 release。
- 保持普通公开、私有和 GitHub 安装路径不变。

**Non-Goals:**

- 不提升 `skills-lock` schema version，也不改变普通技能已有字段语义；只增加可选 `teamId`。
- 不新增 Team 身份鉴权协议；仍使用 Market 现有 teamId 契约。
- 不并行安装团队 Skill，也不改变现有 agent/scope/采集交互顺序。
- 不处理团队 Skill 与公开 Skill 同名时的本地目录冲突策略。

## Decisions

### 1. 团队列表优先读取 installVersion

扩展团队列表类型：

```text
TeamInstallSkill
  id
  name
  displayName
  installVersion
  currentVersion?   兼容旧响应
  visibility
  authorId
```

解析时使用 `installVersion ?? currentVersion`。两者都为空时该 Skill 不进入可安装集合，并输出明确警告，避免回退到名称解析。

### 2. 显式团队上下文通过 ParsedSource 内部字段传递

复用现有 `marketVersion`，并在 `ParsedSource` 增加内部可选字段：

```text
marketSkillId?
marketTeamId?
```

团队循环为每个 Skill 构造：

```text
type: market
marketSkillId: skill.id
marketTeamId: teamId
marketName: release name
marketVersion: installVersion
```

这些字段由团队批处理填充，不从用户输入语法解析。

### 3. 团队上下文跳过名称 resolve

`handleMarketSkill` 在存在 `marketSkillId + marketTeamId` 时跳过 `marketProvider.resolve()`，直接调用：

```text
fetchById(id, version, undefined, teamId)
```

这样 PUBLIC+PENDING、PUBLIC+REJECTED 和团队新版待审都不会被公开搜索或 author/name 路径拦截。失败时不回退 GitHub；只有不具备团队上下文的普通 market source 保留既有回退逻辑。

### 4. 采集预检和正式安装共用上下文

`handleTeamInstall` 在进入 agent/scope 选择前先过滤出具备 `installVersion ?? currentVersion` 的 installable 列表。缺失版本的条目输出团队/Skill 上下文警告且不进入后续流程；空列表直接结束。agent/scope 选择、采集预检、安装循环和完成计数都只使用过滤后的列表。

`preflightTeamCollectConsent` 增加 teamId 参数，并以每个 Skill 的 `id + teamId + installVersion + report=true` 探测。返回的 consent 集合按稳定的团队 Skill 标识索引，循环内据此传递给正式安装。

正式安装仍复用 `handleMarketSkill` 的 agent、scope、symlink/copy、lock 写入和 Pilot 处理，避免复制整套安装逻辑。团队全局安装向 `SkillLockEntry` 写入可选 `teamId`，source 使用 `market/team/<teamId>/<name>`；lock schema version 不变。

`track.resolveTarget()` 读取可选 `teamId`，`track on/off` 调用 `fetchById` 时传入 teamId。写回 lock 时 MUST 保留原 teamId 和包含 teamId 的 source；连续 `track on -> off -> on` 不得丢失团队上下文。旧 lock 没有 teamId 时继续按普通公开/私有逻辑工作；团队 lock 不再用裸名公开请求重取版本。

### 5. 兼容与失败策略

- 新 CLI 可连接旧 Market：列表缺少 `installVersion` 时使用 `currentVersion`。
- 旧 CLI 连接新 Market：服务端继续保持现有字段并新增 `installVersion`，旧路径按原行为运行。
- 团队安装的任何 release 获取失败都不转 GitHub；输出团队和版本上下文后退出该 Skill/命令。
- 普通单 Skill `add` 不设置 `marketTeamId`，行为完全不变。

## Risks / Trade-offs

- [旧 Market 的团队 PUBLIC Skill 可能仍无可安装公开版本] → CLI 兼容字段但无法修复旧服务端；团队 release 安装需要先部署 Market change。
- [团队 release 的本地 installName 仍可能与同名公开 Skill 冲突] → 保持现有目录与 lock 语义，不在本 change 改路径规则；后续如需隔离单独变更。
- [预检和正式安装使用不同上下文会探测错版本] → 两处共享同一个 teamId/installVersion 生成函数，并添加测试断言请求体完全一致。
- [失败时不再回退可能减少可用性] → 团队语义必须保证安装正确版本，宁可报错也不安装同名公开或旧缓存内容。
- [旧 lock 缺少 team 上下文] → 保持旧行为兼容；新团队安装写入 teamId，后续 track 才切换到团队 release。
- [同名团队/公开 Skill 可能共享目录] → 保持既有本地路径规则，不在本 change 改变目录冲突；lock entry 通过 teamId 区分 Market 重取来源。

## Migration Plan

1. 先发布 `skills-market` 的 TeamSkillRelease 与团队安装 API。
2. 再发布 CLI；旧 Market 仍可通过 `currentVersion` 兼容。
3. 回滚 CLI 时服务端新增字段保持向后兼容，旧 CLI 恢复既有名称安装路径。

## Open Questions

无。
