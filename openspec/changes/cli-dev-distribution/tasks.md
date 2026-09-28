## 1. 构建期注入与开发版默认值

- [ ] 1.1 修改 `build.config.mjs`：仅在 `SKILLS_BUILD_TARGET=dev` 时通过 rolldown `define` 注入 dev 市场地址、`@dev` npx tag 与隔离标记；验证 `SKILLS_BUILD_TARGET=dev pnpm build` 后 `dist/cli.mjs` 含 `blueai-skills-market.domob-inc.cn`，而 `pnpm build` 后不含该地址、仍含 `bluemediagroup.cn`
- [ ] 1.2 重构 `src/branding.ts`：市场默认地址与 npx tag 改为“构建期默认 + 运行时覆盖”双层取值，`SKILLS_SITE` 覆盖能力保留；验证 dev 构建的 banner 与 `--help` 输出 `domob-inc.cn` 和 `npx blueai-skills@dev`
- [ ] 1.3 固定正式构建默认值不回归：验证 `pnpm build` 后 `dist/cli.mjs` 中市场地址为 `bluemediagroup.cn`、npx 命令为 `@latest`，且 `src/cli.test.ts` 中 `NPX_CMD`/`SKILLS_SITE` 断言通过

## 2. 状态根与路径收口

- [ ] 2.1 新增 `src/paths.ts`，按 design D3 判定表导出隔离模式判定、状态根、凭证目录、全局锁路径、canonical skills 目录（含 `0`/`false` 布尔解析、`BLUEAI_SKILLS_HOME` 仅在隔离启用时生效、隔离启用时 `XDG_STATE_HOME` 不参与全局锁）；验证单测覆盖“正式 + 未设置/`0`/`1` 均关闭”“开发默认开启”“开发 + `0`/`false` 关闭”“开发 + `BLUEAI_SKILLS_HOME` 生效”“隔离关闭时忽略 `BLUEAI_SKILLS_HOME`”五类组合
- [ ] 2.2 改造 `src/auth.ts` 使用 `paths` 的凭证目录；验证 dev 隔离模式下 `login` 写入 `<状态根>/secrets.json`，`src/auth.test.ts` 用例通过且正式默认路径不变
- [ ] 2.3 将 `src/skill-lock.ts` 与 `src/cli.ts` 中重复的 `getSkillLockPath()` 收敛到 `src/paths.ts`；验证 dev 隔离模式全局安装写入 `<状态根>/.agents/.skill-lock.json`，现有锁相关测试通过
- [ ] 2.4 改造 `src/installer.ts` 的 canonical 目录来源；验证 dev 隔离模式全局安装落在 `<状态根>/.agents/skills/<skill-name>/`
- [ ] 2.5 保留正式构建的 `XDG_STATE_HOME` 行为；验证正式构建下设置 `XDG_STATE_HOME` 时全局锁写入 `$XDG_STATE_HOME/skills/.skill-lock.json`
- [ ] 2.6 直接更新 `openspec/specs/cli-skill-collection-consent/spec.md` 的 Purpose，把固定路径措辞改为“当前生效的全局锁文件”；验证该主 spec 中不再出现把 `.agents/.skill-lock.json` 写死为唯一路径的 Purpose 表述（delta 无法修改 Purpose，必须在 apply 阶段直接改）

## 3. 隔离模式下的真实 agent 目录边界

- [ ] 3.1 安装流程在隔离模式下不写 agent 专属目录、不建软链；验证在临时 HOME 下执行 dev 构建全局安装后，`~/.claude/skills`、`~/.codex/skills`、`~/.openclaw/skills` 均未被创建或修改
- [ ] 3.2 `list` 与 `remove` 的扫描来源在隔离模式下收窄到状态根 canonical 目录；验证预置真实 agent 目录中的同名 skill 后，dev 构建 `list -g` 不显示该 skill，`remove` 也不影响它
- [ ] 3.3 确认 Pilot 路径未被本 change 改动；验证 `src/obs.ts` 的 `~/.loongsuite-pilot` 默认值保持不变，`pnpm test src/obs.test.ts` 全部通过

