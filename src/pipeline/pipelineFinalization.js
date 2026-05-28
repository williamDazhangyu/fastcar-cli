// @ts-check

const { isImplementationMode } = require("../auto-iterate/modeRules");

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
 * @param {unknown} value
 * @returns {unknown[]}
 */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {{ open: string[]; blocked: string[]; allPassed: boolean }}
 */
function requirementClosure(state) {
  const requirements = Array.isArray(state.requirements) ? state.requirements : [];
  const open = [];
  const blocked = [];
  let passed = 0;
  for (const item of requirements) {
    const requirement = asRecord(item);
    const id = nonEmptyString(requirement.id) || "unknown";
    if (requirement.status === "passed") {
      passed += 1;
      continue;
    }
    if (requirement.status === "blocked") {
      blocked.push(id);
      continue;
    }
    open.push(id);
  }
  return {
    open,
    blocked,
    allPassed: requirements.length > 0 && passed === requirements.length,
  };
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {string[]}
 */
function collectChangedFiles(state) {
  const changed = new Set();
  const deliveryEvidence = asRecord(state.deliveryEvidence);
  for (const item of asArray(deliveryEvidence.changedFiles)) {
    if (typeof item === "string" && item) {
      changed.add(item);
    }
  }
  const traceability = asRecord(state.traceability);
  for (const iteration of asArray(traceability.iterations)) {
    const record = asRecord(iteration);
    for (const file of asArray(record.filesChanged)) {
      if (typeof file === "string" && file) {
        changed.add(file);
      }
    }
  }
  return Array.from(changed);
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {string}
 */
function validationSummary(state) {
  const postChange = asRecord(state.postChange);
  const command = nonEmptyString(postChange.command);
  const reason = nonEmptyString(postChange.reason);
  if (postChange.status === "passed" && command) {
    return `真实验证通过: ${command}${reason ? ` (${reason})` : ""}`;
  }
  const validation = asRecord(state.validation);
  const commands = asArray(validation.commands).slice().reverse();
  for (const item of commands) {
    const record = asRecord(item);
    if (record.result === "passed" && nonEmptyString(record.command)) {
      return `真实验证通过: ${record.command}`;
    }
  }
  return "真实验证通过: CLI post-change validation";
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {boolean}
 */
function canFinalizeDelivery(state) {
  const deliveryEvidence = asRecord(state.deliveryEvidence);
  if (deliveryEvidence.status !== "ready" && deliveryEvidence.status !== "delivered") {
    return false;
  }
  const styleConsolidation = asRecord(state.styleConsolidation);
  const mode = state && state.mode && typeof state.mode.mode === "string" ? state.mode.mode : "strict";
  if (isImplementationMode(mode) && styleConsolidation.status !== "completed") {
    return false;
  }
  const contextResetReview = asRecord(state.contextResetReview);
  if (contextResetReview.status !== "passed" && contextResetReview.status !== "user_accepted_limited") {
    return false;
  }
  const skillCapture = asRecord(state.skillCapture);
  if (skillCapture.status === "pending" || !skillCapture.status) {
    return false;
  }
  const cleanup = asRecord(state.cleanup);
  if (cleanup.status !== "completed") {
    return false;
  }
  const postAgentGate = asRecord(state.postAgentValidationGate);
  if (postAgentGate.enabled !== true || postAgentGate.lastResult !== "passed" || postAgentGate.nextAction !== "deliver") {
    return false;
  }
  const closure = requirementClosure(state);
  if (!closure.allPassed || closure.open.length > 0 || closure.blocked.length > 0) {
    return false;
  }
  const postChange = asRecord(state.postChange);
  if (postChange.status !== "passed" || postChange.regressionDetected === true) {
    return false;
  }
  const validation = asRecord(state.validation);
  const watchdog = asRecord(state.watchdog);
  const allowedVerifiability = new Set(["verifiable", "partially_verifiable"]);
  if (!allowedVerifiability.has(String(validation.finalVerifiability || "")) ||
    !allowedVerifiability.has(String(watchdog.deliveryVerifiability || ""))) {
    return false;
  }
  const rawBudgets = asRecord(state.budgets);
  const minimumHardening = Number(rawBudgets.minimumValidationHardeningIterations) || 0;
  const usedHardening = Number(rawBudgets.validationHardeningIterationsUsed) || 0;
  const requiredDimensions = ["boundary", "negative", "regression"];
  const dimensions = asArray(watchdog.validationHardeningDimensionsDone).map((item) => String(item));
  const hardeningStatus = String(watchdog.validationHardeningStatus || "");
  return hardeningStatus === "passed" &&
    usedHardening >= minimumHardening &&
    requiredDimensions.every((dimension) => dimensions.includes(dimension));
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {{ session?: string; mode?: string; reason?: string }} [options]
 * @returns {{ state: import("./types").PipelineStateLike; changed: boolean; ready: boolean; skippedReason?: string }}
 */
function finalizeDeliveryState(state, options = {}) {
  if (!canFinalizeDelivery(state)) {
    const closure = requirementClosure(state);
    return {
      state,
      changed: false,
      ready: false,
      skippedReason: closure.blocked.length > 0
        ? "blocked_requirements"
        : closure.open.length > 0
          ? "open_requirements"
          : "delivery_prerequisites_not_met",
    };
  }

  const now = new Date().toISOString();
  const mode = options.mode || (state.mode && typeof state.mode.mode === "string" ? state.mode.mode : "strict");
  const sessionState = asRecord(state.session);
  const session = options.session || nonEmptyString(sessionState.session) || "default";
  const changedFiles = collectChangedFiles(state);
  const summary = validationSummary(state);
  const rawBudgets = asRecord(state.budgets);
  const budgets = /** @type {import("./types").PipelineBudgets & Record<string, unknown>} */ (rawBudgets);
  const currentWatchdog = asRecord(state.watchdog);

  /** @type {import("./types").PipelineStateLike} */
  const next = {
    ...state,
    updatedAt: now,
    budgets: {
      ...budgets,
      remainingImplementationIterations: 0,
      remainingValidationHardeningIterations: 0,
    },
    currentState: {
      ...asRecord(state.currentState),
      currentPhase: "delivery_ready",
      currentTask: "finalize_delivery_gate",
      nextAction: "deliver",
      overallStatus: "completed",
      recentChanges: "CLI 自动最终化已收敛 cleanup、style、context review、delivery evidence 和 post-agent gate。",
      lastValidationCommand: asRecord(state.postChange).command || "not_run",
      lastValidationResult: "passed",
    },
    watchdog: {
      ...currentWatchdog,
      enabled: true,
      triggered: false,
      requiredAction: "continue",
      deliveryVerifiability: currentWatchdog.deliveryVerifiability,
      validationHardeningStatus: currentWatchdog.validationHardeningStatus,
      validationHardeningDimensionsDone: asArray(currentWatchdog.validationHardeningDimensionsDone),
      newTestCount: Number(currentWatchdog.newTestCount) || 0,
    },
    validation: {
      ...asRecord(state.validation),
      finalVerifiability: asRecord(state.validation).finalVerifiability,
      passed: Array.from(new Set([
        ...asArray(asRecord(state.validation).passed),
        summary,
      ])),
    },
    cleanup: {
      ...asRecord(state.cleanup),
    },
    styleConsolidation: asRecord(state.styleConsolidation),
    contextResetReview: asRecord(state.contextResetReview),
    deliveryEvidence: {
      ...asRecord(state.deliveryEvidence),
      goal: nonEmptyString(asRecord(state.deliveryEvidence).goal) ||
        nonEmptyString(asRecord(state.task).goal) ||
        "未指定",
      changes: nonEmptyString(asRecord(state.deliveryEvidence).changes) ||
        "自动流水线已完成需求闭环、真实验证和交付门禁状态收敛。",
      changedFiles,
      validationSummary: summary,
      baselineComparison: nonEmptyString(asRecord(state.deliveryEvidence).baselineComparison) ||
        "未建立独立 baseline；本次以 CLI post-change validation 和 Requirement Coverage Matrix 作为交付证据。",
      cleanupSummary: "cleanup.status=completed；无待删除临时产物。",
      risks: "有限风险：自动最终化基于本地 CLI 验证和 state.json 证据，外部服务、生产数据和人工验收不在本轮自动验证范围内。",
      unfinishedItems: "无",
      userConfirmation: "无需额外确认：本次按 --yes/autopilot 非交互模式执行，且未发现 pending decisionRequest。",
    },
    skillCapture: asRecord(state.skillCapture),
    postAgentValidationGate: {
      ...asRecord(state.postAgentValidationGate),
      command: nonEmptyString(asRecord(state.postAgentValidationGate).command) ||
        `fastcar-cli auto-iterate --finalize ${session} --yes`,
    },
    phaseGate: {
      ...asRecord(state.phaseGate),
      currentPhase: "delivery",
      canProceed: true,
      blockingReasons: [],
    },
  };

  return {
    state: next,
    changed: true,
    ready: true,
  };
}

module.exports = {
  canFinalizeDelivery,
  finalizeDeliveryState,
  requirementClosure,
};
