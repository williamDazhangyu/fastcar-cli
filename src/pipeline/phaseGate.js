// @ts-check

/**
 * @param {unknown} item
 * @returns {item is { status?: string }}
 */
function hasStatus(item) {
  return Boolean(item && typeof item === "object" && !Array.isArray(item));
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @param {import("./types").PhaseGateContext} [ctx]
 * @returns {import("./types").PhaseGateResult}
 */
function checkPhaseGate(state, ctx = {}) {
  const requirements = state && Array.isArray(state.requirements) ? state.requirements : [];
  const hasOpenRequirement = requirements.some((item) => hasStatus(item) && ["pending", "implemented", "not_verified"].includes(item.status || ""));
  if (ctx.mode === "plan") {
    return {
      phase: "contract",
      canProceed: false,
      reason: "plan_once",
    };
  }
  if (hasOpenRequirement) {
    return {
      phase: "coding",
      canProceed: true,
      reason: "open_requirements",
    };
  }
  const hasBlocked = requirements.some((item) => hasStatus(item) && item.status === "blocked");
  return {
    phase: hasBlocked ? "blocked" : "delivery",
    canProceed: !hasBlocked,
    reason: hasBlocked ? "blocked_requirements" : "requirements_closed",
  };
}

module.exports = {
  checkPhaseGate,
};
