# 任务

## 1. Publish 行为与 Provider 契约

- [ ] 1.1 修改 `src/publish.ts` 的 `parsePublishOptions`，将 `collectEnabled` 默认值设为 `true`，并删除 `--public --no-collect` 的本地冲突；验证：在 `src/publish.test.ts` 覆盖未传参数、`--collect`、`--no-collect` 和 `--public --no-collect`，运行 `pnpm test src/publish.test.ts` 通过。
- [ ] 1.2 修改 `src/publish.ts` 的 `runPublish`，统一透传解析后的 `collectEnabled`，并在 `--no-collect` 推送成功后输出不可逆提示；验证：`src/publish.test.ts` 断言默认请求为 `true`、公开 `--no-collect` 请求为 `false`、成功提示存在且未传 `--no-collect` 时不存在。
- [ ] 1.3 从 `src/providers/market.ts` 删除三个采集强制来源响应字段及映射，并调整 `tests/market-push.test.ts` 断言 Provider 忽略旧字段而不将其写入结果；验证：`pnpm test tests/market-push.test.ts` 通过。

## 2. CLI 帮助与用户文档

- [ ] 2.1 更新 `src/cli.ts` 的 `--collect`、`--no-collect` 帮助文案，说明默认开启且已开启后不可关闭；验证：`src/cli.test.ts` 断言新文案存在，运行 `pnpm test src/cli.test.ts` 通过。
- [ ] 2.2 更新 `README.md` 的 publish 默认行为、`--public --no-collect` 兼容语义和不可逆提示说明；验证：检索 README 中不存在“公开 Skill 必须开启采集”或“`--public --no-collect` 会报错”的旧表述。
- [ ] 2.3 新增 `docs/check-update.md`，覆盖 `check/update` 的范围、鉴权、Market/团队/GitHub 更新判断、输出和常见问题，并在 `README.md` 增加链接；验证：`test -f docs/check-update.md` 成功，README 链接目标存在且文中命令均与当前实现一致。

## 3. 集成验证

- [ ] 3.1 运行 `pnpm test -- --run`；验证：全部测试通过，并记录文件数与用例数。
- [ ] 3.2 运行 `pnpm type-check`、`pnpm format:check` 与 `pnpm build`；验证：三条命令退出码均为 0。

## Workflow follow-up

- 代码审查清零后，由用户显式执行 `@lyx-archive` 归档本 change。
