import {
  formatList,
  withModeDefaults,
} from "./sessionConfig";
import { languageCode } from "../pipeline/language";

type StateObject = Record<string, any>;

function sessionValue(
  answers: StateObject,
  key: string,
  fallback: string,
): string {
  return String(answers[key] || fallback);
}

function buildSourceChecklist(answers: StateObject, lang: string): string {
  if (!answers.sourceChecklist) {
    return "";
  }

  if (lang === "en") {
    return `\nOriginal checklist document:\nSource file: ${answers.sourceChecklistPath}\n\n\`\`\`markdown\n${answers.sourceChecklist}\n\`\`\`\n`;
  }

  return `\n原始清单文档：\n来源文件：${answers.sourceChecklistPath}\n\n\`\`\`markdown\n${answers.sourceChecklist}\n\`\`\`\n`;
}

function buildEnglishExecutionMode(answers: StateObject): string {
  if (answers.executionMode === "protocol_only") {
    return `Execution mode: protocol_only / LLM-only.
Do not dispatch Agent(subagent_type="coder"), do not spawn subagents, and do not use the legacy Worker pipeline.
The current LLM must still follow the auto-iterate loop: Requirement Coverage Matrix, one minimal focus per iteration, real validation, state updates, Watchdog, budgets, delivery gates, and Skill Capture.
This execution mode is locked for this session; stop with need_decision before switching modes.`;
  }

  return `Execution mode: native_subagent.
Default loop: Main Agent reads skill/state, dispatches Agent(subagent_type="coder"), validates with deterministic facts, audits diff, then merges state.
This execution mode is locked for this session; if the subagent fails or becomes unavailable, stop with need_decision or blocked instead of silently switching to protocol_only.`;
}

function buildChineseExecutionMode(answers: StateObject): string {
  if (answers.executionMode === "protocol_only") {
    return `执行模式：protocol_only / LLM-only。
不要派发 Agent(subagent_type="coder")，不要启动 subagent，不要使用旧 Worker pipeline。
当前 LLM 仍必须遵循 auto-iterate 技巧：Requirement Coverage Matrix、每轮一个最小 focus、真实验证、状态更新、Watchdog、预算、交付门禁和 Skill Capture。
本 session 的执行模式已锁定；能力变化需要切换时，必须停止并进入 need_decision。`;
  }

  return `执行模式：native_subagent。
默认循环：主 Agent 读取 skill/state，派发 Agent(subagent_type="coder")，再用工具事实验证、审计 diff 并合并 state。
本 session 的执行模式已锁定；subagent 失败或不可用时，不得静默切换到 protocol_only，必须进入 need_decision 或 blocked。`;
}

export function buildPromptContent(rawAnswers: StateObject): string {
  const answers = withModeDefaults(rawAnswers);
  const lang = languageCode(answers.language);
  return lang === "en"
    ? buildEnglishPromptContent(answers)
    : buildChinesePromptContent(answers);
}

