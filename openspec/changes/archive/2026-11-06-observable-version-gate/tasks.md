## 1. Provider 契约

- [x] 1.1 修改 `src/providers/market.ts`：`fetchById()` 移除 `report` 参数与请求字段，新增保留 `ApiResult` 的安装结果方法，原样透传 `409 code=OBS_VERSION_UNAVAILABLE`；验证 `tests/market-observability-provider.test.ts` 请求体无 `report`
- [x] 1.2 更新 `MarketSkill`/安装响应类型与 `src/collect.ts`：`collect` 仅用 `config + meta.blueai_signature` 判断可观测，删除 `collect.reason` 失败降级语义；验证 collect 单元测试覆盖合法/缺失/非法结构
- [x] 1.3 将安装主流程的 `fetchById` 调用点迁移到新 `ApiResult` 安装方法；保留非安装只读调用使用的 `fetchById(): Promise<MarketSkill | null>` 兼容包装，验证 `pnpm type-check` 通过

## 2. 单 Skill 安装

- [x] 2.1 重构 `src/add.ts` 单 Skill 安装为一次请求一份文件：删除原版先行、`report=true` 探测、monitored replacement 与第二次 fetch；验证测试断言每个 Skill 仅调用一次安装
- [x] 2.2 保留 lock 三态 consent：缺失时交互询问，非交互默认 false；同意/拒绝都安装同一响应文件；验证 `src/add-market-paths.test.ts` 覆盖同意、拒绝、非交互和已有 true/false
- [x] 2.3 将 `--observability` 改为只强制 consent=true 并跳过询问，不触发额外安装请求；不可观测 Skill 仍安装响应文件；验证显式开关与 `OBS_VERSION_UNAVAILABLE` fail-closed 测试
- [x] 2.4 仅在最终 consent=true 的可观测 Skill 上触发现有 Pilot 状态/自动安装链路，false/unset 不提示不安装；验证 `src/add-team-observability.test.ts` 和 `src/obs.test.ts`，并覆盖非交互 consent=true 只输出手动安装指引、不执行脚本

## 3. 团队安装

- [x] 3.1 重构团队安装：以对每个 Skill 的唯一 release-bound 安装响应用于 consent 识别与实际落盘，删除 `report` 预检和第二份下载；验证同 release 只请求一次
- [x] 3.2 保留团队级一次询问：仅对 consent 缺失的可观测 Skill 询问，同意写 true，拒绝/非交互写 false；验证 `src/add-team-observability.test.ts`
- [x] 3.3 对 `OBS_VERSION_UNAVAILABLE`、缺失/失效 releaseId 和网络错误 fail-closed；缺失 releaseId 的团队批量项不安装、不写 consent，单项失败不回退公开、私有、GitHub 或其他团队版本；验证 `src/providers/market-team-install.test.ts` 与批量安装测试

## 4. track 与 Lock

- [x] 4.1 重写 `src/track.ts` 的 on/off：只读取全局 lock 并更新 `collectConsent`，不调用 Market/resolver/installer，不修改版本、hash、team/release 字段，不写 Skill 文件；验证 `src/track.test.ts` 覆盖无网络、无 Skill 文件写入
- [x] 4.2 保持 `src/skill-lock.ts`、`src/local-lock.ts` schema 版本与既有字段兼容，不新增状态文件；验证 lock round-trip 测试
- [x] 4.3 更新 `track list` 与帮助文案，明确 on/off 只改变采集同意并立即影响后续统计/Pilot，不重装文件；验证 CLI help 快照或相关测试

## 5. CLI 文档与兼容

- [x] 5.1 更新 `README.md` 与 CLI help：删除 report、重装切换和 collect.reason 降级说明，记录新 Market 配套发布要求；验证相关文案检索
- [x] 5.2 更新错误提示文案：`OBS_VERSION_UNAVAILABLE` 明确为“当前版本尚无可安装的可观测产物”，不得建议切换原版；验证相关命令输出测试
- [x] 5.3 检查旧 `--observability`、团队安装、update 重装和 `track` 帮助不存在“切换包类型”旧语义；验证 `rg "report|重装原版|collect.reason"` 仅命中兼容说明或测试
- [x] 5.4 检查跨仓 `blueai-skills-cli` companion skill 的 `SKILL.md` 与 references 是否仍描述 report/重装；若存在，作为独立 companion-skill 仓库 follow-up 记录，不纳入本 CLI change commit

## 6. 验证

- [x] 6.1 运行聚焦测试：`pnpm exec vitest run tests/market-observability-provider.test.ts src/add-market-paths.test.ts src/add-team-observability.test.ts src/track.test.ts src/providers/market-team-install.test.ts`
- [x] 6.2 运行 `pnpm type-check`、`pnpm format:check`、`pnpm build`
- [x] 6.3 运行全量 `pnpm exec vitest run`，记录退出码、测试文件数、测试数和失败摘要
