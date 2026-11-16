# 方案上下文

## 核心决策

- 新发布策略取代已归档的 `consume-observable-upload-contract`：CLI 不再解释 Market 强制来源。
- `collectEnabled` 默认取 `true`，公开、私有与团队发布使用同一默认语义。
- `--no-collect` 只表达“尚未开启的 Skill 保持关闭”，不能撤销服务端已开启的可观测。
- `--public --no-collect` 允许透传，不再在 CLI 本地判冲突。
- 详情与行为契约见 `proposal.md`、`design.md` 和 delta spec，本节只记录讨论结论。

## 已否决方案

- 保留三态并仅在 `runPublish` 按公开可见性归一化：会让不同发布范围拥有不同默认值，否决。
- 保留 Provider 强制来源字段但不输出：会留下未消费契约和旧测试噪音，否决。
- 恢复整个 stash：会覆盖刚归档的代码和主 spec，并带入临时探测文件，否决。
- 重新修改 `.agents/`、`.claude/` 忽略规则：当前 `.gitignore` 已覆盖，重复改动无收益，否决。

## 范围边界

- 修改 publish 参数、请求元数据、成功提示、Provider 响应映射及对应测试。
- 同步 CLI 帮助、README 和 `docs/check-update.md`。
- 不修改 Market API、鉴权、团队分发、错误分级、安装/更新运行时逻辑或 lock schema。
- `.tmp-npx-prod-probe/` 仅保留在 stash 中，不恢复到工作区。

## 已知坑与注意事项

- `--no-collect` 可能被 Market 忽略；提示只能说明不可逆语义，不能承诺已开启状态被关闭。
- 旧 Market 若继续返回强制来源字段，CLI 应自然忽略，不因额外字段报错。
- `tests/market-push.test.ts` 中已有强制来源断言，实施时需改为验证结果不包含这些字段。
- `docs/check-update.md` 描述现有行为，不应借本次 change 改写 check/update 逻辑。
