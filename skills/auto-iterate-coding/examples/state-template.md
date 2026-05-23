# Auto Iterate Coding State Template

本模板用于渲染项目内 `.agent-state/auto-iterate/<session>/state.md`，用于 Autopilot 或复杂任务跨会话恢复的人类阅读视图。

机器权威状态必须保存在 `.agent-state/auto-iterate/<session>/state.json`。`state.md` 必须由 `state.json` 渲染生成，并在顶部标注 `GENERATED FILE, DO NOT EDIT`；Agent 或 CLI 更新状态时应先写入并校验 `state.json`，再刷新 `state.md`。

不要在状态文件中写入密钥、token、密码、连接串、大段日志或完整源码。

```text
# Auto Iterate Coding State

> GENERATED FILE, DO NOT EDIT. 机器权威状态为 .agent-state/auto-iterate/<session>/state.json；本 Markdown 仅用于人类阅读和 legacy 兼容。

## At-a-Glance / 人类摘要
tl;dr：整体 in_progress / blocked / passed；模式：
进度：implementation current / max；optimization current / max
需求：passed / not_verified / blocked / pending
验证：最近命令；最近结果
看门狗：clear / triggered；required_action：；fresh_eyes：false / true
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
validation_hardening_iterations_used：
minimum_validation_hardening_iterations：
optimization_iterations_used：
total_cycles：
remaining_implementation_iterations：
remaining_validation_hardening_iterations：
remaining_optimization_iterations：
预算追加记录：
计数口径：实现迭代 = 修改 + 验证/记录 + 状态更新的闭环；验证加固迭代 = 所有关键 REQ passed 后主动寻找遗漏的边界/反例/回归验证；只读探索、reconcile、上下文压缩和纯重复验证不计入实现迭代

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

## Phase Gate / 阶段门禁
current_phase：requirement / contract / baseline / coding / validation / cleanup / delivery
can_proceed：true / false
blocking_reasons：
phase_order：requirement -> contract -> baseline -> coding -> validation -> cleanup -> delivery
gates：
  - phase：requirement
    status：pending / passed / blocked / skipped_with_reason
    entry：
    exit：
    blocking：

## Implementation Contract / 实现契约
status：pending / approved / blocked
goal：
understanding：
scope：
non_goals：
success_criteria：
validation_plan：
risk_points：
open_questions：
user_confirmation_required：true / false

## Baseline / 修改前基线
status：pending / passed / failed / skipped_with_reason / not_available
command：
result：
reason：
failure_category：none / existing_failure / new_failure / environment_failure / test_unavailable / unknown
allows_coding：true / false

## Iteration Policy / 迭代策略
current_iteration_goal：
max_goals_per_iteration：1
max_changed_files：
max_diff_lines：
max_no_progress_iterations：
consecutive_failure_count：
allowed_files：
stop_conditions：
rollback_plan：
last_decision：continue / stop / ask_user / replan / revert

## Task Profile / 任务画像
type：feature / bugfix / docs / refactor / verify / optimize / prototype / unknown
complexity：small / medium / large
risk：low / medium / high
needs_user_confirmation：true / false
reasons：

## Decision Request / 用户确认请求
status：not_needed / pending / approved / rejected / blocked
topic：
background：
options：
recommended：
impact：
triggers：

## Watchdog
enabled：true / false
check_interval：每轮迭代前后、上下文压缩后、恢复后、最终交付前
light_check：每轮必做，检查 no_progress_count / last_validation_result / state_drift / triggered / fresh_eyes_required / new_test_count
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
required_action：continue / narrow_scope / run_validation / reconcile / ask_user / stop / context_compress_and_review
fresh_eyes_required：false / true
fresh_eyes_status：本轮复查发现 / 无新发现
new_test_count：0
new_test_target：所有 passed REQ 至少各有 1 个新增测试
validation_hardening_status：pending / in_progress / found_issue / passed / blocked / not_available / user_accepted_limited
validation_hardening_dimensions_done：boundary / negative / regression / compatibility / concurrency / permission / data / ui / integration
validation_hardening_required：boundary / negative / regression
validation_hardening_cost_policy：优先局部最小可证伪验证；重型 e2e / 全量 CI 只在相关风险、影响面较大或最终交付门禁时运行
heavy_validation_deferred：无 / 命令 + 原因 + 风险 + 用户可复现步骤

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
验证加固：pending / passed / blocked / not_available / user_accepted_limited
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

## Post-Change Validation / 修改后验证
status：not_run / passed / failed / skipped_with_reason / not_available
command：
result：
reason：
regression_detected：true / false

## Delta Assessment / 差异评估
status：pending / improved / unchanged / regression / unknown
summary：
baseline_ref：
post_change_ref：
decision：keep / revert / retry_new_direction / stop / ask_user

## Diff Budget / 变更预算审计
status：not_checked / within_budget / over_budget / unknown
changed_files：
diff_lines：
out_of_scope_files：
high_risk_files：
reason：

## Temporary Artifacts / Cleanup
临时 debug 前缀：
一次性 harness：
原型文件或路由：
待删除 artifacts：
清理状态：pending / completed / blocked

## Style Consolidation / 技巧风格整理
status：pending / completed / not_applicable / blocked / not_available
trigger：功能实现并通过验证后、Delivery Evidence ready 前
local_skills_reviewed：
global_skills_reviewed：
applied_rules：
changed_files：
scope：仅整理本次需求相关代码，不扩大行为范围
summary：
verification_summary：
skipped_reasons：
last_run_summary：
执行时机：实现需求的模式中，所有关键 REQ 已实现并通过验证后，先读取本项目 .agents/skills 与全局 skills 中相关代码风格、框架约束和反模式，再做有边界整理；整理后必须重新运行相关验证，再进入 Delivery Evidence ready。

## Context Reset Review Gate / 上下文清空复核门禁
status：pending / passed / failed / blocked / not_available / user_accepted_limited
trigger：所有关键 REQ passed 后、Delivery Evidence ready 前
review_cycles_used：
max_review_cycles：1
source_of_truth：state.json、原始需求、当前代码/diff、真实验证结果、项目规范和相关 skills；不得依赖历史对话记忆
standards_findings：
spec_findings：
decision：not_run / pass / reopen_requirements / block / limited_acceptance
reopened_requirements：
last_run_summary：
执行方式：清空对话实现细节，只依据 source_of_truth 重新读取事实；按 Standards / Spec 两轴复核。发现问题必须新增或重开 REQ 并回到实现循环；无发现时才能进入 Delivery Evidence ready。

## Delivery Evidence / 交付证据
status：pending / ready / blocked / delivered
goal：
changes：
changed_files：
validation_summary：
baseline_comparison：
cleanup_summary：
risks：
unfinished_items：
user_confirmation：

## Skill Capture / 技能沉淀
status：pending / captured / skipped_no_high_value / blocked / not_available
root：.agents/skills
index_file：.agents/skills/index.md
captured_files：
pending_candidates：
skipped_reasons：
selection_criteria：只沉淀可复用、可验证、跨任务有价值的技能点；不要记录密钥、客户数据、一次性日志或完整源码
last_run_summary：
执行时机：每次任务交付、提前停止或阶段性验收后，先提取高价值技能点，再更新 .agents/skills/index.md；没有高价值内容时写明 skipped_no_high_value 和原因

## Post-Agent Validation Gate / Agent 后置校验门禁
enabled：true / false
command：fastcar-cli auto-iterate --validate-state <session> --strict-state
last_result：passed / failed / not_run
repair_cycles_used：
max_repair_cycles：
failure_summary：
next_action：deliver / context_reset_and_repair / stop

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
如果 Watchdog.fresh_eyes_required 为 true，必须先设置 triggered=true、required_action=context_compress_and_review，并完成上下文压缩与新鲜视角复查后再继续或交付。
如果所有关键 REQ 已 passed，必须先完成 validation_hardening：至少达到 minimum_validation_hardening_iterations，并覆盖 boundary / negative / regression 维度；无法执行时标记 blocked 或 not_available，不得静默跳过。
如果 Temporary Artifacts / Cleanup 中仍有未清理的 debug 日志、harness、原型路由或一次性文件，不要按成功交付输出，除非用户明确要求保留并已标记原因。
实现需求的模式中，功能实现并通过验证后、交付前必须执行 Style Consolidation / 技巧风格整理：读取本地 .agents/skills 和全局 skills 中相关代码风格规则，整理本次修改范围内代码并重新验证；不适用时必须记录 skipped_reasons。
每次任务交付、提前停止或阶段性验收后，必须执行 Skill Capture / 技能沉淀：把高价值、可复用、可验证的经验写入 .agents/skills，并维护 .agents/skills/index.md；没有高价值内容时记录 skipped_no_high_value 和原因。
```
