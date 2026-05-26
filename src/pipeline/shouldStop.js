function hasRemainingBudget(state) {
  const budgets = (state && state.budgets) || {};
  if (Number.isInteger(budgets.remainingImplementationIterations)) {
    return budgets.remainingImplementationIterations > 0;
  }
  if (Number.isInteger(budgets.autopilotMaxIterations)) {
    return (budgets.implementationIterationsUsed || 0) < budgets.autopilotMaxIterations;
  }
  return true;
}

function allRequirementsClosed(state) {
  const requirements = Array.isArray(state && state.requirements) ? state.requirements : [];
  return requirements.length > 0 && requirements.every((item) => item && ["passed", "blocked"].includes(item.status));
}

function hasBlockedRequirement(state) {
  const requirements = Array.isArray(state && state.requirements) ? state.requirements : [];
  return requirements.some((item) => item && item.status === "blocked");
}

function deliveryReady(state) {
  const evidence = (state && state.deliveryEvidence) || {};
  const validation = (state && state.validation) || {};
  const watchdog = (state && state.watchdog) || {};
  const postAgentGate = (state && state.postAgentValidationGate) || {};
  const evidenceReady = evidence.status === "ready" || evidence.status === "delivered";
  const verifiable = validation.finalVerifiability !== "unknown" &&
    watchdog.deliveryVerifiability !== "unknown" &&
    watchdog.deliveryVerifiability !== "not_verifiable";
  const postAgentPassed = postAgentGate.enabled !== true ||
    postAgentGate.lastResult === "passed" ||
    postAgentGate.lastResult === "not_run";
  return evidenceReady && verifiable && postAgentPassed;
}

function shouldStop(state, lastValidation, ctx = {}, mode) {
  if (!hasRemainingBudget(state)) {
    return { stop: true, reason: "budget_exhausted" };
  }

  const watchdog = (state && state.watchdog) || {};
  if (watchdog.requiredAction === "ask_user") {
    return { stop: true, reason: "need_decision" };
  }
  if (watchdog.requiredAction === "stop") {
    return { stop: true, reason: "watchdog_stop" };
  }
  if (Number.isInteger(watchdog.noProgressStreak) &&
    Number.isInteger(watchdog.maxNoProgressIterations) &&
    watchdog.noProgressStreak >= watchdog.maxNoProgressIterations) {
    return { stop: true, reason: "no_progress_streak" };
  }

  if (ctx.once && (state.budgets && state.budgets.totalCycles > 0)) {
    return { stop: true, reason: "once_completed" };
  }

  const stateMode = mode || (state && state.mode && state.mode.mode) || "strict";
  if (stateMode === "plan" && state.budgets && state.budgets.totalCycles > 0) {
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

  if (lastValidation && lastValidation.status === "failed" && ctx.stopOnValidationFailure) {
    return { stop: true, reason: "validation_failed" };
  }

  return { stop: false, reason: "continue" };
}

module.exports = {
  shouldStop,
  deliveryReady,
};
