# cli-dev-distribution Context

## 范围边界

- 本次做三件事：dev 构建期默认值注入、Level 2 状态隔离、`dev-v*` 标签触发 CI 发布。
- 明确不做：项目级 `skills-lock.json` schema 变更、既有本地状态迁移、Pilot 隔离、内网 Nexus 发布、独立 workflow 文件、`workflow_dispatch` 入口。
- 正式构建必须零行为变化；新增环境变量缺省时一律不生效。

## 关键决策

- 双层默认值：构建期注入 dev 默认（市场地址、npx tag、隔离标记），运行时由 `SKILLS_SITE` / `BLUEAI_SKILLS_HOME` / `BLUEAI_SKILLS_DEV` 覆盖。bundle 里的默认值是运行时常量，发布机上临时 export 不会进入产物。
- 状态根默认 `~/.blueai-skills-dev/`，覆盖凭证、全局锁、canonical 安装目录三者；Pilot 保持 `~/.loongsuite-pilot/`，因为它是机器级常驻服务，隔离会起第二个实例。
- 隔离模式不写、不读真实 agent 目录：`listInstalledSkills` 目前同时扫描 canonical 与各 agent 专属目录，只改安装而不收窄扫描会让隔离失效。
- 发布复用现有 `publish.yml` 的 `dev-v*` 标签触发：`npm trust github --file` 把信任绑定到工作流文件名，复用同一文件无需改 npmjs 配置，也不需要本地 npm token。
- 版本号本地生成、经标签传入 CI：`dev-v1.4.7-bmc1.7.0-dev.<yyyymmddhhmm>`，CI 用 `npm version --no-git-tag-version` 写入产物，不提交 `package.json`。
- 涉及既有 capability 的 Purpose 只能在 apply 阶段直接改主 spec，delta 不支持改 Purpose（见 design D9 / tasks 2.6）。

## 已否决备选

- 新增独立 `publish-dev.yml`：`npm trust github --file` 按工作流文件名绑定信任，新文件要在 npmjs 后台补配置，否决。
- `workflow_dispatch`：要求工作流位于默认分支 `master`，需要先动正式分支；标签推送使用被推送 commit 上的工作流文件，develop 落地即可生效，否决。
- 本地 `npm publish --tag dev`：本机 `npm whoami` 返回 401，且 OIDC 信任只在 GitHub Actions 中生效，否决。
- 复用 `publish:snapshot`：实测对 `1.4.7-bmc1.6.4` 生成 `1.4.7-snapshot.0`，丢掉 `-bmc` 段，否决。
- Pilot 一并隔离：机器级常驻服务，会产生第二个实例与端口/服务名冲突风险，否决。
- 各模块各自读环境变量：`cli.ts` 与 `skill-lock.ts` 已出现重复实现，会再次漂移，否决。

## 已知坑与注意事项

- `src/branding.ts` 的 `NPX_CMD` 硬编码 `@latest`，出现在约 20 处帮助与提示文本；dev 构建不换它会把使用者引回正式版。
- `src/agents.ts` 的 `home` 是模块加载期常量；`src/paths.ts` 的状态根也必须只算一次，避免同进程出现两个来源。
- `src/cli.ts` 与 `src/skill-lock.ts` 各有一份 `getSkillLockPath()`，收口时必须两处都改。
- 只改安装路径而不收窄 `listInstalledSkills` 的扫描范围，会让开发版列出正式版已装技能。
- `dev-v*` 触发依赖被标记 commit 上的 workflow 文件；`publish.yml` 的 dev 分支改动必须先提交再打标签。
- CI 失败后标签已存在，重试要生成新版本号与新标签，不复用旧标签，也不得移动已推送的标签指向。
- 首次 dev 发布后核对 `npm view blueai-skills dist-tags`：`latest` 必须未变。
- 正式构建不变性靠单测固定，不靠人工检查。
