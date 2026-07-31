## 1. Market Provider 扩展

- [ ] 1.1 在 `src/providers/market.ts` 新增 `whoami(apiKey): Promise<ApiResult<{ name: string; email: string | null; role: string; isSuperAdmin: boolean }>>` 方法，GET `/api/auth/me`，携带 `Authorization: Bearer <api-key>` 头，复用现有 `requestApiResult` 辅助函数

## 2. `skills whoami` 命令

- [ ] 2.1 在 `src/cli.ts` 新增 `runWhoami()` 函数：读取 `getApiKey()`，缺失时输出与 `publish`/`withdraw` 一致的提示并 `process.exitCode = 1`，不发起网络请求
- [ ] 2.2 调用 `marketProvider.whoami(apiKey)`；失败时复用 `reportApiFailure`
- [ ] 2.3 成功时打印 `name`/`email`/`role`；`isSuperAdmin === true` 时额外打印一行"超级管理员"提示
- [ ] 2.4 注册 `whoami` 命令路由，并在 `--help`/banner 帮助文本中补充一行说明

## 3. 文档与测试

- [ ] 3.1 更新 `AGENTS.md` 命令表格与 "Key Integration Points" 表格
- [ ] 3.2 更新 `README.md`（`login`/`publish`/`withdraw` 那一节旁边补充 `whoami` 用法示例）
- [ ] 3.3 编写测试（`src/cli.test.ts` 或新增 `src/whoami.test.ts`，取决于 `runWhoami` 落地位置）：覆盖成功打印、`isSuperAdmin` 提示、无 Key、401、网络异常
- [ ] 3.4 运行 `pnpm type-check` 与 `pnpm test`，确保全部通过
- [ ] 3.5 运行 `pnpm format` 格式化新增文件
