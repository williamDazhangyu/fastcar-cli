import {
  getLanguageText,
  languageCode,
} from "./language";
import type {
  BuildIterationPromptContext,
  PipelineFocus,
  ValidationResult,
} from "./types";


/**
 * @param {unknown} value
 * @returns {string}
 */
function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeList(value: unknown): string[] {
  if (!value) {
    return [];
  }
  return (Array.isArray(value) ? value : [value])
    .filter((item) => item !== null && item !== undefined && item !== "")
    .map(String);
}

/**
 * @param {Partial<import("./types").BuildIterationPromptContext>} [ctx]
 * @returns {string[]}
 */
function buildAllowedFiles(ctx: Partial<BuildIterationPromptContext> = {}): string[] {
  const lang = languageCode(ctx.language);
  const files = normalizeList(ctx.writeScope || ctx.scope);
  if (ctx.mode === "prototype" && files.length === 0) {
    return ["prototype/**"];
  }
  if (ctx.mode === "verify" && !ctx.allowModify) {
    return [lang === "en" ? "read-only mode: do not modify project files" : "只读模式：不得修改项目文件"];
  }
  if (ctx.mode === "plan") {
    return [lang === "en" ? "plan-only mode: do not modify project files" : "只读规划：不得修改项目文件"];
  }
  return files.length > 0 ? files : [lang === "en"
    ? "No explicit limit; still modify only files directly related to this focus"
    : "未显式限制；仍只能修改本轮 focus 直接相关文件"];
}

/**
 * @param {import("./types").PipelineFocus} [focus]
 * @param {string} [mode]
 * @param {unknown} [language]
 * @returns {string[]}
 */
function buildFocusRules(
  focus: PipelineFocus = {},
  mode?: string,
  language?: unknown,
): string[] {
  const lang = languageCode(language);
  if (lang === "en") {
    const rules = [];
    switch (focus.type) {
      case "reproduce":
        rules.push("First establish the smallest repeatable reproduction, including command, failure signal, and related files.");
        rules.push("Do not fix directly unless the reproduction test/script needs minimal setup.");
        break;
      case "hypothesis_test":
        rules.push("Validate exactly one falsifiable hypothesis; the summary must state the hypothesis, observations, and whether it was ruled out.");
        break;
      case "implement_req":
        rules.push("Prefer adding or updating behavior tests for this slice; explain in risks if tests cannot be written.");
        rules.push("Only advance this req_id in requirements; after implementation, mark at most implemented because CLI validation decides passed.");
        break;
      case "fix_bug":
        rules.push("Start by writing or locating one minimal reproduction test/command, then make the smallest fix.");
        rules.push("The summary must state the first failure signal and the fix hypothesis.");
        break;
      case "verify_req":
        rules.push("Read-only inspect existing implementation and evidence; do not modify files by default.");
        rules.push("If real validation evidence is missing, mark the requirement not_verified and do not claim passed.");
        break;
      case "harden_validation":
        rules.push("Add boundary, negative, or regression validation without expanding product behavior.");
        rules.push("Record the hardening dimension and evidence summary in state_patch.deliveryEvidence.");
        break;
      case "optimize":
        rules.push("Only make comparable, reversible, behavior-preserving optimizations; keep or add validation evidence.");
        rules.push("The summary must state the baseline and post-optimization comparable metric or rationale.");
        break;
      case "verify_optimization":
        rules.push("Only verify optimized behavior and metrics; do not expand optimization scope.");
        rules.push("If comparable evidence is missing, mark optimization not_verified or blocked.");
        break;
      case "regression_check":
        rules.push("Only run or add regression checks to confirm the original reproduction no longer triggers.");
        break;
      case "establish_baseline":
        rules.push(mode === "diagnose" ? "Establish a repeatable reproduction baseline, preferably a failing command or minimal reproduction." : "Establish a pre-change/pre-optimization baseline with a repeatable validation command.");
        break;
      case "plan_once":
        rules.push("Only output the plan and risks; do not modify project files.");
        break;
      case "extract_requirements":
        rules.push("Extract the Requirement Coverage Matrix from the source document or goal; do not implement.");
        break;
      default:
        rules.push("Follow this focus summary and do not advance other tasks.");
    }
    return rules;
  }
  const rules = [];
  switch (focus.type) {
    case "reproduce":
      rules.push("先建立最小可重复复现，记录复现命令、失败信号和相关文件。");
      rules.push("不要直接修复，除非复现所需的测试/脚本本身需要最小补齐。");
      break;
    case "hypothesis_test":
      rules.push("只验证一个可证伪假设，summary 写明假设、观察结果和是否排除。");
      break;
    case "implement_req":
      rules.push("必须优先补充或更新本切片的行为测试；无法写测试时在 risks 中说明原因。");
      rules.push("requirements 中只能推进本轮 req_id；实现后最多标记为 implemented，passed 由 CLI 验证决定。");
      break;
    case "fix_bug":
      rules.push("先写或定位一个最小复现测试/命令，再做最小修复。");
      rules.push("summary 必须说明首个失败信号和修复假设。");
      break;
    case "verify_req":
      rules.push("只读检查现有实现和证据，默认禁止修改文件。");
      rules.push("如果缺少真实验证证据，将需求标为 not_verified，不要声称 passed。");
      break;
    case "harden_validation":
      rules.push("补充 boundary、negative 或 regression 验证覆盖；不要扩大产品行为。");
      rules.push("state_patch.deliveryEvidence 中记录加固维度和证据摘要。");
      break;
    case "optimize":
      rules.push("只做可比较、可回退、行为不变的优化；必须保留或补充验证证据。");
      rules.push("summary 必须说明 baseline 与优化后的可比较指标或理由。");
      break;
    case "verify_optimization":
      rules.push("只验证优化后的行为和指标，不再扩大优化范围。");
      rules.push("如果缺少可比较证据，将优化状态标记为 not_verified 或 blocked。");
      break;
    case "regression_check":
      rules.push("只运行或补充回归检查，确认原始复现不再触发。");
      break;
    case "establish_baseline":
      rules.push(mode === "diagnose" ? "建立可重复复现 baseline，优先产出失败命令或最小复现。" : "建立优化/修改前 baseline，记录可重复验证命令。");
      break;
    case "plan_once":
      rules.push("只输出计划和风险，不修改项目文件。");
      break;
    case "extract_requirements":
      rules.push("从来源文档或目标中提取 Requirement Coverage Matrix，不做实现。");
      break;
    default:
      rules.push("遵守本轮 focus 摘要，不推进其他任务。");
  }
  return rules;
}

