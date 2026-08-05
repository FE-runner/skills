## 1. providers/market.ts

- [x] 1.1 `push()` 新增可选参数 `teamIds?: string[]`；非空时写入请求体 `body.teamIds`。

## 2. publish.ts

- [x] 2.1 `runPublish` 中把解析出的 `teamIds` 作为第 6 个参数传给 `marketProvider.push(...)`。
- [x] 2.2 删除 push 成功后调用 `marketProvider.publishToTeam(...)` 的分支，保留"已提交团队审核: xxx"的成功提示文案（改为基于本地解析出的 `teamIds` 直接打印，不再依赖第二次请求的返回值）。
- [x] 2.3 更新函数头部注释，说明 `--team` 现在随 push 一起发出，不再是链式调用。

## 3. 测试

- [x] 3.1 更新 `src/publish.test.ts`：原"calls publishToTeam with parsed team ids after a successful push"用例改为断言 `push()` 的调用参数包含解析出的 `teamIds`。
- [x] 3.2 更新"does not call publishToTeam when push fails"用例：push 失败场景下 `process.exitCode` 仍为 1（不再有第二次请求需要断言未被调用）。
- [x] 3.3 更新"calls publishToTeam after a successful --public push"用例：断言 `push()` 调用参数同时包含 `visibility: 'PUBLIC'` 与预期 `teamIds`。
- [x] 3.4 回归：`npx vitest run src/publish.test.ts` 全量通过。

## 4. 文档同步

- [x] 4.1 归档后确认 `openspec/specs/cli-publish/spec.md` 中"团队分发（--team）"Requirement 正确替换为新语义。
