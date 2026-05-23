# State Schema

本文件冻结 session-only 状态结构，作为 Agent 状态维护、CLI 生成状态和 `fastcar-cli auto-iterate --validate-state` 的校验基线。

状态文件路径固定为 `.agent-state/auto-iterate/<session>/state.json`。`state.json` 是机器权威状态源；`.agent-state/auto-iterate/<session>/state.md` 是由 CLI / Agent 从 JSON 渲染出的只读人类视图，必须标注 `GENERATED FILE, DO NOT EDIT`。旧版 `.agent-state/auto-iterate-coding.md` 不属于当前 schema。

## 权威文件

- `state.json`：唯一可编辑状态源，包含 `schemaVersion`、task、session、mode、budgets、currentState、watchdog、phaseGate、implementationContract、baseline、iterationPolicy、taskProfile、decisionRequest、requirements、decisions、validation、postChange、deltaAssessment、diffBudget、cleanup、styleConsolidation、contextResetReview、deliveryEvidence、skillCapture、postAgentValidationGate 等结构化字段。
- `state.schema.json`：独立 JSON Schema artifact，用于文档、测试和第三方 Agent 对齐机器状态字段；CLI 仍以运行时代码校验作为最终门禁。
- `state.md`：生成视图，用于人类阅读和 legacy 兼容；不得作为机器恢复、交付门禁或并发调度的唯一依据。
- `auto-iterate-current.json`：当前 session 指针，必须记录 `stateJsonFile`、`stateFile`、`promptFile` 和 `session`。

## state.md 必需章节

