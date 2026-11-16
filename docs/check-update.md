# `check` / `update` 使用文档

## 用途

`check` 和 `update` 用于让已安装 Skill 跟到 Market 当前可安装的最新版本。

- `check`：只检查，不修改本地 Skill 文件。
- `update`：先检查，再重新安装检测到变化的 Skill。
- Market 可观测 Skill 以当前 active build 的 `version + releaseSeq` 为准：版本变化或同版本产生新的 `releaseSeq`，都会触发更新。
- `update` 不需要选择更新原因。检查成功后，CLI 直接通过 `add` 获取当前最新的 `version + releaseSeq`。

## 鉴权

`check` 和 `update` 不需要登录 Market，也不需要 Market API Key：

- 构建检测通过 `/api/skill/build/checkBatch` 读取。
- Market 安装通过 `/api/skill/install` 获取文件。
- 私有 Skill 使用 lock 中保存的 `authorId` 定位。
- 团队 Skill 使用 lock 中保存的 `teamId`、`skillTeamId` 和 `releaseId` 定位。

GitHub 来源可以可选使用 `GITHUB_TOKEN`、`GH_TOKEN` 或 `gh auth token` 提升 API 速率限制；没有 token 时仍可执行公开仓库检查。

## 快速使用

```bash
# 检查当前项目的已装 Skill
npx blueai-skills check

# 更新当前项目的已装 Skill
npx blueai-skills update

# 检查全局已装 Skill
npx blueai-skills check -g

# 更新全局已装 Skill
npx blueai-skills update -g
```

`update` 也可以使用别名 `upgrade`：

```bash
npx blueai-skills upgrade
```

## 检查范围

`check` 和 `update` 默认只处理项目级 Skill，加 `-g` 或 `--global` 后才处理全局 Skill。

| 范围           | 安装记录                            | 命令                     |
| -------------- | ----------------------------------- | ------------------------ |
| 项目级（默认） | 当前项目根目录的 `skills-lock.json` | `check` / `update`       |
| 全局           | 全局 Skill lock                     | `check -g` / `update -g` |

项目级和全局范围互相独立。一个 Skill 装在全局时，执行不带 `-g` 的 `check` 不会检查到它。

## 更新判断

### Market Skill

Market 返回目标版本当前的 `version`、`observabilityEnabled` 和 `releaseSeq`。CLI 与本地 lock 比较：

- `version` 不一致：需要更新。
- `version` 相同，`releaseSeq` 不一致：需要更新。
- `version` 和 `releaseSeq` 都一致：不需要更新。

CLI 不区分“版本更新”和“同版本新构建更新”，两种情况都执行相同的 `add` 流程。

### 团队单 Skill

`ts_<skillTeamId>/<skillName>` 使用 lock 中保存的团队 release 上下文执行构建检测。需要更新时，CLI 重新执行锁文件中的 `ts_` source，由团队 Skill resolver 重新确定安装目标。

### GitHub Skill

全局检查还支持 GitHub 来源的 Skill：CLI 比较本地 `skillFolderHash` 和远端仓库中对应目录的 hash。

GitHub API 请求会依次尝试 `GITHUB_TOKEN`、`GH_TOKEN` 和 `gh auth token`。没有 token 时仍可检查，但更容易受到 GitHub API 速率限制。

### 不支持自动检查的来源

本地路径、COS 直链等来源不在 `check` / `update` 的自动更新范围内。需要更新时，手动重新执行对应的 `add` 命令。

## 输出示例

没有更新：

```text
Checking for skill updates...

Checking 2 skill(s) for updates...

✓ All skills are up to date
```

发现更新：

```text
Checking 2 skill(s) for updates...

1 update(s) available:

  ↑ my-skill
    source: market/my-skill

Run npx blueai-skills update to update all skills
```

检查失败不会显示为“全部最新”。CLI 会单独列出无法检查的 Skill 和错误原因。

## 更新过程

`update` 对每个检测到变化的 Skill 重新执行当前 CLI 的 `add` 命令：

1. 保持原安装范围。项目级更新不加 `-g`，全局更新带 `-g`。
2. 从 Market 获取当前 active build。
3. 校验安装响应中的 `buildHash`。
4. 校验通过后写入 Skill 文件。
5. 全部安装目标成功后，更新对应 lock 中的 `version` 和 `releaseSeq`。

Market 已开启可观测构建但当前没有可安装产物时，安装会失败，不会回退到原版包或其他来源。

## 旧 lock 与强制重装

- 旧 lock 缺少 `releaseSeq` 时，如果 Market 返回 `observabilityEnabled=true`，CLI 会触发一次更新；安装成功后补齐本地 `releaseSeq`。
- `update` 只处理检测到差异的 Skill，不会每次都强制重装全部 Skill。
- 如果需要在不等待 `check` 检测差异的情况下强制重装某个 Skill，直接执行对应的 `add` 命令。

## 自动巡检

CLI 不启动 daemon，也不会在后台定时执行更新。需要自动巡检时，由外部系统调用：

```bash
npx blueai-skills check
npx blueai-skills update
```

## 常见问题

### 为什么没有检测到已安装的 Skill

确认安装范围。默认只检查项目级，全局 Skill 需要加 `-g`。

### 为什么某个 Skill 无法自动检查

确认它不是本地路径或 COS 直链来源。GitHub 来源还需要 lock 中存在 `skillFolderHash` 和 `skillPath`。

### 为什么同版本仍然出现更新

Market 可观测 Skill 的内容变更可能不改 `version`，只递增 `releaseSeq`。CLI 会将这种情况识别为新的可观测构建。

### 版本更新后为什么没有继续单独提示 `releaseSeq`

`update` 安装的是 Market 当前 active build。新的 `version` 对应什么 `releaseSeq`，由安装响应决定；CLI 不会把同一个 Skill 拆成两次更新。
