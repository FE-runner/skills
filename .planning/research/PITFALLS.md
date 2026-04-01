# Fork 同步领域陷阱

**领域:** 定制化 fork 的上游同步 (vercel-labs/skills -> blueai-skills)
**研究日期:** 2026-04-01

## 关键数据

- **Fork 分叉点:** `5ac56d8`（上游 v1.4.3）
- **上游新增:** 29 个提交，17 个文件变更，2 个新文件（update-source.ts/test）
- **BMC 新增:** 54 个提交，20 个文件变更，3 个新文件（branding.ts, cos.ts, market.ts），1 个删除（registry.ts）
- **双方修改的文件:** 11 个（add.ts, cli.ts, find.ts, install.ts, installer.ts, list.test.ts, local-lock.ts, skill-lock.ts, source-parser.test.ts, source-parser.ts, types.ts）
- **上游版本跨度:** v1.4.3 -> v1.4.7

---

## 致命陷阱

发生后需要重做或造成严重回退的错误。

### 陷阱 1: cli.ts 三向合并导致功能丢失

**问题描述:** `src/cli.ts` 是双方改动量最大的文件。上游在 cli.ts 中重构了 `check`/`update` 命令（引入 `update-source.ts`，移除 `CheckUpdatesRequest`/`CheckUpdatesResponse` 接口，新增 XDG_STATE_HOME 支持，新增 `--json` 输出）。BMC 在同一文件中做了大量品牌替换（NPX_CMD, BIN_NAME 等常量引用）和 Market Provider 集成（import marketProvider, readLocalLock）。

**发生原因:** Git 三向合并按行匹配。当上游在 BMC 已经修改过的行附近做了结构性重构（如移除整段接口定义、修改函数签名），合并工具无法正确判断哪些修改应保留。自动合并可能"成功"但产出错误代码——例如保留了 BMC 的 import 但丢失了上游新增的 `buildUpdateInstallSource` import。

**后果:** 编译通过但运行时报错（找不到函数），或者编译失败但错误信息指向完全不相关的地方。更糟的情况：BMC 定制代码被静默覆盖，发布后才发现品牌名称回退到 "skills"。

**预警信号:**
- `git merge` 报告 cli.ts 冲突且差异超过 200 行
- 合并后 cli.ts 中出现重复的 import 语句
- `pnpm build` 通过但 `pnpm test` 中 CLI 帮助文本测试失败

**预防策略:**
1. **不使用 `git merge upstream/main`**，改用逐提交 cherry-pick 或按文件手动合并
2. 对 cli.ts 采用"手动三向比对"：分别查看上游 diff 和 BMC diff，人工决定每处变更的合并方式
3. 合并后搜索所有 branding 常量（`NPX_CMD`, `BIN_NAME`, `SKILLS_SITE` 等），确认无一回退
4. 合并后运行 `grep -r "npx skills" src/` 确认没有硬编码的上游品牌名称泄漏

**适用阶段:** 合并执行阶段（Phase 2），这是最高风险步骤

---

### 陷阱 2: source-parser.ts 功能分歧导致逻辑冲突

**问题描述:** `src/source-parser.ts` 双方都做了重大修改。上游新增了：SSH URL 解析（`git@gitlab.com:owner/repo`）、`sanitizeSubpath()` 防路径遍历、fragment ref 解析（`#ref=branch`）、URL 参数支持。BMC 新增了：Market 优先级解析策略和 GitHub 回退逻辑。两边都修改了 `parseSource()` 函数——上游几乎完全重写了它（+96 行），BMC 在同位置插入了 Market 查询逻辑。

**发生原因:** 上游将 `parseSource()` 从简单的线性逻辑重构为带 fragment/ref 解析的复杂流程，BMC 将同一函数从"先 GitHub 再其他"改为"先 Market 再 GitHub"。两种修改触及相同的函数入口和分支逻辑。

