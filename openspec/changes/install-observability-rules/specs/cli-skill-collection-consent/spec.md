# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: 安装时确定并重新确认 consent`
- TO: `### Requirement: 安装时确定并复用 consent`

## REMOVED Requirements

### Requirement: 团队安装一次询问 consent

**Reason**: 团队安装现在对已有 `true`/`false` 直接复用，只对缺失项进行一次团队级选择；旧标题和“重新确认”场景不再准确。

**Migration**: 团队首次未定夺项继续统一选择，已有选择直接复用；安装失败项不写 consent。

## ADDED Requirements

### Requirement: 团队安装一次确定、复用或询问 consent

团队批量安装 SHALL 在安装前收集团队内可观测 Skill，并对 lock 缺少 `collectConsent` 的项发起一次团队级明确选择；lock 已为 `true` 或 `false` 的项直接复用。选择前 SHALL 展示开发者改进计划声明，选择项 SHALL NOT 预选。非交互环境无显式参数时 SHALL 对待定夺项写 `false` 并继续安装。显式 `--observability` 时 SHALL 为安装成功的可观测 Skill 写 `true`。不可观测 Skill SHALL NOT 写 consent；任一 Skill 安装失败时 SHALL NOT 写入或修改该 Skill 的 consent。

#### Scenario: 团队同意

- **WHEN** 团队含首次未定夺的可观测 Skill 且用户选择开启
- **THEN** 这些 Skill 写 `collectConsent=true`

#### Scenario: 团队拒绝

- **WHEN** 团队含首次未定夺的可观测 Skill 且用户选择关闭
- **THEN** 这些 Skill 写 `collectConsent=false`

#### Scenario: 团队已拒绝项保持拒绝

- **WHEN** 团队批量安装中某可观测 Skill 的 lock 为 `collectConsent=false`
- **THEN** CLI 不重新询问并保持 `collectConsent=false`

#### Scenario: 团队静默默认关闭

- **WHEN** 团队批量安装使用 `-y` 且未传观测参数，存在首次未定夺的可观测 Skill
- **THEN** 这些 Skill 写 `collectConsent=false`
- **AND** 安装继续

#### Scenario: 团队显式开启采集

- **WHEN** 团队批量安装传入 `--observability`
- **THEN** 参与本次安装的可观测 Skill 写 `collectConsent=true`

#### Scenario: 团队无可观测 Skill

- **WHEN** 团队批次没有任何可观测 Skill
- **THEN** CLI 不发起团队级观测选择
- **AND** 不写 `collectConsent`

#### Scenario: 团队单项安装失败

- **WHEN** 团队批量安装中某可观测 Skill 安装失败
- **THEN** CLI 不为该 Skill 写入或修改 `collectConsent`
- **AND** 其他成功 Skill 继续按团队选择或 lock 复用规则处理

## MODIFIED Requirements

### Requirement: 安装时确定并复用 consent

`add` 安装可观测 Skill 时 SHALL 只请求一次目标版本安装产物。当前 scope lock 缺少 `collectConsent` 时，交互安装 SHALL 在展示“开发者改进计划”声明后要求用户明确选择开启或关闭，选择项 SHALL NOT 预选；非交互安装 SHALL 默认写入 `false` 且不中断。lock 已有 `true` 或 `false` 时 CLI SHALL 直接复用，不得重复询问。显式 `--observability` SHALL 优先写入 `true`。无论选择为何，落盘文件均为同一份服务端响应。

#### Scenario: 首次同意

- **WHEN** 可观测 Skill 首次交互安装且 lock 缺少 `collectConsent`，用户选择开启
- **THEN** CLI 写 `collectConsent=true`

#### Scenario: 首次拒绝

- **WHEN** 可观测 Skill 首次交互安装且 lock 缺少 `collectConsent`，用户选择关闭
- **THEN** CLI 写 `collectConsent=false`

#### Scenario: 选择无预选

- **WHEN** CLI 展示首次安装采集选择
- **THEN** 开启和关闭均不处于默认选中状态

#### Scenario: 已同意后重装

- **WHEN** lock 的 `collectConsent=true`
- **THEN** CLI 不重复询问并继续写 `true`

#### Scenario: 已拒绝后交互重装或更新

- **WHEN** lock 的 `collectConsent=false`
- **THEN** CLI 不重复询问并继续写 `false`

#### Scenario: 非交互安装

- **WHEN** `-y`、非 TTY 或 CI 首次遇到 lock 缺少选择的可观测 Skill
- **THEN** CLI 不询问、写 `collectConsent=false` 并继续安装

#### Scenario: 显式开启覆盖旧拒绝

- **WHEN** 用户执行 `add <skill> --observability` 且 lock 原为 `false`
- **THEN** CLI 写 `collectConsent=true`

### Requirement: add --observability 只强制 consent

`add --observability` SHALL 在安装响应可观测时写 `collectConsent=true` 并跳过询问。该开关 SHALL NOT 触发额外安装请求，也 SHALL NOT 在可观测产物不可用时回退原版。响应不可观测时，该参数 SHALL 被忽略：正常安装，SHALL NOT 写入或修改 `collectConsent`，SHALL NOT 报错。

#### Scenario: 显式打开 consent

- **WHEN** 用户执行 `add <skill> --observability` 且响应为可观测 Skill
- **THEN** CLI 安装该响应文件一次并写 `collectConsent=true`

#### Scenario: 显式开启不可观测 Skill

- **WHEN** 用户执行 `add <skill> --observability` 且响应不可观测
- **THEN** CLI 正常安装并忽略该参数
- **AND** 不写 `collectConsent=true`
- **AND** 不修改已有 `collectConsent`

#### Scenario: 可观测版本不可用

- **WHEN** Market 返回 `OBS_VERSION_UNAVAILABLE`
- **THEN** CLI 报错且不写 consent、不安装原版替代
