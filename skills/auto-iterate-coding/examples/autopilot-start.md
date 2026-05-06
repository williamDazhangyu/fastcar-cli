# Autopilot 启动示例

把下面内容发给 Agent，用于启动复杂需求的全自动多轮迭代开发。

```text
请使用 auto-iterate-coding skill，进入 Autopilot 全自动迭代模式。

上下文与状态管理：
本 skill 是面向 AI Coding Agent 的自动迭代开发协议，不是独立 CLI 工具，也不依赖特定 Agent 平台。
请先探测当前 Agent 环境可用能力，包括读写文件、运行命令、真实测试、状态持久化、子 Agent/并行、网络、数据库/密钥和 git diff。
如果某项能力不可用，请按降级规则标记 not_verified 或 blocked，不要伪造完成或验证。
请不要依赖历史对话作为唯一上下文。
如果存在 .agent-state/auto-iterate-coding.md，请先读取它作为任务恢复状态，并执行 reconcile 检查：当前分支、git 状态/diff 摘要、状态文件与当前代码是否一致、是否存在上次停止后的外部修改、最近验证能否重新运行。
每完成一轮实现迭代、递归优化、上下文压缩、提前停止或成功交付前，都要更新 .agent-state/auto-iterate-coding.md。
当上下文变长、完成 3-5 轮迭代、进入新阶段或开始重复尝试时，请输出并使用 Context Handoff Summary 继续。
请维护完整任务清单、已完成任务、当前任务、剩余任务和整体完成状态；剩余任务非空时不得按成功交付停止，只能继续迭代或按提前停止汇报。

需求覆盖要求：
如果需求来自长文档、PRD、issue 列表或多条清单，请先从原文提取 Requirement Coverage Matrix。
每条需求必须包含 ID、原文摘要、状态、相关文件、验证证据、阻塞原因和下一步。
只要仍存在 pending / implemented / not_verified 的关键需求，就不要按成功交付输出；必须继续迭代，或按提前停止列出剩余需求和原因。
测试通过不等于需求完成，最终完成必须逐项对照原始需求文档。

AI 实现流程清单：

用户目标：
实现一个用户登录功能，支持邮箱 + 密码登录，并返回 JWT token。

成功标准：
1. 用户可以通过正确邮箱和密码登录。
2. 密码错误时返回明确错误。
3. 不存在的用户返回明确错误。
4. 登录成功后返回 token。
5. 现有测试、构建、类型检查通过。

非目标：
1. 本次不实现注册。
2. 本次不实现刷新 token。
3. 本次不改动用户表结构，除非现有结构完全无法支持。

允许修改范围：
后端 auth/login 相关代码、测试文件、必要的类型定义和路由注册。

需要保持兼容的接口、命令或行为：
不要破坏现有用户 API。
不要修改已有 CLI 命令行为。
不要删除或削弱现有测试。

可运行的验证命令：
npm test
npm run build
npm run typecheck

外部资源、密钥、数据库、网络或沙箱限制：
不允许连接生产数据库。
可以使用本地测试数据库、fixture 或 mock server。
不要新增依赖，除非先说明原因并等待我确认。

交付格式：
最终输出实现总结、关键修改、完整任务清单完成状态、Requirement Coverage Matrix、Definition of Done、迭代次数、运行过的验证命令、未验证项、剩余任务、剩余风险、验收建议，以及 .agent-state/auto-iterate-coding.md 的最终状态摘要。

迭代预算：
max_iterations 使用默认 100。
autopilot_max_iterations 使用默认 20。

确认后请直接开始自动化开发。中间只汇报关键进展；除非遇到必须由我决策的问题，否则不要停下来问我。
```

## 通用模板

```text
请使用 auto-iterate-coding skill，进入 Autopilot 全自动迭代模式。

上下文与状态管理：
本 skill 是面向 AI Coding Agent 的自动迭代开发协议，不是独立 CLI 工具，也不依赖特定 Agent 平台。
请先探测当前 Agent 环境可用能力，包括读写文件、运行命令、真实测试、状态持久化、子 Agent/并行、网络、数据库/密钥和 git diff。
如果某项能力不可用，请按降级规则标记 not_verified 或 blocked，不要伪造完成或验证。
请不要依赖历史对话作为唯一上下文。
如果存在 .agent-state/auto-iterate-coding.md，请先读取它作为任务恢复状态，并执行 reconcile 检查：当前分支、git 状态/diff 摘要、状态文件与当前代码是否一致、是否存在上次停止后的外部修改、最近验证能否重新运行。
每完成一轮实现迭代、递归优化、上下文压缩、提前停止或成功交付前，都要更新 .agent-state/auto-iterate-coding.md。
当上下文变长、完成 3-5 轮迭代、进入新阶段或开始重复尝试时，请输出并使用 Context Handoff Summary 继续。
请维护完整任务清单、已完成任务、当前任务、剩余任务和整体完成状态；剩余任务非空时不得按成功交付停止，只能继续迭代或按提前停止汇报。

需求覆盖要求：
如果需求来自长文档、PRD、issue 列表或多条清单，请先从原文提取 Requirement Coverage Matrix。
每条需求必须包含 ID、原文摘要、状态、相关文件、验证证据、阻塞原因和下一步。
只要仍存在 pending / implemented / not_verified 的关键需求，就不要按成功交付输出；必须继续迭代，或按提前停止列出剩余需求和原因。
测试通过不等于需求完成，最终完成必须逐项对照原始需求文档。

AI 实现流程清单：

用户目标：
[写清楚要实现什么]

成功标准：
1. [可验收标准 1]
2. [可验收标准 2]
3. [可验收标准 3]

非目标：
1. [本次不做什么]

允许修改范围：
[允许改哪些目录、模块、文件类型]

需要保持兼容的接口、命令或行为：
[不能破坏哪些 API、CLI、配置、数据格式]

可运行的验证命令：
[例如 npm test / pnpm test / cargo test / pytest / go test ./...]

外部资源、密钥、数据库、网络或沙箱限制：
[是否允许联网、数据库、密钥、mock、sandbox、新依赖]

交付格式：
最终输出实现总结、关键修改、完整任务清单完成状态、Requirement Coverage Matrix、Definition of Done、验证证据、未验证项、剩余任务、风险、验收建议，以及 .agent-state/auto-iterate-coding.md 的最终状态摘要。

迭代预算：
max_iterations = 100
autopilot_max_iterations = 20

确认后开始自动化开发；除非触发停止条件，否则持续迭代到完整任务清单全部通过验证或预算耗尽。单个 Phase、子任务或最小纵切通过后，必须继续检查剩余任务并自动进入下一项。
```
