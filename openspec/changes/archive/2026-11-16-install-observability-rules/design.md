# Design

## Context

见 `proposal.md`。当前单 Skill 与团队安装分别使用普通确认；lock 为 false 时仍会重新询问；非可观测 Skill 的 `--observability` 会写入 true。publish 当前允许发出公开关闭请求。

## Goals / Non-Goals

**Goals:**
- 首次交互安装使用无预选明确选择，并展示固定声明。
- lock 的 true/false 直接复用。
- 静默无参数默认关闭，显式 `--observability` 才开启。
- publish 在本地拒绝公开关闭。

**Non-Goals:**
- 不新增 `--no-observability`。
- 不修改安装包类型选择。
- 不修改团队发布和 trace 采集实现。

## Decisions

- 提取统一 consent 选择 helper，供单 Skill 和团队批量使用；使用 `p.select`，不传初始值。
- 将不可观测 Skill 的 `--observability` 处理为 no-op，并沿用已有 lock。
- `parsePublishOptions` 在参数解析完成后检查 `public && collectEnabled === false`，保证文件读取前退出。

## Risks / Trade-offs

- 裸 `-y` 默认关闭与交互必选不同，但由是否 TTY/显式参数决定，行为可预测。
- 团队批量一次选择覆盖多个 Skill，lock 仍按 Skill 独立写入。
- 关闭已有 true 需要 `track off`，不是安装参数。

## Migration Plan

- 无需数据迁移；已有 lock 值直接复用。
- 发布 CLI 与市场安装命令时保持服务端 active artifact 契约不变。
