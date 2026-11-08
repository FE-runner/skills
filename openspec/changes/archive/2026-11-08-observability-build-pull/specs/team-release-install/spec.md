## REMOVED Requirements

### Requirement: Team single Skill check and update use the team resolver

**Reason**: 团队更新判断扩展为 `releaseId + releaseSeq`，并统一走批量构建检测接口；旧的仅 resolver + 版本判断不足以发现同版本新构建。
**Migration**: 使用 `observability-build-pull` 的团队目标检测和更新要求；团队权限、release 绑定与 fail-closed 语义保持不变。
