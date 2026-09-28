# cli-dev-distribution Specification

## Purpose
为 `blueai-skills` 提供一条不污染正式发布的开发版通道：开发构建只覆盖默认市场端点与命令提示中的 npx tag，其余本地状态与路径行为同正式版，并通过 dev dist-tag 发布供内部开发者用 npx 试用。

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

### Requirement: 开发版仅覆盖市场端点

开发版构建 SHALL 只在两处与正式构建不同：默认市场基地址，以及命令提示中的 npx tag。除此之外，开发版的命令行为、本地路径与状态读写 SHALL 与正式构建一致。

#### Scenario: 除市场与提示外行为一致

- **WHEN** 用户在同一环境分别运行开发版与正式版构建的同一命令
- **THEN** 两者的本地文件读写路径一致，仅市场请求目标与提示中的 npx tag 不同

#### Scenario: 运行时可覆盖市场端点

- **WHEN** 用户以 `SKILLS_SITE=<地址>` 运行开发版构建
- **THEN** CLI 使用该地址，内网默认地址被覆盖

#### Scenario: 隔离开关不再被读取

- **WHEN** 用户设置 `BLUEAI_SKILLS_HOME` 或 `BLUEAI_SKILLS_DEV` 后运行开发版构建
- **THEN** CLI 行为不因这两个变量改变，本地路径仍与正式构建一致

### Requirement: 开发版与正式版共用本地状态路径

开发版构建 SHALL 与正式构建共用同一套本地状态路径：凭证文件为 `~/.blueai/secrets.json`；全局 skill 锁为 `~/.agents/.skill-lock.json`，设置 `XDG_STATE_HOME` 时为 `$XDG_STATE_HOME/skills/.skill-lock.json`；全局 canonical 技能目录为 `~/.agents/skills/`，并 SHALL 按既有规则向各 agent 专属全局目录建立链接或副本。

#### Scenario: 凭证路径与正式版一致

- **WHEN** 用户在开发版构建下执行 `login <api-key>`
- **THEN** API Key 写入 `~/.blueai/secrets.json`

#### Scenario: 全局锁路径与正式版一致

- **WHEN** 用户在开发版构建下执行全局安装
- **THEN** 安装记录写入 `~/.agents/.skill-lock.json`，或设置 `XDG_STATE_HOME` 时写入 `$XDG_STATE_HOME/skills/.skill-lock.json`

#### Scenario: 技能安装到真实 agent 目录

- **WHEN** 用户在开发版构建下执行全局安装
- **THEN** 技能文件写入 `~/.agents/skills/<skill-name>/`，并按既有规则在 agent 专属全局目录建立链接或副本，Claude / Codex 等真实 agent 可读取

#### Scenario: 列表与卸载读取真实目录

- **WHEN** 用户在开发版构建下执行 `list -g` 或 `remove -g`
- **THEN** CLI 读取与清理真实 canonical 目录与真实 agent 目录，行为与正式版一致

### Requirement: Pilot 始终使用真实用户目录

LoongSuite Pilot 的检测、安装与卸载 SHALL 始终使用真实用户目录 `~/.loongsuite-pilot/`。开发版使用说明 SHALL 明确 Pilot 属于机器级状态，安装与卸载验证应使用专用机器。

#### Scenario: 检测真实 Pilot

- **WHEN** 用户执行会读取本机 Pilot 状态的命令
- **THEN** CLI 读取 `~/.loongsuite-pilot/`

#### Scenario: 文档声明 Pilot 测试边界

- **WHEN** 开发者查阅开发版使用说明
- **THEN** 文档明确说明 Pilot 安装 / 卸载会作用于真实机器状态，需在专用机器或虚拟机上验证

### Requirement: 正式构建默认值不变

正式构建 SHALL 保持原有默认市场地址 `https://blueai-skills-market.bluemediagroup.cn`、`@latest` npx 提示与既有本地路径行为（凭证 `~/.blueai/secrets.json`、全局锁 `~/.agents/.skill-lock.json` 或 `$XDG_STATE_HOME/skills/.skill-lock.json`、canonical 目录 `~/.agents/skills`）。

#### Scenario: 正式构建默认路径不变

- **WHEN** 用户运行正式构建的 CLI
- **THEN** 凭证、全局锁、canonical 目录与改动前一致

#### Scenario: XDG 状态目录行为保留

- **WHEN** 用户设置 `XDG_STATE_HOME` 并运行任一构建的 CLI
- **THEN** 全局锁写入 `$XDG_STATE_HOME/skills/.skill-lock.json`

#### Scenario: 正式构建市场地址不变

- **WHEN** 用户运行正式构建的 CLI 且未设置 `SKILLS_SITE`
- **THEN** 市场基地址为 `https://blueai-skills-market.bluemediagroup.cn`
