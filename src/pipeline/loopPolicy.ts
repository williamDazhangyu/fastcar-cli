import type {
  LoopPolicyOptions,
  LoopPolicyResult,
  PipelineStateLike,
} from "./types";

export const AUTOPILOT_MODES: ReadonlySet<string> = new Set([
  "strict",
  "quick",
  "diagnose",
]);

export function resolveLoopPolicy(
  options: LoopPolicyOptions = {},
  state: PipelineStateLike = {},
): LoopPolicyResult {
  const mode = options.mode || (state.mode && typeof state.mode.mode === "string" ? state.mode.mode : "strict");
  const runtimeAutopilot = Boolean(options.autopilotRun || (!options.once && AUTOPILOT_MODES.has(mode)));
  const loopShape = mode === "plan" ? "plan_once" : runtimeAutopilot ? "autopilot" : "default";
  const maxStepsOverride = typeof options.maxSteps === "number" && Number.isFinite(options.maxSteps)
    ? Math.max(0, Math.floor(options.maxSteps))
    : null;
  const autopilotMaxIterations = typeof options.autopilotMaxIterations === "number" && Number.isFinite(options.autopilotMaxIterations)
    ? Math.max(0, Math.floor(options.autopilotMaxIterations))
    : null;
  const maxSteps = options.once || mode === "plan"
    ? 1
    : (maxStepsOverride !== null
      ? maxStepsOverride
      : (runtimeAutopilot && autopilotMaxIterations !== null ? autopilotMaxIterations : 20));
  return {
    mode,
    runtimeAutopilot,
    loopShape,
    maxSteps,
  };
}
