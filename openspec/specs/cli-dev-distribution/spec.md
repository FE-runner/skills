# cli-dev-distribution Specification

## Purpose
为 `blueai-skills` 提供一条不污染正式发布的开发版通道：开发构建默认连接内网测试市场、以独立状态根隔离本地凭证与安装状态，并通过 dev dist-tag 发布供内部开发者用 npx 试用。

## Requirements

### Requirement: 开发版默认市场地址与 npx 提示

开发版构建的 CLI SHALL 在未设置 `SKILLS_SITE` 时默认使用 `https://blueai-skills-market.domob-inc.cn` 作为市场基地址，并 SHALL 在帮助与提示文本中给出 `npx blueai-skills@dev` 形式的命令。运行时环境变量 `SKILLS_SITE` SHALL 仍然优先级最高，可覆盖默认地址。

#### Scenario: 开发版无环境变量时使用内网市场

- **WHEN** 用户在未设置 `SKILLS_SITE` 的情况下运行开发版构建的 CLI
- **THEN** 所有市场 API 请求与输出的市场链接指向 `https://blueai-skills-market.domob-inc.cn`

#### Scenario: 运行时覆盖仍然生效

- **WHEN** 用户以 `SKILLS_SITE=http://localhost:3000` 运行开发版构建的 CLI
- **THEN** CLI 使用该地址作为市场基地址，内网默认地址被覆盖

#### Scenario: 帮助与提示给出 dev tag

- **WHEN** 开发版构建的 CLI 输出安装或更新提示
- **THEN** 提示中的命令为 `npx blueai-skills@dev ...`，不出现 `@latest`

### Requirement: 开发隔离模式与状态根

开发版构建 SHALL 默认启用开发隔离模式，并 SHALL 允许运行时环境变量 `BLUEAI_SKILLS_DEV` 以显式假值（`0` / `false`，大小写不敏感）关闭。隔离模式启用时，CLI SHALL 使用一个状态根承载本地状态，默认值为 `~/.blueai-skills-dev/`，并 SHALL 支持运行时环境变量 `BLUEAI_SKILLS_HOME` 覆盖该路径；隔离模式关闭时 `BLUEAI_SKILLS_HOME` SHALL 被忽略。正式构建 SHALL NOT 启用隔离模式，且 SHALL 忽略 `BLUEAI_SKILLS_DEV` 的任何取值。

#### Scenario: 开发版默认启用隔离

- **WHEN** 用户在未设置 `BLUEAI_SKILLS_HOME` 的情况下运行开发版构建的 CLI 并触发本地状态写入
- **THEN** 本地状态写入 `~/.blueai-skills-dev/` 之下，不写入正式版使用的 `~/.blueai/` 或 `~/.agents/`

#### Scenario: 状态根可被运行时覆盖

- **WHEN** 用户以 `BLUEAI_SKILLS_HOME=/tmp/dev-root` 运行开发版构建的 CLI
- **THEN** CLI 使用 `/tmp/dev-root` 作为状态根

#### Scenario: 隔离模式可显式关闭

- **WHEN** 用户以 `BLUEAI_SKILLS_DEV=0` 运行开发版构建的 CLI
- **THEN** CLI 退回正式构建的默认路径行为，不启用状态根

#### Scenario: 隔离关闭时忽略状态根变量

- **WHEN** 用户以 `BLUEAI_SKILLS_DEV=0` 与 `BLUEAI_SKILLS_HOME=/tmp/dev-root` 同时运行开发版构建的 CLI
- **THEN** CLI 使用正式默认路径，不使用 `/tmp/dev-root`

### Requirement: 隔离模式下的状态路径

隔离模式启用时，CLI SHALL 将以下状态置于状态根之下，且三者 SHALL 与正式构建的同名状态互不读写：凭证文件位于状态根内（`<状态根>/secrets.json`），全局 skill 锁位于 `<状态根>/.agents/.skill-lock.json`，全局 canonical skills 目录位于 `<状态根>/.agents/skills/`。

#### Scenario: 凭证落入状态根

- **WHEN** 用户在隔离模式下执行 `login <api-key>`
- **THEN** API Key 写入 `<状态根>/secrets.json`，`~/.blueai/secrets.json` 不被修改

#### Scenario: 全局锁落入状态根

- **WHEN** 用户在隔离模式下执行全局安装
- **THEN** 安装记录写入 `<状态根>/.agents/.skill-lock.json`，`~/.agents/.skill-lock.json` 不被修改

#### Scenario: canonical 安装目录落入状态根

- **WHEN** 用户在隔离模式下执行全局安装
- **THEN** 技能文件写入 `<状态根>/.agents/skills/<skill-name>/`

### Requirement: 隔离模式对真实 agent 目录的边界

隔离模式启用时，对**全局作用域**：CLI SHALL NOT 向真实 agent 全局目录写入技能或创建软链，`list -g`、`remove -g` 等全局状态读取 SHALL NOT 以真实 agent 目录作为来源。开发版全局安装的技能仅对开发版 CLI 可见，真实 agent 不会读取到开发版安装结果。项目级安装、列表、卸载（不带 `-g`）SHALL 保持原行为，仍在 `<cwd>/.agents/skills` 与项目内 agent 目录读写。

#### Scenario: 全局安装不触碰真实 agent 目录

- **WHEN** 用户在隔离模式下执行带 `-g` 的安装
- **THEN** CLI 不写入 `~/.claude/skills`、`~/.codex/skills`、`~/.openclaw/skills` 等真实 agent 目录，也不创建指向状态根的软链

