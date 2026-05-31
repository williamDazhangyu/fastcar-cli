import { evaluateDeliveryGates } from "./deliveryGates";
import type {
  PipelineStateLike,
  ShouldStopContext,
  ShouldStopResult,
  ValidationResult,
} from "./types";

function hasRemainingBudget(
  state: PipelineStateLike | null | undefined,
  mode: string,
): boolean {
  const budgets = (state && state.budgets) || {};
  const runtimeAutopilot = Boolean(state && state.mode && state.mode.runtimeAutopilot);
  if (mode === "optimize" && Number.isInteger(budgets.remainingOptimizationIterations)) {
    const focus = state && state.optimization;
    if (focus && ["implemented", "optimized", "passed", "no_improvement"].includes(focus.status || "")) {
      return true;
    }
    return Number(budgets.remainingOptimizationIterations) > 0;
  }
  if (runtimeAutopilot && Number.isInteger(budgets.autopilotMaxIterations)) {
    return Number(budgets.totalCycles || 0) < Number(budgets.autopilotMaxIterations);
  }
  if (Number.isInteger(budgets.remainingImplementationIterations)) {
    return Number(budgets.remainingImplementationIterations) > 0;
  }
  if (Number.isInteger(budgets.autopilotMaxIterations)) {
    return Number(budgets.totalCycles || budgets.implementationIterationsUsed || 0) < Number(budgets.autopilotMaxIterations);
  }
  return true;
}

function hasStatus(item: unknown): item is { status?: string } {
  return Boolean(item && typeof item === "object" && !Array.isArray(item));
}

function allRequirementsClosed(state: PipelineStateLike | null | undefined): boolean {
  const requirements = state && Array.isArray(state.requirements) ? state.requirements : [];
  return requirements.length > 0 &&
    requirements.every((item) => hasStatus(item) && ["passed", "blocked"].includes(item.status || ""));
}

function hasBlockedRequirement(state: PipelineStateLike | null | undefined): boolean {
  const requirements = state && Array.isArray(state.requirements) ? state.requirements : [];
  return requirements.some((item) => hasStatus(item) && item.status === "blocked");
}

export function deliveryReady(state: PipelineStateLike | null | undefined): boolean {
  return evaluateDeliveryGates(state).ready;
}

export function shouldStop(
  state: PipelineStateLike | null | undefined,
  lastValidation: ValidationResult | null | undefined,
  ctx: ShouldStopContext = {},
  mode?: string,
): ShouldStopResult {
  const stateMode = mode || (state && state.mode && typeof state.mode.mode === "string" ? state.mode.mode : "strict");
  const watchdog = (state && state.watchdog) || {};
  if (watchdog.requiredAction === "ask_user") {
    return { stop: true, reason: "need_decision" };
  }
  if (watchdog.requiredAction === "stop") {
    return { stop: true, reason: "watchdog_stop" };
  }
  if (
    Number.isInteger(watchdog.noProgressStreak) &&
    Number.isInteger(watchdog.maxNoProgressIterations) &&
    Number(watchdog.noProgressStreak) >= Number(watchdog.maxNoProgressIterations)
  ) {
    return { stop: true, reason: "no_progress_streak" };
  }

  if (ctx.once && Number(ctx.runCyclesCompleted || 0) > 0) {
    return { stop: true, reason: "once_completed" };
  }

  if (stateMode === "plan" && state && state.budgets && Number(state.budgets.totalCycles || 0) > 0) {
    return { stop: true, reason: "plan_once_completed" };
  }

  if (hasBlockedRequirement(state)) {
    return { stop: true, reason: "requirements_blocked" };
  }
  if (allRequirementsClosed(state)) {
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