**后果:** 合并后 `parseSource()` 的执行流程可能变得不可预测——Market 优先级逻辑可能在 fragment 解析之前或之后执行，导致 `skills add some-skill#ref=v2` 的行为不一致。

**预警信号:**
- 合并后 `parseSource()` 超过 150 行且嵌套超过 4 层
- `source-parser.test.ts` 测试用例出现意外失败
- Market 技能安装和 GitHub 带分支安装不能同时工作

**预防策略:**
1. 先理解上游 `parseSource()` 的新架构（fragment 解析层 -> 源类型判断层 -> 具体解析层）
2. 将 BMC 的 Market 优先级逻辑重新适配到上游的新架构中，而不是尝试机械合并
3. 为 Market + ref 组合场景编写新测试用例
4. 验证 `sanitizeSubpath()` 不会影响 COS URL 解析

**适用阶段:** 合并执行阶段（Phase 2），需专门分配时间处理

---

### 陷阱 3: providers 目录结构冲突——BMC 删除了 registry.ts

**问题描述:** BMC fork 删除了 `src/providers/registry.ts` 和 `src/providers/types.ts`，用不同的 provider 注册机制替代（通过 `src/providers/index.ts` 直接导入 cos.ts 和 market.ts）。上游没有删除这些文件，反而继续在 `wellknown.ts` 中积极开发（新增 `agent-skills` 路径支持）。

**发生原因:** BMC 认为 registry 模式过度抽象，简化为直接导入。但上游的 wellknown provider 仍依赖 `types.ts` 中导出的类型定义。如果合并时上游的 wellknown.ts 变更试图引用 BMC 已删除的类型，将导致编译错误。

**后果:** TypeScript 编译失败，错误信息类似 `Cannot find module './types'` 或 `Property 'xxx' does not exist on type 'yyy'`。修复时如果简单恢复 types.ts，可能与 BMC 的新 provider 注册方式冲突。

**预警信号:**
- `pnpm build` 报 providers 目录下的 import 错误
- `wellknown.ts` 中有对 `RemoteSkill` 或 `HostProvider` 的引用找不到定义

**预防策略:**
1. 合并前对比 BMC 和上游的 `providers/` 目录结构，建立映射关系
2. 如果 wellknown.ts 需要的类型在 BMC 中已移至其他位置，创建重导出文件或调整 import 路径
3. 确保 BMC 新增的 cos.ts 和 market.ts 在合并后仍能正常导入和工作
4. 先合并 providers/ 目录变更，确认编译通过后再处理其他文件

**适用阶段:** 合并执行阶段（Phase 2），建议作为第一批合并的文件

---

## 严重陷阱

不致命但会造成显著返工的错误。

### 陷阱 4: package.json 合并丢失 BMC 定制字段

**问题描述:** 上游 package.json 从 v1.4.3 升级到 v1.4.7，新增了 keywords（bob, deepagents, firebender, warp），修改了 format 脚本的引号风格。BMC 的 package.json 有大量定制：name (`blueai-skills`), version (`1.4.3-bmc1.1.12`), bin 字段, author, repository URL, 以及额外的 scripts（release, publish:snapshot）。

**发生原因:** 自动合并 JSON 文件极其不可靠——JSON 没有注释来标记"这是 BMC 定制"。合并工具可能在解决冲突时选择上游版本的 name/version，或者"成功"合并但产出无效 JSON（缺少逗号、括号不匹配）。

**后果:** 发布时包名从 `blueai-skills` 回退为 `skills`，覆盖上游 npm 包（如果有发布权限）。或者版本号混乱，BMC 内部安装到错误版本。

**预警信号:**
- 合并后 `package.json` 中 `name` 字段不是 `blueai-skills`
- `version` 字段不以 `bmc` 为前缀标识
- `bin` 字段指向 `skills` 而非 `blueai-skills`