/**
 * @param {import("./types").ValidationResult | null | undefined} lastValidation
 * @returns {string}
 */
function buildLastValidation(lastValidation: ValidationResult | null | undefined): string {
  if (!lastValidation) {
    return "none";
  }
  return formatJson({
    status: lastValidation.status || "unknown",
    command: lastValidation.command || null,
    exitCode: lastValidation.exitCode ?? null,
    summary: lastValidation.summary || "",
  });
}

/**
 * @param {import("./types").BuildIterationPromptContext} ctx
 * @returns {string}
 */
export function buildIterationPrompt(ctx: BuildIterationPromptContext): string {
  const allowedFiles = buildAllowedFiles(ctx);
  const focusRules = buildFocusRules(ctx.focus, ctx.mode, ctx.language);
  const statusValues = ["completed", "failed", "blocked", "need_decision", "no_progress"];
  const lang = languageCode(ctx.language);
  const text = getLanguageText(ctx.language);
  if (lang === "en") {
    const lines = [
      "# auto-iterate pipeline worker",
      "",
      `Session: ${ctx.session}`,
      `Iteration: ${ctx.iteration}`,
      `Mode: ${ctx.mode}`,
      `Focus: ${ctx.focus.type}${ctx.focus.req_id ? `:${ctx.focus.req_id}` : ""}`,
      `Focus summary: ${ctx.focus.summary}`,
      `Result path: ${ctx.resultPath}`,
      `Autopilot: ${ctx.autopilotRun ? "true" : "false"}`,
      "",
      "Hard rules:",
      "- Do exactly this one focus and then exit.",
      "- After writing the JSON result file, stop immediately; do not run validation or extra inspection.",
      "- Do not read or write .agent-state/ except the exact result path above.",
      "- Do not decrement budgets, edit state.json/state.md, or decide whole-task completion.",
      "- Do not fake validation; CLI runs validation independently.",
      "- Do not output private chain-of-thought. Provide only a concise public audit summary in trace.rationaleSummary.",
      "- Keep changes inside the current focus and existing project conventions.",
      "- Write all human-readable summary/risk/evidence fields in English; keep JSON keys and enum values exactly as specified.",
      "",
      "Allowed file scope:",
      ...allowedFiles.map((item) => `- ${item}`),
      "",
      "Focus-specific hard rules:",
      ...focusRules.map((item) => `- ${item}`),
      "",
      "Last CLI validation:",
      buildLastValidation(ctx.lastValidation),
      "",
      "Write JSON to the result path with this schema:",
      formatJson({
        status: statusValues.join("|"),
        summary: "What changed, failed, or made no progress this iteration",
        files_changed: ["relative path; empty array if no files changed"],
        requirements: [{
          id: ctx.focus.req_id || "REQ-001",
          summary: "Requirement summary",
          type: "feature|compatibility|validation|performance|security|docs|constraint",
          status: "pending|implemented|passed|blocked|not_verified",
          relatedFiles: ["relative path"],
          evidence: "Evidence summary; passed can still be downgraded by CLI validation",
          blockedReason: "none or blocking reason",
          nextStep: "Next step",
        }],
        state_patch: {
          currentState: { currentTask: "This focus summary" },
          deliveryEvidence: { note: "optional evidence" },
          notes: ["optional note"],
          hypotheses: ["optional diagnosis/optimization hypothesis"],
          optimizationMetrics: [{
            name: "duration or quality metric name",
            value: 123,
            unit: "ms|count|score",
            direction: "lower_is_better|higher_is_better",
            source: "validation command or measurement method",
          }],
        },
        trace: {
          rationaleSummary: "Public reasoning summary only; no private chain-of-thought",
          decisions: [{ topic: "Decision made this iteration", reason: "Public reason", impact: "Expected impact" }],
          evidence: [{ source: "file, command, or observation", detail: "Evidence summary" }],
        },
        documentation: {
          apiChanges: ["API changes to include in api.md"],
          architectureNotes: ["Architecture notes to include in architecture.md"],
          implementationNotes: ["Core implementation notes to include in implementation.md"],
          changelogEntries: ["User-facing changelog entry"],
        },
        risks: "Remaining risks",
        blocked_reason: "",
        decision_request: {
          question: "Required only when status=need_decision",
          options: [{ id: "A", label: "Option A" }],
          recommended: "A",
        },
      }),
      "",
      "Status meaning:",
      "- completed: This focus produced valid output; CLI validation decides whether requirements can be passed.",
      "- no_progress: No safe or verifiable output was produced; explain why.",
      "- failed: This iteration failed; summary states the first key failure signal.",
      "- blocked: Missing resource, scope, or decision prevents progress.",
      "- need_decision: The user must decide; provide decision_request.",
    ];
    return `${lines.join("\n")}\n`;
  }
  const lines = [
    "# auto-iterate pipeline worker",
    "",
    `Session: ${ctx.session}`,
    `Iteration: ${ctx.iteration}`,
    `Mode: ${ctx.mode}`,
    `Focus: ${ctx.focus.type}${ctx.focus.req_id ? `:${ctx.focus.req_id}` : ""}`,
    `Focus summary: ${ctx.focus.summary}`,
    `Result path: ${ctx.resultPath}`,
    `Autopilot: ${ctx.autopilotRun ? "true" : "false"}`,
    "",
    "Hard rules:",
    "- Do exactly this one focus and then exit.",
    "- After writing the JSON result file, stop immediately; do not run validation or extra inspection.",
    "- Do not read or write .agent-state/ except the exact result path above.",
    "- Do not decrement budgets, edit state.json/state.md, or decide whole-task completion.",
    "- Do not fake validation; CLI runs validation independently.",
    "- 不得输出私有思考链。trace.rationaleSummary 只能写公开、可审计的推理摘要。",
    "- Keep changes inside the current focus and existing project conventions.",
    "- 所有人类可读 summary/risks/evidence 字段使用中文；JSON key 和枚举值保持指定英文。",
    "",
    "Allowed file scope:",
    ...allowedFiles.map((item) => `- ${item}`),
    "",
    "Focus-specific hard rules:",
    ...focusRules.map((item) => `- ${item}`),
    "",
    "Last CLI validation:",
    buildLastValidation(ctx.lastValidation),
    "",
    "Write JSON to the result path with this schema:",
    formatJson({
      status: statusValues.join("|"),
      summary: "本轮完成内容、失败信号或无进展原因",
      files_changed: ["相对路径；无修改则为空数组"],
      requirements: [{
        id: ctx.focus.req_id || "REQ-001",
        summary: "需求摘要",
        type: "功能|兼容性|验证|性能|安全|文档|约束",
        status: "pending|implemented|passed|blocked|not_verified",
        relatedFiles: ["相对路径"],
        evidence: "证据摘要；passed 仍会被 CLI 验证降级",
        blockedReason: "无或阻塞原因",
        nextStep: "下一步",
      }],
      state_patch: {
        currentState: { currentTask: "本轮 focus 摘要" },
        deliveryEvidence: { note: "可选证据" },
        notes: ["可选追加备注"],
        hypotheses: ["可选诊断/优化假设"],
        optimizationMetrics: [{
          name: "耗时或质量指标名",
          value: 123,
          unit: "ms|count|score",
          direction: "lower_is_better|higher_is_better",
          source: "验证命令或测量方式",
        }],
      },
      trace: {
        rationaleSummary: "只写公开推理摘要，不写私有思考链",
        decisions: [{ topic: "本轮决策", reason: "公开理由", impact: "影响范围" }],
        evidence: [{ source: "文件、命令或观察", detail: "证据摘要" }],
      },
      documentation: {
        apiChanges: ["写入 api.md 的 API 变化"],
        architectureNotes: ["写入 architecture.md 的架构说明"],
        implementationNotes: ["写入 implementation.md 的核心实现说明"],
        changelogEntries: ["写入 changelog.md 的变更记录"],
      },
      risks: "剩余风险",
      blocked_reason: "",
      decision_request: {
        question: "仅 status=need_decision 时必填",
        options: [{ id: "A", label: "选项 A" }],
        recommended: "A",
      },
    }),
    "",
    "Status meaning:",
    "- completed: 本轮 focus 有有效产出；CLI 验证决定需求是否能 passed。",
    "- no_progress: 本轮没有安全或可验证产出；必须说明原因。",
    "- failed: 本轮执行失败，summary 写首个关键失败信号。",
    "- blocked: 缺少资源、范围或决策且无法继续。",
    "- need_decision: 必须询问用户，提供 decision_request。",
  ];
  return `${lines.join("\n")}\n`;
}

