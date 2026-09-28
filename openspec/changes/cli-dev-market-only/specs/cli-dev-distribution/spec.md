## REMOVED Requirements

### Requirement: 开发隔离模式与状态根

**Reason**: 开发版不再隔离凭证、全局锁与技能目录；隔离模式与状态根概念整体移除。

**Migration**: 使用「开发版仅覆盖市场端点」与「开发版与正式版共用本地状态路径」两条新要求；`BLUEAI_SKILLS_HOME` / `BLUEAI_SKILLS_DEV` 不再被读取，删除相关环境变量设置即可。

### Requirement: 隔离模式下的状态路径

**Reason**: 凭证、全局锁、canonical 目录都不再置于状态根之下，该要求描述的状态布局已不存在。

**Migration**: 见「开发版与正式版共用本地状态路径」。

### Requirement: 隔离模式对真实 agent 目录的边界

**Reason**: 行为反转——开发版需要安装到真实 agent 目录，才能被 Claude / Codex 等真实 agent 使用。

**Migration**: 见「开发版与正式版共用本地状态路径」。

### Requirement: Pilot 路径不受隔离模式影响

**Reason**: 隔离模式已移除，"不受隔离影响"的前提不存在。

**Migration**: 见「Pilot 始终使用真实用户目录」。

### Requirement: 正式构建不变性

**Reason**: 其中"SHALL NOT 启用开发隔离模式""新增环境变量缺省时不生效""正式构建忽略隔离开关"等表述都建立在隔离模式存在的前提上，该前提已移除。

**Migration**: 见「正式构建默认值不变」与「开发版仅覆盖市场端点」；正式构建的默认值不变，差异边界改由「开发版仅覆盖市场端点」表述。

## ADDED Requirements

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