## 4. 开发版发布入口（dev-v 标签触发 CI）

- [ ] 4.1 修改 `.github/workflows/publish.yml`：`on.push.tags` 增加 `dev-v*`，job 内按 `github.ref_name` 前缀分叉——`dev-v*` 用 `SKILLS_BUILD_TARGET=dev` 构建并从标签派生版本号后执行 `npm publish --tag dev`，`v*` 维持 `--tag latest`；验证 YAML 可解析且两条分支的发布参数正确
- [ ] 4.2 让开发版跳过 GitHub Release：`gh release create` 步骤增加 `!startsWith(github.ref_name, 'dev-v')` 条件；验证条件存在，且 `v*` 分支仍会创建 Release
- [ ] 4.3 新增 `scripts/publish-dev.*`：计算 `1.4.7-bmc<x.y.z>-dev.<yyyymmddhhmm>` 形式唯一版本号、创建并推送 `dev-v<版本号>` 标签到 GitHub 镜像 `old-origin`，本地不执行 `npm publish`、不修改 `package.json`；验证 dry-run 执行后 `git status --porcelain` 为空且无残留 `dev-v*` 本地标签
- [ ] 4.4 在 `package.json` 注册 `publish:dev` script；验证 `node -p "require('./package.json').scripts['publish:dev']"` 有输出且指向新脚本
- [ ] 4.5 确认标签模式不重叠：验证 `dev-v*` 不以 `v` 开头、不会被 `v*` 规则匹配，正式发布路径不会被 dev tag 触发

## 5. 测试与静态检查

- [ ] 5.1 新增或扩展 `src/paths.test.ts`、`src/auth.test.ts`、`src/list.test.ts` 覆盖隔离模式路径、凭证隔离与扫描边界；验证 `pnpm test src/paths.test.ts src/auth.test.ts src/list.test.ts` 通过
- [ ] 5.2 回归采集同意与私有技能链路：验证 `pnpm test src/track.test.ts tests/market-observability-provider.test.ts` 通过
- [ ] 5.3 运行 `pnpm type-check`，验证新增 `src/paths.ts` 的类型导入与调用点无报错
- [ ] 5.4 运行 `pnpm format` 后执行 `pnpm format:check`，验证格式符合仓库要求

## 6. 文档与变更日志

- [ ] 6.1 更新 `README.md`：新增开发版使用说明（`npx --yes blueai-skills@dev`、内网市场地址、状态根位置、回退 `@latest`、Pilot 测试边界）；验证文档中出现 dev 用法的完整命令序列
- [ ] 6.2 更新 `CLAUDE.md`：补充 dev 构建目标、状态根与正式构建不变性说明；验证路径与命令描述与 `src/paths.ts`、`build.config.mjs` 实现一致
- [ ] 6.3 更新 `CHANGELOG.md`，记录开发版分发与状态隔离；验证条目措辞与本次改动一致且位于最新版本段

## 7. 集成验证

- [ ] 7.1 执行 `SKILLS_BUILD_TARGET=dev pnpm build` 并以 `node bin/cli.mjs` 跑无参 banner 与 `--help`，验证市场地址为 `domob-inc.cn`、提示命令为 `@dev`（本地构建不改 `package.json` 版本，`-dev.` 版本格式验证归 4.3/4.4 的标签与 CI 流程）
- [ ] 7.2 在临时 HOME 下用 dev 构建串跑 `add -g` → `list -g` → `remove`，验证状态变化只发生在状态根，真实 `~/.blueai` 与 `~/.agents` 未被写入
- [ ] 7.3 用正式构建复跑默认路径与默认市场检查，验证凭证、全局锁、canonical 目录与市场地址均与改动前一致；同时静态核对 `publish.yml` 的 `v*` 分支仍为 `--tag latest` 且仍创建 Release
- [ ] 7.4 运行 `pnpm test`、`pnpm type-check`、`openspec validate --changes cli-dev-distribution`，验证全量测试与 OpenSpec 结构合法；若存在与本 change 无关的既有失败，记录失败摘要并确认不来自本次改动
