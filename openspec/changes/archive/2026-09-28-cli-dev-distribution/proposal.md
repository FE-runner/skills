## Why

`develop` 已领先 `master` 35 个 commit（obs 接入、采集同意、track 命令组等），需要一条让内部开发者用 npx 试用的非正式发布通道。现有发布链路是 `master` + `v*` tag → `publish.yml` 执行 `npm publish --tag latest`，把任何改动打上去都会直接顶掉正式版；同时开发版必须默认连内网市场 `https://blueai-skills-market.domob-inc.cn`，若只切市场地址而不隔离本地状态，开发版与正式版会共用 API Key、全局锁、canonical 安装目录与真实 agent 目录，反复切换必然互相污染。

## What Changes

- 新增 dev 构建目标：构建期注入 dev 默认市场地址 `https://blueai-skills-market.domob-inc.cn` 与 npx 提示 tag `@dev`，并注入 dev 隔离标记；正式构建不注入任何 dev 默认值。
- 新增统一状态根与 dev 隔离模式：dev 构建默认把凭证、全局 skill 锁、全局 canonical skills 目录收拢到 `~/.blueai-skills-dev/`，且不再向真实 agent 目录写入或建立软链，列表与卸载也不再扫描真实 agent 目录；Pilot 路径明确保持不变。
- 新增 dev 预发布流程：本地入口生成沿 `-bmc` 体系递增的唯一预发布版本号并推送 `dev-v<版本>` tag，由现有 `publish.yml` 以 `SKILLS_BUILD_TARGET=dev` 构建并发布到 `dev` dist-tag；不创建 `v*` tag、不影响 `latest`、不为 dev 版本创建 GitHub Release。
- 正式构建行为零变化：新增环境变量缺省时不生效，`XDG_STATE_HOME` 等既有覆盖行为保留。
- 同步文档与 `CHANGELOG`，说明开发版市场地址、npx 用法、状态根位置与 Pilot 测试边界。

## Capabilities

### New Capabilities

- `cli-dev-distribution`: 开发版构建的默认环境、状态隔离模式、真实 agent 目录边界、dev 预发布分发流程，以及正式构建的不变性约束。

### Modified Capabilities

- `cli-auth`: 凭证目录/文件路径改为“当前生效的凭证目录”，dev 隔离模式下指向状态根，正式构建仍为 `~/.blueai/`。
- `agent-install-targets`: 全局安装目标增加 dev 隔离模式例外——安装只落状态根 canonical 目录，不写 agent 专属全局目录。
- `cli-skill-collection-consent`: `track list` 与采集同意记录引用的全局锁文件改为“当前生效的全局锁文件”，dev 隔离模式下位于状态根。

## Impact

- CLI 代码：`src/branding.ts`、新增 `src/paths.ts`、`src/auth.ts`、`src/skill-lock.ts`、`src/cli.ts`、`src/installer.ts`、`src/agents.ts`。
- 构建与分发：`build.config.mjs`、`.github/workflows/publish.yml`、`package.json` scripts、新增 `scripts/publish-dev.*`。
- 测试：`src/auth.test.ts`、`src/list.test.ts`、`src/obs.test.ts`，新增路径/隔离模式与 dev 构建测试。
- 文档：`README.md`、`CLAUDE.md`、`CHANGELOG.md`。
- 不涉及 market 仓代码、不迁移既有用户数据、不改 `skills-lock.json` schema、不改 Pilot 安装路径、不发内网 Nexus。
