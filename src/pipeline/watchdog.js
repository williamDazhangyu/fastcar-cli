// @ts-check

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @param {import("./types").WatchdogContext} [ctx]
 * @returns {import("./types").WatchdogResult}
 */
function evaluateWatchdog(state, ctx = {}) {
  const watchdog = (state && state.watchdog) || {};
  if (watchdog.requiredAction === "ask_user") {
    return {
      triggered: true,
      requiredAction: "ask_user",
      reason: "need_decision",
    };
  }
  if (watchdog.requiredAction === "stop") {
    return {
      triggered: true,
      requiredAction: "stop",
      reason: "watchdog_stop",
    };
  }
  if (ctx.validation && ctx.validation.status === "failed") {
    return {
      triggered: true,
      requiredAction: "continue",
      reason: "validation_failed",
    };
  }
  if (Number.isInteger(watchdog.noProgressStreak) &&
    Number.isInteger(watchdog.maxNoProgressIterations) &&
    Number(watchdog.noProgressStreak) >= Number(watchdog.maxNoProgressIterations)) {
    return {
      triggered: true,
      requiredAction: "stop",
      reason: "no_progress_streak",
    };
  }
  return {
    triggered: false,
    requiredAction: "continue",
    reason: "clear",
  };
}

module.exports = {
  evaluateWatchdog,
};