**预防策略:**
1. **手动合并 package.json**，不依赖 git 自动合并
2. 创建检查脚本验证关键字段：`name`, `version`, `bin`, `author`, `repository`
3. 从上游只取需要的变更（新 keywords、format 脚本修复），忽略 name/version
4. 合并后立即运行 `node -e "JSON.parse(require('fs').readFileSync('package.json'))"` 验证 JSON 有效性

**适用阶段:** 合并执行阶段（Phase 2）

---

### 陷阱 5: 上游 skill-lock.ts 引入 XDG 路径——破坏 BMC 已有的 lock 文件定位

**问题描述:** 上游新增了 `XDG_STATE_HOME` 环境变量支持来确定 skill-lock 文件路径（commit `35298a9`: "fix: avoid hardcoded ~/.agents for skill lock file"）。BMC 在 skill-lock.ts 中也有自己的修改（添加 authorId 字段）。如果盲目合并，lock 文件路径逻辑可能冲突，或者 BMC 用户的 lock 文件"消失"——因为系统设置了 XDG_STATE_HOME 后，CLI 突然去新路径找 lock 文件。

**发生原因:** 这是一个语义冲突而非文本冲突。两个修改可能在不同位置，git 能自动合并成功，但运行时行为发生变化。

**后果:** 用户升级 CLI 后，`skills check` 和 `skills update` 认为没有已安装的技能（因为在新路径找不到 lock 文件）。lock 文件数据未丢失（旧路径仍在），但需要手动迁移。

**预警信号:**
- 合并后 `skills check` 显示 "No skills installed"，但技能实际已安装
- 测试在有 XDG_STATE_HOME 设置的 CI 环境中失败

**预防策略:**
1. 评估是否接受 XDG 支持——如果 BMC 用户主要在 Windows/macOS，可能不需要
2. 如果接受，添加迁移逻辑：检测旧路径是否有 lock 文件，自动迁移到新路径
3. 确保 BMC 的 authorId 字段在新路径逻辑下仍然正确写入
4. 在测试中同时覆盖 XDG 路径和默认路径场景

**适用阶段:** 差异分析阶段（Phase 1）决定是否接受，合并阶段（Phase 2）实施

---

### 陷阱 6: 上游新增 update-source.ts 模块——BMC 的 check/update 逻辑需要适配

**问题描述:** 上游提取了新模块 `src/update-source.ts`（包含 `buildUpdateInstallSource` 和 `formatSourceInput`），重构了 check/update 命令从单独 API 调用改为使用 GitHub tree SHA 比较。cli.ts 中原有的 `CheckUpdatesRequest`/`CheckUpdatesResponse` 接口被移除。BMC 如果不引入这个新模块，合并后的 check/update 命令将无法工作。

**发生原因:** 上游做了 extract method 重构，将原本内联在 cli.ts 的代码提取到独立模块。这种重构在合并时特别难处理——git 看到 cli.ts 中代码被删除、新文件被创建，但不知道这两个操作是关联的。

**后果:** 如果只合并 cli.ts 的变更但遗漏 update-source.ts，编译失败（import 找不到）。如果引入了 update-source.ts 但未正确适配 BMC 的 Market API 调用，check/update 命令对 Market 技能不生效。

**预警信号:**
- 合并后 `import { buildUpdateInstallSource } from './update-source.ts'` 报错
- `skills check` 只能检测 GitHub 来源的技能更新，忽略 Market 来源

**预防策略:**
1. 将 `update-source.ts` 和 `update-source.test.ts` 完整纳入合并
2. 检查 `buildUpdateInstallSource()` 是否需要感知 Market 来源的技能
3. 如果 BMC 的 check/update 有不同的 API 端点，在 update-source.ts 中通过 branding 常量配置
4. 运行上游新增的 `update-source.test.ts` 验证基础功能

**适用阶段:** 差异分析阶段（Phase 1）理解依赖关系，合并阶段（Phase 2）执行

---

### 陷阱 7: 测试文件合并后断言值错误