| 顺序 | 章节 | 要求 | 维护者 |
| --- | --- | --- | --- |
| 1 | `## At-a-Glance / 人类摘要` | 必填；每次状态更新同步刷新 | CLI 初始化，Agent 更新 |
| 2 | `## Task` | 必填；记录目标、成功标准、非目标、范围和兼容约束 | CLI 初始化，Agent 补充 |
| 3 | `## Session / 会话` | 必填；记录 session、状态文件、启动提示、current 指针和恢复优先级 | CLI 初始化 |
| 4 | `## Mode / 模式` | 必填；记录模式、Autopilot、推断权限和修改权限 | CLI 初始化 |
| 5 | `## Agent Capability Summary` | 必填；启动后由 Agent 探测并更新 | Agent |
| 6 | `## Sub-Agent Dispatch / 子 Agent 调度` | 必填；记录子 Agent 并发状态、active/history 列表、计数和预算参数；每轮 dispatch 和 merge 后更新 | CLI 初始化，Agent 更新 |
| 7 | `## Budgets` | 必填；记录预算、已用轮次、剩余轮次和预算追加记录 | CLI 初始化，Agent 更新 |
| 8 | `## Recovery / Reconcile` | 必填；恢复 session 前必须更新 | Agent |
| 9 | `## Current State` | 必填；每轮实现、优化、压缩、停止和交付前更新 | Agent |
| 10 | `## Phase Gate / 阶段门禁` | 必填；从 state.json.phaseGate 渲染，记录阶段、canProceed 和阻断原因 | CLI 初始化，Agent 更新 |
| 11 | `## Implementation Contract / 实现契约` | 必填；从 state.json.implementationContract 渲染，编码前必须 approved 或 blocked | CLI 初始化，Agent 更新 |
| 12 | `## Baseline / 修改前基线` | 必填；从 state.json.baseline 渲染，coding 前必须可判定 | CLI 初始化，Agent 更新 |
| 13 | `## Iteration Policy / 迭代策略` | 必填；从 state.json.iterationPolicy 渲染，记录单轮目标、预算、停止和回滚 | CLI 初始化，Agent 更新 |
| 14 | `## Task Profile / 任务画像` | 必填；从 state.json.taskProfile 渲染，记录任务类型、复杂度、风险和用户确认需求 | CLI 初始化，Agent 更新 |
| 15 | `## Decision Request / 用户确认请求` | 必填；从 state.json.decisionRequest 渲染，高复杂度或高风险任务必须 approved 或 blocked | CLI 初始化，Agent 更新 |
| 16 | `## Watchdog` | 必填；每轮 light check，phase/恢复/交付前 full check | Agent |
| 17 | `## Requirement Coverage Matrix` | 必填；多需求任务必须拆成 REQ 条目 | Agent |
| 18 | `## Definition of Done` | 必填；从 RCM 派生交付门禁摘要，不独立重复评估 | Agent |
| 19 | `## Decisions` | 必填；记录已确认的架构、产品、接口和用户限制 | Agent |
| 20 | `## Hypotheses` | 必填；诊断、修复和优化时维护假设状态 | Agent |
| 21 | `## Validation` | 必填；记录通过、失败、未运行和不可用能力导致的未验证项 | Agent |
| 22 | `## Post-Change Validation / 修改后验证` | 必填；从 state.json.postChange 渲染，记录修改后验证命令、结果和回归标记 | Agent |
| 23 | `## Delta Assessment / 差异评估` | 必填；从 state.json.deltaAssessment 渲染，比较 baseline 与 post-change 并给出保留/回退决策 | Agent |
| 24 | `## Diff Budget / 变更预算审计` | 必填；从 state.json.diffBudget 渲染，记录变更文件数、diff 行数、越界文件和高风险文件 | Agent |
| 25 | `## Temporary Artifacts / Cleanup` | 必填；记录 debug、harness、原型和清理状态 | Agent |
| 26 | `## Style Consolidation / 技巧风格整理` | 必填；从 state.json.styleConsolidation 渲染，记录实现需求后按本地和全局 skills 代码风格整理、验证和跳过原因 | Agent |
| 27 | `## Context Reset Review Gate / 上下文清空复核门禁` | 必填；从 state.json.contextResetReview 渲染，所有关键 REQ passed 后、Delivery Evidence ready 前执行清空上下文两轴复核 | Agent |
| 28 | `## Delivery Evidence / 交付证据` | 必填；从 state.json.deliveryEvidence 渲染，交付摘要的机器来源 | Agent |
| 29 | `## Skill Capture / 技能沉淀` | 必填；从 state.json.skillCapture 渲染，记录任务后高价值技能点沉淀、`.agents/skills/index.md` 更新和跳过原因 | Agent |
| 30 | `## Post-Agent Validation Gate / Agent 后置校验门禁` | 必填；从 state.json.postAgentValidationGate 渲染，记录 strict 校验和 repair cycle | Agent |
| 31 | `## Context Handoff Summary` | 必填；上下文压缩、长任务恢复和交接时更新 | Agent |
| 32 | `## Resume Prompt` | 必填；说明恢复时的最小执行规则 | CLI 初始化，Agent 可补充 |

## 一致性规则