#### Scenario: 列表只反映状态根

- **WHEN** 用户在隔离模式下执行 `list -g`
- **THEN** 输出只包含状态根内已安装的技能，不包含真实 agent 目录中已存在的正式版技能

#### Scenario: 卸载不影响正式状态

- **WHEN** 用户在隔离模式下执行 `remove -g`
- **THEN** 只从状态根移除技能，真实 agent 目录与正式版安装状态保持不变

#### Scenario: 项目级行为保持不变

- **WHEN** 用户在隔离模式下执行项目级安装、`list` 或 `remove`（不带 `-g`）
- **THEN** CLI 仍按原有项目级路径读写 `<cwd>/.agents/skills` 与项目内 agent 目录

### Requirement: Pilot 路径不受隔离模式影响

LoongSuite Pilot 的检测、安装与卸载 SHALL 始终使用真实用户目录 `~/.loongsuite-pilot/`，不随状态根迁移。隔离模式 SHALL 在文档中明确 Pilot 属于机器级状态，相关安装/卸载验证应使用专用机器。

#### Scenario: 隔离模式下检测真实 Pilot

- **WHEN** 用户在隔离模式下执行会读取本机 Pilot 状态的命令
- **THEN** CLI 读取 `~/.loongsuite-pilot/`，不读取 `<状态根>/.loongsuite-pilot/`

#### Scenario: 文档声明 Pilot 测试边界

- **WHEN** 开发者查阅开发版使用说明
- **THEN** 文档明确说明 Pilot 安装/卸载会作用于真实机器状态，需在专用机器或虚拟机上验证

### Requirement: dev 预发布触发（dev-v 标签）

开发版发布入口 SHALL 生成唯一预发布版本号（保留 `-bmc` 版本体系段并含可区分每次发布的标识），并以 `dev-v<版本号>` 形式在 GitHub 镜像仓库创建并推送标签。该入口 SHALL NOT 在本地执行 `npm publish`，SHALL NOT 推送 `v*` 形式的标签。

#### Scenario: 生成唯一版本号并推标签

- **WHEN** 维护者执行开发版发布
- **THEN** 生成形如 `1.4.7-bmc1.7.0-dev.<唯一标识>` 的版本号，并推送 `dev-v1.4.7-bmc1.7.0-dev.<唯一标识>` 标签

#### Scenario: dev 标签不匹配正式标签模式

- **WHEN** 维护者推送 `dev-v<版本号>` 标签
- **THEN** 该标签不以 `v` 开头，不被 `v*` 正式发布触发规则匹配

#### Scenario: 本地不需要 npm 凭证

- **WHEN** 维护者执行开发版发布且本机未登录 npm
- **THEN** 发布入口仍能完成标签推送，不因缺少 npm 凭证失败

### Requirement: CI 开发版发布行为

`publish.yml` SHALL 在收到 `dev-v*` 标签推送时以开发版构建目标构建并发布到 npm `dev` dist-tag；发布 SHALL NOT 改变 `latest` dist-tag，SHALL NOT 为开发版创建 GitHub Release。正式 `v*` 标签的发布行为 SHALL 保持不变。

#### Scenario: 开发版只更新 dev dist-tag

- **WHEN** 维护者推送 `dev-v*` 标签且 CI 发布成功
- **THEN** npm `dev` dist-tag 指向新版本，`latest` 仍指向原正式版本

#### Scenario: 开发版不创建 GitHub Release

- **WHEN** CI 完成 `dev-v*` 标签的发布
- **THEN** 不创建对应的 GitHub Release

#### Scenario: 开发版使用开发构建默认值

- **WHEN** CI 构建 `dev-v*` 标签产物
- **THEN** 产物默认市场地址为 `https://blueai-skills-market.domob-inc.cn`，npx 提示为 `@dev`

#### Scenario: 正式标签行为不变

- **WHEN** 维护者推送 `v*` 标签
- **THEN** CI 仍以 `--tag latest` 发布并创建 GitHub Release

### Requirement: 正式构建不变性

正式构建 SHALL NOT 启用开发隔离模式，SHALL 保持原有默认市场地址与 `@latest` npx 提示，且新增环境变量缺省时 SHALL 与改动前的路径行为完全一致（凭证 `~/.blueai/secrets.json`、全局锁 `~/.agents/.skill-lock.json` 或 `$XDG_STATE_HOME/skills/.skill-lock.json`、canonical 目录 `~/.agents/skills`）。

#### Scenario: 正式构建默认路径不变

- **WHEN** 用户运行正式构建的 CLI 且未设置任何新增环境变量
- **THEN** 凭证、全局锁、canonical 目录与改动前一致

#### Scenario: XDG 状态目录行为保留

- **WHEN** 用户运行正式构建的 CLI 且设置了 `XDG_STATE_HOME`
- **THEN** 全局锁仍写入 `$XDG_STATE_HOME/skills/.skill-lock.json`

#### Scenario: 正式构建市场地址不变

- **WHEN** 用户运行正式构建的 CLI 且未设置 `SKILLS_SITE`
- **THEN** 市场基地址为 `https://blueai-skills-market.bluemediagroup.cn`

#### Scenario: 正式构建忽略隔离开关

- **WHEN** 用户以 `BLUEAI_SKILLS_DEV=1`（或 `BLUEAI_SKILLS_HOME=/tmp/dev-root`）运行正式构建的 CLI
- **THEN** CLI 仍使用正式默认路径与默认市场地址，不启用隔离模式
