# 实施上下文

## 关键决策

- CLI 更新判断使用 `version + releaseSeq`，`buildHash` 只校验当次下载产物，不写入长期 lock。详见 design D1/D4。
- 检测响应 `observabilityEnabled=false` 表示个人/团队未开启采集，继续原版安装；只有已开启观测且缺少 buildHash 才 fail-closed。
- lock 新增字段保持可选，不提升 schema version；旧 lock 在首次成功安装后补齐。详见 design D1。
- 普通/私有检测使用 `skillId + authorId`，团队检测使用 `skillId + teamId + releaseId`；`skillTeamId` 只用于 `ts_` source 路由。详见 design D2。
- `add` 在 ID/team release 解析后重新获取当前 releaseSeq，再带 expected 序列安装，避免 check/install TOCTOU。
- 团队 release 不保存观测序列；CLI 只把 teamId/releaseId 发给 Market 校验权限，releaseSeq/buildHash 来自引用源 Skill 的 version。
- 安装器使用 staging、备份和 rename；失败保留旧 canonical/agent 目录，不先删除旧版本。详见 design D5。
- backup-only 崩溃状态必须在下次持锁安装时先恢复旧 canonical；不得按普通残留清理。
- 全局/项目 lock 的完整读改写和 canonical 目录切换分别使用 sidecar lock，避免跨 Skill 并发覆盖字段。
- 只有全部目标安装成功后才推进 lock：已开启目标写 `version/releaseSeq`，未开启目标只写原版字段；consent 仍独立处理。
- CLI 不增加 daemon、系统定时器或本地源码 instrument；BlueFlare 外部触发 check/update。

## 已否决备选

- 只比较产品版本号：无法发现同版本新观测构建。
- 把 `buildHash` 长期写入 lock：增加状态但更新判断不需要，违反最简原则。
- 直接复用运行中的 check 结果安装：构建可能在 check 与 install 之间变化。
- 先删目标目录再写新文件：失败会丢失旧版本。
- CLI 常驻轮询：当前自动巡检由 BlueFlare 负责，不需要第二套调度器。
- 本地源码 instrument/publish 一体化：产品明确本期不做。

## 范围边界

- 做：lock releaseSeq、批量构建检测、expected releaseSeq、buildHash 校验、staging/原子替换、check/update、团队与私有目标、文档。
- 不做：BlueFlare 代码、CLI daemon、本地源码升级、回滚、构建管理 UI。

## 已知坑

- Windows 覆盖非空目录的 rename 行为与 Unix 不同；backup/restore 状态机必须可恢复旧目录。
- copy 模式涉及多个 Agent 目录，任一失败都不能损坏该目录旧内容；lock 只在全部成功后推进。
- 旧 Market 的未开启观测原版安装保持兼容；观察到 `observabilityEnabled=true` 但缺少 `releaseSeq/buildHash` 时必须 fail-closed。
- 团队旧 lock 缺 `skillTeamId` 时只影响 `ts_` source 路由；构建检测仍可按 `skillId + teamId + releaseId` 执行。
- `skillFolderHash` 继续保留兼容，不得替代 `buildHash` 校验。

## 实施决策

- `version + releaseSeq` 判断更新；`buildHash` 只校验当次安装产物，不写 lock。
- 普通/私有目标按 `authorId` 选择权限身份；团队目标使用 `skillId + teamId + releaseId`，响应序列来自源版本。
- `add` 在安装前重新检测 releaseSeq；BUILD_CHANGED 或 hash 不一致时 fail-closed，不落盘。
- 全局/项目 lock 的所有字段更新使用 sidecar lock 串行读改写。
- copy 模式一次获取全部 Agent 目标锁，全部 staging 后逐目标切换；失败反向回滚，无法回滚时保留恢复目录。

## 实施验证

- `pnpm test -- --run`: 48 files / 669 tests passed。
- `pnpm format:check`: passed。
- `npx tsc --noEmit`: passed。
- `pnpm build`: passed。
- `openspec validate --changes observability-build-pull`: passed。
