## Context

`bmc-skills` CLI 在最近的提交 (`cb3d9f4`) 中添加了私有技能安装时的 `author` 参数传递支持。安装流程（`add` 命令）已能正确将 `author` 传递给 Market API 的 `resolve()` 和 `fetchById()` 方法。

但 `check` 和 `update` 命令从锁文件读取已安装技能信息后，调用 `marketProvider.check()` 时未传递 `author` 参数，因为锁文件中 `source` 字段未包含 author 信息（当前格式为 `market/skillName`）。对于私有技能，Market API 需要 `author` 参数来验证访问权限，缺少该参数会导致 API 返回 404 或权限错误。

**问题点定位:**
- `src/add.ts:1551` — `sourceIdentifier` 生成时未包含 author：`market/${skill.installName}`
- `src/cli.ts:418` — `marketProvider.check(entry.skillPath!)` 缺少 author
- `src/cli.ts:520` — `marketProvider.check(entry.skillPath)` 缺少 author
- `src/cli.ts:522` — update 时 `installUrl` 仅为 `skillName`，不含 author 前缀

## Goals / Non-Goals

**Goals:**
- 在锁文件的 `source` 字段中编码 author 信息
- `check` 和 `update` 命令从 `source` 解析出 author 并传递给 Market API
- update 时能重新安装私有技能（installUrl 包含 author 前缀）
- 向后兼容：旧格式 `market/skillName` 不受影响

**Non-Goals:**
- 不改动 Market API 后端
- 不改动 `find` 命令的搜索逻辑
- 不改动 `list` 命令的显示
- 不改动 COS provider
- 不新增 SkillLockEntry 字段

## Decisions

### 1. 将 author 编码进 source 字段（而非新增字段）

将 `source` 字段格式从 `market/skillName` 改为 `market/author/skillName`（有 author 时）：

- 公开技能: `"source": "market/create-adaptable-composable"`
- 私有技能: `"source": "market/李阳_242613/create-adaptable-composable"`

**理由**: 不需要修改 `SkillLockEntry` / `LocalLockEntry` 接口，不需要升级锁文件版本号。`source` 字段本身就是标识来源的，包含 author 是自然的。与 GitHub 技能的 `owner/repo` 模式一致。

### 2. 修改 sourceIdentifier 生成逻辑

在 `src/add.ts:1551`，生成 `sourceIdentifier` 时带入 author：

```typescript
// 之前
const sourceIdentifier = parsed.installToken ? `market/token` : `market/${skill.installName}`;
// 之后
const sourceIdentifier = parsed.installToken
  ? `market/token`
  : author
    ? `market/${author}/${skill.installName}`
    : `market/${skill.installName}`;
```

### 3. 添加 source 解析工具函数

新增一个工具函数从 `source` 字段解析出 author 和 skillName：

```typescript
function parseMarketSource(source: string): { author?: string; skillName: string } {
  // source 格式: "market/skillName" 或 "market/author/skillName"
  const parts = source.replace('market/', '').split('/');
  if (parts.length >= 2) {
    return { author: parts[0], skillName: parts.slice(1).join('/') };
  }
  return { skillName: parts[0] };
}
```

### 4. check/update 时从 source 解析 author

在 `runCheck()` 和 `runUpdate()` 中，调用 `parseMarketSource(entry.source)` 获取 author，传递给 `marketProvider.check()`。

**修改位置**:
- `cli.ts:418` — `marketProvider.check(entry.skillPath!, parsed.author)`
- `cli.ts:520` — `marketProvider.check(entry.skillPath, parsed.author)`

### 5. update 重安装时 installUrl 从 source 派生

直接从 `source` 去掉 `market/` 前缀作为 `installUrl`：
- `market/李阳_242613/my-skill` → installUrl = `李阳_242613/my-skill`
- `market/my-skill` → installUrl = `my-skill`

**修改位置**:
- `cli.ts:522` — `installUrl: entry.source.replace('market/', '')`

### 6. 本地锁文件同步处理

`src/local-lock.ts` 和 `src/install.ts` 中同样需要在生成 source 时包含 author，以及在 check/update 本地技能时解析 author。

## Risks / Trade-offs

- **[向后兼容]** → 旧锁文件的 `market/skillName` 格式不含 author，解析时返回 `author: undefined`，不影响公开技能的正常工作
- **[author 含斜杠]** → 当前 author 格式为 `用户名_工号`，不含 `/`，解析安全。如果未来 author 格式变化需要重新评估
- **[source 字段语义变化]** → source 从纯标识变为带 author 信息的标识，但这与 GitHub 的 `owner/repo` 模式一致，语义自然
