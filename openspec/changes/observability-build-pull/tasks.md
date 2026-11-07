## 1. 类型与 Lock

- [ ] 1.1 在 `src/skill-lock.ts`、`src/local-lock.ts`、`src/cli.ts`、`src/types.ts`、`src/providers/market.ts` 增加 Market `observabilityEnabled/releaseSeq/buildHash` 与批量检测类型；旧 lock 缺字段可读取，运行 `npx tsc --noEmit`
- [ ] 1.2 在 `src/add.ts` 为已开启观测的全局和项目 lock 写入安装响应的 `version/releaseSeq`，不写 `buildHash`；未开启观测目标只写原版 `version`；新增 `src/skill-lock.test.ts` 覆盖旧条目补齐和失败不更新
- [ ] 1.3 新建 `src/process-lock.ts` 和 `src/process-lock.test.ts`，用 pid+创建的 sidecar lock 串行化全局/项目 lock 完整读改写与 canonical 安装；实现多目标路径去重、字节序排序、批量获取和反向释放；覆盖等待、超时、持锁进程退出后的接管、不同输入顺序不死锁，并让 `src/skill-lock.ts`、`src/local-lock.ts`、`src/add.ts` 的所有 lock 字段更新走该入口；运行 `pnpm exec vitest run src/process-lock.test.ts src/skill-lock.test.ts` 与 `npx tsc --noEmit`

## 2. Market Provider

- [ ] 2.1 在 `src/providers/market.ts` 和对应测试实现 `checkBuildBatch(items)`，支持 PUBLIC/PRIVATE/TEAM、`observabilityEnabled` 并保持顺序；用 mocked fetch 测试混合批、未开启观测、单项错误和空数组
- [ ] 2.2 扩展 `installById()` 对已开启目标接收 `releaseSeq` 并解析 `observabilityEnabled/version/releaseSeq/buildHash`；测试 `BUILD_CHANGED`、`OBS_VERSION_UNAVAILABLE`、未开启原版和已开启响应缺少 `buildHash`
- [ ] 2.3 扩展团队 install target/install 请求：`checkBuildBatch` 只发送 `skillId/teamId/releaseId`，Market 校验 approved release 后返回源版本 `version/observabilityEnabled/releaseSeq`；install 再携带响应序列并取得源版本 `buildHash`；CLI 不保存团队级观测序列，`skillTeamId` 只用于 `ts_` source 路由
- [ ] 2.4 在 `src/add.ts` 完成 ID/team release 解析后，以单 item 调用 `checkBuildBatch`；仅 `observabilityEnabled=true` 时获取当前 `releaseSeq` 并用该序列调用 `installById`，false 时走原版安装；测试解析后构建变化时不落盘及未开启原版安装

## 3. 安装哈希与原子落盘

- [ ] 3.1 新建 `src/build-hash.ts`，实现 Market 定义的 `<path字节长度>:<path>:<raw bytes sha256>` 逐项编码、`\n` 拼接和 `sha256:` 外层 hash；单测覆盖文本、二进制、路径排序、内容变化、含 `:`/换行/控制字符路径
- [ ] 3.2 重构 `src/installer.ts` 的 `installWellKnownSkillForAgent`：先写唯一 staging，使用 `src/process-lock.ts` 的 canonical sidecar lock 串行化，完成路径与 hash 校验后通过唯一 backup/rename 切换，失败恢复旧目录并清理安全窗口外残留
- [ ] 3.3 为 copy 模式实现全部目标锁批量获取、全部 staging、逐目标切换、失败时回滚所有已切换目标、回滚失败保留可恢复目录且 lock 不推进；在 `src/installer.test.ts` 用临时目录覆盖首次安装、多目标成功、后续目标失败全量回滚、回滚失败下次收敛、两个并发 copy 不同目标顺序不死锁、staging-only、backup-only、canonical+backup、并发同目录和无法安全恢复
- [ ] 3.4 在 `src/add.ts` 仅对 `observabilityEnabled=true` 计算 `buildHash` 并比对响应，原版响应保持旧兼容；只有全部目标成功后通过 scope lock 返回 completed build metadata 并推进 lock，失败时保留旧值

## 4. Check 与 Update

- [ ] 4.1 重构 `src/update-source.ts` 和 `src/cli.ts` 的 Market 检查：收集普通/私有/团队条目，按批调用 `checkBuildBatch`；已开启观测比较 `version + releaseSeq`，未开启只比较原版版本；区分单项错误、整批失败和确实无更新
- [ ] 4.2 修改 `runUpdate`：仅对版本或已开启目标的 releaseSeq 不一致项重新执行对应 `add`；缺少 releaseSeq 的已开启旧 lock 一次重拉，未开启原版条目保持旧路径，安装失败不回退 GitHub/公开/私有来源
- [ ] 4.3 团队路径检测请求传 `releaseId`、响应比较源版本 `releaseSeq`，普通/私有路径传递 `authorId`；对缺 `teamId/releaseId/skillId` 的旧团队 lock 提示重新 add 且不误报无更新；测试覆盖全局与项目、旧 lock、团队 release 变化和无可用产物
- [ ] 4.4 更新 README/命令帮助，说明 `releaseSeq` 判断、`buildHash` 校验、无 daemon 以及本地源码升级不在本期；运行 `pnpm exec vitest run src/cli.test.ts` 验证帮助输出

## 5. 最终验证

- [ ] 5.1 运行 `pnpm test -- --run src/build-hash.test.ts src/process-lock.test.ts src/skill-lock.test.ts src/installer.test.ts src/update-source.test.ts src/add-market-paths.test.ts src/add-team-observability.test.ts src/providers/market-team-install.test.ts` 并修复
- [ ] 5.2 运行 `npx tsc --noEmit` 与 `pnpm build`，记录退出码与结果
- [ ] 5.3 用本地临时目录验证同版本 releaseSeq 变化重拉、未开启观测原版安装、hash 不一致拒绝、升级失败保留旧目录、不同 Skill 并发写 lock 不丢字段和 lock 不推进
