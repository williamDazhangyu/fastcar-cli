const FORBIDDEN_PATCH_KEYS = new Set([
  "budgets",
  "watchdog",
  "postChange",
  "validation",
  "session",
  "mode",
  "schemaVersion",
]);

const { getLanguageText, inferLanguageFromState } = require("./language");

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function compactObject(value) {
  return Object.entries(value).reduce((result, [key, item]) => {
    if (item === undefined || item === null) {
      return result;
    }
    if (Array.isArray(item) && item.length === 0) {
      return result;
    }
    if (typeof item === "string" && item === "") {
      return result;
    }
    result[key] = item;
    return result;
  }, {});
}

function appendDocumentation(existing, incoming) {
  const current = existing || {};
  const report = incoming || {};
  return {
    apiChanges: [
      ...normalizeArray(current.apiChanges),
      ...normalizeArray(report.apiChanges),
    ],
    architectureNotes: [
      ...normalizeArray(current.architectureNotes),
      ...normalizeArray(report.architectureNotes),
    ],
    implementationNotes: [
      ...normalizeArray(current.implementationNotes),
      ...normalizeArray(report.implementationNotes),
    ],
    changelogEntries: [
      ...normalizeArray(current.changelogEntries),
      ...normalizeArray(report.changelogEntries),
    ],
  };
}

function buildTraceEntry(report, cliValidation, ctx, now) {
  const trace = report.trace || {};
  return compactObject({
    iteration: ctx.iteration,
    focus: ctx.focus ? {
      type: ctx.focus.type || "unknown",
      reqId: ctx.focus.req_id || null,
      summary: ctx.focus.summary || "",
    } : null,
    status: report.status || "failed",
    summary: report.summary || "",
    rationaleSummary: trace.rationaleSummary || "",
    decisions: normalizeArray(trace.decisions),
    evidence: normalizeArray(trace.evidence),
    filesChanged: normalizeArray(report.files_changed),
    validation: cliValidation ? {
      status: cliValidation.status || "not_run",
      command: cliValidation.command || "not_run",
      exitCode: cliValidation.exitCode === undefined ? null : cliValidation.exitCode,
      summary: cliValidation.summary || "",
    } : null,
    risks: report.risks || "",
    promptPath: ctx.promptPath || "",
    resultPath: ctx.resultPath || "",
    logPath: ctx.logPath || ctx.workerLogPath || "",
    createdAt: now,
  });
}

function normalizeHypothesisItem(value, index) {
  if (value && typeof value === "object") {
    return {
      id: value.id || `H${index + 1}`,
      summary: String(value.summary || value.text || value.hypothesis || value.id || ""),
      priority: Number.isFinite(value.priority) ? value.priority : index + 1,
      status: value.status || "pending",
      evidence: value.evidence || "",
    };
  }
  return {
    id: `H${index + 1}`,
    summary: String(value),
    priority: index + 1,
    status: "pending",
    evidence: "",
  };
}

function normalizeMetric(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    name: String(value.name || "metric"),
    value: value.value === undefined || value.value === null ? null : value.value,
    unit: value.unit || "",
    direction: value.direction || "lower_is_better",
    source: value.source || "",
  };
}

function compareMetrics(baselineMetrics, postMetrics) {
  const baseline = Array.isArray(baselineMetrics) ? baselineMetrics : [];
  const post = Array.isArray(postMetrics) ? postMetrics : [];
  const postByName = new Map(post.map((item) => [item.name, item]));
  let improved = false;
  let regression = false;
  const comparisons = [];
  for (const item of baseline) {
    const next = postByName.get(item.name);
    if (!next) {
      continue;
    }
    const before = Number(item.value);
    const after = Number(next.value);
    const direction = next.direction || item.direction || "lower_is_better";
    let status = "not_comparable";
    if (Number.isFinite(before) && Number.isFinite(after)) {
      if (after === before) {
        status = "unchanged";
      } else if ((direction === "higher_is_better" && after > before) ||
        (direction !== "higher_is_better" && after < before)) {
        status = "improved";
        improved = true;
      } else {
        status = "regression";
        regression = true;
      }
    }
    comparisons.push({
      name: item.name,
      baseline: item.value,
      post: next.value,
      unit: next.unit || item.unit || "",
      direction,
      status,
    });
  }
  return {
    status: regression ? "regression" : improved ? "improved" : comparisons.length > 0 ? "unchanged" : "unknown",
    comparisons,
  };
}

