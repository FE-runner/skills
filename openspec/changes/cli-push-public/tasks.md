## 1. Provider 层：透传 visibility

- [ ] 1.1 `src/providers/market.ts` 的 `push()` 新增可选参数 `visibility?: 'PRIVATE' | 'PUBLIC'`，有值时写入请求体 `visibility` 字段，不传时不带该字段
- [ ] 1.2 补单测：`visibility` 未传时请求体不含该字段；传 `'PUBLIC'` 时请求体含 `visibility: "PUBLIC"`

## 2. CLI 参数解析

- [ ] 2.1 `src/publish.ts` 的 `PublishOptions` 新增 `public?: boolean`
- [ ] 2.2 `parsePublishOptions` 识别 `--public` flag（无值参数），与 `--version`/`--team` 解析逻辑并列
- [ ] 2.3 补单测：不带 `--public`、带 `--public`、`--public` 与 `--team` 同时出现三种解析结果

## 3. runPublish 调用与输出

- [ ] 3.1 `runPublish` 调用 `marketProvider.push` 时按 `options.public` 传入 `visibility` 参数
- [ ] 3.2 成功输出按 `options.public && pushResult.data.status === 'PENDING'` 分支：两者同时满足才输出"已提交审核"及等待审核提示，其余（含不带 `--public` 但服务端意外返回 PENDING 的场景）保持现有"推送成功"输出
- [ ] 3.3 补单测：`--public` 且返回 PENDING 时输出"已提交审核"；不带 `--public` 时输出不变；不带 `--public` 但响应恰好为 PENDING 时仍输出"推送成功"（回归契约）

## 4. 错误提示分支

- [ ] 4.1 在 `pushResult.ok === false` 分支，`options.public` 为真时按 `pushResult.status` 追加对应提示：403 → 角色无权限；409 → 一条同时覆盖"命中同名 PRIVATE"与"全局同名冲突"两种原因的通用提示（服务端未提供可区分 code，不拆分）；400 → 审核中提示 `skills withdraw`
- [ ] 4.2 确认非 `--public` 场景的错误输出（含既有 401 提示）不受影响
- [ ] 4.3 补单测：403/409（一个测试覆盖通用提示，不区分两种原因）/400 三种状态码在 `--public` 下的追加提示；非 `--public` 时不追加

## 5. 团队分发兼容性验证

- [ ] 5.1 确认 `--public --team` 同时提供时，push 成功后仍正常调用 `publishToTeam`，两者互不依赖对方结果
- [ ] 5.2 补单测：`--public --team team-a` 场景下两次调用均发生，且参数正确

## 6. 收尾

- [ ] 6.1 `pnpm format` && `pnpm type-check` && `pnpm test`
- [ ] 6.2 `src/cli.ts` 帮助文本（`publish [path]` 条目附近，约第 146 行）补一行 `--public` 说明，与 `--version`/`--team` 并列
- [ ] 6.3 README/CLAUDE.md 补充 `skills publish --public` 用法说明
- [ ] 6.4 待 skills-market 的 `skill-push-public` 部署后，手动跑一遍真实新建/更新/403/409/400 场景验证
