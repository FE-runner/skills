## 1. 类型与 Lock

- [ ] 1.1 在 `src/skill-lock.ts`、`src/local-lock.ts`、`src/cli.ts`、`src/types.ts`、`src/providers/market.ts` 增加 Market `releaseSeq/buildHash` 与批量检测类型；旧 lock 缺字段可读取，运行 `npx tsc --noEmit`
- [ ] 1.2 在 `src/add.ts` 为全局和项目 lock 写入安装响应的 `version/releaseSeq`，不写 `buildHash`；新增 lock 读写测试覆盖旧条目补齐和失败不更新

## 2. Market Provider

- [ ] 2.1 实现 `checkBuildBatch(items)`，同时支持 PUBLIC/PRIVATE/TEAM 目标并保持顺序；用 mocked fetch 测试混合批、单项错误和空数组
- [ ] 2.2 扩展 `installById()` 接收 `releaseSeq`，解析响应 `version/releaseSeq/buildHash`；测试 `BUILD_CHANGED`、`OBS_VERSION_UNAVAILABLE` 和缺少 `buildHash`
- [ ] 2.3 扩展团队 install target/install 请求，团队构建检测使用 `skillId/teamId/releaseId/releaseSeq`，`skillTeamId` 只用于 `ts_` source 路由；并保留 fail-closed
- [ ] 2.4 在 `src/add.ts` 完成 ID/team release 解析后，以单 item 调用 `checkBuildBatch` 获取当前 `releaseSeq`，再以该序列调用 `installById`；测试解析后构建变化时不落盘

## 3. 安装哈希与原子落盘

- [ ] 3.1 新建 `src/build-hash.ts`，实现与 Market 一致的 `sha256(path:sha256(rawBytes))` 外层 hash；单测覆盖文本、二进制、顺序不同和内容变化
- [ ] 3.2 重构 `src/installer.ts` 的 `installWellKnownSkillForAgent`：先写 canonical 同级 staging，完成路径与 hash 校验后通过 backup/rename 切换，失败恢复旧目录
- [ ] 3.3 为 copy 模式实现同样的 staging/备份/恢复，确保单 Agent 失败不破坏旧文件；用临时目录集成测试覆盖首次安装、升级成功和升级失败
- [ ] 3.4 在 `src/add.ts` 调用安装前计算 `buildHash` 并比对响应，只有全部目标成功后返回 completed build metadata；失败时保留 lock

## 4. Check 与 Update

- [ ] 4.1 重构 `src/update-source.ts` 和 `src/cli.ts` 的 Market 检查：收集普通/私有/团队条目，按批调用 `checkBuildBatch`，比较 `version + releaseSeq`
- [ ] 4.2 修改 `runUpdate`：仅对版本或 releaseSeq 不一致的条目重新执行对应 `add`；缺少 releaseSeq 的旧 lock 一次重拉，安装失败不回退 GitHub/公开/私有来源
- [ ] 4.3 团队路径保留 `releaseId + releaseSeq` 判定，普通/私有路径传递 `authorId`；测试覆盖全局与项目、旧 lock、团队 release 变化和无可用产物
- [ ] 4.4 更新 README/命令帮助，说明 `releaseSeq` 判断、`buildHash` 校验、无 daemon 以及本地源码升级不在本期；运行 `pnpm exec vitest run src/cli.test.ts` 验证帮助输出

## 5. 最终验证

- [ ] 5.1 运行 `pnpm test -- --run src/update-source.test.ts src/add-market-paths.test.ts src/providers/market-team-install.test.ts` 并修复
- [ ] 5.2 运行 `npx tsc --noEmit` 与 `pnpm build`，记录退出码与结果
- [ ] 5.3 用本地临时目录验证同版本 releaseSeq 变化重拉、hash 不一致拒绝、升级失败保留旧目录和 lock 不推进
