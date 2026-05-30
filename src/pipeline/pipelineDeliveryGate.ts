import { evaluateDeliveryGates } from "./deliveryGates";
import {
  canFinalizeDelivery,
  finalizeDeliveryState,
  requirementClosure,
} from "./pipelineFinalization";
import type {
  DeliveryGateResult,
  PipelineStateLike,
  ValidationResult,
  WorkerIterationResult,
} from "./types";


/**
 * @param {import("./types").PipelineStateLike} state
 * @param {boolean} hasProgress
 * @param {number} [maxNoProgressIterations]
 * @returns {import("./types").PipelineStateLike}
 */
export function updateNoProgressState(
  state: PipelineStateLike,
  hasProgress: boolean,
  maxNoProgressIterations = 3,
): PipelineStateLike {
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
export function needsValidationReconcile(
  report: WorkerIterationResult | null | undefined,
  cliValidation: ValidationResult | null | undefined,
): boolean {
  const rawRequirements = report ? report.requirements : undefined;
  const requirements = Array.isArray(rawRequirements) ? rawRequirements : [];
  return Boolean(cliValidation && cliValidation.status === "failed" &&
    requirements.some((item) => {
      const requirement = item && typeof item === "object" ? item as { status?: unknown } : {};
      return requirement.status === "passed";
    }));
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @returns {import("./types").DeliveryGateResult}
 */
export function buildDeliveryGate(state: PipelineStateLike | null | undefined): DeliveryGateResult {
  return evaluateDeliveryGates(state);
}

