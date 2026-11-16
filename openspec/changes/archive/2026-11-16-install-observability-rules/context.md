# 实施上下文

- 不新增 `--no-observability`；显式开启只使用 `--observability`，关闭通过不带参数表达。
- 裸 `-y` / 非 TTY 默认关闭，不中断；交互无参数才要求无预选选择。
- lock 已有 true/false 直接复用；需要从 true 改为关闭时使用 `track off`。
- 不可观测 Skill 的 `--observability` 是 no-op，不写、不改 consent。
- 团队批量使用一次团队级选择，最终仍按 Skill 写入 lock。