- Autopilot、medium/large、多轮自动迭代和用户指定 session 的任务必须存在独立 session 目录；缺少 `state.json`、`state.md`、`start-prompt.md` 或 current 指针时，状态持久化只能标记为 `degraded`，不得按完整自动迭代完成交付。
- `state.json.schemaVersion` 必须匹配当前 CLI 支持版本；不匹配时必须先迁移或停止恢复。
- `state.json` 中的枚举、数字、布尔、数组和对象字段必须满足强类型校验；不得把 Markdown 中的自由文本作为机器权威状态。
- `task.successCriteria` 不能为空；成功标准缺失时不得进入交付门禁，也不得把“按目标推断”伪装成已确认验收标准。
- 写入 `state.json` 必须使用临时文件加原子 rename；写入后必须校验通过，再渲染 `state.md`。
- `auto-iterate-current.json.stateJsonFile` 必须存在，且指向 `.agent-state/auto-iterate/<session>/state.json`。
- `auto-iterate-current.json.stateFile` 必须存在，且指向 `.agent-state/auto-iterate/<session>/state.md`；`promptFile` 必须存在，且指向同一 session 的 `start-prompt.md`。
- `auto-iterate-current.json.session` 必须与 `state.json.session.session` 和 `state.md` 的 `## Session / 会话` 中的 session 一致。
- 交付前必须执行状态一致性检查：session 指针、state 文件、prompt 文件、迭代计数、最近验证命令、最近验证结果和 RCM/DoD 状态均一致；任一不一致时必须先进入 `reconcile`。
- `At-a-Glance` 的进度、需求计数、验证状态、看门狗状态和交付可验证性必须与 `Budgets`、`Requirement Coverage Matrix`、`Watchdog`、`Validation` 一致。
- `Definition of Done` 的成功标准状态必须引用 RCM 中对应关键 REQ 的状态和验证证据；RCM 与 DoD 不一致时，以 RCM 为准并重新派生 DoD。
- `total_cycles` 必须等于 `implementation_iterations_used + optimization_iterations_used`。
- `minimum_implementation_iterations` 只在用户明确说"最少/至少 N 轮"时启用；它是最小下限检查点，不得写入或等同于 `max_iterations` / `autopilot_max_iterations`。
- 若存在 `minimum_implementation_iterations`，交付前必须确认 `implementation_iterations_used >= minimum_implementation_iterations`；未达到下限只能因 blocked、unsafe、需要用户决策、真实验证不可用或无安全有效工作提前停止，并记录证据。
- 达到 `minimum_implementation_iterations` 后仍有 RCM 未通过项、Watchdog required_action、验证失败、清理项或有效优化空间时，必须继续按最大预算和停止条件推进，不得把下限当成停止线。
- 同时存在最小下限和最大预算时，必须满足 `minimum_implementation_iterations <= max_iterations`；若不满足，必须进入 `ask_user` 或预算追加流程。
- `remaining_implementation_iterations = 0` 时，恢复 session 后必须先请求用户追加预算，不得自动继续修改。
- `Watchdog.triggered = true` 时，必须先处理 `required_action`。
- `phaseGate` 必须包含固定阶段 `requirement`、`contract`、`baseline`、`coding`、`validation`、`cleanup`、`delivery`；`canProceed=false` 时必须记录 `blockingReasons`。
- `implementationContract` 是编码前契约；`contract` 阶段通过时，`implementationContract.status` 必须为 `approved` 且 `openQuestions` 必须为空。
- `baseline` 必须在 coding 前可判定，状态只能是 `passed`、`failed`、`skipped_with_reason` 或 `not_available`；结构化跳过必须记录原因，不得用 `unknown` 冒充验证。
- `iterationPolicy.maxGoalsPerIteration` 必须等于 1；连续失败达到阈值时不得继续自动编码。
- `taskProfile.complexity=large` 或 `taskProfile.risk=high` 时，必须要求用户确认；`taskProfile.needsUserConfirmation=true` 时，`decisionRequest.status` 必须为 `approved` 或 `blocked`。
- `postChange.regressionDetected=true` 或 `deltaAssessment.status=regression` 时，`deltaAssessment.decision` 不得为 `keep`，`iterationPolicy.lastDecision` 不得为 `continue`。
- `diffBudget.changedFiles` / `diffBudget.diffLines` 不得超过 `iterationPolicy.maxChangedFiles` / `iterationPolicy.maxDiffLines`；`diffBudget.status=over_budget` 或存在 `outOfScopeFiles` / `highRiskFiles` 时，`iterationPolicy.lastDecision` 不得为 `continue`。
- `deliveryEvidence.status=ready / delivered` 时，关键 RCM 不得存在开放项，`validation.finalVerifiability` 不得为 `unknown`，且 `cleanup.status` 必须为 `completed`。
- 实现需求的模式（strict、quick、diagnose、prototype）中，功能实现并通过验证后、`deliveryEvidence.status=ready / delivered` 前，必须完成 `styleConsolidation`：读取本项目 `.agents/skills` 和全局 skills 中相关代码风格、FastCar API 约束、TypeScript 规范、反模式和验证建议，按这些规则整理本次修改范围内代码，并重新运行相关验证。
- `deliveryEvidence.status=ready / delivered` 且当前模式为实现需求模式时，`styleConsolidation.status` 不得为 `pending`；若整理不适用，必须标记 `not_applicable` 并记录 `skippedReasons`；若无法读取或写入 skills，必须标记 `not_available / blocked` 并说明原因。
- `styleConsolidation.status=completed` 时，必须记录 `localSkillsReviewed` 或 `globalSkillsReviewed`、`appliedRules`、`changedFiles` 和整理后的 `verificationSummary`，不得用无关格式化、大范围重构或削弱测试代替风格整理。
- 所有关键 REQ 均为 `passed` 后、`deliveryEvidence.status=ready / delivered` 前，必须完成 `contextResetReview`：清空对话实现细节，只依据 `state.json`、原始需求、当前代码/diff、真实验证结果、项目规范和相关 skills 执行 Standards / Spec 两轴复核。
- `deliveryEvidence.status=ready / delivered` 时，`contextResetReview.status` 必须为 `passed`，或用户明确接受的 `user_accepted_limited`；`pending / failed / blocked / not_available` 均不得作为交付候选通过。
- `contextResetReview.status=passed` 时，`reviewCyclesUsed >= 1`、`decision=pass`，且 `standardsFindings`、`specFindings`、`reopenedRequirements` 必须为空。
- `contextResetReview.status=failed` 时，必须记录 `reopenedRequirements`，新增或重开对应 REQ，回到实现循环，不得交付。
- `skillCapture.root` 必须为 `.agents/skills`，`skillCapture.indexFile` 必须为 `.agents/skills/index.md`；每次交付、提前停止或阶段性验收后必须更新技能沉淀状态。
- 技能沉淀只沉淀可复用、可验证、跨任务有价值的技能点；不得记录密钥、客户数据、一次性日志、大段源码或只对本次任务有效的流水账。
- `deliveryEvidence.status=ready / delivered` 时，`skillCapture.status` 不得为 `pending`；如果没有高价值技能点，必须标记 `skipped_no_high_value` 并记录 `skippedReasons`，不得静默跳过。
- `skillCapture.status=captured` 时，`capturedFiles` 必须列出本次写入或更新的 `.agents/skills` 文件，且 `.agents/skills/index.md` 必须同步维护为检索入口。
- `postAgentValidationGate` 必须启用交付前 CLI 门禁，推荐命令为 `fastcar-cli auto-iterate --finalize <session> --yes`；旧格式 `--validate-state <session> --strict-state` 仅作为兼容路径。失败时 `nextAction` 必须为 `context_reset_and_repair` 或 `stop`。
- 所有关键 REQ 均为 `passed` 且 `remaining_implementation_iterations > 0` 时，`Watchdog.fresh_eyes_required` 必须为 `true`，`Watchdog.triggered` 必须为 `true`，且 `required_action` 必须为 `context_compress_and_review`；Agent 不得在此时跳过上下文压缩直接交付。
- 所有关键 REQ 均为 `passed` 且 fresh-eyes 已处理后，必须完成 `validation_hardening` 门禁：`validation_hardening_iterations_used >= minimum_validation_hardening_iterations`，并覆盖 `boundary / negative / regression`；无法覆盖时必须把 `validation_hardening_status` 标记为 `blocked / not_available / user_accepted_limited` 并记录原因。
- `delivery_verifiability = not_verifiable / unknown` 时，不允许按成功交付输出。
- `Temporary Artifacts / Cleanup` 未完成且没有用户确认保留理由时，不允许按成功交付输出。
- `Sub-Agent Dispatch` 中 `active_sub_agents` 的 `files_assigned` 在不同子 Agent 间不得重叠（coder 类型必须互斥；explore 类型允许重叠）。
- 每轮 merge 后，`active_sub_agents` 中 `merge_status=merged` 或 `status=failed` 的条目必须移入 `sub_agent_history`，下一轮 dispatch 前 `active_sub_agents` 必须为空。
- 并行实现的 N 个 coder 子 Agent 完成后，`implementation_iterations_used` 只增加 1；explore 和 verify 子 Agent 不增加迭代计数。
- `failed_count >= max_failed_sub_agents` 时，后续实现轮次不得再 dispatch 新的 coder 子 Agent。
- 恢复 session 时，`active_sub_agents` 中 `merge_status=pending` 的条目必须在进入下一轮前完成 merge 或标记 skipped；完成后移入 `sub_agent_history`。

