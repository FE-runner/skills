# bmc-skills Fork 风险清单

> 基于 vercel-labs/skills (v1.4.3) fork，当前版本 1.4.3-bmc1.0.2

---

## 高风险

### 1. 外部服务依赖仍指向 Vercel 基础设施

| 常量 | 值 | 文件 |
|------|----|------|
| `TELEMETRY_URL` | `https://add-skill.vercel.sh/t` | src/branding.ts |
| `AUDIT_URL` | `https://add-skill.vercel.sh/audit` | src/branding.ts |
| `CHECK_UPDATES_API_URL` | `https://add-skill.vercel.sh/check-updates` | src/cli.ts |
| `SKILLS_SITE` | `https://skills.sh` | src/branding.ts |
| `FIND_SKILLS_REPO` | `vercel-labs/skills` | src/branding.ts |
| `EXAMPLE_REPO` | `vercel-labs/agent-skills` | src/branding.ts |

**影响**: 用户数据可能发送到外部服务器；搜索/审计功能依赖第三方。
**建议**: 替换为内部端点或禁用相关功能。

### 2. 遥测代码仍存在

- `src/telemetry.ts` 中 `isEnabled()` 返回 `false`（已禁用），但代码完整保留
- 收集内容包括：技能名称、Agent 类型、来源信息、查询字符串
- 容易被意外重新启用

**建议**: 彻底移除遥测代码，或添加明确注释说明重启需要内部基础设施。

### 3. GitHub Token 暴露风险

- `src/skill-lock.ts` 读取 `GITHUB_TOKEN`、`GH_TOKEN` 环境变量
- 还会执行 `gh auth token` 提取本地 token
- CI/CD 日志中可能泄露

**建议**: 确保 CI 管道屏蔽敏感变量。

---

## 中风险

### 4. 品牌迁移不完整

- README.md 示例仍引用 `vercel-labs/agent-skills`
- 帮助文本中 `EXAMPLE_REPO_URL` 指向原始仓库
- 用户可能被导向原项目

**建议**: 更新所有文档示例为内部仓库地址。

### 5. 发布流程无审批门控

- tag 推送即自动发布到公共 npm
- 无人工确认步骤
- 被盗的 GitHub token 可发布恶意版本

**建议**: 考虑添加手动审批步骤或使用 GitHub Environment Protection Rules。

### 6. URL 输入无严格校验

- `src/source-parser.ts` 解析 URL 但未限制协议
- 可能处理 `git://` 或 `file://` 协议
- 无域名白名单

**建议**: 实现域名白名单和协议限制。

### 7. LICENSE 归属缺失

- 根目录无 LICENSE 文件（或未包含原项目归属）
- `ThirdPartyNoticeText.txt` 未提及 vercel-labs/skills
- package.json author 为个人而非组织

**建议**: 添加 LICENSE 文件并注明 fork 来源。

### 8. 依赖版本使用范围约束

- 所有依赖使用 `^` 范围（如 `obuild@^0.4.22`）
- CI 构建可能因上游更新而失败

**建议**: 关键构建工具使用精确版本。

---

## 低风险

### 9. GitHub Actions 工作流小问题

- `agents.yml` 有重复的 "Enable Corepack" 步骤
- 无制品保留策略

### 10. 子进程环境变量继承

- `src/git.ts` 中子进程继承父进程全部环境变量
- 可能在进程转储中暴露敏感信息

### 11. 缺少安全策略文件

- 无 `.github/SECURITY.md`
- 用户无法规范报告安全问题

### 12. ThirdPartyNoticeText 不完整

- 仅列出部分依赖（@clack, gray-matter, picocolors, simple-git, xdg-basedir）
- 缺少 obuild, typescript, vitest 等

---

## 优先处理建议

1. **替换/禁用** branding.ts 和 cli.ts 中的 Vercel 外部 URL
2. **移除** 遥测代码或确认永久禁用
3. **更新** README 和帮助文本中的示例仓库地址
4. **添加** LICENSE 文件并归属原项目
5. **补充** SECURITY.md 安全策略
