const AUTOPILOT_MODES = new Set(["strict", "quick", "diagnose"]);

function resolveLoopPolicy(options = {}, state = {}) {
  const mode = options.mode || (state.mode && state.mode.mode) || "strict";
  const runtimeAutopilot = Boolean(options.autopilotRun || (!options.once && AUTOPILOT_MODES.has(mode)));
  const loopShape = mode === "plan" ? "plan_once" : runtimeAutopilot ? "autopilot" : "default";
  const maxSteps = options.once || mode === "plan"
    ? 1
    : (options.maxSteps || (runtimeAutopilot ? options.autopilotMaxIterations : null) || 20);
  return {
    mode,
    runtimeAutopilot,
    loopShape,
    maxSteps,
  };
}

module.exports = {
  AUTOPILOT_MODES,
  resolveLoopPolicy,
};