**问题描述:** `list.test.ts` 和 `source-parser.test.ts` 双方都有修改。测试文件中的硬编码字符串（如命令名称 `"skills"` vs `"blueai-skills"`、API URL、示例输入输出）在合并后可能既不匹配 BMC 行为也不匹配上游行为。

**发生原因:** 测试通常包含具体的断言值，这些值与品牌和配置强关联。Git 不理解断言的语义，可能保留上游的期望值但 BMC 的实现已修改。

**后果:** `pnpm test` 失败，表面看是"测试不通过"，但实际是合并冲突的副作用。如果匆忙修复测试断言值而非理解根因，可能掩盖真正的功能缺陷。

**预警信号:**
- 多个测试文件同时报断言失败（assertion mismatch）
- 失败的断言涉及字符串比较（品牌名、URL 等）

**预防策略:**
1. 合并后先运行全部测试，记录所有失败
2. 将失败分类为"品牌相关"（只需更新断言值）和"逻辑相关"（需要排查合并错误）
3. 品牌相关的测试失败应使用 branding 常量而非硬编码字符串
4. 上游新增的测试（update-source.test.ts）可直接采用，只需确认不依赖上游特定配置

**适用阶段:** 验证阶段（Phase 3）

---

## 中等陷阱

### 陷阱 8: 合并策略选择错误——merge vs rebase vs cherry-pick

**问题描述:** 对于高度分歧的 fork，`git merge upstream/main` 会产生一个巨大的合并提交，所有冲突堆在一起，难以逐个理解和解决。`git rebase` 对于 54 个 BMC 提交 rebase 到 upstream/main 上同样不现实。

**发生原因:** 直觉上 `git merge` 是最简单的方案，但当双方有 11 个共同修改文件且修改逻辑完全不同时，自动合并的质量极低。

**后果:** 合并提交看似成功，但隐藏了多处静默错误。后续 debug 时无法区分"合并引入的 bug"和"原有 bug"。

**预防策略:**
1. **推荐方案：按上游提交分组 cherry-pick**。将上游 29 个提交按功能分组（agent 新增、bug 修复、feature），逐组 cherry-pick
2. 每组 cherry-pick 后运行 build + test，确认无回退
3. 或者采用"干净基线"方案：以上游 main 为基础，手动重新应用 BMC 定制（风险更高但结果更干净）
4. 无论哪种方案，在合并分支上操作，不直接在 master 上合并

**适用阶段:** 策略选择阶段（Phase 1）

---

### 陷阱 9: 上游 installer.ts 修复被 BMC 修改覆盖

**问题描述:** 上游在 installer.ts 中修复了两个实际 bug：跳过断开的符号链接（`skip broken symlinks during skill installation`, commit `4f1d38e`）和当所有 agent 共享目录时跳过提示（`skip symlink/copy prompt when all agents share one directory`, commit `a143ac8`）。BMC 在 installer.ts 中也有自己的修改。

**发生原因:** 合并冲突时"保留 BMC 版本"的策略可能导致上游的 bug 修复被丢弃。因为 BMC 的改动看起来更新（commit 时间更晚），操作者可能默认选择 BMC 版本。

**后果:** 已经被上游社区发现并修复的 bug 继续存在于 BMC fork 中，用户遇到同样问题时需要再次定位和修复。

**预警信号:**
- 合并冲突解决时整段选择了 "ours"（BMC）
- 合并后 `git diff master..upstream/main -- src/installer.ts` 仍显示上游修复的代码不在 BMC 中

**预防策略:**
1. 在差异分析阶段专门列出上游的 **bug 修复** 提交（区别于 feature 和 chore）
2. Bug 修复提交应**优先合并**，即使与 BMC 代码有冲突也要手动适配
3. 上游 bug 修复列表：`4f1d38e` (broken symlinks), `a143ac8` (shared directory prompt), `dacfb8e` (underscore files), `35298a9` (hardcoded path), `1bd2c70` (SSH source URLs), `bacd498` (Windows spawnSync ENOENT)
4. 每个 bug 修复验证是否也影响 BMC（有的可能 BMC 已独立修复了）

