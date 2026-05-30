import { ENGINE_PHASES } from "../auto-iterate/stateValidationHelpers";
import { evaluateDeliveryGates } from "./deliveryGates";
import { addReason, asRecord } from "./valueUtils";
import type {
  PhaseGateContext,
  PhaseGateResult,
  PipelineStateLike,
} from "./types";

type PhaseGateStatus = "pending" | "passed" | "blocked" | "skipped_with_reason";

/**
 * @param {unknown} item
 * @returns {item is { status?: string }}
 */
function hasStatus(item: unknown): item is { status?: string } {
  return Boolean(item && typeof item === "object" && !Array.isArray(item));
}

/**
 * @param {unknown} gate
 * @returns {Record<string, unknown>}
 */
function normalizeGate(gate: unknown): Record<string, unknown> {
  return asRecord(gate);
}

/**
 * @param {string} phase
 * @param {import("./types").PhaseGateResult} result
 * @returns {"pending" | "passed" | "blocked" | "skipped_with_reason"}
 */
function phaseStatus(phase: string, result: PhaseGateResult): PhaseGateStatus {
  const currentIndex = ENGINE_PHASES.indexOf(result.phase);
  const phaseIndex = ENGINE_PHASES.indexOf(phase);
  if (phase === result.phase) {
    return result.canProceed ? "passed" : "pending";
  }
  if (currentIndex >= 0 && phaseIndex >= 0 && phaseIndex < currentIndex) {
    return "passed";
  }
  return result.canProceed ? "passed" : "blocked";
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").PhaseGateResult} result
 * @returns {import("./types").PipelineStateLike}
 */
export function applyPhaseGateToState(
  state: PipelineStateLike,
  result: PhaseGateResult,
): PipelineStateLike {
  const currentPhaseGate = asRecord(state.phaseGate);
  const existingGates = Array.isArray(currentPhaseGate.gates)
    ? currentPhaseGate.gates.map(normalizeGate)
    : [];
  const gatesByPhase = new Map(existingGates
    .filter((gate) => typeof gate.phase === "string")
    .map((gate) => [String(gate.phase), gate]));
  return {
    ...state,
    phaseGate: {
      ...currentPhaseGate,
      currentPhase: result.phase,
      canProceed: result.canProceed,
      blockingReasons: result.canProceed ? [] : result.blockingReasons,
      gates: ENGINE_PHASES.map((phase) => ({
        ...(gatesByPhase.get(phase) || { phase }),
        phase,
        status: phaseStatus(phase, result),
      })),
    },
  };
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @param {import("./types").PhaseGateContext} [ctx]
 * @returns {import("./types").PhaseGateResult}
 */
export function checkPhaseGate(
  state: PipelineStateLike | null | undefined,
  ctx: PhaseGateContext = {},
): PhaseGateResult {
  const requirements = state && Array.isArray(state.requirements) ? state.requirements : [];
  const hasOpenRequirement = requirements.some((item) => hasStatus(item) && ["pending", "implemented", "not_verified"].includes(item.status || ""));
  const hasBlockedRequirement = requirements.some((item) => hasStatus(item) && item.status === "blocked");
  const blockingReasons: string[] = [];
  if (ctx.mode === "plan") {
    return {
      phase: "contract",
      canProceed: false,
      reason: "plan_once",
      blockingReasons: ["plan_once"],
    };
  }
  const implementationContract = asRecord(state && state.implementationContract);
  const baseline = asRecord(state && state.baseline);
  if (implementationContract.status !== "approved") {
    addReason(blockingReasons, "implementation_contract_not_approved");
  }
  if (baseline.status === "pending" || baseline.allowsCoding !== true) {
    addReason(blockingReasons, "baseline_not_ready");
  }
  if (blockingReasons.includes("implementation_contract_not_approved")) {
    return {
      phase: "contract",
      canProceed: false,
      reason: "delivery_blocked",
      blockingReasons,
    };
  }
  if (blockingReasons.includes("baseline_not_ready")) {
    return {
      phase: "baseline",
      canProceed: false,
      reason: "delivery_blocked",
      blockingReasons,
    };
  }
  if (hasBlockedRequirement) {
    return {
      phase: "delivery",
      canProceed: false,
      reason: "blocked_requirements",
      blockingReasons: ["blocked_requirements"],
    };
  }
  if (hasOpenRequirement) {
    return {
      phase: "coding",
      canProceed: blockingReasons.length === 0,
      reason: "open_requirements",
      blockingReasons,
    };
  }
  const modeState = asRecord(state && state.mode);
  const mode = typeof ctx.mode === "string" ? ctx.mode : typeof modeState.mode === "string" ? modeState.mode : "strict";
  const watchdog = asRecord(state && state.watchdog);
  const budgets = asRecord(state && state.budgets);
  const hardeningMinimum = Number(budgets.minimumValidationHardeningIterations || 0);
  const hardeningUsed = Number(budgets.validationHardeningIterationsUsed || 0);
  if (["strict", "quick", "diagnose", "prototype"].includes(mode)) {
    const hardeningPassed = watchdog.validationHardeningStatus === "passed";
    if (!hardeningPassed || hardeningUsed < hardeningMinimum) {
      addReason(blockingReasons, "validation_hardening_not_passed");
    }
  }
  for (const reason of evaluateDeliveryGates(state).blocking_reasons) {
    addReason(blockingReasons, reason === "not_verifiable" || reason === "unknown_verifiability"
      ? "delivery_not_verifiable"
      : reason);
  }
  return {
    phase: blockingReasons.length > 0 ? "validation" : "delivery",
    canProceed: blockingReasons.length === 0,
    reason: blockingReasons.length > 0 ? "delivery_blocked" : "requirements_closed",
    blockingReasons,
  };
}

