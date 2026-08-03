# 手动测试文档：`login` / `publish` / `withdraw`

用于验证 `add-publish-command` 变更（已归档：`openspec/changes/archive/2026-07-31-add-publish-command/`）及
`cli-push-public` 变更（`--public` flag，`openspec/changes/cli-push-public/`）。

## 0. 准备

```bash
cd /Users/ly/codes/work/skills-cli

# 用 dev 模式跑 CLI，不需要先 build（下文命令均可用 `pnpm dev <args>` 替代 `npx blueai-skills <args>`）
pnpm dev --version
```

- 默认打到 `SKILLS_SITE`（`src/branding.ts` 里的常量，指向线上 `https://blueai-skills-market.bluemediagroup.cn`）。
- 如果想测线下环境，先起一个本地 `skills-market`（`pnpm dev`，默认 `http://localhost:3000`），再用环境变量覆盖：
  ```bash
  export SKILLS_SITE=http://localhost:3000
  ```
- 需要一个真实的 Skills Market API Key（在网页 Dashboard → API Key 里生成，或用已有的 `sk-xxxx`）。

准备一个测试用的 Skill 目录，例如：

```bash
mkdir -p /tmp/my-test-skill
cat > /tmp/my-test-skill/SKILL.md <<'EOF'
---
name: my-test-skill
description: 手动测试 skills publish 用的临时技能
---

# my-test-skill

测试内容。
EOF
echo "一些附属说明" > /tmp/my-test-skill/notes.md
```

---

## 1. `login`

| 步骤 | 命令 | 期望结果 |
| --- | --- | --- |
| 1.1 未传参数 | `pnpm dev login` | 打印用法提示，`echo $?` 为 `1`，不产生/修改任何文件 |
| 1.2 首次登录（文件不存在） | 先 `mv ~/.blueai ~/.blueai.bak`（备份），再 `pnpm dev login sk-real-xxxx` | 创建 `~/.blueai/`（权限 `700`，`stat -f%Lp ~/.blueai` 或 `ls -ld`）和 `secrets.json`（权限 `600`） |
| 1.3 校验内容 | `cat ~/.blueai/secrets.json` | 含 `"blueai-skills-market-push.apiKey": "sk-real-xxxx"` |
| 1.4 已有其他键时不覆盖 | 手动往 `secrets.json` 加一行 `"other.key": "keep-me"`，再 `pnpm dev login sk-another` | 重新 `cat` 确认 `other.key` 还在，且 `apiKey` 已更新为 `sk-another` |
| 1.5 恢复真实 Key | `pnpm dev login <你的真实sk-xxxx>` | 后续步骤才能真正打通网络 |
| 1.6 权限过宽警告（可选） | `chmod 644 ~/.blueai/secrets.json && pnpm dev login sk-xxxx` | stderr 打印"权限过宽"警告，`stat` 显示权限仍是 `644`（不强制改） |

收尾：`chmod 600 ~/.blueai/secrets.json`。

---

## 2. `whoami`

验证 `add-whoami-command` 变更（已归档：`openspec/changes/archive/2026-07-31-add-whoami-command/`）。`whoami` 只读查询，不修改任何本地/远端状态。

| 步骤 | 命令 | 期望结果 |
| --- | --- | --- |
| 2.1 未登录 | `mv ~/.blueai ~/.blueai.bak3 && pnpm dev whoami` | 提示"请先运行 `skills login`..."，`$?` 为 `1`。跑完 `mv ~/.blueai.bak3 ~/.blueai` 还原 |
| 2.2 正常查询 | `pnpm dev whoami` | 打印`名称`/`邮箱`/`角色`；邮箱未设置时显示"（未设置）" |
| 2.3 超级管理员账号（可选，若你有） | 用超级管理员账号 `login` 后 `pnpm dev whoami` | 额外打印一行"超级管理员" |
| 2.4 401（Key 失效） | `pnpm dev login sk-invalid-xxx && pnpm dev whoami` | 输出 `HTTP 401: ...`，并追加登录提示；跑完 `pnpm dev login <真实key>` 换回来 |

---

## 3. `publish`

### 3.1 正常首次发布

> 注意：`pnpm --dir <path>` 会把 pnpm 的工作目录切到 `<path>`（即 skills-cli 仓库根目录）再执行脚本，所以 `.` 会被解析成 skills-cli 目录本身，而不是当前 `cd` 进入的目录。要测试"传相对路径 `.`"的场景，必须直接用 `node` 调用 CLI 入口，让 shell 的 `cd` 生效：

```bash
cd /tmp/my-test-skill
node /Users/ly/codes/work/skills-cli/src/cli.ts publish .
```

