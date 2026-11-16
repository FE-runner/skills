# 任务

## 1. Publish 参数约束

- [x] 1.1 修改 `src/publish.ts` 的参数解析，在 `--public` 与 `--no-collect` 同时出现时返回本地参数错误；验证：`src/publish.test.ts` 断言不调用 `marketProvider.push`。
- [x] 1.2 在 `runPublish` 请求前把 PUBLIC 可见性的有效 `collectEnabled` 归一化为 `true`，PRIVATE 保持三态；验证：`src/publish.test.ts` 检查 `--public` 未传 collect 时 metadata 为 `true`。
- [x] 1.3 保持 `--version`、team、路径和私有 collect 参数兼容；验证：现有 `parsePublishOptions` 测试全部通过。

## 2. Market 响应与输出

- [x] 2.1 扩展 `src/providers/market.ts` push 返回类型，保留 `collectForcedBySignature`、`collectForcedByVisibility`、`collectForcedReason`，缺失时归一为 false/null；验证：Provider 或 publish mock 测试覆盖字段透传。
- [x] 2.2 修改 `src/publish.ts` 成功输出，在任一强制标记为 true 时说明 Market 已强制开启采集、来源和原因优先级；验证：`src/publish.test.ts` 覆盖签名、公开、双重命中、无强制四种组合。
- [x] 2.3 确认 CLI 不扫描本地 `SKILL.md` 判断可观测版本；验证：代码检索 publish/provider 路径无 `blueai_signature` 正则或 frontmatter 解析。

## 3. 安装与更新 fail-closed 回归

- [x] 3.1 以既有不变量回归复核 `src/providers/market.ts`、`src/collect.ts`、`src/build-hash.ts` 和 `src/add.ts` 继续在 `OBS_VERSION_UNAVAILABLE`、`BUILD_CHANGED`、缺少 releaseSeq/buildHash、hash 不一致时失败且不落盘；验证：相关 `add-market-paths.test.ts`、`market-build-check.test.ts` 定向测试通过。
- [x] 3.2 复核 `check/update` 对观测版本使用 version + releaseSeq 检测且不回退原版；验证：`src/update-source.test.ts` 与 `src/providers/market-build-check.test.ts` 定向测试通过。

## 4. 验证与文档

- [x] 4.1 运行 `pnpm test -- --run`；验证：全部测试通过并记录文件数和用例数。
- [x] 4.2 运行 `pnpm type-check`、`pnpm format:check` 与 `pnpm build`；验证：三条命令退出码均为 0。
- [x] 4.3 只更新本仓 `README.md` 中关于 `--public --no-collect` 和强制采集输出的描述；外部 companion skill 文档保持独立 follow-up。验证：README 与 `cli-publish` delta spec 一致。

## Workflow follow-up

- 同步 `/Users/ly/codes/learn/liyang-skills/src/blueai-skills-cli/references/publish.md` 中公开 Skill 的采集参数说明。
- Archive the change after plan/code review and final verification pass.
