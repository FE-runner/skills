## ADDED Requirements

### Requirement: `skills login <api-key>` 保存市场 API Key

系统 SHALL 提供 `skills login <api-key>` 命令，将传入的 API Key 写入 `~/.blueai/secrets.json`，键名为 `blueai-skills-market-push.apiKey`（复用既有惯例键名，不新增独立键名）。若该文件或其所在目录不存在，SHALL 自动创建。

#### Scenario: 首次登录，文件不存在

- **WHEN** 用户执行 `skills login sk-xxxx`，且 `~/.blueai/secrets.json` 不存在
- **THEN** 系统创建 `~/.blueai/` 目录（若不存在）和 `secrets.json` 文件，写入 `{ "blueai-skills-market-push.apiKey": "sk-xxxx" }`

#### Scenario: 文件已存在，仅更新该键

- **WHEN** 用户执行 `skills login sk-yyyy`，且 `~/.blueai/secrets.json` 已存在且包含其他键
- **THEN** 系统仅更新 `blueai-skills-market-push.apiKey` 的值为 `sk-yyyy`，保留文件中其他键不变

#### Scenario: 未提供 API Key 参数

- **WHEN** 用户执行 `skills login` 不带参数
- **THEN** 系统输出用法提示并以非零状态码退出，不修改任何文件

### Requirement: API Key 读取优先级

系统 SHALL 在需要鉴权的命令（`publish`、`withdraw`）中，按以下优先级读取 API Key：环境变量 `SKILLS_API_KEY` 优先于 `~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]`。

#### Scenario: 环境变量存在时优先使用

- **WHEN** `process.env.SKILLS_API_KEY` 已设置，且 `~/.blueai/secrets.json` 中也存在该键
- **THEN** 系统使用环境变量的值发起请求，忽略文件中的值

#### Scenario: 仅文件中存在

- **WHEN** `process.env.SKILLS_API_KEY` 未设置，`~/.blueai/secrets.json["blueai-skills-market-push.apiKey"]` 存在
- **THEN** 系统使用文件中的值发起请求

#### Scenario: 两者均不存在

- **WHEN** 环境变量未设置且文件不存在或文件中无该键
- **THEN** 系统在实际发起需要鉴权的请求前输出错误提示"请先运行 `skills login <api-key>` 或设置 `SKILLS_API_KEY` 环境变量"，并以非零状态码退出，不发起网络请求

### Requirement: 凭证文件权限限制

系统 SHALL 在创建 `~/.blueai/` 目录时设置权限为 `0700`，在创建或写入 `~/.blueai/secrets.json` 文件时设置权限为 `0600`，避免同机其他用户读取。

#### Scenario: 首次创建目录

- **WHEN** `skills login` 执行时 `~/.blueai/` 目录不存在
- **THEN** 系统创建该目录并设置权限为 `0700`

#### Scenario: 首次创建文件

- **WHEN** `skills login` 执行时 `~/.blueai/secrets.json` 文件不存在
- **THEN** 系统创建该文件并设置权限为 `0600`

#### Scenario: 已存在文件权限过宽

- **WHEN** `~/.blueai/secrets.json` 已存在，且当前权限比 `0600` 更宽（如其他用户可读）
- **THEN** 系统正常完成写入，同时输出一次性警告提示当前文件权限过宽，不强制修改已有文件权限

