# 引用索引

只读取当前阶段需要的文件；不要一次性加载全部 references。

| 文件 | 触发条件 | 优先级 | 用途 |
| --- | --- | --- | --- |
| `requirement-to-implementation.md` | 新功能、PRD、文档实现、严格启动 | 必读 | 需求规格化、现状探索、脚手架优先、垂直切片 |
| `natural-language-routing.md` | 用户用自然语言启动、恢复、规划、验收、诊断、原型或优化任务 | 必读 | 将用户说法映射为 CLI 命令、预算和 session |
| `feedback-loop.md` | bug、测试失败、性能回归、Autopilot | 必读 | 建立可重复 pass/fail 信号和假设驱动调试 |
| `real-testing.md` | 需要验证、沙箱、外部资源判断 | 必读 | 区分真实验证、沙箱验证和未验证项 |
| `stop-conditions.md` | 每轮继续前、预算耗尽、阻塞、风险上升 | 必读 | 判断继续、收窄、请求用户或提前停止 |
| `final-delivery.md` | 交付前 | 必读 | 成功交付、有限成功、提前停止和验证证据 |
| `state-schema.md` | 维护、恢复或校验 session state | 必读 | 固定 state.json 强约束、state.md 生成视图、Skill Capture 和兼容恢复规则 |
| `state.schema.json` | 第三方 Agent、测试或文档工具需要读取机器状态 schema | 必读 | 独立 JSON Schema artifact，覆盖 state.json 必填对象、关键枚举和门禁实体 |
| `phase-gates.md` | 自动迭代进入编码、验证、cleanup 或交付前 | 必读 | 阶段状态机、Hard Gate、阻断原因和 post-agent strict 校验循环 |
| `iteration-policy.md` | 每轮实现、失败修复、预算或回滚判断 | 必读 | 单轮单目标、变更预算、停止条件和安全回滚 |
| `delivery-template.md` | 成功交付、有限交付或 strict 校验失败后 | 必读 | 交付证据模板、cleanup/validation 门禁和 context_reset_and_repair |
| `tdd-vertical-slices.md` | 新功能、bug 修复、需要 test-first | 按需 | 行为测试、tracer bullet、避免横向切片 |
| `test-quality.md` | 测试设计或评审 | 按需 | 判断测试是否验证行为而非实现细节 |
| `two-axis-review.md` | Verify-only、PRD 验收、Review since X、交付前复核 | 按需 | 分离 Standards 规范符合度和 Spec 需求符合度，避免一个轴掩盖另一个轴 |
| `mocking-boundaries.md` | 需要 mock、替身或外部依赖 | 按需 | 决定 mock 边界和真实依赖替代 |
| `prototype-clarification.md` | 状态机、数据模型、UI 方向不确定 | 按需 | 一次性逻辑原型或 UI 原型规则 |
| `architecture-friction.md` | 没有 test seam、patch 扩散、远处失败 | 遇到时读 | 识别架构摩擦并停止自动修补 |
| `architecture-language.md` | 需要描述 module/interface/seam | 遇到时读 | 统一架构术语 |
| `interface-and-seams.md` | 需要设计可测试接口或 adapter | 遇到时读 | interface、seam、adapter 设计 |
| `refactor-candidates.md` | GREEN 后考虑重构 | 按需 | 识别安全重构和 deep module 机会 |
| `recursive-optimization.md` | 初版验证通过后优化 | 按需 | 有边界递归优化 |
| `plain-optimization.md` | 低风险整理、类型/枚举/常量收敛 | 按需 | 朴素低风险优化 |
| `progress-visualization.md` | 长任务、用户询问进度、最终图示 | 可选 | Mermaid 和纯文本进度图 |
| `sub-agent-concurrency.md` | `子 Agent/并行：available`、探索/验证/需求/实现阶段、Autopilot、`--validate-state`、`--dispatch` | 按需 | 并发调度规则、Codex CLI worker adapter、四阶段 Fan-out、安全约束、合并规则、Session 隔离、session 基线与 sub-agent state 校验 |

## 推荐读取组合

本节是“按模式和场景选引用”的入口。`auto-iterate-coding` 不是只服务编码任务；只要任务可以拆成目标、约束、验证证据和停止条件，也可以用于写作、文档整理、PRD 评审、研究报告、方案设计、测试计划、Runbook、迁移计划、发布说明等非代码产物。非代码任务的验证证据可以是结构化清单覆盖、事实来源核对、术语一致性检查、可读性审阅、格式校验、链接/命令可用性检查或用户确认的验收标准；不能把“看起来写完了”当作已验证。

### 单一模式

