## 1. Provider 层：透传 visibility

- [x] 1.1 `src/providers/market.ts` 的 `push()` 新增可选参数 `visibility?: 'PRIVATE' | 'PUBLIC'`，有值时写入请求体 `visibility` 字段，不传时不带该字段
- [x] 1.2 补单测：`visibility` 未传时请求体不含该字段；传 `'PUBLIC'` 时请求体含 `visibility: "PUBLIC"`

## 2. CLI 参数解析

- [x] 2.1 `src/publish.ts` 的 `PublishOptions` 新增 `public?: boolean`
- [x] 2.2 `parsePublishOptions` 识别 `--public` flag（无值参数），与 `--version`/`--team` 解析逻辑并列
- [x] 2.3 补单测：不带 `--public`、带 `--public`、`--public` 与 `--team` 同时出现三种解析结果

## 3. runPublish 调用与输出

- [x] 3.1 `runPublish` 调用 `marketProvider.push` 时按 `options.public` 传入 `visibility` 参数
- [x] 3.2 成功输出按 `options.public && pushResult.data.status === 'PENDING'` 分支：两者同时满足才输出"已提交审核"及等待审核提示，其余（含不带 `--public` 但服务端意外返回 PENDING 的场景）保持现有"推送成功"输出
- [x] 3.3 补单测：`--public` 且返回 PENDING 时输出"已提交审核"；不带 `--public` 时输出不变；不带 `--public` 但响应恰好为 PENDING 时仍输出"推送成功"（回归契约）

## 4. 错误提示分支

- [x] 4.1 在 `pushResult.ok === false` 分支，`options.public` 为真时按 `pushResult.status` 追加对应提示：403 → 角色无权限；409 → 一条同时覆盖"命中同名 PRIVATE"与"全局同名冲突"两种原因的通用提示（服务端未提供可区分 code，不拆分）；400 → 审核中提示 `skills withdraw`
- [x] 4.2 确认非 `--public` 场景的错误输出（含既有 401 提示）不受影响
- [x] 4.3 补单测：403/409（一个测试覆盖通用提示，不区分两种原因）/400 三种状态码在 `--public` 下的追加提示；非 `--public` 时不追加

## 5. 团队分发兼容性验证

- [x] 5.1 确认 `--public --team` 同时提供时，push 成功后仍正常调用 `publishToTeam`，两者互不依赖对方结果
- [x] 5.2 补单测：`--public --team team-a` 场景下两次调用均发生，且参数正确

## 6. 收尾

- [x] 6.1 `pnpm format` && `pnpm type-check` && `pnpm test`（`pnpm type-check` 存在与本次变更无关的既有报错，见下方说明）
- [x] 6.2 `src/cli.ts` 帮助文本（`publish [path]` 条目附近，约第 146 行）补一行 `--public` 说明，与 `--version`/`--team` 并列
- [x] 6.3 README/CLAUDE.md 补充 `skills publish --public` 用法说明
- [ ] 6.4 待 skills-market 的 `skill-push-public` 部署后，手动跑一遍真实新建/更新/403/409/400 场景验证

### 备注：6.1 的 type-check 既有报错

`pnpm type-check` 在 `src/git.ts:24` 报错（`simple-git` 的 `SimpleGitOptions` 类型不接受 `env` 字段），与本次改动的 4 个文件（`src/providers/market.ts`/`src/publish.ts`/`src/cli.ts`/`README.md`）及新增测试无关；`git log -1 -- src/git.ts` 显示引入自更早的 commit `305ff8b`。`pnpm format`/`pnpm test`（全量 31 个文件、462 个测试，含 `dist.test.ts` 走真实 `pnpm build`）均通过。