function mergeRequirement(existing, incoming, cliValidation, language) {
  const text = getLanguageText(language);
  const next = { ...existing };
  if (incoming.summary) {
    next.summary = incoming.summary;
  }
  if (incoming.type) {
    next.type = incoming.type;
  }
  if (Array.isArray(incoming.relatedFiles)) {
    next.relatedFiles = incoming.relatedFiles;
  }
  if (incoming.nextStep) {
    next.nextStep = incoming.nextStep;
  }
  if (incoming.blockedReason !== undefined) {
    next.blockedReason = incoming.blockedReason || text.none;
  }
  if (incoming.evidence) {
    next.evidence = incoming.evidence;
  }
  if (incoming.status) {
    next.status = incoming.status === "passed" && cliValidation.status !== "passed"
      ? "implemented"
      : incoming.status;
    if (incoming.status === "passed" && cliValidation.status === "failed") {
      next.evidence = `${next.evidence || text.none}；${text.validationFailureDowngrade}`;
      next.nextStep = text.fixAfterValidationFailure;
    }
  }
  return next;
}

function mergeRequirements(state, report, cliValidation) {
  const text = getLanguageText(inferLanguageFromState(state));
  const current = Array.isArray(state.requirements) ? state.requirements : [];
  const incoming = Array.isArray(report.requirements) ? report.requirements : [];
  if (incoming.length === 0) {
    return current;
  }

  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    if (!item || !item.id) {
      continue;
    }
    const existing = byId.get(item.id) || {
      id: item.id,
      summary: item.summary || item.id,
      type: item.type || "功能",
      status: "pending",
      relatedFiles: [],
      evidence: text.none,
      blockedReason: text.none,
      nextStep: text.none,
    };
    byId.set(item.id, mergeRequirement(existing, item, cliValidation, inferLanguageFromState(state)));
  }
  return Array.from(byId.values());
}

function applyAllowedPatch(state, patch, issues) {
  const next = { ...state };
  for (const [key, value] of Object.entries(patch || {})) {
    if (FORBIDDEN_PATCH_KEYS.has(key)) {
      issues.push(`忽略 Worker 禁止写入字段: ${key}`);
      continue;
    }
    if (key === "currentState" && value && typeof value === "object") {
      next.currentState = { ...(next.currentState || {}), ...value };
      continue;
    }
    if (key === "deliveryEvidence" && value && typeof value === "object") {
      next.deliveryEvidence = { ...(next.deliveryEvidence || {}), ...value };
      continue;
    }
    if (key === "notes") {
      next.notes = [
        ...normalizeArray(next.notes),
        ...normalizeArray(value).map((item) => String(item)),
      ];
      continue;
    }
    if (key === "hypotheses") {
      const incoming = normalizeArray(value);
      next.diagnose = {
        ...(next.diagnose || {}),
        hypotheses: [
          ...normalizeArray(next.diagnose && next.diagnose.hypotheses),
          ...incoming.map((item) => typeof item === "string" ? item : String(item.summary || item.text || item.id || "")),
        ].filter(Boolean),
        hypothesisQueue: [
          ...normalizeArray(next.diagnose && next.diagnose.hypothesisQueue),
          ...incoming.map((item, index) => normalizeHypothesisItem(item, index)),
        ],
      };
      continue;
    }
    if (key === "optimizationMetrics" || key === "metrics") {
      const metrics = normalizeArray(value).map(normalizeMetric).filter(Boolean);
      next.optimization = {
        ...(next.optimization || {}),
        pendingMetrics: metrics,
      };
      continue;
    }
    issues.push(`忽略未列入白名单的 state_patch 字段: ${key}`);
  }
  return next;
}

function normalizePostChangeStatus(cliStatus) {
  if (cliStatus === "passed") {
    return "passed";
  }
  if (cliStatus === "failed") {
    return "failed";
  }
  if (cliStatus === "skipped") {
    return "skipped_with_reason";
  }
  if (cliStatus === "not_available") {
    return "not_available";
  }
  return "not_run";
}

function mergeBaseline(state, report, cliValidation, ctx) {
  if (!ctx.focus || !["establish_baseline", "reproduce"].includes(ctx.focus.type)) {
    return state;
  }
  const next = {
    ...state,
    baseline: {
      ...(state.baseline || {}),
      status: cliValidation.status === "passed" ? "passed" :
        cliValidation.status === "failed" ? "failed" :
          cliValidation.status === "skipped" ? "skipped_with_reason" : "not_available",
      command: cliValidation.command || "not_run",
      result: cliValidation.exitCode === null || cliValidation.exitCode === undefined ? null : String(cliValidation.exitCode),
      reason: report.summary || cliValidation.summary || "pipeline baseline",
      failureCategory: cliValidation.status === "failed" ? "existing_failure" : "none",
      allowsCoding: true,
    },
  };
  const metrics = normalizeArray(report.state_patch && (report.state_patch.optimizationMetrics || report.state_patch.metrics))
    .map(normalizeMetric)
    .filter(Boolean);
  if (metrics.length > 0) {
    next.optimization = {
      ...(next.optimization || {}),
      baselineMetrics: metrics,
      pendingMetrics: [],
    };
  }
  if (ctx.focus.type === "reproduce") {
    next.diagnose = {
      ...(next.diagnose || {}),
      reproduceBaseline: {
        status: next.baseline.status,
        command: next.baseline.command,
        summary: next.baseline.reason,
      },
    };
  }
  return next;
}

