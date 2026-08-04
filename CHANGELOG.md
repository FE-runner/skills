# Changelog

> 本 CHANGELOG 仅记录 BMC 内部 Fork（`-bmc` 标签）自身的改动，不包含上游 `blueai-skills` 原始项目的版本历史。

## [1.4.7-bmc1.6.0] - 2026-08-04

### 新功能

- **`login` 命令**：保存 Skills Market API Key 到本地（`~/.blueai/secrets.json`，权限 600），供 `publish`/`withdraw` 命令鉴权使用
- **`whoami` 命令**：查询当前 API Key 对应的用户身份（名称/邮箱/角色/超级管理员标识）
- **`publish` 命令**：将本地目录推送为 Skill
  - 默认推送为私有 Skill，二次推送自动更新（版本号 patch +1，或用 `--version` 显式指定）
  - `--public`：推送为公开 Skill，提交后进入 PENDING 走审核流程；已发布过的公开 Skill 再次推送走 draft 更新
  - `--team <id1>,<id2>`：推送成功后链式提交团队审核，可叠加 `--public`
  - 目录遍历默认跳过符号链接、二进制文件、`.env`（防止误传密钥，`.env.example` 例外）及 VCS/编辑器噪音目录
- **`withdraw` 命令**：撤回处于 PENDING 审核状态的公开 Skill，恢复为私有

### 修复

- 目录遍历跳过规则改为白名单策略，避免误传敏感文件
- `release.sh` 发布前同步双 remote，避免推送被拒

## [1.4.7-bmc1.5.4] - 2026-07-28

### 修复

- OpenClaw 项目级安装目录改为 `.agents/skills`，避免与自带 bundled skill 目录冲突
- 合并上游分支时补回丢失的 Hermes agent keyword

## [1.4.7-bmc1.5.2] - 2026-06-25

### 新功能

- 新增 Hermes agent 支持

## [1.4.7-bmc1.5.1] - 2026-06-15

### 改进

- `release.sh` 支持 retrigger 模式（不改版本号重推 tag 触发 CI），修复脚本执行权限

## [1.4.7-bmc1.5.0] - 2026-06-15

### 新功能

- 支持 `t_<teamId>/<teamName>` 格式批量安装团队全部 Skill

## [1.4.7-bmc1.4.1] - 2026-06-11

### 改进

- COS provider 的 `index.json` 格式增加校验并输出诊断信息

## [1.4.7-bmc1.4.0] - 2026-06-11

### 新功能

- COS provider 改用 `index.json` 模式，支持批量安装

## [1.4.7-bmc1.3.8] - 2026-06-10

### 修复

- 修复 publish workflow 中 `PREV_TAG` 拼接错误

## [1.4.7-bmc1.3.6] - 2026-06-10

### 新功能

- `find` 搜索结果展示 description 摘要

## [1.4.7-bmc1.3.5] - 2026-05-15

### 新功能

- `find` 结果展示 displayName

### 改进

- CLI 调用路径统一更新为 RPC 风格

## [1.4.7-bmc1.3.0] - 2026-04-28

（含 bmc1.2.2/1.3.1/1.3.2/1.3.4 的重发/回归，内容合并列出）

### 新功能

- `find` 支持 `--uid` 参数搜索私有和团队 Skill

### 修复

- 修复交互搜索竞态条件，过期响应直接丢弃

## [1.4.7-bmc1.2.1] - 2026-04-02

完成一轮与上游的选择性合并（cli.ts / source-parser.ts 等高冲突文件手动合并，保留 BMC 品牌/Market 集成逻辑，吸收上游 `--json`、`update-source`、SSH URL 支持等改动）。

### 新功能

- MarketProvider 支持 Team Skill 安装

### 修复

- `-y` 项目安装时复用已有 agent 目录，避免创建多余目录
- 修复 source-parser 中 `github:` 前缀和 `#branch` 与 Market 解析冲突

## [1.4.3-bmc1.1.12] - 2026-03-31

### 新功能

- 锁文件新增 `authorId` 字段以支持私有技能验证
- 新增技能名称空格校验

## [1.4.3-bmc1.1.7] 至 [1.4.3-bmc1.1.11] - 2026-03-13 ~ 2026-03-17

### 新功能

- 实现 Market 优先级解析策略，支持 GitHub 回退

### 改进

- 包名/命令名从 `bmc-skills` 统一迁移为 `blueai-skills`
- Skills Market 域名切换为生产环境地址

## [1.4.3-bmc1.1.3] 至 [1.4.3-bmc1.1.5] - 2026-03-11 ~ 2026-03-13

### 改进

- Skills Market API 地址切换为生产环境域名
- 统一私有技能作者标识格式

## [1.4.3-bmc1.1.2] - 2026-03-11

### 改进

- 简化 provider 注册机制

### 移除

- 移除基于 token 的私有技能安装方式（改为走 Skills Market 身份体系）

## [1.4.3-bmc1.1.1] - 2026-03-09

### 新功能

- 私有技能安装时支持传递作者参数

### 修复

- 统一处理 API 响应信封格式

### 改进

- 优化技能搜索结果的显示格式

## [1.4.3-bmc1.1.0] - 2026-03-09

### 新功能

- 新增 COS 和 Skills Market 技能源支持

## [1.4.3-bmc1.0.1] 至 [1.4.3-bmc1.0.2] - 2026-03-03

### 新功能

- 添加版本发布脚本 `release.sh`

### 改进

- 简化 CI 发布工作流程

## [1.4.3-bmc1.0.0] - 2026-03-03

基于上游 `blueai-skills` v1.2.0 建立 BMC 内部 Fork。

### 新功能

- 配置常量集中化管理（branding）

### 修复

- `package.json` 添加 `repository` 字段，修复 npm provenance 验证
- CI 发布流程添加 `--tag latest`，修复 prerelease 发布问题
