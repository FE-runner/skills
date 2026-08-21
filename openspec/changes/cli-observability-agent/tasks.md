# CLI 可观测接入 — Tasks

## 1. 命令层

- [ ] 1.1 在 `src/cli.ts` 命令路由新增 `obs` 分支（`skills obs …`），接入 `runObs()`；`--help` 补 obs 用法
- [ ] 1.2 新建 `src/obs.ts`：解析子命令（add 语义/create / list / refresh），校验 `--agent` 枚举（hermes|openclaw 与 `agentName` 必填；`--note` 可选）；**`agentName` 保留字检测**（add/list/refresh 取为 agentName 时本地报错退出）

## 2. Provider 与鉴权

- [ ] 2.1 在 `src/providers/market.ts` 新增 `createObservability` / `listObservability` / `renewObservability(agentId)`（renewToken 走 POST + JSON body `{ agentId }`），复用 `requestApiResult` + Bearer API Key
- [ ] 2.2 命令入口先 `getApiKey()`，缺失时提示 `skills login <api-key>` 并退出 1；失败路径复用 `reportApiFailure`

## 3. 测试

- [ ] 3.1 为 `runObs` 补单元测试：agent 枚举非法本地拒绝、refresh 缺 agentId 用法报错、**agentName 保留字拒绝**
- [ ] 3.2 补 provider mock 测试：create/list/renew 三方法请求路径（renew 断言 POST body `{ agentId }`）、鉴权头、响应 envelope 解析、**list 输出含 agentId 字段断言**
- [ ] 3.3 全量 `pnpm test`、`pnpm tsc --noEmit` 通过

## 4. 文档

- [ ] 4.1 更新 `README.md` 命令表补 `obs` 三命令；`CHANGELOG.md` 补条目
- [ ] 4.2 与市场侧联调冒烟验证（create → list（含 agentId）→ refresh <agentId> 顺序全通过）后发布