function mergeModeProgress(state, report, cliValidation, ctx) {
  if (!ctx.focus) {
    return state;
  }
  if (ctx.focus.type === "optimize") {
    const pendingMetrics = normalizeArray(report.state_patch && (report.state_patch.optimizationMetrics || report.state_patch.metrics))
      .map(normalizeMetric)
      .filter(Boolean);
    return {
      ...state,
      optimization: {
        ...(state.optimization || {}),
        status: cliValidation.status === "failed" ? "not_verified" : "implemented",
        lastSummary: report.summary || "optimization focus completed",
        pendingMetrics: pendingMetrics.length > 0 ? pendingMetrics : ((state.optimization || {}).pendingMetrics || []),
      },
    };
  }
  if (ctx.focus.type === "verify_optimization") {
    const optimization = (state.optimization || {});
    const postMetrics = normalizeArray(report.state_patch && (report.state_patch.optimizationMetrics || report.state_patch.metrics))
      .map(normalizeMetric)
      .filter(Boolean);
    const effectivePostMetrics = postMetrics.length > 0 ? postMetrics : (optimization.pendingMetrics || []);
    const comparison = compareMetrics(optimization.baselineMetrics || [], effectivePostMetrics);
    const comparable = comparison.status !== "unknown";
    const noImprovementStreak = comparison.status === "improved" ? 0 :
      comparable ? ((optimization.noImprovementStreak || 0) + 1) :
        (optimization.noImprovementStreak || 0);
    const maxNoImprovementIterations = optimization.maxNoImprovementIterations || 3;
    const verifiedStatus = cliValidation.status === "passed" && comparison.status !== "regression" ?
      (comparison.status === "unchanged" ? "no_improvement" : "passed") :
      "not_verified";
    return {
      ...state,
      optimization: {
        ...optimization,
        status: verifiedStatus,
        verificationCommand: cliValidation.command || "not_run",
        verificationSummary: cliValidation.summary || "",
        postMetrics: effectivePostMetrics,
        metricComparison: comparison,
        noImprovementStreak,
        maxNoImprovementIterations,
        stopReason: noImprovementStreak >= maxNoImprovementIterations ? "no_improvement" : (optimization.stopReason || ""),
      },
    };
  }
  if (ctx.focus.type === "regression_check") {
    return {
      ...state,
      diagnose: {
        ...(state.diagnose || {}),
        regressionCheckStatus: cliValidation.status === "passed" ? "passed" : "not_verified",
        regressionCheckSummary: cliValidation.summary || report.summary || "",
      },
    };
  }
  if (ctx.focus.type === "hypothesis_test") {
    const diagnose = state.diagnose || {};
    const queue = normalizeArray(diagnose.hypothesisQueue);
    const nextQueue = queue.length > 0
      ? queue.map((item, index) => {
          if (index !== queue.findIndex((candidate) => candidate && candidate.status === "pending")) {
            return item;
          }
          return {
            ...item,
            status: cliValidation.status === "passed" ? "supported" : "rejected",
            evidence: report.summary || cliValidation.summary || "",
          };
        })
      : queue;
    return {
      ...state,
      diagnose: {
        ...diagnose,
        hypothesisQueue: nextQueue,
        lastHypothesisResult: report.summary || cliValidation.summary || "",
      },
    };
  }
  return {
    ...state,
  };
}

