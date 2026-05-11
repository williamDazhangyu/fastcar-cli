# Auto Iterate Coding State Template

将本模板复制为项目内 `.agent-state/auto-iterate/<session>/state.md`，用于 Autopilot 或复杂任务跨会话恢复。

不要在状态文件中写入密钥、token、密码、连接串、大段日志或完整源码。

```text
# Auto Iterate Coding State

## At-a-Glance / 人类摘要
tl;dr：整体 in_progress / blocked / passed；模式：
进度：implementation current / max；optimization current / max
需求：passed / not_verified / blocked / pending
验证：最近命令；最近结果
看门狗：clear / triggered；required_action：
交付可验证性：verifiable / partially_verifiable / not_verifiable / unknown
需要用户决策：
下一步：

## Task
用户目标：
成功标准：
非目标：
允许修改范围：
兼容性约束：

## Session / 会话
session：
状态文件：
启动提示：
current 指针：
恢复优先级：当前消息显式 session > session state > current 指针 > 对话推断
语言规则：

## Mode / 模式
模式：
模式说明：
Autopilot：true / false
允许 Agent 推断流程清单：true / false
允许修改文件：true / false
模式执行规则：

## Agent Capability Summary
读文件/搜索代码：available / unavailable / unknown
修改文件：available / unavailable / unknown
运行命令：available / unavailable / unknown
真实测试：available / unavailable / unknown
状态持久化：available / unavailable / unknown
子 Agent/并行：available / unavailable / unknown
  并行探索（explore）：available / unavailable
  后台任务（background）：available / unavailable
  并行实现（coder）：available / unavailable
网络/外部服务：available / unavailable / user-confirmed-required
数据库/密钥：available / unavailable / user-confirmed-required
git 状态/diff：available / unavailable / unknown
媒体/文档处理：available / unavailable / not_needed
降级策略：
阻塞能力：

## Sub-Agent Dispatch / 子 Agent 调度
enabled：true / false
current_phase：explore / req_extract / verify / implement / idle
active_sub_agents：无
active_sub_agents_item_template：
  - id：<agent_id>
    type：explore / coder / background
    task：
    files_assigned：
    status：planned / running / completed / failed / blocked
    failure_reason：
    started_at：
    completed_at：
    result_summary：
    merge_status：pending / merged / skipped
sub_agent_history：无
sub_agent_history_item_template：
  - round：1
    agent_id：<agent_id>
    type：explore / coder / background
    task_summary：
    merge_result：success / partial / skipped
    files_changed：
    validation_result：
    failure_reason：
dispatched_count：
completed_count：
failed_count：
last_dispatch_round：
last_merge_result：success / partial / failed
max_sub_agent_rounds：3
sub_agent_timeout_seconds：300
max_failed_sub_agents：2
token_budget_hint：
concurrency_limit：3

## Budgets
max_iterations：
autopilot_max_iterations：
minimum_implementation_iterations：
minimum_iteration_policy：最少/至少 N 轮是下限检查点，不是上限或仅执行 N 轮；达到下限后仍按 RCM、Watchdog、验证结果和剩余预算继续或停止
implementation_iterations_used：
optimization_iterations_used：
total_cycles：
remaining_implementation_iterations：
remaining_optimization_iterations：
预算追加记录：
计数口径：实现迭代 = 修改 + 验证/记录 + 状态更新的闭环；只读探索、reconcile、上下文压缩和纯验证不计入实现迭代

## Recovery / Reconcile
当前分支：
git 状态/diff 摘要：
状态文件与当前代码是否一致：yes / no / unknown
上次停止后外部修改：none / detected / unknown
最近验证是否已重新运行：yes / no / unavailable
reconcile 结论：continue / update_state_first / blocked

## Current State
当前阶段：
任务规模：
Autopilot：
完整任务清单：
已完成任务：
当前任务：
剩余任务：
整体完成状态：in_progress / blocked / passed
最近修改：
关键文件：
最近验证命令：
最近验证结果：
首个关键失败信号：
未验证项：
需要用户决策：
反馈闭环：
架构摩擦：none / suspected / confirmed
原型状态：not_needed / proposed / active / absorbed / deleted / blocked

## Watchdog
enabled：true / false
check_interval：每轮迭代前后、上下文压缩后、恢复后、最终交付前
light_check：每轮必做，检查 no_progress_count / last_validation_result / state_drift / triggered
full_check：每个 phase、每 3 轮、恢复后和交付前执行完整字段检查
last_progress_iteration：
last_progress_summary：
last_validation_iteration：
last_validation_command：
last_validation_result：
no_progress_count：current / max_no_progress_iterations
unverified_iteration_count：
state_drift：none / suspected / confirmed
delivery_verifiability：verifiable / partially_verifiable / not_verifiable / unknown
triggered：false / true
trigger_reason：
required_action：continue / narrow_scope / run_validation / reconcile / ask_user / stop

## Requirement Coverage Matrix
REQ-001：
原文摘要：
类型：功能 / 兼容性 / 验证 / 性能 / 安全 / 文档 / 约束
状态：pending / implemented / passed / blocked / not_verified
相关文件：
验证证据：
阻塞原因：
下一步：

REQ-002：
原文摘要：
类型：
状态：pending
相关文件：
验证证据：
阻塞原因：
下一步：

## Definition of Done
RCM 状态摘要：REQ 总数；passed / not_verified / blocked / pending / implemented
派生规则：成功标准状态直接引用 Requirement Coverage Matrix 中对应关键 REQ 的状态和验证证据，不独立重复评估
成功标准 1：passed / not_verified / blocked
成功标准 2：passed / not_verified / blocked
成功标准 3：passed / not_verified / blocked
真实验证：
沙箱验证：
未验证项：
Requirement Coverage Matrix 状态：
交付可验证性：verifiable / partially_verifiable / not_verifiable / unknown
看门狗状态：clear / triggered
剩余风险：

## Decisions
已确认的架构决策：
已确认的产品行为：
已确认的接口兼容性：
用户提供的限制：
并发决策：
  parallel_write_allowed：false / true
  parallel_write_confirmation：
  coder_file_ownership：
  fallback_strategy：串行执行 / ask_user / stop

## Hypotheses
已排除假设：
排序候选假设：
当前主要假设：
下一步最小动作：

## Validation
已通过验证：
失败验证：
未运行验证及原因：
沙箱验证：
不可用能力导致的未验证项：
最终交付可验证性：

## Temporary Artifacts / Cleanup
临时 debug 前缀：
一次性 harness：
原型文件或路由：
待删除 artifacts：
清理状态：pending / completed / blocked

## Context Handoff Summary
目标：
成功标准：
当前状态：
已完成：
完整任务清单完成状态：
剩余任务：
当前失败：
已验证命令：
已排除假设：
当前假设：
下一步：
禁止事项：
剩余预算：

## Resume Prompt
下次继续时，请使用 auto-iterate-coding skill。
如果存在本文件，请先读取它作为任务恢复状态。
继续时不要依赖历史对话，只依赖本状态文件、当前代码和真实验证结果。
从“下一步最小动作”继续，并在每轮迭代后更新本文件。
如果 Requirement Coverage Matrix 中仍存在 pending / implemented / not_verified 的关键需求，不要按成功交付输出。
如果 Watchdog triggered 为 true，先处理 required_action；交付可验证性为 not_verifiable 或 unknown 时，不要按成功交付输出。
如果 Temporary Artifacts / Cleanup 中仍有未清理的 debug 日志、harness、原型路由或一次性文件，不要按成功交付输出，除非用户明确要求保留并已标记原因。
```
