## 1. 移除隔离机制

- [ ] 1.1 收缩 `src/paths.ts`：删除 `IS_DEV_ISOLATION` / `getStateRoot()` / `getGlobalBaseDir()` / `DEV_BUILD` / `parseDevFlag` 及相关注释，`getCredentialDir()` 固定返回 `~/.blueai`，`getGlobalSkillLockPath()` 固定走 XDG / `~/.agents` 规则；验证 `rg -n "IS_DEV_ISOLATION|getStateRoot|getGlobalBaseDir|DEV_BUILD|parseDevFlag|BLUEAI_SKILLS" src` 无残留
- [ ] 1.2 `src/auth.ts` 凭证路径固定为 `~/.blueai/secrets.json`；验证 `pnpm test src/auth.test.ts` 通过，且 dev 构建下 `login` 写入该路径
- [ ] 1.3 `src/installer.ts` 删除隔离分支，恢复"universal agent 才走 canonical-only"的原始判断，canonical 与 agent 目录回到真实 homedir；验证 `pnpm test tests/list-installed.test.ts` 通过
- [ ] 1.4 `src/remove.ts` 删除隔离守卫，全局卸载恢复真实 agent 目录清理与占用判断；验证 `pnpm test src/remove.test.ts` 通过
- [ ] 1.5 `src/skill-lock.ts` 与 `src/cli.ts` 继续经 `paths.ts` 取全局锁路径，行为与正式版一致；验证 `rg -n "getGlobalSkillLockPath" src` 命中且无本地重复实现
- [ ] 1.6 `build.config.mjs` 删除 `BLUEAI_SKILLS_DEV_BUILD` 注入，保留市场地址与 npx tag 注入；验证 dev 构建产物含 `domob-inc.cn` 与 `@dev`、正式构建产物含 `bluemediagroup.cn` 与 `@latest`

## 2. 测试调整

- [ ] 2.1 删除 `tests/dev-isolation.test.ts`；验证该文件不存在且 `pnpm test` 不引用它
- [ ] 2.2 收缩 `src/paths.test.ts`：分别断言凭证目录、全局锁路径（默认 / `XDG_STATE_HOME`）在两种构建目标下取值相同，并断言设置 `BLUEAI_SKILLS_HOME` 或 `BLUEAI_SKILLS_DEV` 不改变上述任一路径；验证 `pnpm test src/paths.test.ts` 通过
- [ ] 2.3 回归既有隔离相关断言：验证 `pnpm test src/remove.test.ts tests/list-installed.test.ts src/auth.test.ts src/obs.test.ts` 全部通过

## 3. 文档同步

- [ ] 3.1 更新 `README.md` 的"开发版（内测）"章节：删除状态隔离段落，改为"开发版只改市场端点与提示 tag，本地状态与正式版一致"，并补充共用状态的三条已知影响
- [ ] 3.2 更新 `CLAUDE.md` 开发版章节：删除状态根路径说明，改为开发版仅覆盖市场端点与 npx tag
- [ ] 3.3 更新 `DEV_VERSION_USAGE.md`：清理全部隔离 / 状态根表述——开头正式版对照表的状态行、"状态隔离说明"小节、环境变量表（移除 `BLUEAI_SKILLS_HOME` / `BLUEAI_SKILLS_DEV`）、常见问题两条、维护者登录说明、相关实现表；验证 `rg -n "状态隔离|状态根|BLUEAI_SKILLS" DEV_VERSION_USAGE.md` 无残留
- [ ] 3.4 更新 `CHANGELOG.md`：记录开发版隔离范围收窄为市场端点，并标注两个环境变量移除
- [ ] 3.5 直接更新 `openspec/specs/cli-dev-distribution/spec.md` 的 Purpose：删除"以独立状态根隔离本地凭证与安装状态"表述，改为"开发版仅覆盖市场端点与命令提示 tag，其余本地状态与正式版一致"；验证该主 spec 中不再出现"状态根"字样
- [ ] 3.6 直接更新 `openspec/specs/cli-skill-collection-consent/spec.md` 的 Purpose：把"开发隔离模式下为状态根下的同名文件"改为"开发版与正式版复用同一份全局锁文件"；验证该主 spec 中不再出现"状态根"字样
- [ ] 3.7 同步飞书使用文档（`https://bluefocus.feishu.cn/docx/HnaPdt7Lzoha6ixr9e9c5aT1ngb`）：把状态隔离相关段落改为"与正式版共用本地状态，开发版只改市场端点与提示 tag"，并移除两个已删除环境变量的说明；验证回查文档大纲与正文不再出现"状态隔离 / 状态根"

## 4. 验证

- [ ] 4.1 dev 构建行为验证：`SKILLS_BUILD_TARGET=dev pnpm build` 后在临时 HOME 下跑 `login`、`add -g`、`list -g`、`remove -g`，断言凭证写入 `<HOME>/.blueai/secrets.json`、技能写入 `<HOME>/.agents/skills` 与真实 agent 目录，且不产生任何状态根目录
- [ ] 4.2 正式构建回归验证：`pnpm build` 后断言默认市场为 `bluemediagroup.cn`、npx 提示为 `@latest`，且路径行为与 dev 构建一致
- [ ] 4.3 运行 `pnpm test`、`pnpm type-check`、`pnpm format` + `pnpm format:check`
- [ ] 4.4 运行 `openspec validate --changes cli-dev-market-only`，验证 delta 结构合法
