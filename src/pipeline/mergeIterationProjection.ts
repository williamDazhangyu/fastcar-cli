import { isSuccessfulWorkerStatus } from "./mergeRequirements";
import {
  mergeValidationCommandHistory,
  validationHistoryEntries,
} from "./mergeValidationHistory";
import { asRecord } from "./valueUtils";
import type {
  ApplyIterationProjectionInput,
  EffectiveValidationResult,
  PipelineStateLike,
  PostChangeStatus,
  ValidationResult,
  ValidationStatus,
} from "./types";


function textValue(text: Record<string, unknown>, key: string): string {
  const value = text[key];
  return typeof value === "string" ? value : "";
}

/**
 * @param {unknown} cliStatus
 * @returns {import("./types").ValidationStatus | "skipped_with_reason"}
 */
export function normalizePostChangeStatus(cliStatus: unknown): ValidationStatus | PostChangeStatus {
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
export function normalizeEffectiveValidation(
  reportStatus: unknown,
  cliValidation: ValidationResult | null | undefined,
): EffectiveValidationResult {
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
export function applyIterationProjection(input: ApplyIterationProjectionInput): PipelineStateLike {
  const { state, report, effectiveValidation, status, ctx, text } = input;
  const next = { ...state };
  const currentState = asRecord(next.currentState);
  next.currentState = {
    ...currentState,
    currentPhase: status === "completed" ? "pipeline_iteration_completed" : "pipeline_iteration_attention",
    currentTask: ctx.focus ? `${ctx.focus.type}${ctx.focus.req_id ? `:${ctx.focus.req_id}` : ""}` : "pipeline_iteration",
    nextAction: status === "need_decision" ? textValue(text, "waitUserDecision") : textValue(text, "chooseNextFocus"),
    overallStatus: status === "blocked" ? "blocked" : "in_progress",
    recentChanges: report.summary || textValue(text, "workerNoSummary"),
    keyFiles: Array.isArray(report.files_changed) ? report.files_changed.join(", ") || textValue(text, "noReport") : textValue(text, "noReport"),
    lastValidationCommand: effectiveValidation.command || "not_run",
    lastValidationResult: effectiveValidation.status || "not_run",
  };

  const validation = asRecord(next.validation);
  next.validation = {
    ...validation,
    commands: mergeValidationCommandHistory(validation.commands, validationHistoryEntries(effectiveValidation, ctx.iteration)),
    finalVerifiability: effectiveValidation.status === "passed"
      ? "partially_verifiable"
      : effectiveValidation.status === "failed" ? "unknown" : (validation.finalVerifiability || "unknown"),
  };

  next.postChange = {
    ...asRecord(next.postChange),
    status: normalizePostChangeStatus(effectiveValidation.status),
    command: effectiveValidation.command || "not_run",
    result: effectiveValidation.exitCode === null || effectiveValidation.exitCode === undefined ? null : String(effectiveValidation.exitCode),
    reason: effectiveValidation.summary || "pipeline validation",
    regressionDetected: effectiveValidation.status === "failed",
    perCommand: Array.isArray(effectiveValidation.results)
      ? effectiveValidation.results.map((item) => ({
            command: item.command || "not_run",
            executable: item.executable,
            args: Array.isArray(item.args) ? item.args : undefined,
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
    const deltaAssessment = asRecord(next.deltaAssessment);
    next.deltaAssessment = {
      ...deltaAssessment,
      status: "regression",
      summary: effectiveValidation.summary || report.summary || textValue(text, "validationFailed"),
      baselineRef: deltaAssessment.baselineRef || "baseline",
      postChangeRef: "postChange",
      decision: "retry_new_direction",
    };
    next.iterationPolicy = {
      ...asRecord(next.iterationPolicy),
      lastDecision: "replan",
    };
  }

  const watchdog = asRecord(next.watchdog);
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
      topic: report.decision_request.topic || textValue(text, "pipelineDecision"),
      background: report.decision_request.background || report.summary || textValue(text, "workerRequestedDecision"),
      options: Array.isArray(report.decision_request.options) ? report.decision_request.options : [],
      recommended: report.decision_request.recommended || "",
      impact: report.decision_request.impact || textValue(text, "waitUserSelection"),
      triggers: ["pipeline_worker"],
      question: report.decision_request.question,
      targetField: report.decision_request.targetField || "pipelineDecision",
      answer: null,
    };
  }

  return next;
}

