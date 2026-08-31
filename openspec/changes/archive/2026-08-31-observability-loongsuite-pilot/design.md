# Design: observability-loongsuite-pilot (CLI)

## Context

CLI `obs` 子命令（`src/obs.ts`）与 provider（`src/providers/market.ts`）现根据市场侧旧契约实现：`--agent <hermes|openclaw>` 必填、create 请求体带 `agentType`、响应消费单一 `installCommand`。市场侧 change (`observability-loongsuite-pilot`) 将把契约改为单类型、双平台命令（`os=unix|windows`）。本设计描述 CLI 侧如何对齐。

## Goals / Non-Goals

**Goals**
- 删除 `--agent` 与 `agentType` 全链路，create 只传 `agentName` (+`note`)
- 消费 `installCommandUnix` / `installCommandWindows` 双字段；`obs install` 按宿主平台执行对应命令
- 测试、帮助文案、文档同步

**Non-Goals**
- 不改 `refresh` 的参数契约（仍仅 `agentId`）
- 不引导 Windows 之外的第三方平台选择

## Decisions

### D1: 删除 `--agent` 选项

`parseObsOptions` 删除 `agentType`/`--agent` 解析分支与 `OBSERVABILITY_AGENT_TYPES`/`ObservabilityAgentType` 依赖。create 分支不再要求类型：

```
obs <agentName> [--note …]          → create（单类型，无需 --agent）
obs list / refresh <agentId> / install <agentId>  → 不变
```

`--agent` 传入时按「不支持的选项」本地拒绝（与保留字冲突一致）。

### D2: 双平台命令响应契约

`market.ts` 三个响应接口统一为（与市场侧 `installCommand: { unix, windows }` 嵌套对象契约一致，CLI 不解析 `os=` 本身，`?os=` 只是服务端渲染命令 URL 的一部分）：

```ts
export interface CreateObservabilityResponse {
  id: number;
  agentName: string;
  serviceName: string;
  installCommand: { unix: string; windows: string };
  installScript: { unix: string; windows: string };
  note?: string | null;
}
export interface RenewObservabilityResponse {
  serviceName: string;
  installCommand: { unix: string; windows: string };
}
export interface ObservabilityRecord {
  id: number; agentName: string; note?: string | null;
  serviceName: string; createdAt: string;
  // 无 agentType
}
```

create body 去掉 `agentType` 字段。

### D3: `obs install` 按本机平台执行

```ts
export function detectHostPlatform(): 'unix' | 'windows' {
  return process.platform === 'win32' ? 'windows' : 'unix';
}
export function pickPlatformCommand(cmd: { unix: string; windows: string }): string {
  return detectHostPlatform() === 'windows' ? cmd.windows : cmd.unix;
}
```

- `obs refresh`：两条命令都打印（用户自行选择/复制）
- `obs install`：`pickPlatformCommand()` 取本机平台命令执行——unix 走现有 `/bin/sh -c` 同一条 tocken 命令；windows 走 `powershell.exe -ExecutionPolicy Bypass -Command` 执行
- 保留二次确认、非零退出码语义

### D4: 帮助文案与输出

- `showObsHelp`：Usage 去掉 `--agent <hermes|openclaw>`，create 行改为 `obs <agentName> [--note …]`
- 创建成功提示打印双命令；`printObservabilityList` 去掉 agentType 列
- 空清单 / 保留字提示保持

## Risks / Trade-offs

- [Windows 执行路径] Windows 上 `runInstallCommand` 改用 `spawn('powershell.exe', ['-ExecutionPolicy','Bypass','-Command', cmd])`，避免 `/bin/sh -c` 不存在 → 按 `process.platform` 分支建命令，非 win32 维持 `/bin/sh -c`。
- [双平台字段命名] 若市场侧字段名经 review 调整，CLI 侧同步跟随（契约变更点集中在 `market.ts` 三个接口）。

## Migration Plan

1. `market.ts`：改三个响应接口 + create payload（去 agentType）
2. `obs.ts`：`parseObsOptions` 去 `--agent`、`runObs` create 分支去 payload 字段、`obs install` 平台分支、`showObsHelp`/`printObservabilityList` 文案
3. `src/obs.test.ts`、`tests/market-observability-provider.test.ts` 同步
4. 与市场侧 change 联调（同一 feature 分支双仓库合并）

**Rollback**：市场侧契约回退时，CLI 侧收敛点集中在 `market.ts` 接口与 `obs.ts` 平台分支，反向恢复即可。

## Open Questions

- Ubuntu/WSL 由 `process.platform === 'win32'` 判为 unix——符合目标（多数 AI Coding Agent Linux 侧用 bash）。若需细分（Git Bash/MSYS）可在后续迭代，不阻塞本轮。