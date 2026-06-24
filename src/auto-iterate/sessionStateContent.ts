import { isImplementationMode } from "./modeRules";
import {
  formatList,
  normalizeLines,
  withModeDefaults,
} from "./sessionConfig";
import {
  ENGINE_PHASES,
  defaultPhaseBlockingRules,
  defaultPhaseEntryCriteria,
  defaultPhaseExitCriteria,
} from "./stateValidationHelpers";
import { languageCode } from "../pipeline/language";

type StateObject = Record<string, any>;

export function buildStateContent(rawAnswers: StateObject): string {
  const answers = withModeDefaults(rawAnswers);
  const isProtocolOnly = answers.executionMode === "protocol_only";
  const subAgentEnabledLine = isProtocolOnly
    ? "enabled：false（protocol_only / LLM-only；用户明确手动模式或不启动 subagent）"
    : "enabled：true（native_subagent 默认开启；每轮最多一个 coder）";
  const subAgentConcurrencyLine = isProtocolOnly
    ? "concurrency_limit：0（protocol-only 不派发 coder subagent）"
    : "concurrency_limit：1（写代码 coder 固定串行；只读探索辅助不得写业务代码或 state）";
  const lang = languageCode(answers.language);
  const sourceChecklist = answers.sourceChecklist
    ? lang === "en"
      ? `\n## Source Checklist\nSource file: ${answers.sourceChecklistPath}\n\n\`\`\`markdown\n${answers.sourceChecklist}\n\`\`\`\n`
      : `\n## 来源清单\n来源文件：${answers.sourceChecklistPath}\n\n\`\`\`markdown\n${answers.sourceChecklist}\n\`\`\`\n`
    : "";
  const autopilotText = answers.autopilot ? "true" : "false";
  const remainingImplementationIterations = answers.autopilot
    ? answers.autopilotMaxIterations
    : answers.maxIterations;
  const remainingOptimizationIterations = answers.mode === "optimize"
    ? answers.maxIterations
    : "未开始";
  const optimizationProgressMax = answers.mode === "optimize"
    ? answers.maxIterations
    : "未开始";

  return `# 自动迭代编码状态

> GENERATED FILE, DO NOT EDIT. 机器权威状态为 ${answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json"}；本 Markdown 仅用于人类阅读和 legacy 兼容。
${sourceChecklist}

## At-a-Glance / 人类摘要
tl;dr：整体 in_progress；模式：${answers.mode} / ${answers.modeLabel}
语言：${lang}
激活状态：active；这不是普通对话内多轮工作节奏，必须按 auto-iterate session 持久化流程执行
进度：implementation 0 / ${answers.autopilot ? answers.autopilotMaxIterations : answers.maxIterations}；optimization 0 / ${optimizationProgressMax}
需求：passed 0 / not_verified 全部 / blocked 0 / pending REQ-BOOTSTRAP
验证：最近命令 未运行；最近结果 未运行
看门狗：clear；required_action：continue
交付可验证性：unknown
需要用户决策：无
下一步：${answers.nextAction}

## Task / 任务
用户目标：
${answers.goal || "未指定"}

成功标准：
${formatList(answers.successCriteria)}

非目标：
${formatList(answers.nonGoals)}

允许修改范围：
${answers.allowedScope || "未指定"}

兼容性约束：
${formatList(answers.compatibility)}

## Session / 会话
session：${answers.session || "default"}
状态文件：${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}
启动提示：${answers.sessionPromptFile || ".agent-state/auto-iterate/default/start-prompt.md"}
current 指针：${answers.currentFile || ".agent-state/auto-iterate-current.json"}
激活声明：Agent 开始执行前必须在对话中明确声明“auto-iterate 已激活”，并列出 mode、session、state 文件、current 指针和下一步最小动作
恢复优先级：当前消息显式 session > session state > current 指针 > 对话推断
语言规则：输出、状态记录和交付总结必须与用户当前提示语言保持一致；用户使用中文时不要突然切换为英文，除非术语、命令、代码或用户明确要求保留英文
最终回复语言规则：中文 session 的最终对话回复、本次任务交付总结、阶段验收摘要、Skill Capture 人类可读内容和生成文档必须使用中文；命令、文件名、JSON key、API 名称和机器枚举值保持英文
language：${lang}
status_display_rule：机器枚举保持英文；人类摘要和原因文案跟随用户语言

## Mode / 模式
模式：${answers.mode} / ${answers.modeLabel}
模式说明：${answers.modeDescription}
Autopilot：${autopilotText}
runtime_autopilot：${autopilotText}
loop_shape：${answers.autopilot ? "autopilot" : answers.mode === "plan" ? "plan_once" : "default"}
execution_mode：${answers.executionMode || "native_subagent"}
允许 Agent 推断流程清单：${answers.allowAgentInference ? "true" : "false"}
允许修改文件：${answers.allowModify ? "true" : "false"}

模式执行规则：
${answers.modeInstructions}

## Agent Capability Summary / 能力摘要
读文件/搜索代码：unknown
修改文件：unknown
运行命令：unknown
真实测试：unknown
状态持久化：available
coder subagent：unknown
只读探索辅助：unknown
网络/外部服务：unknown
数据库/密钥：user-confirmed-required
git 状态/diff：unknown
媒体/文档处理：not_needed
降级策略：能力不可用时标记 not_verified 或 blocked，不得伪造验证
阻塞能力：待 Agent 启动后探测

## Sub-Agent Dispatch / 子 Agent 调度
${subAgentEnabledLine}
current_phase：idle
active_sub_agents：无
active_sub_agents_item_template：
  - id：<agent_id>
    type：coder / readonly_explore
    task：
    files_assigned：
    status：planned / running / completed / failed / blocked
    failure_reason：
    started_at：
    completed_at：
    result_summary：
    merge_status：pending / merged / skipped
sub_agent_history：无（记录单 coder 交接历史；字段模板：round / agent_id / type / task_summary / merge_result / files_changed / validation_result / failure_reason）
sub_agent_history_item_template：
  - round：1
    agent_id：<agent_id>
    type：coder / readonly_explore
    task_summary：
    merge_result：success / partial / skipped
    files_changed：
    validation_result：
    failure_reason：
dispatched_count：0
completed_count：0
failed_count：0
last_dispatch_round：0
last_merge_result：N/A
max_sub_agent_rounds：3
sub_agent_timeout_seconds：300
max_failed_sub_agents：2
token_budget_hint：未设置
${subAgentConcurrencyLine}

## Budgets / 预算
max_iterations：${answers.maxIterations}
autopilot_max_iterations：${answers.autopilotMaxIterations}
minimum_implementation_iterations：未启用
minimum_iteration_policy：最少/至少 N 轮是下限检查点，不是上限或仅执行 N 轮；达到下限后仍按 RCM、Watchdog、验证结果和剩余预算继续或停止
implementation_iterations_used：0
non_implementation_iterations_used：0
validation_hardening_iterations_used：0
minimum_validation_hardening_iterations：${answers.mode === "strict" ? "2" : "1"}
optimization_iterations_used：0
total_cycles：0
remaining_implementation_iterations：${remainingImplementationIterations}
remaining_validation_hardening_iterations：${answers.mode === "strict" ? "2" : "1"}
remaining_optimization_iterations：${remainingOptimizationIterations}
预算追加记录：无；如果恢复时 remaining_implementation_iterations = 0，必须先请求用户追加预算，历史计数不清零
计数口径：实现迭代 = 修改 + 验证/记录 + 状态更新的闭环；验证加固迭代 = 所有关键 REQ passed 后主动寻找遗漏的边界/反例/回归验证；只读探索、reconcile、上下文压缩、向用户提问和纯重复验证不计入实现迭代

## Recovery / Reconcile / 恢复一致性检查
当前分支：待检查
git 状态/diff 摘要：待检查
状态文件与当前代码是否一致：unknown
上次停止后外部修改：unknown
最近验证是否已重新运行：no
reconcile 结论：启动时先检查

## Current State / 当前状态
当前阶段：${answers.currentPhase}
任务规模：auto
Autopilot：${autopilotText}
完整任务清单：待从成功标准、原始清单和模式规则提取
已完成任务：无
当前任务：${answers.currentTask}
剩余任务：所有需求
整体完成状态：in_progress
最近修改：无
关键文件：未探索
最近验证命令：未运行
最近验证结果：未运行
首个关键失败信号：无
未验证项：全部成功标准尚未验证
需要用户决策：无
反馈闭环：未建立
架构摩擦：none
原型状态：${answers.mode === "prototype" ? "proposed" : "not_needed"}

## Phase Gate / 阶段门禁
current_phase：requirement
can_proceed：false
blocking_reasons：REQ-BOOTSTRAP pending；尚未生成完整 Requirement Coverage Matrix 和 Implementation Contract
phase_order：requirement -> contract -> baseline -> coding -> validation -> cleanup -> delivery
gates：
${ENGINE_PHASES.map((phase) => `  - phase：${phase}
    status：${phase === "requirement" ? "pending" : "blocked"}
    entry：${defaultPhaseEntryCriteria(phase).join("；")}
    exit：${defaultPhaseExitCriteria(phase).join("；")}
    blocking：${defaultPhaseBlockingRules(phase).join("；")}`).join("\n")}

## Implementation Contract / 实现契约
status：pending
goal：${answers.goal || "未指定"}
understanding：待 Agent 从原始清单、当前代码和用户约束中确认
scope：${answers.allowedScope || "未指定"}
non_goals：${normalizeLines(answers.nonGoals).join("；") || "未指定"}
success_criteria：${normalizeLines(answers.successCriteria).join("；") || "未指定"}
validation_plan：${normalizeLines(answers.validationCommands).join("；") || "未指定"}
risk_points：状态门禁、baseline、cleanup、delivery 证据和 CLI strict 校验必须保持一致
open_questions：无
user_confirmation_required：false

## Baseline / 修改前基线
status：pending
command：${normalizeLines(answers.validationCommands)[0] || "not_run"}
result：未运行
reason：尚未由 Agent 建立修改前 baseline
failure_category：unknown
allows_coding：false

## Iteration Policy / 迭代策略
current_iteration_goal：提取完整 RCM 并补齐门禁实体
max_goals_per_iteration：1
max_changed_files：8
max_diff_lines：800
max_no_progress_iterations：3
consecutive_failure_count：0
allowed_files：未分配
stop_conditions：连续失败达到阈值；验证结果恶化；修改范围超出 Implementation Contract；finalVerifiability 无法判定
rollback_plan：仅回滚本轮 Agent 自己的修改；无法安全回滚时记录风险并停止或 ask_user
last_decision：continue

## Task Profile / 任务画像
type：${answers.mode === "verify" ? "verify" : answers.mode === "optimize" ? "optimize" : answers.mode === "prototype" ? "prototype" : "unknown"}
complexity：${answers.mode === "strict" ? "large" : "medium"}
risk：${answers.mode === "strict" ? "high" : "medium"}
needs_user_confirmation：${answers.mode === "strict" ? "true" : "false"}
reasons：严格模式默认按复杂/高风险处理；复杂度分级只能调节流程强度，不能绕过 Hard Gate

## Decision Request / 用户确认请求
status：${answers.mode === "strict" ? "approved" : "not_needed"}
topic：${answers.mode === "strict" ? "严格模式高风险任务确认" : "无"}
background：${answers.mode === "strict" ? "用户已通过 CLI 参数确认 strict/autopilot session 和文档来源" : "当前任务不需要额外用户确认"}
options：${answers.mode === "strict" ? "继续 strict/autopilot；降级为 plan-only；停止" : "无"}
recommended：${answers.mode === "strict" ? "继续 strict/autopilot" : "not_needed"}
impact：${answers.mode === "strict" ? "允许 Agent 在限定范围内继续实现，但仍不得绕过 Hard Gate" : "无"}
triggers：${answers.mode === "strict" ? "complexity=large；risk=high" : "无"}

## Watchdog / 看门狗
enabled：true
check_interval：每轮迭代前后、上下文压缩后、恢复后、最终交付前
light_check：每轮必做，检查 no_progress_count / last_validation_result / state_drift / triggered / fresh_eyes_required / new_test_count
full_check：每个 phase、每 3 轮、恢复后和交付前执行完整字段检查
last_progress_iteration：0
last_progress_summary：CLI 已生成初始状态，Agent 尚未开始执行
last_validation_iteration：0
last_validation_command：未运行
last_validation_result：未运行
no_progress_count：0 / 按模式 max_no_progress_iterations
unverified_iteration_count：0
state_drift：none
delivery_verifiability：unknown
triggered：false
trigger_reason：无
required_action：continue
fresh_eyes_required：false
new_test_count：0
new_test_target：所有 passed REQ 至少各有 1 个本轮新增的行为测试或等价验证命令；未补测试的 REQ 必须在已知限制中记录原因
validation_hardening_status：pending
validation_hardening_dimensions_done：无
validation_hardening_required：boundary / negative / regression；有 UI、权限、并发、数据迁移或外部服务时追加对应维度
validation_hardening_cost_policy：优先局部最小可证伪验证；重型 e2e / 全量 CI 只在相关风险、影响面较大或最终交付门禁时运行
heavy_validation_deferred：无

## Requirement Coverage Matrix / 需求覆盖矩阵
REQ-BOOTSTRAP：
原文摘要：启动后必须先从用户目标、成功标准、原始清单文档和当前模式提取完整 Requirement Coverage Matrix
类型：验证
状态：pending
相关文件：${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}
验证证据：无
阻塞原因：无
下一步：读取原始清单和当前代码，拆分 REQ-001...REQ-N，并在实现或验证前更新本矩阵

## Definition of Done / 完成定义
RCM 状态摘要：REQ-BOOTSTRAP pending；完整 RCM 尚未提取
派生规则：成功标准状态直接引用 Requirement Coverage Matrix 中对应关键 REQ 的状态和验证证据，不独立重复评估
${normalizeLines(answers.successCriteria)
  .map((line, index) => `成功标准 ${index + 1}：not_verified - ${line}`)
  .join("\n") || "成功标准 1：not_verified - 未指定"}
真实验证：未运行
沙箱验证：未运行
未验证项：全部成功标准尚未验证
Requirement Coverage Matrix 状态：未提取完整矩阵，REQ-BOOTSTRAP pending
验证加固：pending
交付可验证性：unknown
看门狗状态：clear
剩余风险：尚未开始执行

## Decisions / 已确认决策
已确认的架构决策：未确认，优先从现有代码和脚手架推断
已确认的产品行为：以本文件成功标准为准；快速模式下先由 Agent 推断并等待必要确认
已确认的接口兼容性：
${formatList(answers.compatibility)}
用户提供的限制：
${formatList(answers.constraints)}
单 coder 决策：
  parallel_write_allowed：false
  parallel_write_confirmation：禁止并发 coder 写入；每轮只允许一个 coder
  coder_file_ownership：由主 Agent 每轮按 focus 分配
  fallback_strategy：无 coder 能力时进入 protocol-only / need_decision，不得静默切换

## Traceability / 可追溯记录
policy：只记录公开可审计推理摘要；不得记录私有思考链
iterations：无
字段来源：coder result.json 的 trace.rationaleSummary / trace.decisions / trace.evidence 由主 Agent 清洗后合并；validation、prompt/result/log 路径由主 Agent 补充
文档去向：finalize 时汇总到 docs/architecture.md 和 docs/implementation.md

## Delivery Docs / 交付文档
status：pending
path：.agent-state/auto-iterate/${answers.session || "default"}/docs
files：api.md；changelog.md；architecture.md；implementation.md
generated_at：未生成
生成时机：fastcar-cli auto-iterate --finalize ${answers.session || "default"} --yes
语言规则：文档标题和人类可读内容跟随用户语言；文件名、JSON key 和机器枚举保持英文

## Notes / 备注
无

## Hypotheses / 假设
已排除假设：无
排序候选假设：未生成
结构化假设：无
当前主要假设：可以通过当前 Agent 能力探测、现有项目结构和验证命令推进本模式
下一步最小动作：${answers.nextAction}

## Validation / 验证
已通过验证：无
失败验证：无
未运行验证及原因：尚未开始
沙箱验证：无
不可用能力导致的未验证项：待 Agent 能力探测
最终交付可验证性：unknown
可运行的验证命令：
${formatList(answers.validationCommands)}

## Post-Change Validation / 修改后验证
status：not_run
command：${normalizeLines(answers.validationCommands)[0] || "not_run"}
result：未运行
reason：尚未执行修改后验证
regression_detected：false

## Delta Assessment / 差异评估
status：pending
summary：尚未比较 baseline 与 post-change
baseline_ref：baseline
post_change_ref：postChange
decision：keep

## Diff Budget / 变更预算审计
status：not_checked
changed_files：0
diff_lines：0
out_of_scope_files：无
high_risk_files：无
reason：尚未检查 git diff

## Temporary Artifacts / Cleanup / 临时产物清理
临时 debug 前缀：无
一次性 harness：无
原型文件或路由：${answers.mode === "prototype" ? "待创建并明确标记" : "无"}
待删除 artifacts：无
清理状态：pending

## Style Consolidation / 技巧风格整理
status：${isImplementationMode(answers.mode) ? "pending" : "not_applicable"}
trigger：功能实现并通过验证后、Delivery Evidence ready 前
local_skills_reviewed：无
global_skills_reviewed：无
applied_rules：无
changed_files：无
scope：${answers.mode === "optimize" || answers.mode === "verify" || answers.mode === "plan" ? "非实现模式默认不要求整理" : "仅整理本次需求相关代码，不扩大行为范围"}
summary：尚未按本地和全局 skills 的代码风格整理
verification_summary：未运行
skipped_reasons：${isImplementationMode(answers.mode) ? "无" : "当前模式不是实现需求模式"}
last_run_summary：尚未执行技巧风格整理
执行时机：实现需求的模式中，所有关键 REQ 已实现并通过验证后，先读取本项目 .agents/skills 与全局 skills 中相关代码风格、框架约束和反模式，再做有边界整理；整理后必须重新运行相关验证，再进入 Delivery Evidence ready。

## Context Reset Review Gate / 上下文清空复核门禁
status：pending / passed / failed / blocked / not_available / user_accepted_limited
trigger：所有关键 REQ passed 后、Delivery Evidence ready 前
review_cycles_used：0
max_review_cycles：1
source_of_truth：state.json、原始需求、当前代码/diff、真实验证结果、项目规范和相关 skills；不得依赖历史对话记忆
standards_findings：无
spec_findings：无
decision：not_run / pass / reopen_requirements / block / limited_acceptance
reopened_requirements：无
last_run_summary：尚未执行上下文清空复核
执行方式：清空对话实现细节，只依据 source_of_truth 重新读取事实；按 Standards / Spec 两轴复核。发现问题必须新增或重开 REQ 并回到实现循环；无发现时才能进入 Delivery Evidence ready。

## Delivery Evidence / 交付证据
status：pending
goal：${answers.goal || "未指定"}
changes：尚未交付
changed_files：无
validation_summary：未运行
baseline_comparison：未建立 baseline
cleanup_summary：pending
risks：交付前必须通过 postAgentValidationGate
unfinished_items：REQ-BOOTSTRAP pending
user_confirmation：无

## Skill Capture / 技能沉淀
status：pending
root：.agents/skills
index_file：.agents/skills/index.md
captured_files：无
pending_candidates：无
skipped_reasons：无
selection_criteria：只沉淀可复用、可验证、跨任务有价值的技能点；不要记录密钥、客户数据、一次性日志或完整源码
last_run_summary：尚未执行任务后技能沉淀
执行时机：每次任务交付、提前停止或阶段性验收后，先提取高价值技能点，再更新 .agents/skills/index.md；没有高价值内容时写明 skipped_no_high_value 和原因

## Post-Agent Validation Gate / Agent 后置校验门禁
enabled：true
command：fastcar-cli auto-iterate --finalize ${answers.session || "default"} --yes
last_result：not_run
repair_cycles_used：0
max_repair_cycles：5
failure_summary：无
next_action：context_reset_and_repair

## Context Handoff Summary / 上下文交接摘要
目标：${answers.goal || "未指定"}
成功标准：${normalizeLines(answers.successCriteria).join("；") || "未指定"}
当前状态：${answers.modeLabel} 启动前，等待 Agent 读取状态并开始执行
已完成：CLI 已生成初始状态和启动提示
完整任务清单完成状态：未提取
剩余任务：所有需求
当前失败：无
已验证命令：未运行
已排除假设：无
当前假设：可以先完成 Agent 能力探测和 feedback loop 识别
下一步：${answers.nextAction}
禁止事项：不要伪造验证，不要泄露或写入密钥，不要破坏兼容性约束；Verify-only/Plan-only 未获明确允许不得修改项目文件
Watchdog：enabled，交付前必须从 unknown 更新为 verifiable / partially_verifiable / not_verifiable
剩余预算：实现迭代 ${answers.autopilotMaxIterations} / 普通预算 ${answers.maxIterations}

## Resume Prompt / 恢复提示
下次继续时，请使用 auto-iterate-coding skill。
如果存在本文件，请先读取它作为任务恢复状态。
继续时不要依赖历史对话，只依赖本状态文件、当前代码和真实验证结果。
从“下一步最小动作”继续，并在每轮迭代后更新本文件。
如果 Requirement Coverage Matrix 中仍存在 pending / implemented / not_verified 的关键需求，不要按成功交付输出。
如果 Watchdog triggered 为 true，先处理 required_action；交付可验证性为 not_verifiable 或 unknown 时，不要按成功交付输出。
如果 Watchdog.fresh_eyes_required 为 true，必须先设置 triggered=true、required_action=context_compress_and_review，并完成上下文压缩与新鲜视角复查后再继续或交付。
如果所有关键 REQ 已 passed，Delivery Evidence ready 前必须完成 Context Reset Review Gate：清空对话实现细节，只依据 state.json、原始需求、当前代码/diff、真实验证结果、项目规范和相关 skills 执行 Standards / Spec 两轴复核。发现问题必须新增或重开 REQ 并回到实现循环；无发现时将 contextResetReview.status 标记为 passed。
如果所有关键 REQ 已 passed，必须先完成 validation_hardening：至少达到 minimum_validation_hardening_iterations，并覆盖 boundary / negative / regression 维度；无法执行时标记 blocked 或 not_available，不得静默跳过。
如果 Temporary Artifacts / Cleanup 中仍有未清理的 debug 日志、harness、原型路由或一次性文件，不要按成功交付输出，除非用户明确要求保留并已标记原因。
`;
}
