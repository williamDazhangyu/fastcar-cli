// @ts-check

const { isImplementationMode } = require("../auto-iterate/modeRules");

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @param {string} mode
 * @returns {boolean}
 */
function hasRemainingBudget(state, mode) {
  const budgets = (state && state.budgets) || {};
  if (mode === "optimize" && Number.isInteger(budgets.remainingOptimizationIterations)) {
    const focus = state && state.optimization;
    if (focus && ["implemented", "optimized", "passed", "no_improvement"].includes(focus.status || "")) {
      return true;
    }
    return Number(budgets.remainingOptimizationIterations) > 0;
  }
  if (Number.isInteger(budgets.remainingImplementationIterations)) {
    return Number(budgets.remainingImplementationIterations) > 0;
  }
  if (Number.isInteger(budgets.autopilotMaxIterations)) {
    return (budgets.implementationIterationsUsed || 0) < Number(budgets.autopilotMaxIterations);
  }
  return true;
}

/**
 * @param {unknown} item
 * @returns {item is { status?: string }}
 */
function hasStatus(item) {
  return Boolean(item && typeof item === "object" && !Array.isArray(item));
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @returns {boolean}
 */
function allRequirementsClosed(state) {
  const requirements = state && Array.isArray(state.requirements) ? state.requirements : [];
  return requirements.length > 0 && requirements.every((item) => hasStatus(item) && ["passed", "blocked"].includes(item.status || ""));
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @returns {boolean}
 */
function hasBlockedRequirement(state) {
  const requirements = state && Array.isArray(state.requirements) ? state.requirements : [];
  return requirements.some((item) => hasStatus(item) && item.status === "blocked");
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @returns {boolean}
 */
function deliveryReady(state) {
  const evidence = (state && state.deliveryEvidence) || {};
  const validation = (state && state.validation) || {};
  const watchdog = (state && state.watchdog) || {};
  const postChange = (state && state.postChange) || {};
  const postAgentGate = (state && state.postAgentValidationGate) || {};
  const cleanup = (state && state.cleanup) || {};
  const styleConsolidation = (state && state.styleConsolidation) || {};
  const contextResetReview = (state && state.contextResetReview) || {};
  const skillCapture = (state && state.skillCapture) || {};
  const mode = state && state.mode && typeof state.mode.mode === "string" ? state.mode.mode : "strict";
  const evidenceReady = evidence.status === "ready" || evidence.status === "delivered";
  const allowedVerifiability = new Set(["verifiable", "partially_verifiable"]);
  const verifiable = allowedVerifiability.has(String(validation.finalVerifiability || "")) &&
    allowedVerifiability.has(String(watchdog.deliveryVerifiability || ""));
  const postChangePassed = postChange.status === "passed" &&
    postChange.regressionDetected !== true;
  const postAgentPassed = postAgentGate.enabled === true &&
    postAgentGate.lastResult === "passed" &&
    postAgentGate.nextAction === "deliver";
  const cleanupCompleted = cleanup.status === "completed";
  const styleReady = !isImplementationMode(mode) || styleConsolidation.status !== "pending";
  const contextReviewReady = contextResetReview.status === "passed" ||
    contextResetReview.status === "user_accepted_limited";
  const skillCaptureReady = skillCapture.status !== "pending";
  return evidenceReady &&
    verifiable &&
    postChangePassed &&
    postAgentPassed &&
    cleanupCompleted &&
    styleReady &&
    contextReviewReady &&
    skillCaptureReady;
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @param {import("./types").ValidationResult | null | undefined} lastValidation
 * @param {import("./types").ShouldStopContext} [ctx]
 * @param {string} [mode]
 * @returns {import("./types").ShouldStopResult}
 */
function shouldStop(state, lastValidation, ctx = {}, mode) {
  const stateMode = mode || (state && state.mode && typeof state.mode.mode === "string" ? state.mode.mode : "strict");
  const watchdog = (state && state.watchdog) || {};
  if (watchdog.requiredAction === "ask_user") {
    return { stop: true, reason: "need_decision" };
  }
  if (watchdog.requiredAction === "stop") {
    return { stop: true, reason: "watchdog_stop" };
  }
  if (Number.isInteger(watchdog.noProgressStreak) &&
    Number.isInteger(watchdog.maxNoProgressIterations) &&
    Number(watchdog.noProgressStreak) >= Number(watchdog.maxNoProgressIterations)) {
    return { stop: true, reason: "no_progress_streak" };
  }

  if (ctx.once && Number(ctx.runCyclesCompleted || 0) > 0) {
    return { stop: true, reason: "once_completed" };
  }

  if (stateMode === "plan" && state && state.budgets && Number(state.budgets.totalCycles || 0) > 0) {
    return { stop: true, reason: "plan_once_completed" };
  }

  if (allRequirementsClosed(state)) {
    if (hasBlockedRequirement(state)) {
      return { stop: true, reason: "requirements_blocked" };
    }
    if (deliveryReady(state)) {
      return { stop: true, reason: "delivery_ready" };
    }
  }

  if (!hasRemainingBudget(state, stateMode)) {
    return { stop: true, reason: "budget_exhausted" };
  }

  if (lastValidation && lastValidation.status === "failed" && ctx.stopOnValidationFailure) {
    return { stop: true, reason: "validation_failed" };
  }

  return { stop: false, reason: "continue" };
}

module.exports = {
  shouldStop,
  deliveryReady,
};
