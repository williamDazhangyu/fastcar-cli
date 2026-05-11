# State Schema

本文件冻结 session-only `state.md` 的顶层章节，作为 Agent 手写状态、CLI 生成状态和未来 `fastcar-cli auto-iterate --validate-state` 的校验基线。

状态文件路径固定为 `.agent-state/auto-iterate/<session>/state.md`。旧版 `.agent-state/auto-iterate-coding.md` 不属于当前 schema。

## 必需章节

| 顺序 | 章节 | 要求 | 维护者 |
| --- | --- | --- | --- |
| 1 | `## At-a-Glance / 人类摘要` | 必填；每次状态更新同步刷新 | CLI 初始化，Agent 更新 |
| 2 | `## Task` | 必填；记录目标、成功标准、非目标、范围和兼容约束 | CLI 初始化，Agent 补充 |
| 3 | `## Session / 会话` | 必填；记录 session、状态文件、启动提示、current 指针和恢复优先级 | CLI 初始化 |
| 4 | `## Mode / 模式` | 必填；记录模式、Autopilot、推断权限和修改权限 | CLI 初始化 |
| 5 | `## Agent Capability Summary` | 必填；启动后由 Agent 探测并更新 | Agent |
| 6 | `## Budgets` | 必填；记录预算、已用轮次、剩余轮次和预算追加记录 | CLI 初始化，Agent 更新 |
| 7 | `## Recovery / Reconcile` | 必填；恢复 session 前必须更新 | Agent |
| 8 | `## Current State` | 必填；每轮实现、优化、压缩、停止和交付前更新 | Agent |
| 9 | `## Watchdog` | 必填；每轮 light check，phase/恢复/交付前 full check | Agent |
| 10 | `## Requirement Coverage Matrix` | 必填；多需求任务必须拆成 REQ 条目 | Agent |
| 11 | `## Definition of Done` | 必填；从 RCM 派生交付门禁摘要，不独立重复评估 | Agent |
| 12 | `## Decisions` | 必填；记录已确认的架构、产品、接口和用户限制 | Agent |
| 13 | `## Hypotheses` | 必填；诊断、修复和优化时维护假设状态 | Agent |
| 14 | `## Validation` | 必填；记录通过、失败、未运行和不可用能力导致的未验证项 | Agent |
| 15 | `## Temporary Artifacts / Cleanup` | 必填；记录 debug、harness、原型和清理状态 | Agent |
| 16 | `## Context Handoff Summary` | 必填；上下文压缩、长任务恢复和交接时更新 | Agent |
| 17 | `## Resume Prompt` | 必填；说明恢复时的最小执行规则 | CLI 初始化，Agent 可补充 |

## 一致性规则

- Autopilot、medium/large、多轮自动迭代和用户指定 session 的任务必须存在独立 session 目录；缺少 `state.md`、`start-prompt.md` 或 current 指针时，状态持久化只能标记为 `degraded`，不得按完整自动迭代完成交付。
- `auto-iterate-current.json.stateFile` 必须存在，且指向 `.agent-state/auto-iterate/<session>/state.md`；`promptFile` 必须存在，且指向同一 session 的 `start-prompt.md`。
- `auto-iterate-current.json.session` 必须与 `state.md` 的 `## Session / 会话` 中的 session 一致。
- 交付前必须执行状态一致性检查：session 指针、state 文件、prompt 文件、迭代计数、最近验证命令、最近验证结果和 RCM/DoD 状态均一致；任一不一致时必须先进入 `reconcile`。
- `At-a-Glance` 的进度、需求计数、验证状态、看门狗状态和交付可验证性必须与 `Budgets`、`Requirement Coverage Matrix`、`Watchdog`、`Validation` 一致。
- `Definition of Done` 的成功标准状态必须引用 RCM 中对应关键 REQ 的状态和验证证据；RCM 与 DoD 不一致时，以 RCM 为准并重新派生 DoD。
- `total_cycles` 必须等于 `implementation_iterations_used + optimization_iterations_used`。
- `minimum_implementation_iterations` 只在用户明确说“最少/至少 N 轮”时启用；它是最小下限检查点，不得写入或等同于 `max_iterations` / `autopilot_max_iterations`。
- 若存在 `minimum_implementation_iterations`，交付前必须确认 `implementation_iterations_used >= minimum_implementation_iterations`；未达到下限只能因 blocked、unsafe、需要用户决策、真实验证不可用或无安全有效工作提前停止，并记录证据。
- 达到 `minimum_implementation_iterations` 后仍有 RCM 未通过项、Watchdog required_action、验证失败、清理项或有效优化空间时，必须继续按最大预算和停止条件推进，不得把下限当成停止线。
- 同时存在最小下限和最大预算时，必须满足 `minimum_implementation_iterations <= max_iterations`；若不满足，必须进入 `ask_user` 或预算追加流程。
- `remaining_implementation_iterations = 0` 时，恢复 session 后必须先请求用户追加预算，不得自动继续修改。
- `Watchdog.triggered = true` 时，必须先处理 `required_action`。
- `delivery_verifiability = not_verifiable / unknown` 时，不允许按成功交付输出。
- `Temporary Artifacts / Cleanup` 未完成且没有用户确认保留理由时，不允许按成功交付输出。
