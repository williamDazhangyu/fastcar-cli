# 自动迭代编码启动提示

将下面内容发给 Agent，用于启动本项目的 auto-iterate-coding 流程。

```text
请先读取 auto-iterate-coding/SKILL.md，按该 skill 的自然语言命令路由、模式选择、session 恢复、能力降级、停止条件和语言一致性规则执行。
如果本启动提示来自自然语言路由，请确认命令已经包含独立 session；以后每次自然语言路由都必须显式传入 --session <name>。用户未指定 session 时，由 Agent 根据模式和目标生成英文小写、数字和连字符组成的默认 session 名，例如 quick-login-bugfix、diagnose-flaky-e2e、prototype-order-state-machine，不要省略 --session。

请使用 auto-iterate-coding skill，进入 Autopilot 全自动迭代模式。

当前启动模式：quick / 快速启动
适合小中型任务，Agent 先从代码库推断流程清单。

当前 session：session-only-test
Session 状态文件：.agent-state/auto-iterate/session-only-test/state.md
Session 启动提示：.agent-state/auto-iterate/session-only-test/start-prompt.md

模式执行规则：
快速启动模式：
- Agent 先探索代码库并生成“推断版 AI 实现流程清单”。
- 只有以下情况才停止询问用户：成功标准会影响产品行为、修改范围可能跨模块、验证命令缺失且无法推断、需要数据库/密钥/外部服务/新依赖、可能破坏兼容性。
- 在实现前把推断出的成功标准、修改范围、验证命令和 Requirement Coverage Matrix 写入状态。

上下文与状态管理：
请始终使用与用户当前提示一致的语言输出、记录状态和交付总结；用户使用中文时不要突然切换为英文，除非术语、命令、代码或用户明确要求保留英文。
本 skill 是面向 AI Coding Agent 的自动迭代开发协议，不是独立 CLI 工具，也不依赖特定 Agent 平台。
请先探测当前 Agent 环境可用能力，包括读写文件、运行命令、真实测试、状态持久化、子 Agent/并行、网络、数据库/密钥和 git diff。
如果某项能力不可用，请按降级规则标记 not_verified 或 blocked，不要伪造完成或验证。
请不要依赖历史对话作为唯一上下文。
如果存在 .agent-state/auto-iterate/session-only-test/state.md，请先读取它作为本 session 的恢复状态。
恢复前执行 reconcile 检查：当前分支、git 状态/diff 摘要、状态文件与当前代码是否一致、是否存在上次停止后的外部修改、最近验证能否重新运行。
每完成一轮实现迭代、递归优化、上下文压缩、提前停止或成功交付前，都要优先更新 session 状态文件 .agent-state/auto-iterate/session-only-test/state.md；如果当前环境不能写状态文件，请在对话内维护同等结构的 Iteration State。
请启用并维护 Watchdog 状态；每轮迭代前后、上下文压缩后、恢复后和最终交付前都要检查无进展、验证缺失、状态漂移和交付可验证性，并把 required_action 写回状态文件。
如果 Watchdog 触发 run_validation、reconcile、ask_user 或 stop，必须先处理 required_action，不得绕过；交付可验证性为 not_verifiable 或 unknown 时，不要按成功交付输出。
当上下文变长、完成 3-5 轮迭代、进入新阶段或开始重复尝试时，请输出并使用 Context Handoff Summary 继续。
请维护完整任务清单、已完成任务、当前任务、剩余任务和整体完成状态；剩余任务非空时不得按成功交付停止，只能继续迭代或按提前停止汇报。
修 bug、性能回归或验证失败时，请先建立能复现目标问题的 feedback loop；无法建立时停止并说明尝试过什么、缺少什么 artifact 或环境。
连续失败或修改无改善时，请列出 3-5 个排序假设，并让每轮只验证一个可证伪假设。
新功能和缺陷修复优先使用垂直切片 TDD；一次只写一个外部行为测试或等价验证，再做最小实现。
如果问题需要先澄清状态模型、数据模型、交互逻辑或 UI 方向，可以先做明确标记的一次性原型；原型结论吸收前不得声称需求完成。
如果出现没有正确 test seam、只能测私有实现、局部修改反复触发远处失败或 patch 范围扩散，请标记架构摩擦并请求用户确认，不要擅自升级为大范围重构。

需求覆盖要求：
如果需求来自长文档、PRD、issue 列表或多条清单，请先从原文提取 Requirement Coverage Matrix。
每条需求必须包含 ID、原文摘要、状态、相关文件、验证证据、阻塞原因和下一步。
只要仍存在 pending / implemented / not_verified 的关键需求，就不要按成功交付输出；必须继续迭代，或按提前停止列出剩余需求和原因。
测试通过不等于需求完成，最终完成必须逐项对照原始需求文档。
最终交付前必须清理临时 debug 日志、一次性 harness、原型路由、variant switcher 和未吸收的原型外壳；不能清理时按风险说明。

AI 实现流程清单：


用户目标：
修复登录失败

成功标准：
- 由 Agent 先探索代码库后推断，并在实现前写入需求覆盖矩阵（Requirement Coverage Matrix）

非目标：
- 不做与本需求无关的重构、架构迁移或新依赖引入

允许修改范围：
优先限于与目标直接相关的最小文件集合；跨模块修改前停止确认

需要保持兼容的接口、命令或行为：
- 保持现有公开 API、CLI 命令、配置、数据格式和测试行为；可能破坏兼容性时停止确认

可运行的验证命令：
- 由 Agent 从 package.json、Makefile、scripts、CI 配置和项目约定中识别；缺失时标记 not_verified

外部资源、密钥、数据库、网络或沙箱限制：
- 不要连接生产数据库
- 不要写入密钥、token、密码或连接串
- 不要新增依赖，除非先说明原因并等待确认

交付格式：
最终输出实现总结、关键修改、完整任务清单完成状态、需求覆盖矩阵（Requirement Coverage Matrix）、完成定义（Definition of Done）、Watchdog 状态、交付可验证性、验证证据、未验证项、剩余需求、风险、验收建议，以及本 session state 的最终状态摘要。

迭代预算：
max_iterations = 100
autopilot_max_iterations = 10

确认后请直接开始执行。中间只汇报关键进展；除非触发停止条件或遇到必须由我决策的问题，否则不要停下来问我。
```
