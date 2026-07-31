## 1. 代码修改

- [x] 1.1 修改 `src/agents.ts` 中 `openclaw.skillsDir`，由 `"skills"` 改为 `".agents/skills"`
- [x] 1.2 确认 `openclaw.globalSkillsDir` 保持不变
- [x] 1.3 重新构建 `dist/cli.mjs`，核实 `openclaw.skillsDir` 已更新为 `.agents/skills`

## 2. 文档更新

- [x] 2.1 更新 `README.md` 中 OpenClaw 行的项目级路径列，由 `skills/` 改为 `.agents/skills/`

## 3. 验证

- [x] 3.1 单元/集成测试：确认按 `skillsDir === ".agents/skills"` 判定的通用 `.agents` 列表逻辑将 `openclaw` 正确归入
- [ ] 3.2 手动验证：在真实 OpenClaw 容器环境中执行项目级安装（未加 `-g`），确认文件写入 `<cwd>/.agents/skills/` 且无 `EACCES`（需真实容器环境，本次未执行）
- [ ] 3.3 手动验证：安装后执行 `openclaw skills list`，确认技能被实际加载（需真实容器环境，本次未执行）
- [ ] 3.4 手动验证：`-g` 全局安装路径（`~/.openclaw/skills`）行为未受影响（需真实容器环境，本次未执行）