function mergeIterationIntoState(state, report, cliValidation, ctx = {}) {
  const issues = [];
  const language = inferLanguageFromState(state);
  const text = getLanguageText(language);
  const now = new Date().toISOString();
  let next = applyAllowedPatch(state || {}, report.state_patch, issues);
  const status = report.status || "failed";
  next = mergeBaseline(next, report, cliValidation, ctx);
  next = mergeModeProgress(next, report, cliValidation, ctx);

  next.requirements = mergeRequirements(next, report, cliValidation);
  next.traceability = {
    ...(next.traceability || {}),
    policy: (next.traceability && next.traceability.policy) || "Record public audit summaries only; never record private chain-of-thought.",
    iterations: [
      ...normalizeArray(next.traceability && next.traceability.iterations),
      buildTraceEntry(report, cliValidation, ctx, now),
    ],
  };
  next.documentation = appendDocumentation(next.documentation, report.documentation);
  next.updatedAt = now;
  next.budgets = {
    ...(next.budgets || {}),
    implementationIterationsUsed: ((next.budgets && next.budgets.implementationIterationsUsed) || 0) + 1,
    totalCycles: ((next.budgets && next.budgets.totalCycles) || 0) + 1,
  };
  if (Number.isInteger(next.budgets.remainingImplementationIterations)) {
    next.budgets.remainingImplementationIterations = Math.max(0, next.budgets.remainingImplementationIterations - 1);
  }

  next.currentState = {
    ...(next.currentState || {}),
    currentPhase: status === "completed" ? "pipeline_iteration_completed" : "pipeline_iteration_attention",
    currentTask: ctx.focus ? `${ctx.focus.type}${ctx.focus.req_id ? `:${ctx.focus.req_id}` : ""}` : "pipeline_iteration",
    nextAction: status === "need_decision" ? text.waitUserDecision : text.chooseNextFocus,
    overallStatus: status === "blocked" ? "blocked" : "in_progress",
    recentChanges: report.summary || text.workerNoSummary,
    keyFiles: Array.isArray(report.files_changed) ? report.files_changed.join(", ") || text.noReport : text.noReport,
    lastValidationCommand: cliValidation.command || "not_run",
    lastValidationResult: cliValidation.status || "not_run",
  };

  next.validation = {
    ...(next.validation || {}),
    commands: [
      ...(((next.validation || {}).commands || []).filter((item) => typeof item !== "object")),
      ...(cliValidation.command
        ? [{
            command: cliValidation.command,
            result: cliValidation.status,
            summary: cliValidation.summary || "",
            exitCode: cliValidation.exitCode,
            iteration: ctx.iteration,
          }]
        : []),
    ],
    finalVerifiability: cliValidation.status === "passed" ? "partially_verifiable" : ((next.validation || {}).finalVerifiability || "unknown"),
  };

  next.postChange = {
    ...(next.postChange || {}),
    status: normalizePostChangeStatus(cliValidation.status),
    command: cliValidation.command || "not_run",
    result: cliValidation.exitCode === null || cliValidation.exitCode === undefined ? null : String(cliValidation.exitCode),
    reason: cliValidation.summary || "pipeline validation",
    regressionDetected: cliValidation.status === "failed",
    perCommand: Array.isArray(cliValidation.results)
      ? cliValidation.results.map((item) => ({
          command: item.command || "not_run",
          status: item.status || "not_run",
          result: item.exitCode === null || item.exitCode === undefined ? null : String(item.exitCode),
          exitCode: item.exitCode === undefined ? null : item.exitCode,
          signal: item.signal || "none",
          error: item.error || "none",
          durationMs: item.durationMs || 0,
          stdoutTail: item.stdoutTail || "",
          stderrTail: item.stderrTail || "",
        }))
      : [],
  };

  if (cliValidation.status === "failed") {
    next.deltaAssessment = {
      ...(next.deltaAssessment || {}),
      status: "regression",
      summary: cliValidation.summary || report.summary || text.validationFailed,
      baselineRef: ((next.deltaAssessment || {}).baselineRef) || "baseline",
      postChangeRef: "postChange",
      decision: "retry_new_direction",
    };
    next.iterationPolicy = {
      ...(next.iterationPolicy || {}),
      lastDecision: "replan",
    };
  }

  next.watchdog = {
    ...(next.watchdog || {}),
    enabled: true,
    triggered: status === "need_decision" || status === "blocked",
    requiredAction: status === "need_decision" ? "ask_user" : status === "blocked" ? "stop" : "continue",
    deliveryVerifiability: cliValidation.status === "passed" ? "partially_verifiable" : ((next.watchdog || {}).deliveryVerifiability || "unknown"),
  };

  if (status === "need_decision" && report.decision_request) {
    next.decisionRequest = {
      status: "pending",
      topic: report.decision_request.topic || text.pipelineDecision,
      background: report.decision_request.background || report.summary || text.workerRequestedDecision,
      options: Array.isArray(report.decision_request.options) ? report.decision_request.options : [],
      recommended: report.decision_request.recommended || "",
      impact: report.decision_request.impact || text.waitUserSelection,
      triggers: ["pipeline_worker"],
      question: report.decision_request.question,
      targetField: report.decision_request.targetField || "pipelineDecision",
      answer: null,
    };
  }

  return { state: next, issues };
}

module.exports = {
  mergeIterationIntoState,
};
