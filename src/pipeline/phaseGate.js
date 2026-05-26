function checkPhaseGate(state, ctx = {}) {
  const requirements = Array.isArray(state && state.requirements) ? state.requirements : [];
  const hasOpenRequirement = requirements.some((item) => item && ["pending", "implemented", "not_verified"].includes(item.status));
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
  const hasBlocked = requirements.some((item) => item && item.status === "blocked");
  return {
    phase: hasBlocked ? "blocked" : "delivery",
    canProceed: !hasBlocked,
    reason: hasBlocked ? "blocked_requirements" : "requirements_closed",
  };
}

module.exports = {
  checkPhaseGate,
};
