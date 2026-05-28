// @ts-check

const { isSuccessfulWorkerStatus } = require("./mergeRequirements");
const {
  mergeValidationCommandHistory,
  validationHistoryEntries,
} = require("./mergeValidationHistory");

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {unknown} cliStatus
 * @returns {import("./types").ValidationStatus | "skipped_with_reason"}
 */
function normalizePostChangeStatus(cliStatus) {
  if (cliStatus === "passed") {
    return "passed";
  }
  if (cliStatus === "failed") {
    return "failed";
  }
  if (cliStatus === "skipped") {
    return "skipped_with_reason";
  }
  if (cliStatus === "not_available") {
    return "not_available";
  }
  return "not_run";
}

/**
 * @param {unknown} reportStatus
 * @param {import("./types").ValidationResult | null | undefined} cliValidation
 * @returns {import("./types").EffectiveValidationResult}
 */
function normalizeEffectiveValidation(reportStatus, cliValidation) {
  if (isSuccessfulWorkerStatus(reportStatus) || reportStatus === "need_decision") {
    return cliValidation || { status: "not_run", command: null };
  }
  const validation = cliValidation || { status: "not_run", command: null };
  const validationSummary = validation.summary ? `; CLI validation: ${validation.summary}` : "";
  return {
    ...validation,
    status: "failed",
    command: `worker result status: ${reportStatus || "failed"}`,
    exitCode: 1,
    summary: `Worker reported ${reportStatus || "failed"}${validationSummary}`,
  };
}

/**
 * @param {import("./types").ApplyIterationProjectionInput} input
 * @returns {import("./types").PipelineStateLike}
 */
function applyIterationProjection(input) {
  const { state, report, effectiveValidation, status, ctx, text } = input;
  const next = { ...state };
  const currentState = toRecord(next.currentState);
  next.currentState = {
    ...currentState,
    currentPhase: status === "completed" ? "pipeline_iteration_completed" : "pipeline_iteration_attention",
    currentTask: ctx.focus ? `${ctx.focus.type}${ctx.focus.req_id ? `:${ctx.focus.req_id}` : ""}` : "pipeline_iteration",
    nextAction: status === "need_decision" ? text.waitUserDecision : text.chooseNextFocus,
    overallStatus: status === "blocked" ? "blocked" : "in_progress",
    recentChanges: report.summary || text.workerNoSummary,
    keyFiles: Array.isArray(report.files_changed) ? report.files_changed.join(", ") || text.noReport : text.noReport,
    lastValidationCommand: effectiveValidation.command || "not_run",
    lastValidationResult: effectiveValidation.status || "not_run",
  };

  const validation = toRecord(next.validation);
  next.validation = {
    ...validation,
    commands: mergeValidationCommandHistory(validation.commands, validationHistoryEntries(effectiveValidation, ctx.iteration)),
    finalVerifiability: effectiveValidation.status === "passed"
      ? "partially_verifiable"
      : effectiveValidation.status === "failed" ? "unknown" : (validation.finalVerifiability || "unknown"),
  };

  next.postChange = {
    ...toRecord(next.postChange),
    status: normalizePostChangeStatus(effectiveValidation.status),
    command: effectiveValidation.command || "not_run",
    result: effectiveValidation.exitCode === null || effectiveValidation.exitCode === undefined ? null : String(effectiveValidation.exitCode),
    reason: effectiveValidation.summary || "pipeline validation",
    regressionDetected: effectiveValidation.status === "failed",
    perCommand: Array.isArray(effectiveValidation.results)
      ? effectiveValidation.results.map((item) => ({
          command: item.command || "not_run",
          status: item.status || "not_run",
          result: item.exitCode === null || item.exitCode === undefined ? null : String(item.exitCode),
          exitCode: item.exitCode === undefined ? null : item.exitCode,
          signal: item.signal || "none",
          error: item.error || "none",
          durationMs: item.durationMs || 0,
          stdoutTail: item.stdoutTail || "",
          stderrTail: item.stderrTail || "",
        }))
      : [],
  };

  if (effectiveValidation.status === "failed") {
    const deltaAssessment = toRecord(next.deltaAssessment);
    next.deltaAssessment = {
      ...deltaAssessment,
      status: "regression",
      summary: effectiveValidation.summary || report.summary || text.validationFailed,
      baselineRef: deltaAssessment.baselineRef || "baseline",
      postChangeRef: "postChange",
      decision: "retry_new_direction",
    };
    next.iterationPolicy = {
      ...toRecord(next.iterationPolicy),
      lastDecision: "replan",
    };
  }

  const watchdog = toRecord(next.watchdog);
  next.watchdog = {
    ...watchdog,
    enabled: true,
    triggered: status === "need_decision" || status === "blocked",
    requiredAction: status === "need_decision" ? "ask_user" : status === "blocked" ? "stop" : "continue",
    deliveryVerifiability: effectiveValidation.status === "passed"
      ? "partially_verifiable"
      : effectiveValidation.status === "failed" ? "unknown" : (watchdog.deliveryVerifiability || "unknown"),
  };

  if (status === "need_decision" && report.decision_request) {
    next.decisionRequest = {
      status: "pending",
      topic: report.decision_request.topic || text.pipelineDecision,
      background: report.decision_request.background || report.summary || text.workerRequestedDecision,
      options: Array.isArray(report.decision_request.options) ? report.decision_request.options : [],
      recommended: report.decision_request.recommended || "",
      impact: report.decision_request.impact || text.waitUserSelection,
      triggers: ["pipeline_worker"],
      question: report.decision_request.question,
      targetField: report.decision_request.targetField || "pipelineDecision",
      answer: null,
    };
  }

  return next;
}

module.exports = {
  applyIterationProjection,
  normalizeEffectiveValidation,
  normalizePostChangeStatus,
};
