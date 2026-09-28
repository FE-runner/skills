## Context

当前 CLI 是单包双用途：`master` 上打 `v*` tag 后由 `.github/workflows/publish.yml` 执行 `npm publish --provenance --tag latest`，任何 tag 都会成为正式版；`src/branding.ts` 的市场默认值是构建期写死进 bundle 的 `process.env.SKILLS_SITE ?? "https://blueai-skills-market.bluemediagroup.cn"`，运行时只保留 `SKILLS_SITE` 覆盖能力。见 `proposal.md` 获取动机与范围。

本地状态目前散落在若干绝对路径：`src/auth.ts` 用 `~/.blueai/secrets.json`，`src/skill-lock.ts` 与 `src/cli.ts` 各有一份 `getSkillLockPath()`（`$XDG_STATE_HOME/skills/.skill-lock.json` 或 `~/.agents/.skill-lock.json`），`src/installer.ts` 用 `~/.agents/skills` 作为 canonical 目录并会向各 agent 专属目录建软链。`src/obs.ts` 的 Pilot 路径固定在 `~/.loongsuite-pilot`。

## Goals / Non-Goals

**Goals:**

- 开发版与正式版在同一台机器上可同时使用，且凭证、全局锁、canonical 安装目录互不读写。
- 开发版默认连内网市场，正式版默认值不受影响。
- 开发版用 `npx blueai-skills@dev` 可直接试用，发布动作不触碰 `latest` 与 `v*` tag。

**Non-Goals:**

- 不改 `skills-lock.json` 的项目级 schema，不隔离仓库内的项目锁文件。
- 不迁移、不修复既有用户状态，不做自动数据搬迁。
- 不把 Pilot 纳入状态根，不解决 Pilot 双实例问题。
- 不发内网 Nexus，不新建独立 workflow 文件；开发版复用 `publish.yml` 以保住已生效的 Trusted Publisher 绑定，也不引入需要默认分支承载的 `workflow_dispatch`。

## Decisions

### D1：构建期注入默认值 + 运行时可覆盖的双层设计

新增构建期注入的三个量：dev 默认市场地址、npx 提示 tag、dev 隔离标记；运行时仍保留可覆盖入口。`build.config.mjs` 仅在 `SKILLS_BUILD_TARGET=dev` 时通过 rolldown `define` 注入，正式构建不注入。

备选：只在发布时 `export SKILLS_SITE`。否决原因：bundle 里的默认值是运行时常量表达式，发布机上的环境变量不会进入产物，装机后无效。

备选：发布脚本用 sed 改源码再还原。否决原因：不可靠、易残留、无法在 CI 复现。

### D2：新增 `src/paths.ts` 统一路径来源，加载期计算一次

状态根、凭证目录、全局锁、canonical 目录统一由 `src/paths.ts` 导出，模块加载期计算一次，避免同进程内出现两个来源。`src/cli.ts` 中重复的 `getSkillLockPath()` 收敛到该模块。

备选：各模块各自读环境变量。否决原因：`src/cli.ts` 与 `src/skill-lock.ts` 已经出现过重复实现，继续分散会再次漂移。

### D3：隔离模式以构建期标记为上限，运行时只能关闭、不能开启

判定分两层：构建期标记为关闭（正式构建）时隔离模式永远关闭，`BLUEAI_SKILLS_DEV=1` 被忽略；构建期标记为开启（开发构建）时，`BLUEAI_SKILLS_DEV` 为显式假值则关闭，否则开启。`BLUEAI_SKILLS_HOME` 仅在隔离模式启用时生效。

| 构建 | `BLUEAI_SKILLS_DEV` | 隔离模式 | `BLUEAI_SKILLS_HOME` |
| --- | --- | --- | --- |
| 正式 | 未设置 / `0` / `1` | 关闭 | 忽略 |
| 开发 | 未设置 | 开启 | 生效 |
| 开发 | `0` / `false` | 关闭 | 忽略 |
| 开发 | `1` / `true` / 其它非空值 | 开启 | 生效 |

布尔解析：trim 后为 `0` 或 `false`（大小写不敏感）视为假值，其余非空值视为真值；未设置时取构建期默认。

备选：仅凭 `BLUEAI_SKILLS_HOME` 是否设置来决定。否决原因：开发者漏设变量时会静默写进正式状态，不符合隔离目标。

备选：允许正式构建通过 `BLUEAI_SKILLS_DEV=1` 开启隔离。否决原因：会破坏“正式构建不变性”这条可测试的硬约束，正式用户升级后的行为必须完全可预测。

### D4：状态根覆盖凭证、全局锁、canonical 目录；Pilot 明确例外

状态根默认 `~/.blueai-skills-dev/`，可用 `BLUEAI_SKILLS_HOME` 覆盖。凭证为 `<状态根>/secrets.json`，全局锁为 `<状态根>/.agents/.skill-lock.json`，canonical 为 `<状态根>/.agents/skills/`。隔离模式启用时 `XDG_STATE_HOME` 不参与全局锁定位；隔离模式关闭时保留 `XDG_STATE_HOME` 的既有行为。Pilot 保持 `~/.loongsuite-pilot/`。

备选：Pilot 一并隔离。否决原因：Pilot 是带 PID 与安装脚本的机器级常驻服务，改目录会产生第二个实例，端口与服务名冲突不由 CLI 控制。

### D5：隔离模式不写、不读真实 agent 目录

安装不向 `~/.claude/skills`、`~/.codex/skills`、`~/.openclaw/skills` 等目录写入或建软链；`list`、`remove` 的扫描来源收窄到状态根 canonical 目录。

