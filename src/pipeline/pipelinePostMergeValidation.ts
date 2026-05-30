import { mergeValidationCommandHistory } from "./mergeValidationHistory";
import type {
  PipelineStateLike,
  PostChangeStatus,
  ValidationHistoryEntry,
  ValidationPerCommandItem,
  ValidationResult,
  ValidationStatus,
} from "./types";


/**
 * @param {import("./types").ValidationResult} validation
 * @param {number} iteration
 * @param {string} phase
 * @returns {import("./types").ValidationHistoryEntry}
 */
export function validationHistoryItem(
  validation: ValidationResult,
  iteration: number,
  phase: string,
): ValidationHistoryEntry {
  return {
    command: validation.command || "not_run",
    result: validation.status || "not_run",
    summary: validation.summary || "",
    exitCode: validation.exitCode === undefined ? null : validation.exitCode,
    iteration,
    phase,
  };
}

/**
 * @param {import("./types").ValidationResult | null | undefined} validation
 * @param {number} iteration
 * @param {string} phase
 * @returns {import("./types").ValidationHistoryEntry[]}
 */
export function validationHistoryItems(
  validation: ValidationResult | null | undefined,
  iteration: number,
  phase: string,
): ValidationHistoryEntry[] {
  const results = validation && Array.isArray(validation.results) ? validation.results : [];
  if (results.length > 0) {
    return results.map((item) => ({
      command: item.command || "not_run",
      result: item.status || "not_run",
      summary: [item.stdoutTail, item.stderrTail].filter(Boolean).join("\n"),
      exitCode: item.exitCode === undefined ? null : item.exitCode,
      iteration,
      phase,
    }));
  }
  return validation && validation.command
    ? [validationHistoryItem(validation, iteration, phase)]
    : [];
}

/**
 * @param {import("./types").ValidationResult | null | undefined} validation
 * @returns {import("./types").ValidationPerCommandItem[]}
 */
export function validationPerCommand(
  validation: ValidationResult | null | undefined,
): ValidationPerCommandItem[] {
  const results = validation && Array.isArray(validation.results) ? validation.results : [];
  return results.length > 0
    ? results.map((item) => ({
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
    : [];
}

/**
 * @param {import("./types").ValidationStatus | string | null | undefined} status
 * @returns {import("./types").PostChangeStatus}
 */
export function normalizePostMergePostChangeStatus(
  status: ValidationStatus | string | null | undefined,
): PostChangeStatus {
  if (status === "passed") {
    return "passed";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "skipped") {
    return "skipped_with_reason";
  }
  if (status === "not_available") {
    return "not_available";
  }
  return "not_run";
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").ValidationResult} validation
 * @param {number} iteration
 * @returns {import("./types").PipelineStateLike}
 */
export function applyPostMergeValidationState(
  state: PipelineStateLike,
  validation: ValidationResult,
  iteration: number,
): PipelineStateLike {
  const passed = validation.status === "passed";
  /** @type {import("./types").PipelineStateLike} */
  const next = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  const validationState = next.validation && typeof next.validation === "object" ? next.validation : {};
  next.validation = {
    ...validationState,
    commands: mergeValidationCommandHistory(
      validationState.commands,
      validationHistoryItems(validation, iteration, "post_merge"),
    ),
    finalVerifiability: passed ? "partially_verifiable" : "unknown",
  };
  next.postChange = {
    ...(next.postChange || {}),
    status: normalizePostMergePostChangeStatus(validation.status),
    command: validation.command || "not_run",
    result: validation.exitCode === null || validation.exitCode === undefined ? null : String(validation.exitCode),
    reason: validation.summary || "post-merge validation",
    regressionDetected: validation.status === "failed",
    perCommand: validationPerCommand(validation),
  };
  const currentState = next.currentState && typeof next.currentState === "object" ? next.currentState : {};
  next.currentState = {
    ...currentState,
    lastValidationCommand: validation.command || "not_run",
    lastValidationResult: validation.status || "not_run",
    nextAction: passed
      ? (currentState.nextAction || "由 CLI 选择下一轮 focus")
      : "修复 post-merge validation 失败后重新验证",
  };
  const watchdog = next.watchdog && typeof next.watchdog === "object" ? next.watchdog : {};
  next.watchdog = {
    ...watchdog,
    enabled: true,
    triggered: validation.status === "failed" ? true : (watchdog.triggered || false),
    requiredAction: validation.status === "failed" ? "continue" : (watchdog.requiredAction || "continue"),
    deliveryVerifiability: passed ? "partially_verifiable" : "unknown",
  };
  if (validation.status === "failed") {
    const deltaAssessment = next.deltaAssessment && typeof next.deltaAssessment === "object" ? next.deltaAssessment : {};
    next.deltaAssessment = {
      ...deltaAssessment,
      status: "regression",
      summary: validation.summary || "post-merge validation failed",
      baselineRef: deltaAssessment.baselineRef || "baseline",
      postChangeRef: "postMergeValidation",
      decision: "retry_new_direction",
    };
    next.iterationPolicy = {
      ...(next.iterationPolicy || {}),
      lastDecision: "replan",
    };
  }
  return next;
}

