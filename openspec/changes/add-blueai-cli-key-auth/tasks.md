## 1. API Key 解析链（cli-auth）

- [x] 1.1 在 `src/auth.ts` 重写读取逻辑，实现 6 级优先级链：`--api-key` flag → `SKILLS_API_KEY` → `~/.blueai/secrets.json[market key]` → 工作区 `.blueai/credentials.json[activeProfile].apiKey` → `BLUEAI_API_KEY` → 用户 `<configDir>/credentials.json[activeProfile].apiKey`；验证：`src/auth.test.ts` 中新增的各来源用例全部通过
- [x] 1.2 实现 `activeProfile` 解析（读 `<configDir>/config.json`，缺省 `default`，文件缺失/不可解析时回退）与 `BLUEAI_CONFIG_DIR` 覆盖配置目录、并在其设置时跳过工作区查找；验证：对应单测通过，且人工用临时 `BLUEAI_CONFIG_DIR` 确认工作区凭据被跳过
- [x] 1.3 实现工作区凭据查找（从当前工作目录向上逐级找最近的 `.blueai/credentials.json`，取 `[activeProfile].apiKey`），文件缺失/不可解析时视为未命中不报错；验证：单测覆盖"向上多级命中最近者"与"无文件时不报错"
- [x] 1.4 扩展 `src/auth.test.ts`，覆盖每个来源单独命中、优先级冲突（含 `SKILLS_API_KEY` 与工作区凭据同时存在时 `SKILLS_API_KEY` 取胜）与全空报错；验证：`pnpm vitest run src/auth.test.ts` 全绿

## 2. `--api-key` flag（cli-auth）

- [x] 2.1 `cli.ts` 将 `restArgs` 透传给 `runWhoami`；`publish` / `withdraw` 参数解析接受 `--api-key <key>`（单次覆盖、不落盘），其中 `withdraw` 仍须拒绝 `--api-key` 之外的未声明选项；验证：命令级单测覆盖"接受 `--api-key`"与"仍拒绝 `--team`"两种输入
- [x] 2.2 单测覆盖"传入 `--api-key` 时忽略所有持久化来源"，并确认未传时行为与现状一致；验证：相关单测通过

## 3. 503 有界重试与错误分级（cli-auth / cli-publish / cli-withdraw）

- [x] 3.1 在 `src/providers/market.ts` 的 `requestApiResult` 中读取响应 `Retry-After`（秒数与 HTTP-date 两种）并暴露给上层；验证：单测用桩响应头断言解析结果
- [x] 3.2 对 `503` 实现有界重试：最多 2 次（共 3 次尝试）、退避 500ms → 1s（含抖动）、`Retry-After` 优先且单次等待上限 10s、重试期间 stderr 输出进度；401/403 不重试；验证：单测断言尝试次数、退避上限与"401 不重试"
- [x] 3.3 扩展 `src/api-error.ts` 的 `reportApiFailure`：503 重试耗尽输出"服务暂不可用，请稍后重试"（不提示重新登录）、500 标注服务端错误、401 行为保持不变；验证：单测覆盖 401/500/503 三种状态输出与 `process.exitCode`
- [x] 3.4 `publish` / `withdraw` / `whoami` 接入上述分级，并在 `withdraw` 中确保 503 不被误判为"名称不存在"/"鉴权失败"；验证：对应命令单测通过
- [x] 3.5 更新无 Key 时的错误提示语（`publish` / `withdraw` / `whoami`）列明可用来源（`skills login`、`SKILLS_API_KEY`、`BLUEAI_API_KEY`）；验证：单测或人工触发确认提示文案包含这三个来源

## 4. 验证

- [x] 4.1 运行 `pnpm type-check` 与 `pnpm test` 全绿；验证：命令退出码为 0
- [ ] 4.2（延后，依赖 market 侧 central-openapi-user-auth 上线）真机端到端验收：仅注入 `BLUEAI_API_KEY` 的环境下 `skills whoami` 返回 200；并显式验证中央解析不可用时返回 503 触发有界重试而非"鉴权失败"；验证：人工执行并记录结果