function buildEnglishPromptContent(answers: StateObject): string {
  const sourceChecklist = buildSourceChecklist(answers, "en");
  const startLine = answers.autopilot
    ? "Use the auto-iterate-coding skill and enter Autopilot mode."
    : "Use the auto-iterate-coding skill and follow the bounded workflow for the current mode.";
  const session = String(answers.session || "default");
  const stateJsonFile = sessionValue(answers, "sessionStateJsonFile", ".agent-state/auto-iterate/default/state.json");
  const stateFile = sessionValue(answers, "sessionStateFile", ".agent-state/auto-iterate/default/state.md");
  const promptFile = sessionValue(answers, "sessionPromptFile", ".agent-state/auto-iterate/default/start-prompt.md");
  const currentFile = sessionValue(answers, "currentFile", ".agent-state/auto-iterate-current.json");

  return `# Auto-Iterate Coding Start Prompt

Send the following compact bootstrap prompt to the Agent. Detailed protocol rules live in auto-iterate-coding/SKILL.md, state.json/state.md, and the referenced gate documents; load them on demand instead of expanding them here.

\`\`\`text
First read auto-iterate-coding/SKILL.md and follow its natural-language routing, session recovery, capability degradation, stop conditions, traceability, and language consistency rules.
If this start prompt came from natural-language routing, confirm that the command used an independent --session <name>.

${startLine}
${buildEnglishExecutionMode(answers)}

Current mode: ${answers.mode} / ${answers.modeLabel}
${answers.modeDescription}

Current session: ${session}
Session machine state: ${stateJsonFile}
Session state view: ${stateFile}
Session start prompt: ${promptFile}
Current pointer: ${currentFile}
Language: en
Language rule: write human-readable output, state notes, summaries, Skill Capture content, and delivery summaries in English; keep commands, file names, JSON keys, API names, and machine enum values unchanged.

Auto-iterate activation statement:
Before starting, state in 1-3 lines that auto-iterate is active, including mode, session, state.json, state.md, current pointer, persistence status, and the next minimal action.
If state.json, state.md, start-prompt.md, or the current pointer cannot be read or written, mark persistence as degraded / not_available and explain why.

Mode rules:
${answers.modeInstructions}

Compact execution loop:
- Treat ${stateJsonFile} as the machine source of truth; read it before continuing and refresh ${stateFile} after state changes.
- Do not rely on conversation history alone. Run reconcile before resuming: branch, git status/diff, state/code consistency, external edits, and whether recent validation can be rerun.
- Probe capabilities: file read/write, commands, real tests, persistent state, coder subagent, read-only exploration helpers, network, database/secrets, and git diff.
- If a capability is unavailable, mark affected requirements not_verified or blocked instead of faking completion or validation.
- Extract and maintain the Requirement Coverage Matrix before implementing long documents, PRDs, issue lists, or checklists.
- Use one minimal focus per iteration, run real validation, audit diff/scope, update state.json first, then refresh state.md.
- Maintain Watchdog, Definition of Done, Style Consolidation, Context Reset Review Gate, Delivery Evidence, Skill Capture, and Post-Agent Validation Gate from state.json and SKILL.md.
- Use fastcar-cli helpers when available: --next ${session}, --merge ${session}, --validate-state ${session} --strict-state, --finalize ${session} --yes, and --check-bloat.
- For native_subagent, follow references/judge-runbook.md: Main Agent validates result schema, Node runner facts, diff/scope, validation.log, state merge, budgets, Watchdog, and delivery gates.
- If Watchdog.required_action is run_validation, reconcile, ask_user, context_compress_and_review, or stop, handle it before continuing.
- context_compress_and_review means an auto-iterate handoff summary plus fresh-eyes review, not a request to trigger runtime context compaction.

## Skill Capture
After delivery, early stop, or milestone acceptance, run Skill Capture. Compress reusable English skill content into Trigger / Signal, Do, Verify, Avoid, Boundary, and Source Evidence; write it under .agents/skills, update .agents/skills/index.md, or set skillCapture.status=skipped_no_high_value with reasons.

Requirements:
Every requirement must include ID, original summary, status, related files, validation evidence, blocking reason, and next step.
Do not deliver successfully while any critical requirement is pending, implemented, or not_verified.
Passing tests is not enough; final completion must be checked against the original requirements.
Detailed gate text is intentionally not duplicated here; read SKILL.md references only when entering that phase.

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

function buildChinesePromptContent(answers: StateObject): string {
  const sourceChecklist = buildSourceChecklist(answers, "zh");
  const startModeLine = answers.autopilot
    ? "请使用 auto-iterate-coding skill，进入 Autopilot 全自动迭代模式。"
    : "请使用 auto-iterate-coding skill，按当前模式执行有边界的 Agent 工作流。";
  const session = String(answers.session || "default");
  const stateJsonFile = sessionValue(answers, "sessionStateJsonFile", ".agent-state/auto-iterate/default/state.json");
  const stateFile = sessionValue(answers, "sessionStateFile", ".agent-state/auto-iterate/default/state.md");
  const promptFile = sessionValue(answers, "sessionPromptFile", ".agent-state/auto-iterate/default/start-prompt.md");
  const currentFile = sessionValue(answers, "currentFile", ".agent-state/auto-iterate-current.json");

  return `# 自动迭代编码启动提示

将下面的轻量启动提示发给 Agent。详细协议规则保留在 auto-iterate-coding/SKILL.md、state.json/state.md 和相关 references 中；进入对应阶段时再按需读取，不在启动 prompt 中重复展开。

\`\`\`text
请先读取 auto-iterate-coding/SKILL.md，按该 skill 的自然语言命令路由、模式选择、session 恢复、能力降级、停止条件、可追溯规则和语言一致性规则执行。
如果本启动提示来自自然语言路由，请确认命令已经包含独立 session；以后每次自然语言路由都必须显式传入 --session <name>。用户未指定 session 时，由 Agent 根据模式和目标生成英文小写、数字和连字符组成的默认 session 名，不要省略 --session。

${startModeLine}
${buildChineseExecutionMode(answers)}

当前启动模式：${answers.mode} / ${answers.modeLabel}
${answers.modeDescription}

当前 session：${session}
Session 机器状态：${stateJsonFile}
Session 状态视图：${stateFile}
Session 启动提示：${promptFile}
Current 指针：${currentFile}

Auto-iterate 激活声明：
开始执行前，请先在对话中用 1-3 行明确声明本任务已经进入 auto-iterate-coding 激活态，并列出 mode、session、state.json、state.md、current 指针、状态持久化能力和下一步最小动作。
如果不能读取或写入 session state.json、state.md、start-prompt 或 current 指针，必须把状态持久化标记为 degraded / not_available，并说明原因；不得把普通对话内多轮修改称为完整 auto-iterate session。

模式执行规则：
${answers.modeInstructions}

轻量执行闭环：
- 请始终使用与用户当前提示一致的语言输出、记录状态和交付总结；本 session 的最终对话回复、本次任务交付总结、阶段验收摘要、Skill Capture 人类可读内容和生成文档必须使用中文；只保留命令、文件名、JSON key、API 名称和 pending / passed / blocked / not_verified 等机器枚举值为英文。
- 如果存在 ${stateJsonFile}，请先读取它作为本 session 的机器权威恢复状态；不要依赖历史对话作为唯一上下文。
- 恢复前执行 reconcile 检查：当前分支、git 状态/diff 摘要、状态文件与当前代码是否一致、是否存在上次停止后的外部修改、最近验证能否重新运行。
- 请先探测当前 Agent 环境可用能力，包括读写文件、运行命令、真实测试、状态持久化、coder subagent、只读探索辅助、网络、数据库/密钥和 git diff；不可用能力要标记 not_verified 或 blocked，不要伪造完成或验证。
- 长文档、PRD、issue 列表或多条清单任务先提取 Requirement Coverage Matrix，再进入实现或验收。
- 每轮只选择一个最小 focus，完成最小修改或只读验证后运行真实验证，审计 diff/scope，先更新 state.json，再刷新 ${stateFile} 生成视图。
- 默认自动模式固定为“主 Agent（裁判）-> 单个 coder subagent（运动员）-> 主 Agent（裁判）”。如为 native_subagent，请按 references/judge-runbook.md 执行 result schema、Node runner 验证、git diff/scope 审计、validation.log、state merge、预算、Watchdog 和交付门禁。
- 可用时使用 CLI 辅助：\`fastcar-cli auto-iterate --next ${session}\`、\`fastcar-cli auto-iterate --merge ${session}\`、\`fastcar-cli auto-iterate --validate-state ${session} --strict-state\`、\`fastcar-cli auto-iterate --finalize ${session} --yes\` 和 \`fastcar-cli auto-iterate --check-bloat\`。
- 请维护 Watchdog、Definition of Done、Style Consolidation、Context Reset Review Gate、Delivery Evidence、Skill Capture 和 Post-Agent Validation Gate；详细门禁文本从 state.json、state.md 和 SKILL.md references 按阶段读取。
- 如果 Watchdog 触发 run_validation、reconcile、ask_user、context_compress_and_review 或 stop，必须先处理 required_action，不得绕过；交付可验证性为 not_verifiable 或 unknown 时，不要按成功交付输出。
- context_compress_and_review 表示 auto-iterate 的交接摘要和新视角复核，不是要求触发运行时上下文压缩。需要时输出 Context Handoff Summary，只保留可执行事实，再以新接手项目的开发者视角重新复核 RCM、代码和验证证据。
- 修 bug、性能回归或验证失败时，请先建立能复现目标问题的 feedback loop；无法建立时停止并说明尝试过什么、缺少什么 artifact 或环境。

## Skill Capture / 技能沉淀
每次任务交付、提前停止或阶段性验收后，都必须执行 Skill Capture / 技能沉淀：只沉淀可迁移、可行动、可验证的技能点，按 Trigger / Signal、Do、Verify、Avoid、Boundary、Source Evidence 结构压缩，写入 .agents/skills 并同步维护 .agents/skills/index.md；没有高价值内容时，将 skillCapture.status 标记为 skipped_no_high_value 并记录 skippedReasons。

需求覆盖要求：
每条需求必须包含 ID、原文摘要、状态、相关文件、验证证据、阻塞原因和下一步。
只要仍存在 pending / implemented / not_verified 的关键需求，就不要按成功交付输出；必须继续迭代，或按提前停止列出剩余需求和原因。
测试通过不等于需求完成，最终完成必须逐项对照原始需求文档。
详细门禁不在启动提示中重复展开；进入 Context Reset Review Gate、validation_hardening、Style Consolidation 或 Skill Capture 阶段时再读取对应 references。

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
