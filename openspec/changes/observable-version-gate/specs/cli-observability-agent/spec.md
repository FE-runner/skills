## ADDED Requirements

### Requirement: Pilot 引导由 collectConsent 决定

自动创建接入记录与安装 LoongSuite Pilot 的复用链路 SHALL 仅在对应 Skill 的 `collectConsent=true` 且调用方完成用户确认后执行。`collectConsent=false` 或缺失时 SHALL NOT 自动创建接入记录、SHALL NOT 执行安装脚本；可观测文件仍正常安装。

#### Scenario: consent=true 且本机缺失插件

- **WHEN** 可观测 Skill 安装且 consent=true，本机插件缺失，用户确认自动安装
- **THEN** CLI 创建接入记录并执行本机安装命令

#### Scenario: consent=false

- **WHEN** 可观测 Skill 安装且 consent=false
- **THEN** CLI 不展示自动安装询问、不创建接入记录、不执行安装脚本

#### Scenario: 非交互 consent=false

- **WHEN** 非交互安装且 consent=false
- **THEN** CLI 不输出采集插件自动安装指引，仅完成文件安装
