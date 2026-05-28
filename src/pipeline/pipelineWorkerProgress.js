// @ts-check

const path = require("path");
const { emitProgress } = require("./progress");
const { parseAndValidateIterationResult } = require("./resultSchema");

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
function tail(value, max = 4096) {
  const text = String(value || "");
  return text.length > max ? text.slice(text.length - max) : text;
}

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
function singleLine(value, max = 240) {
  return tail(String(value || "").replace(/\s+/g, " ").trim(), max);
}

/**
 * @param {string} projectRoot
 * @param {string} filePath
 * @returns {string}
 */
function toRelative(projectRoot, filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @param {string} [mode]
 * @returns {number | null}
 */
function getBudgetLeft(state, mode) {
  const budgets = (state && state.budgets) || {};
  const stateMode = mode || (state && state.mode && state.mode.mode) || "strict";
  if (
    stateMode === "optimize"
    && typeof budgets.remainingOptimizationIterations === "number"
    && Number.isInteger(budgets.remainingOptimizationIterations)
  ) {
    return budgets.remainingOptimizationIterations;
  }
  return typeof budgets.remainingImplementationIterations === "number"
    && Number.isInteger(budgets.remainingImplementationIterations)
    ? budgets.remainingImplementationIterations
    : null;
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @param {import("./types").ProgressStatsContext} [context]
 * @returns {import("./types").ProgressStats}
 */
function buildProgressStats(state, context = {}) {
  const rawRequirements = state ? state.requirements : undefined;
  /** @type {unknown[]} */
  const requirements = Array.isArray(rawRequirements) ? rawRequirements : [];
  /** @type {Record<string, number>} */
  const counts = {};
  for (const item of requirements) {
    const requirement = item && typeof item === "object" ? /** @type {{ status?: unknown }} */ (item) : {};
    const status = typeof requirement.status === "string" && requirement.status ? requirement.status : "unknown";
    counts[status] = (counts[status] || 0) + 1;
  }
  const budgets = (state && state.budgets) || {};
  const phaseGate = state && state.phaseGate && typeof state.phaseGate === "object"
    ? /** @type {{ currentPhase?: unknown }} */ (state.phaseGate)
    : {};
  const watchdog = state && state.watchdog && typeof state.watchdog === "object"
    ? /** @type {{ requiredAction?: unknown }} */ (state.watchdog)
    : {};
  return {
    iter: context.iteration,
    elapsed_ms: context.startedAt ? Date.now() - context.startedAt : 0,
    total_cycles: typeof budgets.totalCycles === "number" && Number.isInteger(budgets.totalCycles) ? budgets.totalCycles : 0,
    budget_left: getBudgetLeft(state, context.mode),
    total_reqs: requirements.length,
    req_counts: counts,
    focus: context.focus || null,
    phase: typeof phaseGate.currentPhase === "string" ? phaseGate.currentPhase : undefined,
    watchdog_action: typeof watchdog.requiredAction === "string" ? watchdog.requiredAction : undefined,
  };
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @param {import("./types").PipelineTimeoutOptions} [options]
 * @param {import("./types").PipelineFocus | null} [focus]
 * @returns {import("./types").EffectiveTimeouts}
 */
function computeEffectiveTimeouts(state, options = {}, focus = null) {
  const baseWallSeconds = typeof options.stepTimeoutSeconds === "number" && Number.isFinite(options.stepTimeoutSeconds)
    ? options.stepTimeoutSeconds
    : 300;
  const baseInactivitySeconds = typeof options.inactivityTimeoutSeconds === "number" && Number.isFinite(options.inactivityTimeoutSeconds)
    ? options.inactivityTimeoutSeconds
    : 120;
  const currentState = state && state.currentState && typeof state.currentState === "object"
    ? /** @type {{ currentTask?: unknown }} */ (state.currentState)
    : {};
  const focusText = [
    focus && focus.type,
    focus && focus.req_id,
    currentState.currentTask,
  ].filter(Boolean).join(" ");
  let complexityMultiplier = 1;
  if (/(refactor|migrate|migration|重构|迁移)/i.test(focusText)) {
    complexityMultiplier = 2;
  } else if (/(implement|build|实现|构建)/i.test(focusText)) {
    complexityMultiplier = 1.5;
  }
  const watchdog = state && state.watchdog && typeof state.watchdog === "object"
    ? /** @type {{ noProgressStreak?: unknown }} */ (state.watchdog)
    : {};
  const noProgressStreak = typeof watchdog.noProgressStreak === "number" && Number.isInteger(watchdog.noProgressStreak)
    ? watchdog.noProgressStreak
    : 0;
  const retryBackoff = 1 + Math.min(noProgressStreak, 3) * 0.25;
  const mode = state && state.mode && state.mode.mode;
  const modeMultiplier = mode === "plan" ? 0.5 : 1;
  const wallTimeoutMs = baseWallSeconds > 0
    ? Math.max(1, Math.round(baseWallSeconds * complexityMultiplier * retryBackoff * modeMultiplier * 1000))
    : 0;
  return {
    timeoutMs: wallTimeoutMs,
    inactivityTimeoutMs: baseInactivitySeconds > 0 ? Math.round(baseInactivitySeconds * 1000) : 0,
    warnBeforeMs: Math.min(30000, Math.max(1000, Math.floor(wallTimeoutMs / 2))),
    graceKillMs: 5000,
    baseTimeoutMs: Math.round(baseWallSeconds * 1000),
    complexityMultiplier,
    retryBackoff,
    modeMultiplier,
  };
}

/**
 * @param {import("./types").PipelineWorkerAdapter} adapter
 * @param {import("./types").PipelineWorkerAdapterOptions} adapterOptions
 * @param {import("./types").PipelineWorkerProgressOptions} progressOptions
 * @returns {Promise<import("./types").PipelineWorkerRunResult>}
 */
async function runWorkerWithProgress(adapter, adapterOptions, progressOptions) {
  const heartbeatMs = progressOptions.heartbeatMs || 15000;
  let heartbeatCount = 0;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let lastActivityAt = Date.now();
  let lastOutput = "";
  /** @type {string | null} */
  let lastOutputStream = null;
  const lastOutputProgressAt = {
    stdout: 0,
    stderr: 0,
  };
  const startedAt = Date.now();
  const fs = require("fs");
  const initialResultStat = adapterOptions.resultPath && fs.existsSync(adapterOptions.resultPath)
    ? fs.statSync(adapterOptions.resultPath)
    : null;
  /**
   * @param {string | undefined} resultPath
   * @returns {boolean}
   */
  const stopWhenResultValid = (resultPath) => {
    if (!resultPath) {
      return false;
    }
    try {
      if (!fs.existsSync(resultPath)) {
        return false;
      }
      if (initialResultStat) {
        const currentStat = fs.statSync(resultPath);
        if (
          currentStat.mtimeMs === initialResultStat.mtimeMs
          && currentStat.size === initialResultStat.size
        ) {
          return false;
        }
      }
      const parsed = parseAndValidateIterationResult(fs.readFileSync(resultPath, "utf8"));
      return Boolean(parsed && parsed.valid);
    } catch (error) {
      return false;
    }
  };
  /** @param {import("./types").PipelineWorkerOutput} output */
  const emitOutputProgress = (output) => {
    if (output && output.event === "worker_timeout_warning") {
      emitProgress({
        event: "worker_timeout_warning",
        session: progressOptions.session,
        iter: progressOptions.iteration,
        reason: output.reason,
        remaining_ms: output.remainingMs,
        idle_ms: output.idleMs,
        warning_file: adapterOptions.timeoutWarningPath
          ? toRelative(progressOptions.projectRoot, adapterOptions.timeoutWarningPath)
          : null,
      }, progressOptions.options);
      return;
    }
    const stream = output && output.stream === "stderr" ? "stderr" : "stdout";
    const chunk = String((output && output.chunk) || "");
    const bytes = Buffer.byteLength(chunk, "utf8");
    if (stream === "stderr") {
      stderrBytes += bytes;
    } else {
      stdoutBytes += bytes;
    }
    lastActivityAt = Date.now();
    lastOutput = singleLine(chunk);
    lastOutputStream = stream;

    const now = Date.now();
    if (now - lastOutputProgressAt[stream] < 1000 && chunk.length < 512) {
      return;
    }
    lastOutputProgressAt[stream] = now;
    emitProgress({
      event: "worker_output",
      session: progressOptions.session,
      iter: progressOptions.iteration,
      stream,
      bytes,
      stdout_bytes: stdoutBytes,
      stderr_bytes: stderrBytes,
      elapsed_ms: now - startedAt,
      summary: lastOutput,
    }, progressOptions.options);
  };
  emitProgress({
    event: "worker_started",
    session: progressOptions.session,
    iter: progressOptions.iteration,
    stage: "worker_running",
    timeout_ms: adapterOptions.timeoutMs || null,
    inactivity_timeout_ms: adapterOptions.inactivityTimeoutMs || null,
    timeout_policy: progressOptions.timeoutPolicy || null,
    ...buildProgressStats(progressOptions.state, {
      iteration: progressOptions.iteration,
      focus: progressOptions.focus,
      startedAt,
    }),
  }, progressOptions.options);
  const timer = setInterval(() => {
    heartbeatCount += 1;
    emitProgress({
      event: "pipeline_progress",
      session: progressOptions.session,
      stage: "worker_running",
      heartbeat: heartbeatCount,
      last_activity_ms: Date.now() - lastActivityAt,
      stdout_bytes: stdoutBytes,
      stderr_bytes: stderrBytes,
      last_output_stream: lastOutputStream,
      last_output: lastOutput,
      ...buildProgressStats(progressOptions.state, {
        iteration: progressOptions.iteration,
        focus: progressOptions.focus,
        startedAt,
      }),
    }, progressOptions.options);
  }, heartbeatMs);
  if (timer.unref) {
    timer.unref();
  }
  try {
    const worker = await adapter.run({
      ...adapterOptions,
      stopWhenResultValid,
      onOutput: emitOutputProgress,
    });
    return {
      ...worker,
      progressDurationMs: Date.now() - startedAt,
      progressHeartbeats: heartbeatCount,
      stdoutBytes,
      stderrBytes,
      lastActivityMs: Date.now() - lastActivityAt,
    };
  } catch (error) {
    return {
      command: null,
      status: 1,
      signal: null,
      error: error && error instanceof Error ? error.message : String(error),
      stdout: "",
      stderr: "",
      timedOut: false,
      progressDurationMs: Date.now() - startedAt,
      progressHeartbeats: heartbeatCount,
      stdoutBytes,
      stderrBytes,
      lastActivityMs: Date.now() - lastActivityAt,
    };
  } finally {
    clearInterval(timer);
  }
}

module.exports = {
  buildProgressStats,
  computeEffectiveTimeouts,
  getBudgetLeft,
  runWorkerWithProgress,
  tail,
  toRelative,
};
