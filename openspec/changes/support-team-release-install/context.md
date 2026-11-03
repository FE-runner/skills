# Context

## 关键决策

- 团队批量 Skill 必须使用 `id + teamId + installVersion` 直接安装，不再走名称 resolve；参见 `design.md` 决策 2/3。
- Market 新字段 `installVersion` 优先，旧 Market 回退 `currentVersion`；两者都缺失时跳过并告警。
- 团队采集预检和正式安装共享同一 release 上下文，探测结果不得复用给不同版本。
- 团队安装失败直接报错，不回退 GitHub、公开裸名或私有 author 解析。

## 否决方案

- 否决把团队 Skill 当 PUBLIC 裸名安装：公开审核未通过时无法解析，也可能装到错误版本。
- 否决把团队 Skill 当 PRIVATE author/name 安装：团队 release 可能不是公开 currentVersion，author 路径无法表达团队版本。
- 否决为团队安装另写一套 agent/scope/采集/lock 流程：会重复 `handleMarketSkill` 的大量行为并增加分叉。

## 范围边界

- 做：团队列表契约、teamId/version 透传、采集预检、失败策略和测试。
- 不做：Market 服务端、团队鉴权、本地目录冲突策略、`skills-lock` 格式变更。

## 已知坑

- `MarketProvider.fetchById` 的 team 参数已经存在，但当前 team 循环没有传入；实现时要验证最终请求体而非仅验证函数签名。
- `handleMarketSkill` 依赖 resolve 结果；团队上下文必须绕过 resolve 且保留普通 market fallback 不受影响。
- 采集团队 consent 的 key 不能只依赖裸名，否则同名团队/公开 Skill 会串用状态。
