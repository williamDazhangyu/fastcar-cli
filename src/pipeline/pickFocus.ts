import type {
  PipelineFocus,
  PickFocusStateLike,
} from "./types";

interface FocusLike {
  id?: string;
  status?: string;
  summary?: string;
  text?: string;
  hypothesis?: string;
}

interface PendingHypothesis {
  id: string | null;
  summary: string;
}

/**
 * @param {unknown} item
 * @returns {item is { id?: string; status?: string; summary?: string; text?: string; hypothesis?: string }}
 */
function hasFocusFields(item: unknown): item is FocusLike {
  return Boolean(item && typeof item === "object" && !Array.isArray(item));
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {Array<{ id?: string; status?: string; summary?: string }>}
 */
function getRequirements(state: PickFocusStateLike | null | undefined): FocusLike[] {
  return state && Array.isArray(state.requirements)
    ? state.requirements.filter(hasFocusFields)
    : [];
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {{ id?: string; status?: string; summary?: string } | undefined}
 */
function firstOpenRequirement(state: PickFocusStateLike | null | undefined): FocusLike | undefined {
  const requirements = getRequirements(state);
  return requirements.find((item) => hasFocusFields(item) && !["passed", "blocked"].includes(item.status || ""));
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @param {string[]} statuses
 * @returns {{ id?: string; status?: string; summary?: string } | undefined}
 */
function firstRequirementWithStatus(
  state: PickFocusStateLike | null | undefined,
  statuses: string[],
): FocusLike | undefined {
  const requirements = getRequirements(state);
  const allowed = new Set(statuses);
  return requirements.find((item) => hasFocusFields(item) && allowed.has(item.status || ""));
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {boolean}
 */
function allRequirementsPassed(state: PickFocusStateLike | null | undefined): boolean {
  const requirements = getRequirements(state);
  return requirements.length > 0 && requirements.every((item) => hasFocusFields(item) && item.status === "passed");
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {boolean}
 */
function hasBlockedRequirement(state: PickFocusStateLike | null | undefined): boolean {
  return getRequirements(state).some((item) => hasFocusFields(item) && item.status === "blocked");
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {boolean}
 */
function hardeningDone(state: PickFocusStateLike | null | undefined): boolean {
  const watchdog = (state && state.watchdog) || {};
  const phaseGate = (state && state.phaseGate) || {};
  return watchdog.validationHardeningStatus === "passed" ||
    watchdog.validation_hardening_status === "passed" ||
    phaseGate.validationHardeningDone === true ||
    phaseGate.hardeningDone === true;
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {boolean}
 */
function optimizeDone(state: PickFocusStateLike | null | undefined): boolean {
  const optimization = (state && state.optimization) || {};
  const phaseGate = (state && state.phaseGate) || {};
  return optimization.status === "passed" ||
    optimization.status === "completed" ||
    phaseGate.optimizationDone === true;
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {boolean}
 */
function optimizationNeedsVerification(state: PickFocusStateLike | null | undefined): boolean {
  const optimization = (state && state.optimization) || {};
  const phaseGate = (state && state.phaseGate) || {};
  return optimization.status === "implemented" ||
    optimization.status === "optimized" ||
    phaseGate.optimizationNeedsVerification === true;
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {boolean}
 */
function optimizationStoppedForNoImprovement(state: PickFocusStateLike | null | undefined): boolean {
  const optimization = (state && state.optimization) || {};
  return optimization.stopReason === "no_improvement" ||
    (Number.isInteger(optimization.noImprovementStreak) &&
      Number.isInteger(optimization.maxNoImprovementIterations) &&
      Number(optimization.noImprovementStreak) >= Number(optimization.maxNoImprovementIterations));
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {boolean}
 */
function hasDiagnoseHypotheses(state: PickFocusStateLike | null | undefined): boolean {
  const diagnose = (state && state.diagnose) || {};
  const queue = Array.isArray(diagnose.hypothesisQueue) ? diagnose.hypothesisQueue : [];
  if (queue.some((item) => hasFocusFields(item) && item.status === "pending")) {
    return true;
  }
  const hypotheses = diagnose.hypotheses;
  return Array.isArray(hypotheses) && hypotheses.length > 0 && !diagnose.lastHypothesisResult;
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {{ id: string | null; summary: string } | null}
 */
function firstPendingDiagnoseHypothesis(state: PickFocusStateLike | null | undefined): PendingHypothesis | null {
  const diagnose = (state && state.diagnose) || {};
  const queue = Array.isArray(diagnose.hypothesisQueue) ? diagnose.hypothesisQueue : [];
  const pending = queue.find((item) => hasFocusFields(item) && item.status === "pending");
  if (pending) {
    return {
      id: pending.id || null,
      summary: pending.summary || pending.text || pending.hypothesis || pending.id || "",
    };
  }
  const hypotheses = Array.isArray(diagnose.hypotheses) ? diagnose.hypotheses : [];
  if (hypotheses.length === 0 || diagnose.lastHypothesisResult) {
    return null;
  }
  const first = hypotheses[0];
  if (hasFocusFields(first)) {
    return {
      id: first.id || "H1",
      summary: first.summary || first.text || first.hypothesis || first.id || "",
    };
  }
  return {
    id: "H1",
    summary: String(first),
  };
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {boolean}
 */
function regressionCheckDone(state: PickFocusStateLike | null | undefined): boolean {
  const diagnose = (state && state.diagnose) || {};
  return diagnose.regressionCheckStatus === "passed" || diagnose.regression_check_status === "passed";
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @param {string} mode
 * @returns {boolean}
 */
function baselineDone(state: PickFocusStateLike | null | undefined, mode: string): boolean {
  const baseline = (state && state.baseline) || {};
  const modeBaseline = baseline[mode];
  return baseline.status === "passed" ||
    baseline.status === "failed" ||
    baseline.status === "ready" ||
    baseline.status === "skipped_with_reason" ||
    baseline.status === "not_available" ||
    (hasFocusFields(modeBaseline) && ["passed", "failed", "ready", "skipped_with_reason", "not_available"].includes(modeBaseline.status || ""));
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @returns {boolean}
 */
function lastCliValidationFailed(state: PickFocusStateLike | null | undefined): boolean {
  const postChange = (state && state.postChange) || {};
  const currentState = (state && state.currentState) || {};
  return postChange.status === "failed" || currentState.lastValidationResult === "failed";
}

/**
 * @param {unknown} value
 * @returns {import("./types").PipelineFocus | null}
 */
function parseFocusOverride(value: unknown): PipelineFocus | null {
  if (!value) {
    return null;
  }
  const [type, ...rest] = String(value).split(":");
  const id = rest.join(":");
  const summary = String(value);
  return {
    type: type || "custom",
    req_id: id || null,
    summary,
  };
}

const ALLOWED_FOCUS_BY_MODE: Record<string, Set<string>> = {
  plan: new Set(["plan_once"]),
  verify: new Set(["verify_req"]),
  diagnose: new Set(["reproduce", "hypothesis_test", "fix_bug", "regression_check"]),
  optimize: new Set(["establish_baseline", "optimize", "verify_optimization"]),
  strict: new Set(["extract_requirements", "implement_req", "fix_bug", "harden_validation", "optimize", "verify_optimization"]),
  quick: new Set(["extract_requirements", "implement_req", "fix_bug", "harden_validation"]),
  prototype: new Set(["extract_requirements", "implement_req", "fix_bug", "harden_validation"]),
};

/**
 * @param {import("./types").PipelineFocus | null | undefined} focus
 * @param {string} [mode]
 * @returns {boolean}
 */
export function isFocusAllowedForMode(focus: PipelineFocus | null | undefined, mode?: string): boolean {
  if (!focus || !focus.type) {
    return false;
  }
  const allowed = ALLOWED_FOCUS_BY_MODE[mode || "strict"] || ALLOWED_FOCUS_BY_MODE.strict;
  return allowed.has(focus.type);
}

/**
 * @param {import("./types").PickFocusStateLike | null | undefined} state
 * @param {unknown} override
 * @param {string} [mode]
 * @returns {import("./types").PipelineFocus | null}
 */
export function pickNextFocus(
  state: PickFocusStateLike | null | undefined,
  override?: unknown,
  mode?: string,
): PipelineFocus | null {
  const stateMode = mode || (state && state.mode && typeof state.mode.mode === "string" ? state.mode.mode : "strict");
  const forced = parseFocusOverride(override);
  if (forced) {
    return isFocusAllowedForMode(forced, stateMode) ? forced : null;
  }

  if (stateMode === "plan") {
    return {
      type: "plan_once",
      req_id: null,
      summary: "输出实施计划，不修改项目文件",
    };
  }

  if (stateMode === "verify") {
    const requirement = firstOpenRequirement(state);
    return {
      type: "verify_req",
      req_id: requirement ? requirement.id : null,
      summary: requirement ? requirement.summary : "验证现有实现是否满足目标",
    };
  }

  if (stateMode === "diagnose") {
    if (hasBlockedRequirement(state)) {
      return null;
    }
    if (!baselineDone(state, "diagnose")) {
      return {
        type: "reproduce",
        req_id: null,
        summary: "先建立可重复复现和验证 baseline",
      };
    }
    if (hasDiagnoseHypotheses(state)) {
      const hypothesis = firstPendingDiagnoseHypothesis(state);
      const hypothesisLabel = hypothesis && hypothesis.id ? ` ${hypothesis.id}` : "";
      const hypothesisSummary = hypothesis && hypothesis.summary ? `: ${hypothesis.summary}` : "";
      return {
        type: "hypothesis_test",
        req_id: hypothesis ? hypothesis.id : null,
        summary: `验证诊断假设${hypothesisLabel}${hypothesisSummary}`,
      };
    }
    const failed = firstRequirementWithStatus(state, ["failed", "implemented", "not_verified", "pending"]);
    if (failed) {
      return {
        type: "fix_bug",
        req_id: failed.id,
        summary: failed.summary || "修复当前复现失败信号",
      };
    }
    return regressionCheckDone(state) ? null : {
      type: "regression_check",
      req_id: null,
      summary: "修复后执行原始复现的回归检查",
    };
  }

  if (stateMode === "optimize") {
    if (!baselineDone(state, "optimize")) {
      return {
        type: "establish_baseline",
        req_id: null,
        summary: "先建立优化前 baseline",
      };
    }
    if (optimizationNeedsVerification(state)) {
      return {
        type: "verify_optimization",
        req_id: null,
        summary: "验证优化后行为和指标",
      };
    }
    if (optimizationStoppedForNoImprovement(state)) {
      return null;
    }
    if (optimizeDone(state)) {
      return null;
    }
    return {
      type: "optimize",
      req_id: null,
      summary: "在已建立 baseline 上执行有边界优化",
    };
  }

  if (lastCliValidationFailed(state)) {
    const failedByValidation = firstRequirementWithStatus(state, ["implemented", "not_verified", "pending"]);
    if (failedByValidation) {
      return {
        type: "fix_bug",
        req_id: failedByValidation.id,
        summary: failedByValidation.summary || "修复 CLI 验证失败信号",
      };
    }
  }

  const failedRequirement = firstRequirementWithStatus(state, ["failed"]);
  if (failedRequirement) {
    return {
      type: "fix_bug",
      req_id: failedRequirement.id,
      summary: failedRequirement.summary || "修复失败需求",
    };
  }

  const requirement = firstOpenRequirement(state);
  if (requirement) {
    return {
      type: requirement.id === "REQ-BOOTSTRAP" ? "extract_requirements" : "implement_req",
      req_id: requirement.id,
      summary: requirement.summary,
    };
  }

  if (allRequirementsPassed(state) && !hardeningDone(state)) {
    return {
      type: "harden_validation",
      req_id: null,
      summary: "全部需求 passed 后补齐边界、反例和回归验证加固",
    };
  }

  if (allRequirementsPassed(state) && stateMode === "strict" && hardeningDone(state) && optimizationNeedsVerification(state)) {
    return {
      type: "verify_optimization",
      req_id: null,
      summary: "验证优化后行为和指标",
    };
  }

  if (allRequirementsPassed(state) && stateMode === "strict" && hardeningDone(state) && !optimizeDone(state)) {
    return {
      type: "optimize",
      req_id: null,
      summary: "在验证通过后执行低风险递归优化",
    };
  }

  return null;
}

