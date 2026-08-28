# Tasks: observability-loongsuite-pilot (CLI)

## 1. Provider 契约对齐

- [x] 1.1 `src/providers/market.ts`：删除 `ObservabilityAgentType` 类型与 `ObservabilityRecord.agentType`
- [x] 1.2 `CreateObservabilityResponse` / `RenewObservabilityResponse` 的 `installCommand` / `installScript` 字段改为嵌套对象 `{ unix, windows }`（`installCommandUnix`/`installCommandWindows` 双字段方案已废弃）
- [x] 1.3 `createObservability` payload 去掉 `agentType`

## 2. obs 命令改造

- [x] 2.1 `src/obs.ts`：删除 `OBSERVABILITY_AGENT_TYPES`、`ObsOptions.agentType`、`--agent` 解析分支与本地类型校验
- [x] 2.2 create 分支：payload 去掉 `agentType`，响应打印 serviceName + 双平台命令
- [x] 2.3 refresh 分支：打印两条命令（unix + windows）
- [x] 2.4 install 分支：`detectHostPlatform()` 选本机平台命令；windows 走 `powershell.exe` 执行、unix 维持 `/bin/sh -c`
- [x] 2.5 `showObsHelp` / `printObservabilityList`：去 `--agent` 与 agentType 列/文案

## 3. 测试同步

- [x] 3.1 `src/obs.test.ts`：去掉 `--agent hermes/openclaw` / `agentType` / `?type=` 断言，改 `installCommand.{unix,windows}` 嵌套对象断言 + `detectHostPlatform`/`pickPlatformCommand` 宿主平台选择单测（win32 分支 + unix 分支）
- [x] 3.2 `tests/market-observability-provider.test.ts`：create body 去 agentType、嵌套对象契约断言

## 4. 文档

- [x] 4.1 `CHANGELOG.md` 补充 obs 对齐条目
- [x] 4.2 如有 README / help 引用更新

## 5. 联调与验收

- [x] 5.1 市场侧 `observability-loongsuite-pilot` change 已实现后两端联调：create/list/refresh/install 端到端
- [x] 5.2 CLI 测试全量通过（与市场侧同 feature 分支合并）
