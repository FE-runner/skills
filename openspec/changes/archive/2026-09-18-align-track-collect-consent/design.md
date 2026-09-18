## Context

市场侧安装接口当前以 `collect = { config: { collectEnabled }, meta: { blueai_signature } }` 表示有效监测版产物，以 `collect = { reason }` 表示服务端改造失败降级；结构化改造产物（`.blueai-skills-market/obs-manifest.yaml`、`.blueai-skills-market/obs-run`）只作为 `files` 下发，CLI 不需要理解其内部结构。CLI 侧 `add` 已使用有效 collect 判定，但 `track on` 仍把任意 truthy `collect` 当成监测版；CLI 仓内两份采集同意 spec 也保留了 `blueai-track.js` / 插文字旧口径。见 `proposal.md` 获取动机与范围。

## Goals / Non-Goals

**Goals:**

- `add`、团队探测与 `track on` 共用同一个有效采集配置判定。
- `track on` 遇到 `{ reason }` 时保持原安装与 lock 状态不变，并输出可诊断原因。
- CLI 行为 spec 与跨仓契约 spec 均对齐当前 market 的 `collectEnabled`、`blueai_signature`、`obs-run`、`{ reason }` 口径。

**Non-Goals:**

- 不改 market 仓、数据库迁移或安装接口。
- 不改 `skills obs` / `ObservabilityAgent` 链路。
- 不新增 CLI `publish --collect` 入口。
- 不让 CLI 读取 `SkillObsManifest` 或 `obsTransformStatus`。

## Decisions

### D1：新增共享有效采集判定模块

新增一个共享模块导出 `hasValidCollect(skill)`，判定规则为：`collect` 必须是对象，且 `config` 为对象、`meta.blueai_signature` 为非空字符串。`src/add.ts` 删除本地 `hasValidCollect` 并改为引用共享模块；`src/track.ts` 在 `report=true` 分支使用同一函数。

备选：在 `track.ts` 复制一套判定。否决原因是此前两个入口已发生分叉，复制会让后续契约变化再次分叉。备选：从 `add.ts` 导出函数。否决原因是 `add.ts` 是命令实现模块，`track.ts` 不应依赖其内部实现。

### D2：无效 collect 按“未开启采集”处理，不按错误退出

`collect = { reason }` 是无监测版可用，不是命令级异常。`track on` 发现无效 collect 时应输出原因、保持 lock 与安装目录原状，并以非成功语义提示用户；不得安装原版并写入 `collectConsent=true`。`track off` 不依赖 collect 有效性，继续按原版重装。

备选：把 `{ reason }` 当作 hard error 并写入 `collectConsent=false`。否决原因是这会替用户改变既有选择，且 `track on` 只是尝试开启，失败后应保留原状态。

### D3：团队安装只统计有效 collect

团队批量安装的“带采集 Skill 数量”与一次询问只由有效 collect 决定；`{ reason }` 不计入团队询问触发条件。该行为已由现有 `add` 实现采用，本次只把它固化为 spec，并用共享函数统一。

### D4：`skill-collection-consent` 契约 spec 去除 CLI 行为细节

CLI 仓内的 `skill-collection-consent` 是跨仓契约镜像。本次保留其中“安装接口携带 report 参数”的接口契约，删除已由 `cli-skill-collection-consent` 接管的 package-type 判定、首次询问、track 行为与 `blueai-track.js` 载体要求；作者撤回声明条款改为引用 lock 三态规则。

备选：把两份 spec 全部合并成一份。否决原因是 `cli-skill-collection-consent` 是 CLI 行为契约，`skill-collection-consent` 是跨仓接口契约，职责不同；本次只消除重复和过时口径。

### D5：主 spec Purpose 通过 apply 阶段直接修正

OpenSpec 的 delta 不支持修改既有 capability 的 Purpose。实现阶段直接更新 `openspec/specs/skill-collection-consent/spec.md` 的 Purpose 与 Open Questions，去掉“按包类型判定”、旧的 obs-run 待办措辞和已由 lock 三态取代的升级默认包类型问题。该直接编辑发生在 apply 阶段，不进入 propose 阶段 change-dir-only commit。

## Risks / Trade-offs

- [判定过严] market 若返回 `config` 但缺失 `meta.blueai_signature`，CLI 会按无效处理 → 以当前 market 契约为准；测试覆盖缺 meta 场景，若 market 要放宽需先改契约。
- [track on 不再回退原版] 用户执行 `track on` 失败时仍保留原包 → 这是有意行为，避免把一次开启失败变成静默关闭。
- [team 探测语义变化] 旧 mock 可能只带 `collect.config` 而缺 meta → 实施时同步 fixture；规格明确要求 config + signature。
- [Purpose 直接编辑与 delta 归档交叉] 后续 archive 可能覆盖主 spec → apply 阶段提交后再跑 archive 验证，确认 Purpose 未被回退。

## Migration Plan

本次不涉及数据迁移或外部依赖升级。发布后：

1. 用户已有 lock 状态不变。
2. 已安装监测版的用户无需重装；仅后续 `add` / `track` 使用新判定。
3. 若用户此前因 `{ reason }` 误写 `collectConsent=true`，本 change 不做自动修复；`track off` 或用有效版本重新 `track on` 可纠正。

回滚策略：恢复 `track.ts` 的旧判定并撤回 delta specs 即可；不涉及持久化格式变化。
