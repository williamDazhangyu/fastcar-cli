// @ts-check

const { emitProgress } = require("./progress");
const {
  refreshStateMarkdownView,
  writeJsonAtomic,
} = require("./pipelineStateIO");

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").WorkerIterationResult | null | undefined} report
 * @param {import("./types").IsolatedWorktreeOperationResult | import("./types").IsolatedWorktreeApplyResult | null | undefined} applied
 * @param {string} isolatedWorktree
 * @returns {import("./types").PipelineStateLike}
 */
function markIsolateMergeFailed(state, report, applied, isolatedWorktree) {
  const failureSummary = applied && !applied.ok && applied.error ? applied.error : "isolated worktree merge failed";
  const now = new Date().toISOString();
  /** @type {import("./types").PipelineStateLike} */
  const next = {
    ...state,
    updatedAt: now,
    watchdog: {
      ...(state.watchdog || {}),
      triggered: true,
      requiredAction: "stop",
      deliveryVerifiability: "unknown",
    },
    validation: {
      ...(state.validation || {}),
      finalVerifiability: "unknown",
    },
    postChange: {
      ...(state.postChange || {}),
      status: "failed",
      result: "1",
      reason: failureSummary,
      regressionDetected: true,
    },
    deltaAssessment: {
      ...(state.deltaAssessment || {}),
      status: "regression",
      summary: failureSummary,
      postChangeRef: "isolateMerge",
      decision: "stop",
    },
    iterationPolicy: {
      ...(state.iterationPolicy || {}),
      lastDecision: "stop",
    },
    isolate: {
      ...(state.isolate || {}),
      conflictWorktree: isolatedWorktree,
      conflictReason: failureSummary,
    },
  };
  const rawRequirements = report ? report.requirements : undefined;
  const touchedRequirementIds = new Set(
    (Array.isArray(rawRequirements) ? rawRequirements : [])
      .map((item) => {
        const requirement = item && typeof item === "object" ? /** @type {{ id?: unknown }} */ (item) : {};
        return requirement.id;
      })
      .filter((id) => typeof id === "string" && Boolean(id)),
  );
  if (touchedRequirementIds.size > 0 && Array.isArray(next.requirements)) {
    next.requirements = next.requirements.map((item) => {
      const requirement = item && typeof item === "object" ? /** @type {Record<string, unknown> & { id?: unknown; evidence?: unknown }} */ (item) : null;
      if (!requirement || typeof requirement.id !== "string" || !touchedRequirementIds.has(requirement.id)) {
        return item;
      }
      return {
        ...requirement,
        status: "blocked",
        evidence: `${typeof requirement.evidence === "string" && requirement.evidence ? requirement.evidence : "none"}；isolated worktree merge failed`,
        blockedReason: failureSummary,
        nextStep: "Resolve isolated worktree merge failure before resuming.",
      };
    });
  }
  return next;
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").IsolatedWorktreeOperationResult | null | undefined} cleanup
 * @returns {import("./types").PipelineStateLike}
 */
function markIsolateCleanupFailed(state, cleanup) {
  const failureSummary = cleanup && cleanup.error ? cleanup.error : "isolated worktree cleanup failed";
  const now = new Date().toISOString();
  const deltaAssessment = asRecord(state.deltaAssessment);
  return {
    ...state,
    updatedAt: now,
    currentState: {
      ...(state.currentState || {}),
      lastValidationResult: "failed",
      nextAction: "处理 isolated worktree cleanup failure 后 resume 自动迭代",
    },
    watchdog: {
      ...(state.watchdog || {}),
      triggered: true,
      requiredAction: "stop",
      deliveryVerifiability: "unknown",
    },
    validation: {
      ...(state.validation || {}),
      finalVerifiability: "unknown",
    },
    postChange: {
      ...(state.postChange || {}),
      status: "failed",
      result: "1",
      reason: failureSummary,
      regressionDetected: true,
    },
    deltaAssessment: {
      ...deltaAssessment,
      status: "unknown",
      summary: failureSummary,
      baselineRef: deltaAssessment.baselineRef || "baseline",
      postChangeRef: "isolateCleanup",
      decision: "stop",
    },
    iterationPolicy: {
      ...(state.iterationPolicy || {}),
      lastDecision: "stop",
    },
    isolate: {
      ...(state.isolate || {}),
      cleanupReason: failureSummary,
    },
  };
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").PipelineFailureInput} [failure]
 * @returns {import("./types").PipelineStateLike}
 */
function markPipelineExecutionFailed(state, failure = {}) {
  const now = new Date().toISOString();
  const reason = failure.reason || "pipeline_failed";
  const detail = failure.detail || reason;
  const command = failure.command || reason;
  const result = failure.exitCode === null || failure.exitCode === undefined
    ? "1"
    : String(failure.exitCode);
  const deltaAssessment = asRecord(state.deltaAssessment);
  return {
    ...state,
    updatedAt: now,
    currentState: {
      ...(state.currentState || {}),
      lastValidationCommand: "not_run",
      lastValidationResult: "failed",
      nextAction: `处理 ${reason} 后 resume 自动迭代`,
    },
    watchdog: {
      ...(state.watchdog || {}),
      enabled: true,
      triggered: true,
      requiredAction: "stop",
      deliveryVerifiability: "unknown",
    },
    validation: {
      ...(state.validation || {}),
      finalVerifiability: "unknown",
    },
    postChange: {
      ...(state.postChange || {}),
      status: "failed",
      command,
      result,
      reason: detail,
      regressionDetected: true,
    },
    deltaAssessment: {
      ...deltaAssessment,
      status: "unknown",
      summary: detail,
      baselineRef: deltaAssessment.baselineRef || "baseline",
      postChangeRef: "pipelineExecution",
      decision: "stop",
    },
    iterationPolicy: {
      ...(state.iterationPolicy || {}),
      lastDecision: "stop",
    },
  };
}

/**
 * @param {string} stateJsonPath
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").StatePersistenceOptions} [options]
 * @returns {Promise<import("./types").StateValidationIssue[]>}
 */
async function writeValidatedState(stateJsonPath, state, options = {}) {
  if (typeof options.validateStateModel !== "function") {
    await writeJsonAtomic(stateJsonPath, state);
    const markdownIssue = await refreshStateMarkdownView(stateJsonPath, state);
    if (markdownIssue) {
      emitProgress({ event: "warning", reason: markdownIssue.code, detail: markdownIssue.message }, options);
      return [markdownIssue];
    }
    return [];
  }
  const session = asRecord(state.session).session;
  const issues = options.validateStateModel(state, {
    session: typeof session === "string" ? session : undefined,
  });
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    return errors;
  }
  await writeJsonAtomic(stateJsonPath, state);
  const markdownIssue = await refreshStateMarkdownView(stateJsonPath, state);
  if (markdownIssue) {
    emitProgress({ event: "warning", reason: markdownIssue.code, detail: markdownIssue.message }, options);
    return [...issues, markdownIssue];
  }
  return issues;
}

/**
 * @param {string} stateJsonPath
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").PipelineFailureInput} failure
 * @param {import("./types").StatePersistenceOptions} [options]
 * @returns {Promise<import("./types").PipelineFailurePersistResult>}
 */
async function persistPipelineFailureState(stateJsonPath, state, failure, options = {}) {
  const next = markPipelineExecutionFailed(state, failure);
  const schemaIssues = await writeValidatedState(stateJsonPath, next, options);
  if (schemaIssues.some((issue) => issue.severity === "error")) {
    return {
      state: next,
      ok: false,
      issues: schemaIssues,
    };
  }
  return {
    state: next,
    ok: true,
    issues: schemaIssues,
  };
}

module.exports = {
  markIsolateCleanupFailed,
  markIsolateMergeFailed,
  markPipelineExecutionFailed,
  persistPipelineFailureState,
  writeValidatedState,
};