期望：
- 打印"推送 Skill: ..."、附属文件列表（`notes.md`）
- `✓ 推送成功`，打印名称/版本/状态（`PRIVATE / APPROVED`）
- 去网页 Dashboard → 我的技能，能看到 `my-test-skill`

### 3.2 缺省路径 = 当前目录

```bash
cd /tmp/my-test-skill
node /Users/ly/codes/work/skills-cli/src/cli.ts publish
```
期望：等价于 `publish .`。

### 3.3 二次发布 = 更新（版本自动 +1）

不改内容再跑一次 3.1 的命令，期望版本号从 `0.0.1` 变成 `0.0.2`（服务端 patch bump）。

### 3.4 `--version` 覆盖

```bash
pnpm --dir /Users/ly/codes/work/skills-cli dev publish /tmp/my-test-skill --version 9.9.9
```
期望：状态里版本号是 `9.9.9`，不是自动递增值。

### 3.5 `--team` 分发

先拿一个你有权限的 teamId（网页团队详情页 URL 里的 id，或 `Dashboard → 团队`）：

```bash
pnpm --dir /Users/ly/codes/work/skills-cli dev publish /tmp/my-test-skill --team <teamId>
# 多个团队：
pnpm --dir /Users/ly/codes/work/skills-cli dev publish /tmp/my-test-skill --team <teamId1>,<teamId2>
```
期望：推送成功后额外打印"已提交团队审核: ..."；去团队页能看到该 Skill 处于待审核。

### 3.6 目录遍历安全边界

```bash
cd /tmp/my-test-skill
mkdir -p .git && echo x > .git/config          # VCS 目录，应跳过
mkdir -p .idea && echo x > .idea/workspace.xml # 编辑器目录，应跳过
echo x > .DS_Store                             # 系统噪音文件，应跳过
echo 'SECRET=xxx' > .env                       # 环境变量文件，应跳过（防止误传密钥）
echo 'SECRET=' > .env.example                  # .env.example 例外，应上传
mkdir -p .github && echo x > .github/note.txt  # 其他隐藏目录，不再特殊跳过，应上传
printf '\x00\x01binary' > blob.bin             # 二进制文件，应跳过
ln -s /etc/hosts linked.txt                    # 符号链接，应跳过

node /Users/ly/codes/work/skills-cli/src/cli.ts publish .
```
期望 stderr 打印：
- `警告: 跳过符号链接 linked.txt`
- `警告: 跳过二进制文件 blob.bin`
- `警告: 跳过环境变量文件 .env（可能含密钥）`
（`.git/config`、`.idea/*`、`.DS_Store` 无警告静默跳过）

`files` 列表（可从 dashboard 详情页文件树核对）不应包含 `blob.bin`/`linked.txt`/`.git/*`/`.idea/*`/`.DS_Store`/`.env`，应包含 `notes.md`、`.env.example`、`.github/note.txt`。

清理：`rm -rf .git .idea .github .DS_Store .env .env.example blob.bin linked.txt`。

### 3.7 错误路径

| 场景 | 命令 | 期望 |
| --- | --- | --- |
| SKILL.md 不存在 | `pnpm dev publish /tmp/empty-dir`（先 `mkdir -p /tmp/empty-dir`） | 报错提示路径 + `SKILL.md` 缺失，`echo $?` 为 `1`，不发请求 |
| 未登录 | `mv ~/.blueai ~/.blueai.bak2 && pnpm dev publish /tmp/my-test-skill` | 提示"请先运行 `skills login`..."，`$?` 为 `1`。跑完 `mv ~/.blueai.bak2 ~/.blueai` 还原 |
| 401（Key 失效） | `pnpm dev login sk-invalid-xxx && pnpm dev publish /tmp/my-test-skill` | 输出 `HTTP 401: ...`，并追加"请运行 \`skills login\`"提示；跑完记得 `pnpm dev login <真实key>` 换回来 |
| 同名冲突（409，若你账号下已有同名**公开** Skill） | 用一个已知冲突的名字发布 | 输出 `HTTP 409: 同名的公开 Skill 已存在，请通过 Web 界面管理公开 Skill` |
| 网络异常 | `SKILLS_SITE=http://127.0.0.1:9 pnpm dev publish /tmp/my-test-skill` | 输出网络错误信息，`$?` 为 `1` |

### 3.8 `--public` 首次发布（对齐 skills-market 的 `skill-push-public`）

> 需要 ADMIN/REVIEWER/DEVELOPER 角色账号（USER 角色见 3.10）。

```bash
cd /tmp/my-test-skill
node /Users/ly/codes/work/skills-cli/src/cli.ts publish . --public
```

