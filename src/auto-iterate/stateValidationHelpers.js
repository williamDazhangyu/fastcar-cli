// @ts-check

const { addError } = require("./stateValidationPrimitives");

const ENGINE_PHASES = [
  "requirement",
  "contract",
  "baseline",
  "coding",
  "validation",
  "cleanup",
  "delivery",
];

const ENGINE_PHASE_SET = new Set(ENGINE_PHASES);

/**
 * @typedef {import("./stateValidationPrimitives").ValidationIssue} ValidationIssue
 * @typedef {{ [key: string]: unknown }} StateObject
 * @typedef {"requirement" | "contract" | "baseline" | "coding" | "validation" | "cleanup" | "delivery"} EnginePhase
 * @typedef {{ passed: number, pending: number, implemented: number, notVerified: number, blocked: number, unknown: number }} RequirementStateCounts
 * @typedef {Record<EnginePhase, string[]>} PhaseCriteriaMap
 */

/**
 * @param {string} phase
 * @returns {phase is EnginePhase}
 */
function isEnginePhase(phase) {
  return ENGINE_PHASE_SET.has(phase);
}

/**
 * @param {ValidationIssue[]} issues
 * @param {StateObject} budgets
 * @param {string} labelPrefix
 * @returns {void}
 */
function validateBudgetRelationships(issues, budgets, labelPrefix) {
  if (budgets.minimumImplementationIterations !== null &&
    (!Number.isInteger(budgets.minimumImplementationIterations) || Number(budgets.minimumImplementationIterations) < 1)) {
    addError(issues, `${labelPrefix}.minimumImplementationIterations 必须为 null 或正整数`);
  }
  if (Number.isInteger(budgets.totalCycles) &&
    Number.isInteger(budgets.implementationIterationsUsed) &&
    Number.isInteger(budgets.optimizationIterationsUsed) &&
    budgets.totalCycles !== Number(budgets.implementationIterationsUsed) + Number(budgets.optimizationIterationsUsed) + Number(budgets.nonImplementationIterationsUsed || 0)) {
    addError(issues, `${labelPrefix}.totalCycles=${budgets.totalCycles}，但 implementationIterationsUsed + optimizationIterationsUsed + nonImplementationIterationsUsed=${Number(budgets.implementationIterationsUsed) + Number(budgets.optimizationIterationsUsed) + Number(budgets.nonImplementationIterationsUsed || 0)}`);
  }
  if (Number.isInteger(budgets.minimumImplementationIterations) &&
    Number.isInteger(budgets.maxIterations) &&
    Number(budgets.minimumImplementationIterations) > Number(budgets.maxIterations)) {
    addError(issues, `${labelPrefix}.minimumImplementationIterations=${budgets.minimumImplementationIterations} 大于 maxIterations=${budgets.maxIterations}`);
  }
}

/**
 * @param {unknown[]} requirements
 * @returns {RequirementStateCounts}
 */
function countJsonRequirementStates(requirements) {
  const counts = {
    passed: 0,
    pending: 0,
    implemented: 0,
    notVerified: 0,
    blocked: 0,
    unknown: 0,
  };
  requirements.forEach((item) => {
    const status = item && typeof item === "object" && "status" in item
      ? /** @type {{ status?: unknown }} */ (item).status
      : undefined;
    if (status === "passed") {
      counts.passed += 1;
    } else if (status === "pending") {
      counts.pending += 1;
    } else if (status === "implemented") {
      counts.implemented += 1;
    } else if (status === "not_verified") {
      counts.notVerified += 1;
    } else if (status === "blocked") {
      counts.blocked += 1;
    } else {
      counts.unknown += 1;
    }
  });
  return counts;
}

/**
 * @param {string} phase
 * @returns {string[]}
 */
function defaultPhaseEntryCriteria(phase) {
  /** @type {PhaseCriteriaMap} */
  const criteria = {
    requirement: ["读取用户目标和原始清单", "提取 Requirement Coverage Matrix"],
    contract: ["RCM 已提取", "明确目标、范围、非目标、成功标准和验证计划"],
    baseline: ["Implementation Contract 已批准或无开放问题", "识别可运行验证命令"],
    coding: ["baseline 已运行或有结构化 skip/not_available 原因", "本轮目标唯一且在变更预算内"],
    validation: ["本轮修改完成", "运行 post-change 验证或记录不可用原因"],
    cleanup: ["验证结果已归因", "无新增 regression 未处理"],
    delivery: ["关键 REQ passed", "cleanup completed", "postAgentValidationGate passed"],
  };
  return isEnginePhase(phase) ? criteria[phase] : [];
}

/**
 * @param {string} phase
 * @returns {string[]}
 */
function defaultPhaseExitCriteria(phase) {
  /** @type {PhaseCriteriaMap} */
  const criteria = {
    requirement: ["RCM 覆盖原始需求和验收标准"],
    contract: ["implementationContract.status=approved"],
    baseline: ["baseline.status 为 passed/failed/skipped_with_reason/not_available"],
    coding: ["只完成一个最小目标修改并更新状态"],
    validation: ["记录 baseline/post-change/delta 结果"],
    cleanup: ["cleanup.status=completed 或有用户确认保留理由"],
    delivery: ["deliveryEvidence ready/delivered 且 validate-state --strict-state 通过"],
  };
  return isEnginePhase(phase) ? criteria[phase] : [];
}

/**
 * @param {string} phase
 * @returns {string[]}
 */
function defaultPhaseBlockingRules(phase) {
  /** @type {PhaseCriteriaMap} */
  const rules = {
    requirement: ["缺少 RCM 不得进入 contract"],
    contract: ["缺少 Implementation Contract 不得进入 coding", "成功标准为空必须 ask_user"],
    baseline: ["无 baseline 且无 skipReason 不得进入 coding 或声称验证有效"],
    coding: ["一轮多目标、超预算或范围扩大必须 stop/replan/ask_user"],
    validation: ["validation unknown 或新增 regression 不得进入 cleanup/delivery"],
    cleanup: ["cleanup pending 或临时 artifact 未解释不得 delivery"],
    delivery: ["finalVerifiability unknown、RCM 开放项或 postAgentValidationGate 失败不得交付"],
  };
  return isEnginePhase(phase) ? rules[phase] : [];
}

/**
 * @param {StateObject | null | undefined} baseline
 * @returns {boolean}
 */
function hasValidatedBaseline(baseline) {
  if (!baseline) {
    return false;
  }
  return (baseline.status === "passed" || baseline.status === "failed" || baseline.status === "skipped_with_reason" || baseline.status === "not_available") &&
    Boolean(baseline.reason);
}

/**
 * @param {RequirementStateCounts} counts
 * @returns {boolean}
 */
function hasOpenRequirementCounts(counts) {
  return counts.pending > 0 ||
    counts.implemented > 0 ||
    counts.notVerified > 0 ||
    counts.blocked > 0 ||
    counts.unknown > 0;
}

module.exports = {
  ENGINE_PHASES,
  countJsonRequirementStates,
  defaultPhaseBlockingRules,
  defaultPhaseEntryCriteria,
  defaultPhaseExitCriteria,
  hasOpenRequirementCounts,
  hasValidatedBaseline,
  isEnginePhase,
  validateBudgetRelationships,
};
