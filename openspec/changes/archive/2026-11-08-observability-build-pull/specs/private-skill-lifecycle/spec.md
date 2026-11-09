## REMOVED Requirements

### Requirement: check 命令支持私有技能版本检查

**Reason**: 普通与私有 Market Skill 统一改由批量构建检测和 `version + releaseSeq` 判断，旧的单 Skill 版本检查不再是唯一更新依据。
**Migration**: 使用 `observability-build-pull` 的批量构建检测；`authorId` 仅作为普通/私有目标入参保留。

### Requirement: update 命令支持私有技能更新

**Reason**: 更新触发条件改为 `version + releaseSeq`，安装必须在写盘前完成构建校验。
**Migration**: 使用 `observability-build-pull` 的更新与安装要求；私有 source 仍保留 author 信息。