期望：
- `pushResult.data.status === 'PENDING'` 时打印"✓ 已提交审核"（不是"✓ 推送成功"），打印名称 + `PUBLIC / PENDING`，提示等待管理员/审核员审核
- 去网页 Dashboard → 管理后台 → 待审核列表，能看到该 Skill

### 3.9 `--public` 二次推送 = 更新

不改内容对 3.8 的同一个 Skill 再跑一次：

```bash
cd /tmp/my-test-skill
node /Users/ly/codes/work/skills-cli/src/cli.ts publish . --public
```

期望：
- 若 3.8 那次尚未被审核通过（仍 PENDING）→ 命中"审核中"分支，见 3.10 的 400 场景，不会是这里的成功路径
- 需要先在网页 Dashboard 用 ADMIN/REVIEWER 账号审核通过 3.8 的提交，使其变为 `PUBLIC / APPROVED`（此时才有 `currentVersion`，即"已发布"状态），再跑本条：
  - 期望打印"✓ 已提交审核"，本次内容写入草稿（draft），已发布版本和市场展示不受影响
  - 去 Dashboard 详情页能看到"审核中的更新"与"当前已发布版本"分别展示

### 3.10 `--public` 已知错误分支（403/409/400）

| 场景 | 命令 | 期望 |
| --- | --- | --- |
| USER 角色无权限（403） | 用 USER 角色账号 `login` 后 `publish . --public` | 输出 `HTTP 403: ...`，并追加"提示: 当前账号角色无权发布公开 Skill" |
| 同名冲突（409） | 用一个已被占用的名字（自己名下已有同名 PRIVATE，或别人已有同名 PUBLIC）`publish . --public` | 输出 `HTTP 409: ...`，并追加"提示: 名称冲突——可能是你名下已有同名私有 Skill（需改走 Web 发布流程转公开），也可能是名称已被其他作者占用（需更换名称）" |
| 审核中（400） | 对一个当前 `status=PENDING` 的公开 Skill 再次 `publish . --public` | 输出 `HTTP 400: ...`，并追加"提示: 该 Skill 可能正在审核中，可执行 \`skills withdraw <name>\` 撤回后重试" |

`--public --team <id>` 可叠加：push 成功（含 PENDING）后仍会链式调用 `publishToTeam`，两者互不依赖，若 team 分发失败不影响已成功的 push 结果本身。

---

## 4. `withdraw`

`withdraw` 只对**处于 PENDING 审核状态的公开 Skill** 生效（私有 Skill 不需要撤回）。构造一个 PENDING 场景最简单的方式：

1. 用网页 Dashboard 把一个私有 Skill "发布到市场"（进入 PENDING+PUBLIC），或
2. 用 ADMIN/REVIEWER 账号直接创建一个公开 Skill（首次创建即 PENDING）

### 4.1 成功撤回

```bash
pnpm --dir /Users/ly/codes/work/skills-cli dev withdraw <该Skill的name>
```
期望：`✓ 已撤回`，打印当前状态（应回到 `PRIVATE / APPROVED`）。去网页确认该 Skill 已变回私有。

### 4.2 未提供参数

```bash
pnpm --dir /Users/ly/codes/work/skills-cli dev withdraw
```
期望：打印用法提示，`$?` 为 `1`，不发请求。

### 4.3 不支持的选项被拒绝

```bash
pnpm --dir /Users/ly/codes/work/skills-cli dev withdraw my-test-skill --team abc
```
期望：报错"withdraw 命令不支持选项 --team"，`$?` 为 `1`，**不发起任何网络请求**（可用 `--team` 传一个明显无效的 teamId，确认它压根没被使用/没有副作用）。

### 4.4 名称不存在

```bash
pnpm --dir /Users/ly/codes/work/skills-cli dev withdraw this-name-should-not-exist-xyz
```
期望：提示"未找到...技能"，`$?` 为 `1`。

### 4.5 状态不是 PENDING（例如已是 PRIVATE/APPROVED 或已经撤回过）

对上面 4.1 的同一个 Skill 再跑一次：
```bash
pnpm --dir /Users/ly/codes/work/skills-cli dev withdraw <同一个name>
```
期望：服务端返回非 PENDING 相关的错误消息，被原样转述，`$?` 为 `1`。

### 4.6 401

同 3.7 的方式（换成失效 Key）跑一次 `withdraw`，期望同样追加登录提示。

---

## 5. 收尾清理

```bash
rm -rf /tmp/my-test-skill /tmp/empty-dir
# 若中途改过 ~/.blueai/secrets.json 权限或备份文件，记得恢复
```

去网页 Dashboard 删除测试用的 `my-test-skill`（软删除即可），避免污染正式列表。
