import {
  formatList,
  withModeDefaults,
} from "./sessionConfig";
import { languageCode } from "../pipeline/language";

type StateObject = Record<string, any>;

export function buildPromptContent(rawAnswers: StateObject): string {
  const answers = withModeDefaults(rawAnswers);
  const lang = languageCode(answers.language);
  const sourceChecklist = answers.sourceChecklist
    ? lang === "en"
      ? `\nOriginal checklist document:\nSource file: ${answers.sourceChecklistPath}\n\n\`\`\`markdown\n${answers.sourceChecklist}\n\`\`\`\n`
      : `\n原始清单文档：\n来源文件：${answers.sourceChecklistPath}\n\n\`\`\`markdown\n${answers.sourceChecklist}\n\`\`\`\n`
    : "";
  const startModeLine = answers.autopilot
    ? "请使用 auto-iterate-coding skill，进入 Autopilot 全自动迭代模式。"
    : "请使用 auto-iterate-coding skill，按当前模式执行有边界的 Agent 工作流。";
  const isProtocolOnly = answers.executionMode === "protocol_only";
  const englishExecutionMode = isProtocolOnly
    ? `Execution mode: protocol_only / LLM-only.
Do not dispatch Agent(subagent_type="coder"), do not spawn subagents, and do not use the legacy Worker pipeline.
The current LLM must still follow auto-iterate techniques: RCM, one minimal focus per iteration, real validation, state updates, Watchdog, budgets, delivery gates, and Skill Capture.
This execution mode is locked for this session. Do not silently switch between native_subagent and protocol_only; if capability changes require a switch, stop with need_decision.`
    : `Execution mode: native_subagent.
Default loop: Main Agent reads skill/state, dispatches Agent(subagent_type="coder"), validates with deterministic Node runner facts, audits diff, then merges state.
This execution mode is locked for this session. Do not silently switch to protocol_only if the subagent fails or becomes unavailable; stop with need_decision or blocked.`;
  const chineseExecutionMode = isProtocolOnly
    ? `执行模式：protocol_only / LLM-only。
不要派发 Agent(subagent_type="coder")，不要启动 subagent，不要使用旧 Worker pipeline。
当前 LLM 仍必须遵循 auto-iterate 技巧：Requirement Coverage Matrix、每轮一个最小 focus、真实验证、状态更新、Watchdog、预算、交付门禁和 Skill Capture。
本 session 的执行模式已锁定；不得在 native_subagent 与 protocol_only 之间静默切换。能力变化需要切换时，必须停止并进入 need_decision。`
    : `执行模式：native_subagent。
默认循环：主 Agent 读取 skill/state，派发 Agent(subagent_type="coder")，再用工具事实验证、审计 diff 并合并 state。
本 session 的执行模式已锁定；subagent 失败或不可用时，不得静默切换到 protocol_only，必须进入 need_decision 或 blocked。`;

  if (lang === "en") {
    const startLine = answers.autopilot
      ? "Use the auto-iterate-coding skill and enter Autopilot mode."
      : "Use the auto-iterate-coding skill and follow the bounded workflow for the current mode.";
    return `# Auto-Iterate Coding Start Prompt

Send the following content to the Agent to start this project's auto-iterate-coding workflow.

\`\`\`text
First read auto-iterate-coding/SKILL.md and follow its natural-language routing, mode selection, session recovery, capability degradation, stop conditions, and language consistency rules.
If this start prompt came from natural-language routing, confirm that the command used an independent --session <name>.

${startLine}
${englishExecutionMode}

Current mode: ${answers.mode} / ${answers.modeLabel}
${answers.modeDescription}

Current session: ${answers.session || "default"}
Session machine state: ${answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json"}
Session state view: ${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}
Session start prompt: ${answers.sessionPromptFile || ".agent-state/auto-iterate/default/start-prompt.md"}
Current pointer: ${answers.currentFile || ".agent-state/auto-iterate-current.json"}
Language: ${lang}
Language rule: write human-readable output, state notes, summaries, Skill Capture content, and delivery summaries in English; keep commands, file names, JSON keys, API names, and machine enum values unchanged.

Auto-iterate activation statement:
Before starting, state in 1-3 lines that auto-iterate is active, including mode, session, state.json, state.md, current pointer, persistence status, and the next minimal action.

Mode rules:
${answers.modeInstructions}

Context and state management:
Treat ${answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json"} as the machine source of truth when it exists.
Keep status-like machine fields such as pending, passed, blocked, not_verified, requiredAction, and mode values in English. Localize only human-readable summaries, reasons, evidence, and generated documents.
Do not rely on conversation history as the only context.
Probe available capabilities: file read/write, commands, real tests, persistent state, sub-agent/parallel support, network, database/secrets, and git diff.
If a capability is unavailable, mark affected requirements not_verified or blocked instead of faking completion or validation.
Run reconcile before resuming: current branch, git status/diff, state/code consistency, external edits after the last stop, and whether recent validation can be rerun.
After each implementation iteration, optimization iteration, context compression, early stop, or pre-delivery step, update state.json first and refresh state.md.
Maintain Watchdog, Requirement Coverage Matrix, Definition of Done, Style Consolidation, Context Reset Review, Delivery Evidence, and Skill Capture according to the skill.

## Skill Capture
After delivery, early stop, or milestone acceptance, run Skill Capture: extract high-value reusable skills from real failure signals, debugging paths, validation strategy, framework API constraints, scaffolding, anti-patterns, and stop conditions. Write English human-readable skill content under .agents/skills and update .agents/skills/index.md. If no high-value content exists, set skillCapture.status=skipped_no_high_value with reasons.

Requirements:
If the task comes from a long document, PRD, issue list, or checklist, first extract a Requirement Coverage Matrix from the original text.
Every requirement must include ID, original summary, status, related files, validation evidence, blocking reason, and next step.
Do not deliver successfully while any critical requirement is pending, implemented, or not_verified.
Passing tests is not enough; final completion must be checked against the original requirements.

AI implementation checklist:
${sourceChecklist}

User goal:
${answers.goal || "not specified"}

Success criteria:
${formatList(answers.successCriteria, "not specified")}

Non-goals:
${formatList(answers.nonGoals, "not specified")}

Allowed change scope:
${answers.allowedScope || "not specified"}

Compatibility requirements:
${formatList(answers.compatibility, "not specified")}

Runnable validation commands:
${formatList(answers.validationCommands, "not specified")}

External resources, secrets, database, network, or sandbox constraints:
${formatList(answers.constraints, "not specified")}

Delivery format:
${answers.deliveryFormat}

Iteration budget:
max_iterations = ${answers.maxIterations}
autopilot_max_iterations = ${answers.autopilotMaxIterations}

Start directly after confirmation. Report only key progress; do not stop for questions unless a stop condition or required user decision is triggered.
\`\`\`
`;
  }

  return `# 自动迭代编码启动提示

将下面内容发给 Agent，用于启动本项目的 auto-iterate-coding 流程。

\`\`\`text
请先读取 auto-iterate-coding/SKILL.md，按该 skill 的自然语言命令路由、模式选择、session 恢复、能力降级、停止条件和语言一致性规则执行。
如果本启动提示来自自然语言路由，请确认命令已经包含独立 session；以后每次自然语言路由都必须显式传入 --session <name>。用户未指定 session 时，由 Agent 根据模式和目标生成英文小写、数字和连字符组成的默认 session 名，例如 quick-login-bugfix、diagnose-flaky-e2e、prototype-order-state-machine，不要省略 --session。

${startModeLine}
${chineseExecutionMode}

当前启动模式：${answers.mode} / ${answers.modeLabel}
${answers.modeDescription}

当前 session：${answers.session || "default"}
Session 机器状态：${answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json"}
Session 状态视图：${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}
Session 启动提示：${answers.sessionPromptFile || ".agent-state/auto-iterate/default/start-prompt.md"}
Current 指针：${answers.currentFile || ".agent-state/auto-iterate-current.json"}

Auto-iterate 激活声明：
开始执行前，请先在对话中用 1-3 行明确声明本任务已经进入 auto-iterate-coding 激活态，并列出 mode、session、state.json、state.md、current 指针和下一步最小动作。
如果不能读取或写入 session state.json、state.md、start-prompt 或 current 指针，必须把状态持久化标记为 degraded / not_available，并说明原因；不得把普通对话内多轮修改称为完整 auto-iterate session。
后续每轮进展摘要和最终交付都必须引用当前 session，避免把“多轮迭代开发”误判为未激活持久化任务。

模式执行规则：
${answers.modeInstructions}

上下文与状态管理：
请始终使用与用户当前提示一致的语言输出、记录状态和交付总结；用户使用中文时不要突然切换为英文，除非术语、命令、代码或用户明确要求保留英文。
本 skill 是面向 AI Coding Agent 的自动迭代开发协议，不是独立 CLI 工具，也不依赖特定 Agent 平台。
请先探测当前 Agent 环境可用能力，包括读写文件、运行命令、真实测试、状态持久化、coder subagent、只读探索辅助、网络、数据库/密钥和 git diff。
如果某项能力不可用，请按降级规则标记 not_verified 或 blocked，不要伪造完成或验证。
默认自动模式固定为“主 Agent（裁判）-> 单个 coder subagent（运动员）-> 主 Agent（裁判）”。每轮只派发一个 coder；coder 是唯一允许修改业务代码的角色，写入 result.json 后停止。
请按 references/judge-runbook.md 执行裁判步骤：主 Agent 亲自做 result schema、Node runner 验证、git diff/scope 审计、validation.log、state merge、预算、Watchdog 和交付门禁。
不要使用 CLI --dispatch、外部 Worker、validator subagent、orchestrator subagent 或 coder 并发写入作为默认路径。只读探索辅助可以并行，但不得写业务代码、不得写 state、不得替代主 Agent 的裁判校验。
检测到 state.json 或 state.md 在 coder 运行期间被外部修改时，先进入 reconcile，不得继续派发下一轮 coder。
请不要依赖历史对话作为唯一上下文。
如果存在 ${answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json"}，请先读取它作为本 session 的机器权威恢复状态；缺少 state.json 的旧 session 才降级读取 ${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}。
恢复前执行 reconcile 检查：当前分支、git 状态/diff 摘要、状态文件与当前代码是否一致、是否存在上次停止后的外部修改、最近验证能否重新运行。
每完成一轮实现迭代、递归优化、上下文压缩、提前停止或成功交付前，都要优先更新 session 机器状态文件 ${answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json"}，再刷新 ${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"} 生成视图；如果当前环境不能写状态文件，请在对话内维护同等结构的 Iteration State。
请启用并维护 Watchdog 状态；每轮迭代前后、上下文压缩后、恢复后和最终交付前都要检查无进展、验证缺失、状态漂移和交付可验证性，并把 required_action 写回 state.json 后刷新 state.md。
如果 Watchdog 触发 run_validation、reconcile、ask_user、context_compress_and_review 或 stop，必须先处理 required_action，不得绕过；交付可验证性为 not_verifiable 或 unknown 时，不要按成功交付输出。
当 Watchdog.fresh_eyes_required = true 时：所有 REQ 已 passed 但仍有剩余实现预算。请执行上下文压缩，输出 Context Handoff Summary，清空对话中的实现细节。以"新接手项目的开发者"视角重新审视全部代码和 RCM。发现遗漏 → 创建新 REQ，重置 fresh_eyes_required = false，继续迭代。无遗漏 → fresh_eyes_required = false，继续优化或交付。
当所有关键 REQ passed 后、Delivery Evidence ready 前，必须执行 Context Reset Review Gate：清空对话实现细节，只依据 state.json、原始需求、当前代码/diff、真实验证结果、项目规范和相关 skills 重新读取事实；按 Standards / Spec 两轴复核。发现问题时更新 contextResetReview.status=failed、记录 reopenedRequirements、新增或重开 REQ 并回到实现循环；无发现时更新 contextResetReview.status=passed、decision=pass、reviewCyclesUsed>=1。不要用“我记得已经完成”替代该门禁。
当所有关键 REQ passed 且 fresh_eyes_required 已处理后，必须进入 validation_hardening 交付前验证加固。验证加固不消耗实现迭代预算；每轮选择一个攻击式验证维度（boundary、negative、regression，必要时追加 compatibility、concurrency、permission、data、ui），优先用局部最小可证伪验证补充真实测试或等价验证命令。重型 e2e / 全量 CI 不得每轮机械重复，只有相关风险、影响面较大或最终交付门禁需要时运行；如因耗时延后，记录 heavy_validation_deferred、原因和用户可复现命令。发现问题时新增或重开 REQ 并回到实现；无新发现时更新 validation_hardening_iterations_used、validation_hardening_dimensions_done 和验证证据。未达到 minimum_validation_hardening_iterations 或缺少必需维度时，不得按成功交付输出。
如果当前模式是实现需求的模式（strict、quick、diagnose、prototype），在功能实现并通过验证后、Delivery Evidence ready 前，必须执行 Style Consolidation / 技巧风格整理：读取本项目 .agents/skills 和全局 skills 中与本次代码相关的代码风格、FastCar API 约束、TypeScript 规范、反模式和验证建议，按这些规则重新整理本次修改范围内代码。不得扩大行为范围、引入无关重构或为了风格削弱测试。整理后必须重新运行相关验证，并更新 state.json.styleConsolidation；非实现模式可标记 not_applicable 并记录原因。
当上下文变长、完成 3-5 轮迭代、进入新阶段或开始重复尝试时，请输出并使用 Context Handoff Summary 继续。
请维护完整任务清单、已完成任务、当前任务、剩余任务和整体完成状态；剩余任务非空时不得按成功交付停止，只能继续迭代或按提前停止汇报。
修 bug、性能回归或验证失败时，请先建立能复现目标问题的 feedback loop；无法建立时停止并说明尝试过什么、缺少什么 artifact 或环境。

## Skill Capture / 技能沉淀
每次任务交付、提前停止或阶段性验收后，都必须执行 Skill Capture / 技能沉淀：从真实失败信号、调试路径、验证策略、框架 API 约束、复用脚手架、反模式和停止条件中筛选高价值技能点，写入本项目 .agents/skills 下的合适 skill 文档，并同步维护 .agents/skills/index.md 作为检索入口。只沉淀可复用、可验证、跨任务有价值的技能点；不得写入密钥、客户数据、一次性日志、大段源码或只对本次任务有效的流水账。没有高价值内容时，将 skillCapture.status 标记为 skipped_no_high_value 并记录 skippedReasons；不能写文件时标记 not_available 或 blocked。
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
${sourceChecklist}

用户目标：
${answers.goal || "未指定"}

成功标准：
${formatList(answers.successCriteria)}

非目标：
${formatList(answers.nonGoals)}

允许修改范围：
${answers.allowedScope || "未指定"}

需要保持兼容的接口、命令或行为：
${formatList(answers.compatibility)}

可运行的验证命令：
${formatList(answers.validationCommands)}

外部资源、密钥、数据库、网络或沙箱限制：
${formatList(answers.constraints)}

交付格式：
${answers.deliveryFormat}

迭代预算：
max_iterations = ${answers.maxIterations}
autopilot_max_iterations = ${answers.autopilotMaxIterations}

确认后请直接开始执行。中间只汇报关键进展；除非触发停止条件或遇到必须由我决策的问题，否则不要停下来问我。
\`\`\`
`;
}