## validate-state 校验基线

`fastcar-cli auto-iterate --validate-state [session|state.md|state.json]` 当前执行只读校验，不修改 state，也不创建 session。追加 `--strict-state` 时，缺失 `state.json`、强类型不匹配、枚举非法、预算关系错误或 warning 均会作为错误阻止恢复。

兼容旧 session：`fastcar-cli auto-iterate --resume <session>` 在恢复门禁中允许缺少 `state.json` 的旧 `state.md`-only session 降级恢复，并必须输出 degraded 提示；但显式执行 `--validate-state --strict-state` 时仍应把缺失 `state.json` 报为错误，方便迁移前审计。

它校验三层内容：

- `state.json` 强约束：schemaVersion、必填对象、字段类型、枚举值、预算计数、任务成功标准、RCM 状态、Watchdog 交付可验证性、session 路径和 current 指针。
- Phase Gate 强约束：固定阶段完整、Implementation Contract 完整、baseline 可判定、单轮单目标预算、Task Profile、Decision Request、Post-Change Validation、Delta Assessment、Diff Budget、Style Consolidation、Delivery Evidence 和 Post-Agent Validation Gate 一致。
- session 基线一致性：32 个章节、session 路径、`start-prompt.md`、`auto-iterate-current.json`、预算计数、最少轮次、Phase Gate、Implementation Contract、Baseline、Iteration Policy、Task Profile、Decision Request、Watchdog、RCM/DoD、Validation、Post-Change Validation、Delta Assessment、Diff Budget、临时产物清理、Style Consolidation、Context Reset Review Gate、Delivery Evidence、Skill Capture 和 Post-Agent Validation Gate。
- sub-agent 协议一致性：`Sub-Agent Dispatch`、`Decisions` 中的并发确认、coder 文件 ownership、active/history 计数、merge 状态和 RCM 推进风险。

校验结果中的 `ERROR` 表示不应继续恢复、dispatch 或按成功交付输出；`WARN` 表示有参考风险，通常应在下一轮迭代、dispatch 或交付前同步状态。

交付门禁的交叉检查包括：

- current 指针中的 `stateFile` / `promptFile` 必须与 `## Session / 会话` 中记录一致，且 `promptFile` 必须真实存在。
- RCM 仍有开放项时，`Watchdog.delivery_verifiability` 和 DoD 不得标记为 `verifiable`。
- RCM 出现 `passed` 时，`Watchdog.last_validation_result` 和 `Validation.已通过验证` 应能提供最近验证证据。
- 交付候选必须先通过 `Context Reset Review Gate`；若复核发现 Standards 或 Spec 问题，必须进入 `context_reset_and_repair`，新增或重开 REQ 后再次实现、验证和复核。
- `postAgentValidationGate.lastResult=failed` 时，Agent 不得交付；必须生成 Context Handoff Summary，重新读取 `state.json` 和当前代码，针对首个阻断项修补后再次运行 strict 校验。`gate_repair_cycles` 不计入普通实现迭代；若发现功能缺口，则必须回到实现迭代预算。
