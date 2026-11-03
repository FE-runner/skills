# support-binary-file-install 审查未修项快照

## 方案审查

- 执行轮次：1
- 记录时间：2026-10-15 14:03:53 CST
- 基线：propose commit `ee45289`；工作区无额外未提交改动
- Critical：0

### Warning

1. [`specs/skill-install-file-content/spec.md` 「二进制内容的前置校验与失败语义」] — 失败语义中"SHALL NOT 在磁盘上留下该技能的任何文件"与 `design.md` Risks 段中"校验失败时已存在的旧版本内容保持不变"存在歧义：若目标目录此前已安装同名技能，前置校验失败后这些旧文件仍会存在。
   建议: 把 spec 语义改为"不新增、不清空、不改写任何文件；已存在的目标内容保持原状"，并补一个"目标目录已有旧内容时校验失败"的 Scenario；同时让 `tasks.md` 2.2 的断言从"未被创建或清空"扩展为"既有文件逐字节不变"。
   - 解决：本 change 内修复（commit 348e94e）— spec、design、proposal 与 tasks 已统一为不新增、不清空、不改写，既有旧内容保持原状，并补充了对应 Scenario。
2. [`design.md` D4 严格 Base64 校验口径] — "解码结果非空"会把合法的 0 字节二进制文件判为失败。当前四份产物一致采用该口径，但这与"二进制按原始字节无损落盘"的目标存在边界冲突，且 proposal/design/spec 都未说明服务端是否保证不发送空文件。
   建议: 明确空二进制文件的产品语义：若服务端保证不发送，则把该假设写入 Context 或服务器契约；若可能发送，则移除"解码结果非空"校验或在 spec 中新增 0 字节文件应成功写入的 Scenario。
   - 解决：本 change 内修复（commit 348e94e）— design 已明确服务端按文本处理空文件，空 Base64 仅用于防御畸形响应，无需修改运行时代码。
