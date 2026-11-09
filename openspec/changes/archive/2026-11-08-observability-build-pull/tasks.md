## 1. 类型与 Lock

- [x] 1.1 在 `src/skill-lock.ts`、`src/local-lock.ts`、`src/cli.ts`、`src/types.ts`、`src/providers/market.ts` 增加 Market `observabilityEnabled/releaseSeq/buildHash` 与批量检测类型；旧 lock 缺字段可读取，运行 `npx tsc --noEmit`
- [x] 1.2 在 `src/add.ts` 为已开启观测的全局和项目 lock 写入安装响应的 `version/releaseSeq`，不写 `buildHash`；未开启观测目标只写原版 `version`；新增 `src/skill-lock.test.ts` 覆盖旧条目补齐和失败不更新
- [x] 1.3 删除 `src/process-lock.ts`、`src/process-lock.test.ts` 和 sidecar lock 调用；`src/skill-lock.ts`、`src/local-lock.ts` 恢复普通读写，并发 CLI 不作为支持场景

## 2. Market Provider

- [x] 2.1 在 `src/providers/market.ts` 和对应测试实现 `checkBuildBatch(items)`，支持 PUBLIC/PRIVATE/TEAM、`observabilityEnabled` 并保持顺序；用 mocked fetch 测试混合批、未开启观测、单项错误和空数组
- [x] 2.2 扩展 `installById()` 对已开启目标接收 `releaseSeq` 并解析 `observabilityEnabled/version/releaseSeq/buildHash`；测试 `BUILD_CHANGED`、`OBS_VERSION_UNAVAILABLE`、未开启原版和已开启响应缺少 `buildHash`
- [x] 2.3 扩展团队 install target/install 请求：`checkBuildBatch` 只发送 `skillId/teamId/releaseId`，Market 校验 approved release 后返回源版本 `version/observabilityEnabled/releaseSeq`；install 再携带响应序列并取得源版本 `buildHash`；CLI 不保存团队级观测序列，`skillTeamId` 只用于 `ts_` source 路由
- [x] 2.4 在 `src/add.ts` 完成 ID/team release 解析后，以单 item 调用 `checkBuildBatch`；仅 `observabilityEnabled=true` 时获取当前 `releaseSeq` 并用该序列调用 `installById`，false 时走原版安装；测试解析后构建变化时不落盘及未开启原版安装

## 3. 安装哈希与直接落盘

- [x] 3.1 新建 `src/build-hash.ts`，实现 Market 定义的 `<path字节长度>:<path>:<raw bytes sha256>` 逐项编码、`\n` 拼接和 `sha256:` 外层 hash；单测覆盖文本、二进制、路径排序、内容变化、含 `:`/换行/控制字符路径
- [x] 3.2 保持 `src/installer.ts` 的 `cleanAndCreateDirectory + writeSkillFiles` 直接写入逻辑，删除 staging、backup、完成标记、崩溃恢复、目标锁、跨 Agent 回滚和 `partialSuccess`
- [x] 3.3 多个 Agent 按顺序逐个直接安装；任一目标失败继续检查剩余目标，最终存在失败时返回失败且不推进 lock；测试覆盖部分目标成功、部分目标失败
- [x] 3.4 在 `src/add.ts` 仅对 `observabilityEnabled=true` 计算 `buildHash` 并比对响应，原版响应保持旧兼容；只有全部目标成功后推进 lock，失败时保留旧值

## 4. Check 与 Update

- [x] 4.1 重构 `src/update-source.ts` 和 `src/cli.ts` 的 Market 检查：收集普通/私有/团队条目，按批调用 `checkBuildBatch`；已开启观测比较 `version + releaseSeq`，未开启只比较原版版本；区分单项错误、整批失败和确实无更新
- [x] 4.2 修改 `runUpdate`：仅对版本或已开启目标的 releaseSeq 不一致项重新执行对应 `add`；缺少 releaseSeq 的已开启旧 lock 一次重拉，未开启原版条目保持旧路径，安装失败不回退 GitHub/公开/私有来源
- [x] 4.3 团队路径检测请求传 `releaseId`、响应比较源版本 `releaseSeq`，普通/私有路径传递 `authorId`；对缺 `teamId/releaseId/skillId` 的旧团队 lock 提示重新 add 且不误报无更新；测试覆盖全局与项目、旧 lock、团队 release 变化和无可用产物
- [x] 4.4 更新 README/命令帮助，说明 `releaseSeq` 判断、`buildHash` 校验、无 daemon 以及本地源码升级不在本期；运行 `pnpm exec vitest run src/cli.test.ts` 验证帮助输出

## 5. 最终验证

- [x] 5.1 运行 `pnpm test -- --run src/build-hash.test.ts src/skill-lock.test.ts src/update-source.test.ts src/add-market-paths.test.ts src/add-team-observability.test.ts src/providers/market-team-install.test.ts` 并修复
- [x] 5.2 运行 `npx tsc --noEmit` 与 `pnpm build`，记录退出码与结果
- [x] 5.3 验证同版本 releaseSeq 变化重拉、未开启观测原版安装、hash 不一致拒绝、部分目标失败返回失败和 lock 不推进