备选：仍建软链。否决原因：软链会写进真实 agent 目录，隔离在第一次安装时就失效。

### D6：开发版复用 `publish.yml`，由 `dev-v*` 标签触发 CI 发布

在现有 `publish.yml` 的 `on.push.tags` 增加 `dev-v*`，按标签前缀分叉：`dev-v*` 使用 `SKILLS_BUILD_TARGET=dev` 构建并以 `npm publish --tag dev` 发布；`v*` 保持 `--tag latest` 与 GitHub Release。开发版 SHALL 跳过 GitHub Release 步骤。

备选：新增独立 `publish-dev.yml`。否决原因：npm Trusted Publisher 通过 `npm trust github --file` 绑定到工作流文件名，新文件需要在 npmjs 后台补一条信任配置，而现有绑定已被 `v*` 发布验证可用。

备选：给 `publish.yml` 加 `workflow_dispatch`。否决原因：`workflow_dispatch` 要求工作流位于默认分支 `master`，需要先动正式分支；标签推送使用被推送提交上的工作流文件，只在 develop 落地即可生效。

备选：本地 `npm publish --tag dev`。否决原因：本机 `npm whoami` 返回 401，本地无可用发布凭证；且 OIDC 信任只在 GitHub Actions 运行中生效。

### D7：版本号由本地生成、经标签传入 CI

本地入口生成 `1.4.7-bmc<x.y.z>-dev.<yyyymmddhhmm>` 形式的唯一版本号，创建 `dev-v<版本号>` 标签并推送到 GitHub 镜像；CI 从 `github.ref_name` 去掉 `dev-v` 前缀得到版本号，用 `npm version <版本号> --no-git-tag-version` 设置后再构建发布。版本号不在 develop 上提交，工作区保持干净。

备选：CI 内部用运行号自行派生版本号。否决原因：版本号脱离标签无法追溯，本地与 CI 可能出现不一致。

备选：复用现有 `publish:snapshot` 脚本。否决原因：实测 `npm version prerelease --preid=snapshot` 对 `1.4.7-bmc1.6.4` 生成 `1.4.7-snapshot.0`，会丢掉 `-bmc` 段，脱离本仓版本体系。

### D8：正式构建不变性靠“默认不生效 + 显式测试”保证

正式构建不注入任何 dev 默认值，新增环境变量缺省时全部回落到现状路径；`XDG_STATE_HOME` 覆盖行为保留。用单测固定正式构建的默认路径与默认市场地址。

备选：用版本号后缀（`-dev.`）在运行时推断隔离模式。否决原因：运行时读取自身版本需要额外注入，且会让隔离行为与版本字符串耦合，难以测试。

### D9：涉及既有 capability 的 Purpose 在 apply 阶段直接修正

OpenSpec delta 不支持修改既有 capability 的 Purpose。`cli-skill-collection-consent` 的主 spec Purpose 写有“复用既有 `.agents/.skill-lock.json` 写入流”，在状态根引入后需要改为“当前生效的全局锁文件”。该直接编辑发生在 apply 阶段，不进入 propose 阶段 change-dir-only commit。

## Risks / Trade-offs

- [开发版安装的技能真实 agent 看不到] → 这是隔离的预期代价，文档明确“开发版用于验证 CLI 行为”；需要验证 agent 实际读取效果时用项目级安装或专用机器。
- [路径收口遗漏] → `src/cli.ts` 曾有重复的 `getSkillLockPath()`，`src/agents.ts` 还有模块级 `home` 常量；统一到 `src/paths.ts` 并用测试覆盖两处调用。
- [环境变量组合歧义] → 明确优先级为“显式运行时变量 > 构建期 dev 默认 > 正式默认”，并用矩阵单测固定四种组合。
- [内网域名出现在 public npm 包] → 已知并接受；dev 包只发布 `dev` dist-tag，不含任何密钥，域名本身非机密。
- [npm 版本不可复用 / CI 失败后标签已存在] → 版本号带时间戳，修好流水线后重新生成新版本号与新标签即可，不复用旧标签。
- [dev 触发依赖被标记提交上的工作流文件] → 首次开发版发布前必须确保 `publish.yml` 的 dev 分支改动已在被标记的 commit 上；标签本身不带触发器不会补触发。
- [误把 dev 打成正式] → `dev-v*` 不以 `v` 开头，不匹配 `v*`；发布与 Release 步骤都按 `github.ref_name` 前缀显式分叉，并由任务静态校验两条分支。
- [Pilot 测试污染真实机器] → 文档要求 Pilot 安装/卸载在专用机器或虚拟机验证。
- [正式构建被误启隔离] → 构建期只在 dev target 注入标记，并加正式默认路径回归测试。

## Migration Plan

本次无数据迁移，也不改写既有用户状态：

1. 正式用户升级后路径与默认市场完全不变。
2. 开发版使用者首次运行会在 `~/.blueai-skills-dev/` 建立独立状态，需在该状态根下重新 `login` 一次。
3. 开发版测试结束可直接改用 `npx --yes blueai-skills@latest`，不需要卸载或清理。
4. 开发版发布要求 `publish.yml` 的 dev 分支改动已提交到被标记的 commit；不需要先把 workflow 改动落 `master`。
5. 首次开发版发布后核对 `npm view blueai-skills dist-tags`：`dev` 指向新版本、`latest` 未变。

回滚策略：移除 dev 构建注入与 `publish:dev` 入口即可回到现状；已发布的 dev 版本仅占 `dev` dist-tag，可用 `npm dist-tag` 调整，不影响 `latest`。
