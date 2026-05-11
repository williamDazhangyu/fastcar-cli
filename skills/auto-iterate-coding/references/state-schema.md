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

- `At-a-Glance` 的进度、需求计数、验证状态、看门狗状态和交付可验证性必须与 `Budgets`、`Requirement Coverage Matrix`、`Watchdog`、`Validation` 一致。
- `Definition of Done` 的成功标准状态必须引用 RCM 中对应关键 REQ 的状态和验证证据；RCM 与 DoD 不一致时，以 RCM 为准并重新派生 DoD。
- `total_cycles` 必须等于 `implementation_iterations_used + optimization_iterations_used`。
- `remaining_implementation_iterations = 0` 时，恢复 session 后必须先请求用户追加预算，不得自动继续修改。
- `Watchdog.triggered = true` 时，必须先处理 `required_action`。
- `delivery_verifiability = not_verifiable / unknown` 时，不允许按成功交付输出。
- `Temporary Artifacts / Cleanup` 未完成且没有用户确认保留理由时，不允许按成功交付输出。

