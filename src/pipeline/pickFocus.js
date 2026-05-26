function getRequirements(state) {
  return Array.isArray(state && state.requirements) ? state.requirements : [];
}

function firstOpenRequirement(state) {
  const requirements = getRequirements(state);
  return requirements.find((item) => item && !["passed", "blocked"].includes(item.status));
}

function firstRequirementWithStatus(state, statuses) {
  const requirements = Array.isArray(state && state.requirements) ? state.requirements : [];
  const allowed = new Set(statuses);
  return requirements.find((item) => item && allowed.has(item.status));
}

function allRequirementsPassed(state) {
  const requirements = getRequirements(state);
  return requirements.length > 0 && requirements.every((item) => item && item.status === "passed");
}

function hardeningDone(state) {
  const watchdog = (state && state.watchdog) || {};
  const phaseGate = (state && state.phaseGate) || {};
  return watchdog.validationHardeningStatus === "passed" ||
    watchdog.validation_hardening_status === "passed" ||
    phaseGate.validationHardeningDone === true ||
    phaseGate.hardeningDone === true;
}

function optimizeDone(state) {
  const optimization = (state && state.optimization) || {};
  const phaseGate = (state && state.phaseGate) || {};
  return optimization.status === "passed" ||
    optimization.status === "completed" ||
    phaseGate.optimizationDone === true;
}

function optimizationNeedsVerification(state) {
  const optimization = (state && state.optimization) || {};
  const phaseGate = (state && state.phaseGate) || {};
  return optimization.status === "implemented" ||
    optimization.status === "optimized" ||
    phaseGate.optimizationNeedsVerification === true;
}

function optimizationStoppedForNoImprovement(state) {
  const optimization = (state && state.optimization) || {};
  return optimization.stopReason === "no_improvement" ||
    (Number.isInteger(optimization.noImprovementStreak) &&
      Number.isInteger(optimization.maxNoImprovementIterations) &&
      optimization.noImprovementStreak >= optimization.maxNoImprovementIterations);
}

function hasDiagnoseHypotheses(state) {
  const diagnose = (state && state.diagnose) || {};
  const queue = Array.isArray(diagnose.hypothesisQueue) ? diagnose.hypothesisQueue : [];
  if (queue.some((item) => item && item.status === "pending")) {
    return true;
  }
  const hypotheses = diagnose.hypotheses;
  return Array.isArray(hypotheses) && hypotheses.length > 0 && !diagnose.lastHypothesisResult;
}

function regressionCheckDone(state) {
  const diagnose = (state && state.diagnose) || {};
  return diagnose.regressionCheckStatus === "passed" || diagnose.regression_check_status === "passed";
}

function baselineDone(state, mode) {
  const baseline = (state && state.baseline) || {};
  const modeBaseline = baseline[mode];
  return baseline.status === "passed" ||
    baseline.status === "failed" ||
    baseline.status === "ready" ||
    baseline.status === "skipped_with_reason" ||
    baseline.status === "not_available" ||
    (modeBaseline && ["passed", "failed", "ready", "skipped_with_reason", "not_available"].includes(modeBaseline.status));
}

function lastCliValidationFailed(state) {
  const postChange = (state && state.postChange) || {};
  const currentState = (state && state.currentState) || {};
  return postChange.status === "failed" || currentState.lastValidationResult === "failed";
}

function parseFocusOverride(value) {
  if (!value) {
    return null;
  }
  const [type, ...rest] = String(value).split(":");
  const id = rest.join(":");
  return {
    type: type || "custom",
    req_id: id || null,
    summary: value,
  };
}

const ALLOWED_FOCUS_BY_MODE = {
  plan: new Set(["plan_once"]),
  verify: new Set(["verify_req"]),
  diagnose: new Set(["reproduce", "hypothesis_test", "fix_bug", "regression_check"]),
  optimize: new Set(["establish_baseline", "optimize", "verify_optimization"]),
  strict: new Set(["extract_requirements", "implement_req", "fix_bug", "harden_validation", "optimize"]),
  quick: new Set(["extract_requirements", "implement_req", "fix_bug", "harden_validation"]),
  prototype: new Set(["extract_requirements", "implement_req", "fix_bug", "harden_validation"]),
};

function isFocusAllowedForMode(focus, mode) {
  if (!focus || !focus.type) {
    return false;
  }
  const allowed = ALLOWED_FOCUS_BY_MODE[mode || "strict"] || ALLOWED_FOCUS_BY_MODE.strict;
  return allowed.has(focus.type);
}

function pickNextFocus(state, override, mode) {
  const stateMode = mode || (state && state.mode && state.mode.mode) || "strict";
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
    if (!baselineDone(state, "diagnose")) {
      return {
        type: "reproduce",
        req_id: null,
        summary: "先建立可重复复现和验证 baseline",
      };
    }
    if (hasDiagnoseHypotheses(state)) {
      return {
        type: "hypothesis_test",
        req_id: null,
        summary: "验证当前最高优先级诊断假设",
      };
    }
    const failed = firstRequirementWithStatus(state, ["failed", "blocked", "implemented", "not_verified", "pending"]);
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

  if (allRequirementsPassed(state) && stateMode === "strict" && hardeningDone(state) && !optimizeDone(state)) {
    return {
      type: "optimize",
      req_id: null,
      summary: "在验证通过后执行低风险递归优化",
    };
  }

  return null;
}

module.exports = {
  isFocusAllowedForMode,
  pickNextFocus,
};
