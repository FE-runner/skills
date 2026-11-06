## Context

See `proposal.md` — Why. 当前 CLI 的 `MarketProvider.fetchById()` 用 `report` 切换安装响应，`add.ts` 会先请求原版、再探测改造版并在首次 consent 询问后替换文件；`track.ts` 也会重新 fetch + install。市场新契约把文件版本和 consent 分开后，这些双请求与重装路径都必须删除。Lock 字段已经存在，不需要结构迁移。

## Goals / Non-Goals

**Goals:**

- 每个目标 Skill 每次安装只发起一次 Market 安装请求并落盘该响应。
- consent 三态只从当前 scope lock 读取，首次缺失时询问，后续不重复询问。
- 明确区分 `OBS_VERSION_UNAVAILABLE` 与其他安装失败，禁止回退替代来源。
- 保持 teamId、skillTeamId、releaseId、version 和 lock schema 兼容。

**Non-Goals:**

- 不修改 Market 服务端实现。
- 不新增 consent 状态文件，不提升任一 lock schema version。
- 不兼容旧 Market：旧服务端忽略“未传 report”并返回原版时，无法保证安装改造版。
- 不改变 push/publish 的文件采集逻辑；市场端签名字段检测由服务端完成。

## Decisions

### D1: Provider 安装调用返回可区分错误

新增/改造安装结果方法返回 `ApiResult<MarketSkill>`，并移除 `report` 参数。请求体只含 `id`、可选 `version`、`author`/`team` 和 `releaseId`。`409 OBS_VERSION_UNAVAILABLE` 原样透传给命令层，命令层输出稳定错误并不回退原版。

保留现有 `fetchById(): Promise<MarketSkill | null>` 作为轻量兼容包装仅限不关心失败分类的内部调用；安装主流程使用 `ApiResult` 方法。备选方案是让 `fetchById` 抛异常，但项目现有命令错误处理统一使用 `ApiResult`，异常会引入第二套控制流。

### D2: 单 Skill 安装只请求一次

`add.ts` 在确定 `id/version/author/team/releaseId` 后请求一次安装响应。响应含合法 `collect` 即视为可观测 Skill：

1. lock consent 缺失：交互时询问；非交互默认 `false`。
2. consent 已定夺：复用 lock，不询问。
3. `--observability`：强制 `true`，跳过询问。
4. 无论 consent 值，安装文件都使用同一响应。

删除 `monitoredGrafted`、原版先行、`collect.reason` 降级和第二次 fetch。备选方案是保留两次请求但忽略第二次文件，仍会造成无意义下载和竞态，否决。

### D3: consent 写入与实际安装解耦但同命令收口

consent 在文件安装前决定，以便决定是否提示 Pilot；lock 写入仍在文件安装成功后执行。安装失败不写 consent。`collectConsent=true` 才调用既有 Pilot 状态/自动安装链路；`false`/missing 不触发。

### D4: Team 安装复用 release-bound 响应

团队流程以 `teamId/skillId/installVersion/releaseId` 获取每个 Skill 的唯一响应：

- 收集其中可观测 Skill，并对 consent 缺失项发起一次团队询问。
- 每个 Skill 用其响应文件安装；不可用项 fail-closed，不影响其他可安装项。
- 同一命令内以 release 上下文作为缓存键，避免 consent 判断与实际安装重复下载。

备选方案是先“预检”再正式安装，仍会重复请求且容易版本漂移，否决。

### D5: track 是纯 lock 操作

`track on/off` 只解析全局 lock 条目，写 `collectConsent=true/false`，保留 team/version/hash 等字段。不再调用 resolver、Market 安装接口或 installer。`track list` 不变。

### D6: 旧 lock 与团队上下文保持兼容

继续使用现有 `skill-lock.ts` 与 `local-lock.ts` 中的 `collectConsent`，不提升 schema。团队字段优先关系保持 `skillTeamId/releaseId` → `teamId` → `author`。

## Risks / Trade-offs

- [Marker 混部] → 新 CLI 必须与新 Market 配套发布；release notes 明确升级顺序，旧 CLI 的 `report` 语义不再支持。
- [用户拒绝后仍落盘可观测文件] → 这是既定隐私/版本解耦语义；通过不写 consent、不引导 Pilot 和 Hook 下游排除 `false/unset` 控制统计。
- [服务端 collect 响应异常] → 非对象或缺签名时按非可观测处理；不得扫描文件推断 consent。
- [团队部分失败] → 单项失败不影响其他项，但绝不回退其他安装源；最终命令保留失败退出码。
- [首次非交互默认拒绝] → 文件仍是 active artifact，后续 `track on` 无需重装即可开始统计。

## Migration Plan

1. 先部署支持“无 report、active artifact + OBS_VERSION_UNAVAILABLE”的 Market。
2. 发布配套 CLI；新 CLI 删除所有 `report` 请求和 consent 重装。
3. 文档与 `blueai-skills-cli` companion skill 同步 track-only 语义。
4. 回滚时 Market 与 CLI 一起回滚；lock 字段兼容，无需数据库或文件迁移。
