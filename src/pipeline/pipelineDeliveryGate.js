// @ts-check

const { deliveryReady } = require("./shouldStop");
const {
  canFinalizeDelivery,
  finalizeDeliveryState,
  requirementClosure,
} = require("./pipelineFinalization");

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {boolean} hasProgress
 * @param {number} [maxNoProgressIterations]
 * @returns {import("./types").PipelineStateLike}
 */
function updateNoProgressState(state, hasProgress, maxNoProgressIterations = 3) {
  const watchdog = state.watchdog || {};
  const current = typeof watchdog.noProgressStreak === "number" && Number.isInteger(watchdog.noProgressStreak)
    ? watchdog.noProgressStreak
    : 0;
  const nextCount = hasProgress ? 0 : current + 1;
  return {
    ...state,
    watchdog: {
      ...watchdog,
      noProgressStreak: nextCount,
      maxNoProgressIterations,
      triggered: nextCount >= maxNoProgressIterations ? true : watchdog.triggered,
      requiredAction: nextCount >= maxNoProgressIterations ? "stop" : (watchdog.requiredAction || "continue"),
    },
  };
}

/**
 * @param {import("./types").WorkerIterationResult | null | undefined} report
 * @param {import("./types").ValidationResult | null | undefined} cliValidation
 * @returns {boolean}
 */
function needsValidationReconcile(report, cliValidation) {
  const rawRequirements = report ? report.requirements : undefined;
  const requirements = Array.isArray(rawRequirements) ? rawRequirements : [];
  return Boolean(cliValidation && cliValidation.status === "failed" &&
    requirements.some((item) => {
      const requirement = item && typeof item === "object" ? /** @type {{ status?: unknown }} */ (item) : {};
      return requirement.status === "passed";
    }));
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
function stringValue(value, fallback = "unknown") {
  return typeof value === "string" && value ? value : fallback;
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @returns {import("./types").DeliveryGateResult}
 */
function buildDeliveryGate(state) {
  const rawRequirements = state ? state.requirements : undefined;
  const requirements = Array.isArray(rawRequirements) ? rawRequirements : [];
  const normalizedRequirements = requirements.map((item) => (
    item && typeof item === "object"
      ? /** @type {{ id?: unknown; status?: unknown }} */ (item)
      : {}
  ));
  const openRequirements = normalizedRequirements
    .filter((item) => !["passed", "blocked"].includes(String(item.status || "")))
    .map((item) => stringValue(item.id, "unknown"));
  const blockedRequirements = normalizedRequirements
    .filter((item) => item.status === "blocked")
    .map((item) => stringValue(item.id, "unknown"));
  const validation = asRecord(state && state.validation);
  const watchdog = asRecord(state && state.watchdog);
  const evidence = asRecord(state && state.deliveryEvidence);
  const postAgentGate = asRecord(state && state.postAgentValidationGate);
  const cleanup = asRecord(state && state.cleanup);
  const styleConsolidation = asRecord(state && state.styleConsolidation);
  const contextResetReview = asRecord(state && state.contextResetReview);
  const skillCapture = asRecord(state && state.skillCapture);
  const modeState = asRecord(state && state.mode);
  const mode = stringValue(modeState.mode, "strict");
  const knownVerifiability = new Set(["verifiable", "partially_verifiable", "not_verifiable"]);
  /** @type {string[]} */
  const blockingReasons = [];
  if (openRequirements.length > 0) {
    blockingReasons.push("open_requirements");
  }
  if (blockedRequirements.length > 0) {
    blockingReasons.push("blocked_requirements");
  }
  if (!knownVerifiability.has(String(validation.finalVerifiability || "")) ||
    !knownVerifiability.has(String(watchdog.deliveryVerifiability || ""))) {
    blockingReasons.push("unknown_verifiability");
  }
  if (validation.finalVerifiability === "not_verifiable" || watchdog.deliveryVerifiability === "not_verifiable") {
    blockingReasons.push("not_verifiable");
  }
  const postChange = asRecord(state && state.postChange);
  if (postChange.status !== "passed") {
    blockingReasons.push("post_change_not_passed");
  }
  if (postChange.regressionDetected === true) {
    blockingReasons.push("regression_detected");
  }
  if (evidence.status !== "ready" && evidence.status !== "delivered") {
    blockingReasons.push("delivery_evidence_not_ready");
  }
  if (postAgentGate.enabled !== true ||
    postAgentGate.lastResult !== "passed" ||
    postAgentGate.nextAction !== "deliver") {
    blockingReasons.push("post_agent_gate_not_passed");
  }
  if (cleanup.status !== "completed") {
    blockingReasons.push("cleanup_not_completed");
  }
  if (["strict", "quick", "diagnose", "prototype"].includes(mode) && styleConsolidation.status === "pending") {
    blockingReasons.push("style_consolidation_pending");
  }
  if (contextResetReview.status !== "passed" && contextResetReview.status !== "user_accepted_limited") {
    blockingReasons.push("context_reset_review_not_passed");
  }
  if (skillCapture.status === "pending") {
    blockingReasons.push("skill_capture_pending");
  }
  return {
    ready: deliveryReady(state) && blockingReasons.length === 0,
    open_requirements: openRequirements,
    blocked_requirements: blockedRequirements,
    validation_verifiability: stringValue(validation.finalVerifiability),
    watchdog_verifiability: stringValue(watchdog.deliveryVerifiability),
    delivery_evidence_status: stringValue(evidence.status),
    post_agent_gate: stringValue(postAgentGate.lastResult, "not_run"),
    cleanup_status: stringValue(cleanup.status),
    style_consolidation_status: stringValue(styleConsolidation.status),
    context_reset_review_status: stringValue(contextResetReview.status),
    skill_capture_status: stringValue(skillCapture.status),
    blocking_reasons: blockingReasons,
  };
}

module.exports = {
  buildDeliveryGate,
  canFinalizeDelivery,
  finalizeDeliveryState,
  needsValidationReconcile,
  requirementClosure,
  updateNoProgressState,
};