- Quick：`natural-language-routing.md`、`requirement-to-implementation.md`、`feedback-loop.md`、`real-testing.md`、`stop-conditions.md`、`final-delivery.md`。适合目标明确的小中型改动、文档补丁、示例补全或轻量写作修订；Agent 先从仓库、文档和约定推断流程清单，并在任务后执行 `.agents/skills` 技能沉淀。
- 严格实现 / Autopilot / Strict：`requirement-to-implementation.md`、`feedback-loop.md`、`real-testing.md`、`stop-conditions.md`、`final-delivery.md`，交付前按需读取 `two-axis-review.md`。适合 PRD、issue、长清单、生产代码或正式文档的完整实现。
- Autopilot：`requirement-to-implementation.md`、`feedback-loop.md`、`real-testing.md`、`stop-conditions.md`、`final-delivery.md`，长任务配合 `progress-visualization.md`。适合“完整做完”“一直修到通过”“迭代 N 次以内”等有边界自动推进任务；预算是上限，不是必须消耗。
- Diagnose：`feedback-loop.md`、`tdd-vertical-slices.md`、`real-testing.md`、`stop-conditions.md`、`final-delivery.md`。适合困难 bug、性能回归、flaky 测试，也适合定位文档生成失败、示例不可运行、发布说明与实际 diff 不一致等非代码问题。
- Verify-only：`real-testing.md`、`two-axis-review.md`、`stop-conditions.md`、`final-delivery.md`。适合验收 PRD、检查实现完成度、审查文档是否覆盖原始需求、核对写作产物是否满足提纲和事实约束；默认不修改文件。
- Plan-only：`requirement-to-implementation.md`、`architecture-language.md`、`interface-and-seams.md`、`stop-conditions.md`、`final-delivery.md`。适合只规划、不写代码或不改文档的场景，例如模块重构方案、写作大纲、迁移计划、测试策略和调研路线。
- Prototype-only：`prototype-clarification.md`、必要时 `progress-visualization.md`。适合正式实现前澄清状态机、数据模型、交互方向、信息架构或文档结构；原型结论未吸收前不能声称生产或正式文档完成。
- Optimization-only：`recursive-optimization.md` 或 `plain-optimization.md`，再配合 `real-testing.md` 和 `stop-conditions.md`。适合性能、可维护性、类型、命名、结构和文档清晰度优化；必须保持外部行为或原始含义不变。
- State / sub-agent 校验 / session / validate-state：`natural-language-routing.md`、`state-schema.md`、`state.schema.json`、`phase-gates.md`、`iteration-policy.md`、`delivery-template.md`、`sub-agent-concurrency.md`。适合 `--list`、`--switch`、`--resume`、`--validate-state`、恢复一致性检查、交付前 strict 门禁和 session 状态审计。
- Dispatch / sub-agent：`natural-language-routing.md`、`sub-agent-concurrency.md`、`state-schema.md`、`final-delivery.md`。适合父 Agent 将探索、验证、实现或写作子任务派发给 Codex、Claude、Gemini、Kimi、Cursor 等 worker；父 Agent 仍负责 Quality Gate 和最终合并。

### 组合模式

- Quick + Autopilot：用于目标短但需要自动推进的小任务，例如修复一个 CLI 文案错误、补一段文档、更新示例或改写一节指南。读取 Quick 组合后追加 `stop-conditions.md` 和 `final-delivery.md`；若涉及多文件或状态持久化，再读 `state-schema.md`。
- Strict + Autopilot + Requirement Coverage Matrix：用于“根据 PRD/issue/长文档全部实现”或“根据提纲写完整文档”。先用 `requirement-to-implementation.md` 逐条提取需求，再用 `feedback-loop.md` 和 `real-testing.md` 建立代码或非代码验证证据，最后用 `two-axis-review.md` 做交付前复核。
- Strict + Verify-only：用于验收已有实现、已有文档或已有报告是否满足原始清单。读取 `two-axis-review.md` 区分规范符合度和需求符合度；只在用户明确允许修复时才转入实现模式。
- Diagnose + Autopilot：用于持续失败信号，例如测试一直失败、构建不稳定、文档生成链路失败、链接校验反复失败或写作输出持续偏离提纲。先建立可重复 feedback loop，再有界修复。
- Plan-only + Strict：用于大任务前的只读设计阶段，例如先规划模块改造、文档重构、白皮书结构、PRD 拆解或迁移路线。Plan-only 阶段不得修改文件；用户确认计划后再启动 Strict 或 Quick。
- Prototype-only + Strict：用于先验证方案再正式吸收，例如 UI 原型、状态机原型、文档信息架构原型、报告章节结构样稿。原型文件必须有清理或吸收计划；正式交付必须回到 Strict/Quick 并重新验证。
- Optimization-only + Verify-only：用于保持行为或含义不变的优化审查，例如代码重构、文档去重、术语统一、章节顺序调整、发布说明压缩。先建立 baseline，再验证外部行为、原始事实和核心含义没有回归。
- Dispatch + Strict/Autopilot：用于任务可拆分且文件 ownership 清晰的长任务，例如并行探索模块、并行抽取 PRD 需求、并行校验文档链接或让 worker 处理单个 REQ。必须读取 `sub-agent-concurrency.md`，父 Agent 统一审查和合并。
- State validate + Resume：用于恢复历史 session、切换任务或交付前审计。先运行或执行等价的 `validate-state` 检查；若 state、current 指针、diff 或最近验证不一致，必须进入 reconcile，而不是继续旧假设。交付前必须读取 `phase-gates.md`、`iteration-policy.md` 和 `delivery-template.md`，strict 校验失败时进入 `postAgentValidationGate.nextAction=context_reset_and_repair`。
- 写作 / 文档生成 + Verify-only：用于文章、指南、PRD、报告、教程、Runbook、README 或发布说明。将提纲、事实约束、目标读者、语气、格式和来源作为 Requirement Coverage Matrix；验证方式包括事实核对、结构覆盖、链接检查、术语一致性和样例可运行性。
- 写作 / 文档生成 + Autopilot：用于“按大纲完整写完”“持续改到满足清单”“迭代 20 次以内优化文档”。每轮必须围绕一个最小写作目标或验证失败信号推进，例如补缺章节、消除矛盾、压缩重复、增强示例、统一术语或修复格式；不得为了消耗轮次做无意义改写。
- 研究 / 调研 + Plan-only + Verify-only：用于技术选型、方案比较、竞品梳理或事实密集型报告。先规划问题和证据口径，再做只读验证；需要最新外部事实时必须使用可用网络或标记 `not_verified`。
- 任务后 Skill Capture：交付、提前停止或阶段性验收前，按 `final-delivery.md` 和 `state-schema.md` 更新 `Skill Capture / 技能沉淀`，将高价值经验写入 `.agents/skills`，并维护 `.agents/skills/index.md`；没有高价值内容时记录 `skipped_no_high_value`。
