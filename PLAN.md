# Tencent COS Provider 实现方案

## 概述

新增 `CosProvider`，支持从腾讯云 COS Bucket 中发现和安装 skills。

**用户输入约束**：
- 访问方式：公开读（无需认证）
- URL 格式：COS 域名 URL（`https://<bucket>.cos.<region>.myqcloud.com/...`）
- 目录结构：`skills/<id>/versions/<version>/`（内含 SKILL.md 等文件）
- 发现方式：COS ListObjects API 自动扫描（无需 index.json）
- 版本策略：默认安装最新版本，用户可指定版本

## 使用方式

```bash
# 列出 bucket 中所有可用 skills
bmc-skills add https://my-bucket.cos.ap-guangzhou.myqcloud.com

# 安装指定 skill（自动选择最新版本）
bmc-skills add https://my-bucket.cos.ap-guangzhou.myqcloud.com/skills/my-skill

# 安装指定版本
bmc-skills add https://my-bucket.cos.ap-guangzhou.myqcloud.com/skills/my-skill/versions/1.0.0
```

## 文件变更清单

### 1. 新建 `src/providers/cos.ts` — COS Provider 实现

核心类 `CosProvider implements HostProvider`，包含：

- **`match(url)`** — 匹配 `*.cos.*.myqcloud.com` 域名的 URL
- **`parseCosUrl(url)`** — 从 URL 中提取 bucket、region、skillId、version
- **`listSkillIds(bucket, region)`** — 调用 COS List Objects API（`prefix=skills/&delimiter=/`）列举所有 skill ID
- **`listVersions(bucket, region, skillId)`** — 列举某 skill 的所有版本
- **`resolveLatestVersion(versions)`** — 对版本号排序取最新（支持 semver 数字比较）
- **`listFiles(bucket, region, prefix)`** — 列举某版本下的所有文件 Key
- **`fetchFileContent(bucket, region, key)`** — HTTP GET 获取单个文件内容
- **`fetchSkill(url)`** / **`fetchAllSkills(url)`** — 整合以上方法，返回 `CosSkill[]`
- **`getSourceIdentifier(url)`** — 返回 `cos/<bucket>` 作为来源标识
- **`toRawUrl(url)`** — 直接返回 COS 对象 URL

**COS List Objects API**（公开读 Bucket 无需认证）：
```
GET /?list-type=2&prefix=skills/&delimiter=/
Host: <bucket>.cos.<region>.myqcloud.com
```
返回 XML，用简单正则提取 `<Prefix>` 和 `<Key>` 节点（结构固定，无需引入 XML 解析库）。

**数据类型**：
```typescript
export interface CosSkill extends RemoteSkill {
  files: Map<string, string>;   // 文件名 → 内容
  version: string;               // 版本号
  skillId: string;               // skill ID
}
```

### 2. 修改 `src/providers/index.ts` — 导出 COS Provider

添加 COS provider 的导出：
```typescript
export { CosProvider, cosProvider, type CosSkill } from './cos.ts';
```

### 3. 修改 `src/types.ts` — ParsedSource 增加 cos 类型

```typescript
export interface ParsedSource {
  type: 'github' | 'gitlab' | 'git' | 'local' | 'well-known' | 'cos';  // ← 加 'cos'
  // ...其余不变
}
```

### 4. 修改 `src/source-parser.ts` — 识别 COS URL

在 `isWellKnownUrl()` 之前插入 COS URL 检测：

```typescript
// Tencent COS URL: https://<bucket>.cos.<region>.myqcloud.com/...
if (isCosUrl(input)) {
  return { type: 'cos', url: input };
}
```

新增 `isCosUrl()` 函数：匹配 `*.cos.*.myqcloud.com` 域名模式。

### 5. 修改 `src/add.ts` — 添加 COS 处理流程

新增 `handleCosSkills()` 函数，参照 `handleWellKnownSkills()` 的模式：

1. 解析 COS URL → 提取 bucket、region、可选的 skillId/version
2. 如果未指定 skill：调用 `listSkillIds()` 列出所有 skills，让用户选择
3. 对选中的 skill 调用 `listVersions()` → `resolveLatestVersion()` 确定版本
4. 调用 `fetchAllSkills()` 获取文件内容
5. 复用现有的 agent 选择、scope 选择、安装确认 UI
6. 调用 `installWellKnownSkillForAgent()` 安装（CosSkill 与 WellKnownSkill 结构兼容）
7. 更新 lock 文件，sourceType 为 `'cos'`

在主流程 `addPackage()` 中添加分支：
```typescript
if (parsed.type === 'cos') {
  await handleCosSkills(source, parsed.url, options, spinner);
  return;
}
```

### 6. 修改 `src/installer.ts` — 泛化安装函数签名（可选）

当前 `installWellKnownSkillForAgent` 接受 `WellKnownSkill` 类型，但实际只使用 `installName` 和 `files` 字段。`CosSkill` 拥有相同的字段，可以直接类型兼容传入（或做一个 `Pick` 类型泛化）。

**方案**：在 `installer.ts` 中将参数类型改为：
```typescript
skill: { installName: string; files: Map<string, string> }
```
并保持原函数名不变。`WellKnownSkill` 和 `CosSkill` 都自动满足此接口。

## 不需要的依赖

- **不需要** `cos-nodejs-sdk-v5`（公开读 Bucket 直接用 HTTP fetch）
- **不需要** XML 解析库（COS API 返回结构固定，用正则提取即可）

## COS XML 解析策略

COS List Objects 返回的 XML 格式示例：
```xml
<ListBucketResult>
  <IsTruncated>false</IsTruncated>
  <CommonPrefixes>
    <Prefix>skills/my-skill/</Prefix>
  </CommonPrefixes>
</ListBucketResult>
```

使用正则提取：
- `/<Prefix>([^<]+)<\/Prefix>/g` → 提取目录前缀
- `/<Key>([^<]+)<\/Key>/g` → 提取对象 Key
- `/<IsTruncated>true<\/IsTruncated>/` → 检测是否截断

## 版本排序

简单数字版本比较（不引入 semver 库）：
```typescript
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
```
