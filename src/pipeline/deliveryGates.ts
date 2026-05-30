import { isImplementationMode } from "../auto-iterate/modeRules";
import { addReason, asRecord, statusOf, stringValue } from "./valueUtils";
import type {
  DeliveryGateResult,
  PipelineStateLike,
} from "./types";

interface RequirementSummary {
  openRequirements: string[];
  blockedRequirements: string[];
}

const ALLOWED_VERIFIABILITY = new Set(["verifiable", "partially_verifiable"]);
const KNOWN_VERIFIABILITY = new Set(["verifiable", "partially_verifiable", "not_verifiable"]);

function collectRequirementSummary(state: PipelineStateLike | null | undefined): RequirementSummary {
  const rawRequirements = state ? state.requirements : undefined;
  const requirements = Array.isArray(rawRequirements) ? rawRequirements : [];
  const normalizedRequirements = requirements.map((item) => asRecord(item));
  return {
    openRequirements: normalizedRequirements
      .filter((item) => !["passed", "blocked"].includes(String(item.status || "")))
      .map((item) => stringValue(item.id, "unknown")),
    blockedRequirements: normalizedRequirements
      .filter((item) => item.status === "blocked")
      .map((item) => stringValue(item.id, "unknown")),
  };
}

function addVerifiabilityReasons(
  reasons: string[],
  validationVerifiability: unknown,
  watchdogVerifiability: unknown,
): void {
  const validationValue = String(validationVerifiability || "");
  const watchdogValue = String(watchdogVerifiability || "");
  if (!KNOWN_VERIFIABILITY.has(validationValue) || !KNOWN_VERIFIABILITY.has(watchdogValue)) {
    addReason(reasons, "unknown_verifiability");
    return;
  }
  if (!ALLOWED_VERIFIABILITY.has(validationValue) || !ALLOWED_VERIFIABILITY.has(watchdogValue)) {
    addReason(reasons, "not_verifiable");
  }
}

function addOptionalRuntimeGateReasons(
  reasons: string[],
  state: PipelineStateLike | null | undefined,
  mode: string,
): void {
  const postAgentGate = asRecord(state && state.postAgentValidationGate);
  const cleanupStatus = statusOf(state && state.cleanup);
  const styleConsolidationStatus = statusOf(state && state.styleConsolidation);
  const contextResetReviewStatus = statusOf(state && state.contextResetReview);
  const skillCaptureStatus = statusOf(state && state.skillCapture);

  // Runtime gate fields introduced for stricter finalization are opt-in blockers.
  // Missing/disabled gates must not trap ordinary quick/strict sessions in max_steps_reached.
  if (postAgentGate.enabled === true &&
    (postAgentGate.lastResult !== "passed" || postAgentGate.nextAction !== "deliver")) {
    addReason(reasons, "post_agent_gate_not_passed");
  }
  if (cleanupStatus && cleanupStatus !== "completed") {
    addReason(reasons, "cleanup_not_completed");
  }
  if (isImplementationMode(mode) && styleConsolidationStatus === "pending") {
    addReason(reasons, "style_consolidation_pending");
  }
  if (contextResetReviewStatus &&
    contextResetReviewStatus !== "passed" &&
    contextResetReviewStatus !== "user_accepted_limited") {
    addReason(reasons, "context_reset_review_not_passed");
  }
  if (skillCaptureStatus === "pending") {
    addReason(reasons, "skill_capture_pending");
  }
}

export function evaluateDeliveryGates(state: PipelineStateLike | null | undefined): DeliveryGateResult {
  const validation = asRecord(state && state.validation);
  const watchdog = asRecord(state && state.watchdog);
  const evidence = asRecord(state && state.deliveryEvidence);
  const postChange = asRecord(state && state.postChange);
  const postAgentGate = asRecord(state && state.postAgentValidationGate);
  const modeState = asRecord(state && state.mode);
  const mode = stringValue(modeState.mode, "strict");
  const { openRequirements, blockedRequirements } = collectRequirementSummary(state);
  const blockingReasons: string[] = [];

  if (openRequirements.length > 0) {
    addReason(blockingReasons, "open_requirements");
  }
  if (blockedRequirements.length > 0) {
    addReason(blockingReasons, "blocked_requirements");
  }
  addVerifiabilityReasons(blockingReasons, validation.finalVerifiability, watchdog.deliveryVerifiability);
  if (postChange.status !== "passed") {
    addReason(blockingReasons, "post_change_not_passed");
  }
  if (postChange.regressionDetected === true) {
    addReason(blockingReasons, "regression_detected");
  }
  if (evidence.status !== "ready" && evidence.status !== "delivered") {
    addReason(blockingReasons, "delivery_evidence_not_ready");
  }
  addOptionalRuntimeGateReasons(blockingReasons, state, mode);

  return {
    ready: blockingReasons.length === 0,
    open_requirements: openRequirements,
    blocked_requirements: blockedRequirements,
    validation_verifiability: stringValue(validation.finalVerifiability),
    watchdog_verifiability: stringValue(watchdog.deliveryVerifiability),
    delivery_evidence_status: stringValue(evidence.status),
    post_agent_gate: stringValue(postAgentGate.lastResult, postAgentGate.enabled === true ? "not_run" : "disabled"),
    cleanup_status: stringValue(statusOf(state && state.cleanup)),
    style_consolidation_status: stringValue(statusOf(state && state.styleConsolidation)),
    context_reset_review_status: stringValue(statusOf(state && state.contextResetReview)),
    skill_capture_status: stringValue(statusOf(state && state.skillCapture)),
    blocking_reasons: blockingReasons,
  };
}
