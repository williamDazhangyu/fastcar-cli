# State Schema

本文件冻结 session-only 状态结构，作为 Agent 状态维护、CLI 生成状态和 `fastcar-cli auto-iterate --validate-state` 的校验基线。

状态文件路径固定为 `.agent-state/auto-iterate/<session>/state.json`。`state.json` 是机器权威状态源；`.agent-state/auto-iterate/<session>/state.md` 是由 CLI / Agent 从 JSON 渲染出的只读人类视图，必须标注 `GENERATED FILE, DO NOT EDIT`。旧版 `.agent-state/auto-iterate-coding.md` 不属于当前 schema。

## 权威文件

- `state.json`：唯一可编辑状态源，包含 `schemaVersion`、task、session、mode、budgets、currentState、watchdog、requirements、decisions、validation、cleanup 等结构化字段。
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
| 10 | `## Watchdog` | 必填；每轮 light check，phase/恢复/交付前 full check | Agent |
| 11 | `## Requirement Coverage Matrix` | 必填；多需求任务必须拆成 REQ 条目 | Agent |
| 12 | `## Definition of Done` | 必填；从 RCM 派生交付门禁摘要，不独立重复评估 | Agent |
| 13 | `## Decisions` | 必填；记录已确认的架构、产品、接口和用户限制 | Agent |
| 14 | `## Hypotheses` | 必填；诊断、修复和优化时维护假设状态 | Agent |
| 15 | `## Validation` | 必填；记录通过、失败、未运行和不可用能力导致的未验证项 | Agent |
| 16 | `## Temporary Artifacts / Cleanup` | 必填；记录 debug、harness、原型和清理状态 | Agent |
| 17 | `## Context Handoff Summary` | 必填；上下文压缩、长任务恢复和交接时更新 | Agent |
| 18 | `## Resume Prompt` | 必填；说明恢复时的最小执行规则 | CLI 初始化，Agent 可补充 |

## 一致性规则

- Autopilot、medium/large、多轮自动迭代和用户指定 session 的任务必须存在独立 session 目录；缺少 `state.json`、`state.md`、`start-prompt.md` 或 current 指针时，状态持久化只能标记为 `degraded`，不得按完整自动迭代完成交付。
- `state.json.schemaVersion` 必须匹配当前 CLI 支持版本；不匹配时必须先迁移或停止恢复。
- `state.json` 中的枚举、数字、布尔、数组和对象字段必须满足强类型校验；不得把 Markdown 中的自由文本作为机器权威状态。
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

- `state.json` 强约束：schemaVersion、必填对象、字段类型、枚举值、预算计数、RCM 状态、Watchdog 交付可验证性、session 路径和 current 指针。
- session 基线一致性：18 个章节、session 路径、`start-prompt.md`、`auto-iterate-current.json`、预算计数、最少轮次、Watchdog、RCM/DoD、Validation 和临时产物清理状态。
- sub-agent 协议一致性：`Sub-Agent Dispatch`、`Decisions` 中的并发确认、coder 文件 ownership、active/history 计数、merge 状态和 RCM 推进风险。

校验结果中的 `ERROR` 表示不应继续恢复、dispatch 或按成功交付输出；`WARN` 表示有参考风险，通常应在下一轮迭代、dispatch 或交付前同步状态。

交付门禁的交叉检查包括：

- current 指针中的 `stateFile` / `promptFile` 必须与 `## Session / 会话` 中记录一致，且 `promptFile` 必须真实存在。
- RCM 仍有开放项时，`Watchdog.delivery_verifiability` 和 DoD 不得标记为 `verifiable`。
- RCM 出现 `passed` 时，`Watchdog.last_validation_result` 和 `Validation.已通过验证` 应能提供最近验证证据。
