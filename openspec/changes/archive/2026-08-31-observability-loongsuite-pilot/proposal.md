# Proposal: observability-loongsuite-pilot

## Why

市场侧可观测接入已整体对齐阿里云官方 LoongSuite Pilot（单类型 loongsuite、双平台安装命令、删除 `agentType`、`serviceName` 改 `BSM-<uuid>`）。CLI 的 `obs` 子命令（`src/obs.ts` + `src/providers/market.ts`）仍硬编码 `--agent <hermes|openclaw>`、请求/响应携带 `agentType`、消费单一 `installCommand`——不随之收敛到市场侧新契约就会编译失败，且 `obs install` 在 Windows 上根本无法执行（`/bin/sh` + `curl | bash`）。本次将 CLI `obs` 对齐市场侧新契约。

## What Changes

- **删除 `--agent` 选项（BREAKING）**：`obs <agentName>` 不再要求 `--agent hermes|openclaw`，create body 不再携带 `agentType`；删除 `OBSERVABILITY_AGENT_TYPES` 与 `ObservabilityAgentType` 类型；保留字集合相对 `add/list/refresh/install` 不变
- **响应契约定双平台命令（BREAKING）**：`CreateObservabilityResponse`/`RenewObservabilityResponse`/`ObservabilityRecord` 去 `agentType`，`installCommand` / `installScript` 字段改为嵌套对象 `{ unix, windows }`（`os=unix` / `os=windows` 是服务端渲染的安装命令 URL 的一部分，CLI 不解析 `os=` 本身）
- **`obs install` 按本机平台执行**：检测宿主操作系统，choose 对应平台命令执行（macOS/Linux 走 `cmd.unix` → `curl…&os=unix | bash`，Windows 走 `cmd.windows` → `Invoke-WebRequest…&os=windows | powershell -ExecutionPolicy Bypass -File`）；`obs refresh` 打印两条命令供用户选择/复制
- **帮助与文案同步**：`showObsHelp` / 创建成功提示 / 清单打印去除 `--agent` 与 agentType 列
- **测试同步**：`src/obs.test.ts`、`tests/market-observability-provider.test.ts` 全部去 `agentType`、改 `installCommand.{unix,windows}` 嵌套对象断言

## Capabilities

- **New Capabilities**:
  - `cli-observability-agent` — 新的活跃 spec（obs 功能此前只有归档 change，无活跃 spec）：单一类型创建（无 `--agent`）、双平台安装命令消费、按本机平台执行、清单无 Agent 类型列

## Impact

- **代码**：`src/obs.ts`、`src/providers/market.ts`、`src/cli.ts`（帮助文案，如需）
- **测试**：`src/obs.test.ts`、`tests/market-observability-provider.test.ts`
- **文档**：`CHANGELOG.md`、`README.md`（若有 obs 用法）
- **兼容**：与本仓库正在进行的市场侧 change (`observability-loongsuite-pilot`) 配套，两端接口契约须同步联调后合并