**适用阶段:** 差异分析阶段（Phase 1）标记，合并阶段（Phase 2）优先处理

---

### 陷阱 10: 新增 agent 定义合并不完整

**问题描述:** 上游在 agents.ts 中新增了多个 agent（Deep Agents, Firebender, IBM Bob, Warp），同时更新了 Antigravity 的安装路径。BMC 在 agents.ts 中没有修改（只在 package.json keywords 中有差异）。但 BMC 可能有自己不公开的 agent 定义，或者上游新增的 agent 路径在 BMC 环境中不适用。

**发生原因:** agents.ts 的合并看似简单（只有上游改了），但忽略了 BMC 可能需要验证每个新 agent 的路径在目标用户环境中是否有效。

**后果:** 新增的 agent 在 BMC 用户的机器上检测失败或安装到错误路径，但因为是新 agent，不影响已有功能，容易被忽略直到有用户报告。

**预防策略:**
1. 直接接受上游 agents.ts 的变更（这是低风险合并）
2. 验证 BMC 是否需要过滤掉某些 agent（内部用户可能只用特定 agent）
3. 更新 README 中的 agent 列表

**适用阶段:** 合并执行阶段（Phase 2），低优先级

---

## 轻微陷阱

### 陷阱 11: 上游 format 脚本引号风格变更导致 CI 差异

**问题描述:** 上游将 format 脚本从单引号改为双引号（`'src/**/*.ts'` -> `"src/**/*.ts"`）。这在 Windows 上行为可能不同。

**预防策略:** 接受上游变更，在 Windows 和 Linux 上各测试一次 `pnpm format`。

---

### 陷阱 12: 合并后遗忘更新 CLAUDE.md 中的架构文档

**问题描述:** 上游新增的文件（update-source.ts）和修改的模块职责不会自动反映在 BMC 的 CLAUDE.md 文档中。

**预防策略:** 合并完成后专门检查 CLAUDE.md 中的架构描述、命令列表、文件列表是否需要更新。

---

## 按阶段的风险汇总

| 阶段 | 对应陷阱 | 风险等级 | 缓解措施 |
|------|----------|----------|----------|
| Phase 1: 差异分析 | #5 (XDG路径), #6 (update-source), #8 (合并策略), #9 (bug修复识别) | 中 | 逐文件分析，按功能分类提交 |
| Phase 2: 合并执行 | #1 (cli.ts), #2 (source-parser), #3 (providers), #4 (package.json), #10 (agents) | 高 | 逐文件手动合并，每步 build+test |
| Phase 3: 验证 | #7 (测试断言), #11 (format), #12 (文档) | 低 | 全量测试 + 文档审查 |

## 置信度

| 陷阱 | 置信度 | 理由 |
|------|--------|------|
| #1-3 (核心文件冲突) | HIGH | 直接通过 `git diff` 验证了双方修改的重叠 |
| #4 (package.json) | HIGH | 通过实际 diff 确认了字段冲突 |
| #5-6 (语义冲突) | HIGH | 通过阅读上游 commit 内容确认了功能变更 |
| #7 (测试断言) | MEDIUM | 基于 fork 同步的通用经验，未逐行验证测试内容 |
| #8 (合并策略) | HIGH | 基于 11 个冲突文件和 54+29 提交的分歧规模 |
| #9 (bug修复覆盖) | HIGH | 通过上游 commit log 确认了具体的修复提交 |
| #10-12 (轻微陷阱) | MEDIUM | 合理推断，影响有限 |

## 来源

- 本仓库 git history（`git log`, `git diff`）
- 上游 vercel-labs/skills main 分支（通过 `git fetch upstream` 获取）
- 分叉点分析：`git merge-base master upstream/main` = `5ac56d8`
- 冲突文件分析：`git diff --name-only` 双向比较
