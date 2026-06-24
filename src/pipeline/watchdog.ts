import type {
  PipelineStateLike,
  WatchdogContext,
  WatchdogResult,
} from "./types";

export function evaluateWatchdog(
  state: PipelineStateLike | null | undefined,
  ctx: WatchdogContext = {},
): WatchdogResult {
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
  if (
    Number.isInteger(watchdog.noProgressStreak) &&
    Number.isInteger(watchdog.maxNoProgressIterations) &&
    Number(watchdog.noProgressStreak) >= Number(watchdog.maxNoProgressIterations)
  ) {
    return {
      triggered: true,
      requiredAction: "stop",
      reason: "no_progress_streak",
    };
  }

  // 新增：state drift 检查
  if (ctx.reconcileStatus && ctx.reconcileStatus !== "clear") {
    return {
      triggered: true,
      requiredAction: "reconcile",
      reason: "state_drift",
    };
  }

  // 新增：fresh eyes 检查
  if (watchdog.freshEyesRequired === true) {
    return {
      triggered: true,
      requiredAction: "context_compress_and_review",
      reason: "fresh_eyes_required",
    };
  }

  // 新增：验证加固缺口检查
  if (ctx.allRequirementsPassed && watchdog.validationHardeningStatus !== "passed") {
    return {
      triggered: true,
      requiredAction: "run_validation",
      reason: "hardening_gap",
    };
  }

  return {
    triggered: false,
    requiredAction: "continue",
    reason: "clear",
  };
}
