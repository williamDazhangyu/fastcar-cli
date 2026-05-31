import {
  type ValidationIssue,
  addError,
  normalizeRelativePathForCompare,
  requireArray,
  requireBooleanFields,
  requireEnumValue,
  requireNonEmptyString,
  requireNonEmptyStringFields,
  requireNonNegativeIntegerFields,
  requireNormalizedPath,
  requireNullableNonEmptyStringFields,
  requirePlainObject,
} from "./stateValidationPrimitives";
import {
  ENGINE_PHASES,
  countJsonRequirementStates,
  hasOpenRequirementCounts,
  hasValidatedBaseline,
} from "./stateValidationHelpers";
import {
  validateBudgetsModel,
  validateCleanupModel,
  validateDocumentationModel,
  validateLanguageModel,
  validateModeModel,
  validateRequirementsModel,
  validateSessionModel,
  validateTaskModel,
  validateTraceabilityModel,
  validateWatchdogModel,
} from "./stateSchemaBasicValidators";
import { isImplementationMode } from "./modeRules";

type StateObject = Record<string, unknown>;

interface EnumValues {
  requirementStatus: string[];
  deliveryVerifiability: string[];
  requiredAction: string[];
  cleanupStatus: string[];
}

interface StateJsonModelCoreOptions {
  expected?: { session?: string };
  schemaVersion: number;
  validModes: string[];
  isValidationHistoryEntry: (value: unknown) => boolean;
}

/**
 * @param {unknown} value
 * @returns {value is StateObject}
 */
function isStateObject(value: unknown): value is StateObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const DEFAULT_ENUM_VALUES = {
  requirementStatus: ["pending", "implemented", "passed", "blocked", "not_verified"],
  deliveryVerifiability: ["verifiable", "partially_verifiable", "not_verifiable", "unknown"],
  requiredAction: ["continue", "narrow_scope", "run_validation", "reconcile", "ask_user", "stop", "context_compress_and_review"],
  cleanupStatus: ["pending", "completed", "blocked"],
};

const REQUIRED_STATE_OBJECT_KEYS = [
  "task",
  "session",
  "mode",
  "budgets",
  "currentState",
  "watchdog",
  "phaseGate",
  "implementationContract",
  "baseline",
  "iterationPolicy",
  "taskProfile",
  "decisionRequest",
  "decisions",
  "validation",
  "postChange",
  "deltaAssessment",
  "diffBudget",
  "cleanup",
  "styleConsolidation",
  "contextResetReview",
  "deliveryEvidence",
  "skillCapture",
  "postAgentValidationGate",
];

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} validation
 * @param {{ deliveryVerifiability: string[] }} enumValues
 * @param {(value: unknown) => boolean} isValidationHistoryEntry
 * @returns {StateObject}
 */
function validateValidationModel(
  issues: ValidationIssue[],
  validation: unknown,
  enumValues: Pick<EnumValues, "deliveryVerifiability">,
  isValidationHistoryEntry: (value: unknown) => boolean,
): StateObject {
  if (!requirePlainObject(issues, validation, "state.json.validation")) {
    return {};
  }
  requireEnumValue(issues, validation.finalVerifiability, enumValues.deliveryVerifiability, "state.json.validation.finalVerifiability");
  requireArray(issues, validation.commands, "state.json.validation.commands");
  validateValidationCommandsModel(issues, validation.commands, isValidationHistoryEntry);
  return validation;
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} state
 * @returns {void}
 */
function validateDeliveryGateConsistencyModel(issues: ValidationIssue[], state: unknown): void {
  if (!isStateObject(state)) {
    return;
  }
  const deliveryEvidence = isStateObject(state.deliveryEvidence) ? state.deliveryEvidence : {};
  const postAgentGate = isStateObject(state.postAgentValidationGate) ? state.postAgentValidationGate : {};
  const watchdog = isStateObject(state.watchdog) ? state.watchdog : {};
  const postChange = isStateObject(state.postChange) ? state.postChange : {};
  const isReadyOrDelivered = deliveryEvidence.status === "ready" || deliveryEvidence.status === "delivered";
  if (!isReadyOrDelivered) {
    return;
  }
  if (postChange.status !== "passed") {
    addError(issues, "deliveryEvidence ready/delivered 时 postChange.status 必须为 passed");
  }
  if (postChange.regressionDetected === true) {
    addError(issues, "deliveryEvidence ready/delivered 时 postChange.regressionDetected 必须为 false");
  }
  if (postAgentGate.enabled !== true) {
    addError(issues, "deliveryEvidence ready/delivered 时 postAgentValidationGate.enabled 必须为 true");
  }
  if (postAgentGate.lastResult !== "passed") {
    addError(issues, "deliveryEvidence ready/delivered 时 postAgentValidationGate.lastResult 必须为 passed");
  }
  if (postAgentGate.nextAction !== "deliver") {
    addError(issues, "deliveryEvidence ready/delivered 时 postAgentValidationGate.nextAction 必须为 deliver");
  }
  if (watchdog.deliveryVerifiability !== "verifiable" && watchdog.deliveryVerifiability !== "partially_verifiable") {
    addError(issues, "deliveryEvidence ready/delivered 时 watchdog.deliveryVerifiability 必须为 verifiable 或 partially_verifiable");
  }
}

/**
 * @param {unknown} phaseGate
 * @returns {StateObject[]}
 */
function phaseGateGates(phaseGate: unknown): StateObject[] {
  if (!isStateObject(phaseGate) || !Array.isArray(phaseGate.gates)) {
    return [];
  }
  return phaseGate.gates.filter(isStateObject);
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} phaseGate
 * @returns {void}
 */
function validatePhaseGateModel(issues: ValidationIssue[], phaseGate: unknown): void {
  const gateStatusValues = ["pending", "passed", "blocked", "skipped_with_reason"];
  if (!requirePlainObject(issues, phaseGate, "state.json.phaseGate")) {
    return;
  }
  requireEnumValue(issues, phaseGate.currentPhase, ENGINE_PHASES, "state.json.phaseGate.currentPhase");
  requireBooleanFields(issues, phaseGate, ["canProceed"], "state.json.phaseGate");
  requireArray(issues, phaseGate.blockingReasons, "state.json.phaseGate.blockingReasons");
  requireArray(issues, phaseGate.gates, "state.json.phaseGate.gates");
  if (!Array.isArray(phaseGate.gates)) {
    return;
  }

  const seenPhases = new Set();
  phaseGate.gates.forEach((gate, index) => {
    if (!requirePlainObject(issues, gate, `state.json.phaseGate.gates[${index}]`)) {
      return;
    }
    requireEnumValue(issues, gate.phase, ENGINE_PHASES, `state.json.phaseGate.gates[${index}].phase`);
    requireArray(issues, gate.entryCriteria, `state.json.phaseGate.gates[${index}].entryCriteria`);
    requireArray(issues, gate.exitCriteria, `state.json.phaseGate.gates[${index}].exitCriteria`);
    requireArray(issues, gate.blockingRules, `state.json.phaseGate.gates[${index}].blockingRules`);
    requireEnumValue(issues, gate.status, gateStatusValues, `state.json.phaseGate.gates[${index}].status`);
    if (gate.phase) {
      seenPhases.add(gate.phase);
    }
  });

  ENGINE_PHASES.forEach((phase) => {
    if (!seenPhases.has(phase)) {
      addError(issues, `state.json.phaseGate.gates 缺少阶段 ${phase}`);
    }
  });

  if (phaseGate.canProceed === false && (!Array.isArray(phaseGate.blockingReasons) || phaseGate.blockingReasons.length === 0)) {
    addError(issues, "state.json.phaseGate.canProceed=false 时必须记录 blockingReasons");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} contract
 * @param {unknown} phaseGate
 * @returns {void}
 */
function validateImplementationContractModel(issues: ValidationIssue[], contract: unknown, phaseGate: unknown): void {
  const contractStatusValues = ["pending", "approved", "blocked"];
  if (!requirePlainObject(issues, contract, "state.json.implementationContract")) {
    return;
  }
  requireEnumValue(issues, contract.status, contractStatusValues, "state.json.implementationContract.status");
  requireNonEmptyStringFields(issues, contract, [
    "goal",
    "understanding",
    "scope",
    "nonGoals",
    "successCriteria",
    "validationPlan",
    "riskPoints",
  ], "state.json.implementationContract");
  requireArray(issues, contract.openQuestions, "state.json.implementationContract.openQuestions");
  requireBooleanFields(issues, contract, ["userConfirmationRequired"], "state.json.implementationContract");

  const passedContractGate = phaseGateGates(phaseGate)
    .some((gate) => gate.phase === "contract" && gate.status === "passed");
  if (passedContractGate && contract.status !== "approved") {
    addError(issues, "contract 阶段已通过，但 state.json.implementationContract.status 不是 approved");
  }
  if (contract.status === "approved" && Array.isArray(contract.openQuestions) && contract.openQuestions.length > 0) {
    addError(issues, "state.json.implementationContract.status=approved 时 openQuestions 必须为空");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} baseline
 * @param {unknown} phaseGate
 * @returns {void}
 */
function validateBaselineModel(issues: ValidationIssue[], baseline: unknown, phaseGate: unknown): void {
  const baselineStatusValues = ["pending", "passed", "failed", "skipped_with_reason", "not_available"];
  const failureCategoryValues = ["none", "existing_failure", "new_failure", "environment_failure", "test_unavailable", "unknown"];
  if (!requirePlainObject(issues, baseline, "state.json.baseline")) {
    return;
  }
  requireEnumValue(issues, baseline.status, baselineStatusValues, "state.json.baseline.status");
  requireNonEmptyString(issues, baseline.command, "state.json.baseline.command");
  requireNullableNonEmptyStringFields(issues, baseline, ["result", "reason"], "state.json.baseline");
  requireEnumValue(issues, baseline.failureCategory, failureCategoryValues, "state.json.baseline.failureCategory");
  requireBooleanFields(issues, baseline, ["allowsCoding"], "state.json.baseline");

  if (baseline.status === "pending" && baseline.allowsCoding) {
    addError(issues, "state.json.baseline.status=pending 时 allowsCoding 不得为 true");
  }
  if ((baseline.status === "skipped_with_reason" || baseline.status === "not_available") && !baseline.reason) {
    addError(issues, `state.json.baseline.status=${baseline.status} 时必须记录 reason`);
  }

  const codingStarted = phaseGateGates(phaseGate)
    .some((gate) => ["coding", "validation", "cleanup", "delivery"].includes(String(gate.phase)) && gate.status === "passed");
  if (codingStarted && !hasValidatedBaseline(baseline)) {
    addError(issues, "coding/validation/cleanup/delivery 阶段推进前必须有 baseline passed/failed/skipped_with_reason/not_available 及原因");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} policy
 * @returns {void}
 */
function validateIterationPolicyModel(issues: ValidationIssue[], policy: unknown): void {
  const decisionValues = ["continue", "stop", "ask_user", "replan", "revert"];
  if (!requirePlainObject(issues, policy, "state.json.iterationPolicy")) {
    return;
  }
  requireNonEmptyString(issues, policy.currentIterationGoal, "state.json.iterationPolicy.currentIterationGoal");
  requireNonNegativeIntegerFields(issues, policy, [
    "maxGoalsPerIteration",
    "maxChangedFiles",
    "maxDiffLines",
    "maxNoProgressIterations",
    "consecutiveFailureCount",
  ], "state.json.iterationPolicy");
  requireEnumValue(issues, policy.lastDecision, decisionValues, "state.json.iterationPolicy.lastDecision");
  requireArray(issues, policy.allowedFiles, "state.json.iterationPolicy.allowedFiles");
  requireArray(issues, policy.stopConditions, "state.json.iterationPolicy.stopConditions");
  requireArray(issues, policy.rollbackPlan, "state.json.iterationPolicy.rollbackPlan");

  if (policy.maxGoalsPerIteration !== 1) {
    addError(issues, `state.json.iterationPolicy.maxGoalsPerIteration=${policy.maxGoalsPerIteration}，必须等于 1`);
  }
  if (Number(policy.consecutiveFailureCount) >= Number(policy.maxNoProgressIterations) && policy.lastDecision === "continue") {
    addError(issues, "连续失败达到阈值时 iterationPolicy.lastDecision 不得为 continue");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} profile
 * @returns {void}
 */
function validateTaskProfileModel(issues: ValidationIssue[], profile: unknown): void {
  const typeValues = ["feature", "bugfix", "docs", "refactor", "verify", "optimize", "prototype", "unknown"];
  const complexityValues = ["small", "medium", "large"];
  const riskValues = ["low", "medium", "high"];
  if (!requirePlainObject(issues, profile, "state.json.taskProfile")) {
    return;
  }
  requireEnumValue(issues, profile.type, typeValues, "state.json.taskProfile.type");
  requireEnumValue(issues, profile.complexity, complexityValues, "state.json.taskProfile.complexity");
  requireEnumValue(issues, profile.risk, riskValues, "state.json.taskProfile.risk");
  requireBooleanFields(issues, profile, ["needsUserConfirmation"], "state.json.taskProfile");
  requireArray(issues, profile.reasons, "state.json.taskProfile.reasons");
  if ((profile.complexity === "large" || profile.risk === "high") && profile.needsUserConfirmation !== true) {
    addError(issues, "large/high risk taskProfile 必须设置 needsUserConfirmation=true 或记录用户已确认的 decisionRequest");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} request
 * @param {unknown} taskProfile
 * @param {unknown} [state]
 * @returns {void}
 */
function validateDecisionRequestModel(
  issues: ValidationIssue[],
  request: unknown,
  taskProfile: unknown,
  state: unknown = {},
): void {
  const statusValues = ["not_needed", "pending", "approved", "rejected", "blocked"];
  if (!requirePlainObject(issues, request, "state.json.decisionRequest")) {
    return;
  }
  requireEnumValue(issues, request.status, statusValues, "state.json.decisionRequest.status");
  requireNonEmptyStringFields(issues, request, ["topic", "background", "recommended", "impact"], "state.json.decisionRequest");
  requireArray(issues, request.options, "state.json.decisionRequest.options");
  requireArray(issues, request.triggers, "state.json.decisionRequest.triggers");
  const watchdog = isStateObject(state) && isStateObject(state.watchdog) ? state.watchdog : {};
  const pendingRuntimeDecision = request.status === "pending" &&
    watchdog.triggered === true &&
    watchdog.requiredAction === "ask_user" &&
    Array.isArray(request.triggers) &&
    request.triggers.includes("pipeline_worker");
  if (isStateObject(taskProfile) && taskProfile.needsUserConfirmation &&
    request.status !== "approved" &&
    request.status !== "blocked" &&
    !pendingRuntimeDecision) {
    addError(issues, "taskProfile.needsUserConfirmation=true 时 decisionRequest.status 必须为 approved 或 blocked");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} postChange
 * @returns {void}
 */
function validatePostChangeModel(issues: ValidationIssue[], postChange: unknown): void {
  const statusValues = ["not_run", "passed", "failed", "skipped_with_reason", "not_available"];
  const perCommandStatusValues = ["not_run", "passed", "failed", "skipped", "skipped_with_reason", "not_available"];
  if (!requirePlainObject(issues, postChange, "state.json.postChange")) {
    return;
  }
  requireEnumValue(issues, postChange.status, statusValues, "state.json.postChange.status");
  requireNonEmptyString(issues, postChange.command, "state.json.postChange.command");
  requireNullableNonEmptyStringFields(issues, postChange, ["result", "reason"], "state.json.postChange");
  requireBooleanFields(issues, postChange, ["regressionDetected"], "state.json.postChange");
  if ((postChange.status === "skipped_with_reason" || postChange.status === "not_available") && !postChange.reason) {
    addError(issues, `state.json.postChange.status=${postChange.status} 时必须记录 reason`);
  }
  if (postChange.perCommand !== undefined && !Array.isArray(postChange.perCommand)) {
    addError(issues, "state.json.postChange.perCommand 必须是数组");
  }
  const perCommand = Array.isArray(postChange.perCommand) ? postChange.perCommand : [];
  let failedCommandCount = 0;
  perCommand.forEach((item, index) => {
    if (!requirePlainObject(issues, item, `state.json.postChange.perCommand[${index}]`)) {
      return;
    }
    requireNonEmptyString(issues, item.command, `state.json.postChange.perCommand[${index}].command`);
    requireEnumValue(issues, item.status, perCommandStatusValues, `state.json.postChange.perCommand[${index}].status`);
    if (item.exitCode !== undefined && item.exitCode !== null && !Number.isInteger(item.exitCode)) {
      addError(issues, `state.json.postChange.perCommand[${index}].exitCode 必须是整数或 null`);
    }
    if (item.status === "passed" && item.exitCode !== undefined && item.exitCode !== null && item.exitCode !== 0) {
      addError(issues, `state.json.postChange.perCommand[${index}] status=passed 时 exitCode 必须为 0 或 null`);
    }
    if (item.status === "failed") {
      failedCommandCount += 1;
      const hasFailureSignal = item.exitCode !== 0 ||
        (item.signal && item.signal !== "none") ||
        (item.error && item.error !== "none");
      if (!hasFailureSignal) {
        addError(issues, `state.json.postChange.perCommand[${index}] status=failed 时必须记录非 0 exitCode、signal 或 error`);
      }
    }
  });
  if (postChange.status === "passed" && failedCommandCount > 0) {
    addError(issues, "state.json.postChange.status=passed 时 perCommand 不得包含 failed 命令");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} commands
 * @param {(item: unknown) => boolean} isValidationHistoryEntry
 * @returns {void}
 */
function validateValidationCommandsModel(
  issues: ValidationIssue[],
  commands: unknown,
  isValidationHistoryEntry: (value: unknown) => boolean,
): void {
  const resultValues = ["passed", "failed", "skipped", "not_run", "not_available", "skipped_with_reason"];
  if (!Array.isArray(commands)) {
    return;
  }
  commands.forEach((item, index) => {
    if (typeof item === "string") {
      if (!item.trim()) {
        addError(issues, `state.json.validation.commands[${index}] 字符串命令不能为空`);
      }
      return;
    }
    if (!requirePlainObject(issues, item, `state.json.validation.commands[${index}]`)) {
      return;
    }
    requireNonEmptyString(issues, item.command, `state.json.validation.commands[${index}].command`);
    if (isValidationHistoryEntry(item)) {
      requireEnumValue(issues, item.result, resultValues, `state.json.validation.commands[${index}].result`);
      if (item.status !== undefined) {
        requireEnumValue(issues, item.status, resultValues, `state.json.validation.commands[${index}].status`);
      }
      if (item.exitCode !== undefined && item.exitCode !== null && !Number.isInteger(item.exitCode)) {
        addError(issues, `state.json.validation.commands[${index}].exitCode 必须是整数或 null`);
      }
      const iteration = item.iteration;
      if (iteration !== undefined && (!Number.isInteger(iteration) || Number(iteration) < 1)) {
        addError(issues, `state.json.validation.commands[${index}].iteration 必须是大于 0 的整数`);
      }
    }
  });
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} delta
 * @param {unknown} postChange
 * @param {unknown} policy
 * @returns {void}
 */
function validateDeltaAssessmentModel(
  issues: ValidationIssue[],
  delta: unknown,
  postChange: unknown,
  policy: unknown,
): void {
  const statusValues = ["pending", "improved", "unchanged", "regression", "unknown"];
  const decisionValues = ["keep", "revert", "retry_new_direction", "stop", "ask_user"];
  if (!requirePlainObject(issues, delta, "state.json.deltaAssessment")) {
    return;
  }
  requireEnumValue(issues, delta.status, statusValues, "state.json.deltaAssessment.status");
  requireEnumValue(issues, delta.decision, decisionValues, "state.json.deltaAssessment.decision");
  requireNonEmptyStringFields(issues, delta, ["summary", "baselineRef", "postChangeRef"], "state.json.deltaAssessment");
  if ((delta.status === "regression" || (isStateObject(postChange) && postChange.regressionDetected)) && delta.decision === "keep") {
    addError(issues, "检测到 regression 时 deltaAssessment.decision 不得为 keep");
  }
  if (delta.status === "regression" && isStateObject(policy) && policy.lastDecision === "continue") {
    addError(issues, "deltaAssessment.status=regression 时 iterationPolicy.lastDecision 不得为 continue");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} diffBudget
 * @param {unknown} policy
 * @returns {void}
 */
function validateDiffBudgetModel(issues: ValidationIssue[], diffBudget: unknown, policy: unknown): void {
  const statusValues = ["not_checked", "within_budget", "over_budget", "unknown"];
  if (!requirePlainObject(issues, diffBudget, "state.json.diffBudget")) {
    return;
  }
  requireEnumValue(issues, diffBudget.status, statusValues, "state.json.diffBudget.status");
  requireNonNegativeIntegerFields(issues, diffBudget, ["changedFiles", "diffLines"], "state.json.diffBudget");
  requireArray(issues, diffBudget.outOfScopeFiles, "state.json.diffBudget.outOfScopeFiles");
  requireArray(issues, diffBudget.highRiskFiles, "state.json.diffBudget.highRiskFiles");
  requireNonEmptyString(issues, diffBudget.reason, "state.json.diffBudget.reason");
  if (isStateObject(policy)) {
    if (Number(diffBudget.changedFiles) > Number(policy.maxChangedFiles)) {
      addError(issues, `state.json.diffBudget.changedFiles=${diffBudget.changedFiles} 超出 maxChangedFiles=${policy.maxChangedFiles}`);
    }
    if (Number(diffBudget.diffLines) > Number(policy.maxDiffLines)) {
      addError(issues, `state.json.diffBudget.diffLines=${diffBudget.diffLines} 超出 maxDiffLines=${policy.maxDiffLines}`);
    }
  }
  if (diffBudget.status === "over_budget" && isStateObject(policy) && policy.lastDecision === "continue") {
    addError(issues, "diffBudget.status=over_budget 时 iterationPolicy.lastDecision 不得为 continue");
  }
  if ((Array.isArray(diffBudget.outOfScopeFiles) && diffBudget.outOfScopeFiles.length > 0 ||
    Array.isArray(diffBudget.highRiskFiles) && diffBudget.highRiskFiles.length > 0) &&
    isStateObject(policy) &&
    policy.lastDecision === "continue") {
    addError(issues, "存在 outOfScopeFiles/highRiskFiles 时 iterationPolicy.lastDecision 不得为 continue");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} evidence
 * @param {unknown} validation
 * @param {unknown} cleanup
 * @param {unknown} requirements
 * @returns {void}
 */
function validateDeliveryEvidenceModel(
  issues: ValidationIssue[],
  evidence: unknown,
  validation: unknown,
  cleanup: unknown,
  requirements: unknown,
): void {
  const deliveryStatusValues = ["pending", "ready", "blocked", "delivered"];
  if (!requirePlainObject(issues, evidence, "state.json.deliveryEvidence")) {
    return;
  }
  requireEnumValue(issues, evidence.status, deliveryStatusValues, "state.json.deliveryEvidence.status");
  requireNonEmptyStringFields(issues, evidence, [
    "goal",
    "changes",
    "validationSummary",
    "baselineComparison",
    "cleanupSummary",
    "risks",
    "unfinishedItems",
    "userConfirmation",
  ], "state.json.deliveryEvidence");
  requireArray(issues, evidence.changedFiles, "state.json.deliveryEvidence.changedFiles");

  const requirementCounts = countJsonRequirementStates(Array.isArray(requirements) ? requirements : []);
  const hasOpenRequirements = hasOpenRequirementCounts(requirementCounts);
  if ((evidence.status === "ready" || evidence.status === "delivered") && hasOpenRequirements) {
    addError(issues, "state.json.deliveryEvidence.status 为 ready/delivered 时 requirements 不得存在开放项");
  }
  const isReadyOrDelivered = evidence.status === "ready" || evidence.status === "delivered";
  if (isReadyOrDelivered && isStateObject(validation) && validation.finalVerifiability === "unknown") {
    addError(issues, "state.json.deliveryEvidence.status 为 ready/delivered 时 validation.finalVerifiability 不得为 unknown");
  }
  if (isReadyOrDelivered && isStateObject(validation) && validation.finalVerifiability === "not_verifiable") {
    addError(issues, "state.json.deliveryEvidence.status 为 ready/delivered 时 validation.finalVerifiability 不得为 not_verifiable");
  }
  if (isReadyOrDelivered && isStateObject(cleanup) && cleanup.status !== "completed") {
    addError(issues, "state.json.deliveryEvidence.status 为 ready/delivered 时 cleanup.status 必须为 completed");
  }
  if (isReadyOrDelivered && typeof evidence.validationSummary === "string" && /^(未运行|无|unknown|not_run)$/i.test(evidence.validationSummary.trim())) {
    addError(issues, "state.json.deliveryEvidence.status 为 ready/delivered 时 validationSummary 必须包含真实验证结论");
  }
  if (isReadyOrDelivered && typeof evidence.risks === "string" && /^(无|none|not_needed)$/i.test(evidence.risks.trim())) {
    addError(issues, "state.json.deliveryEvidence.status 为 ready/delivered 时 risks 必须显式说明风险或有限可验证边界");
  }
  if (isReadyOrDelivered && typeof evidence.userConfirmation === "string" && /^(无|none)$/i.test(evidence.userConfirmation.trim())) {
    addError(issues, "state.json.deliveryEvidence.status 为 ready/delivered 时 userConfirmation 必须记录确认来源或说明无需确认的原因");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} styleConsolidation
 * @param {unknown} state
 * @returns {void}
 */
function validateStyleConsolidationModel(
  issues: ValidationIssue[],
  styleConsolidation: unknown,
  state: unknown,
): void {
  const statusValues = ["pending", "completed", "not_applicable", "blocked", "not_available"];
  if (!requirePlainObject(issues, styleConsolidation, "state.json.styleConsolidation")) {
    return;
  }

  requireEnumValue(issues, styleConsolidation.status, statusValues, "state.json.styleConsolidation.status");
  requireNonEmptyStringFields(issues, styleConsolidation, [
    "trigger",
    "scope",
    "summary",
    "verificationSummary",
    "lastRunSummary",
  ], "state.json.styleConsolidation");
  requireArray(issues, styleConsolidation.localSkillsReviewed, "state.json.styleConsolidation.localSkillsReviewed");
  requireArray(issues, styleConsolidation.globalSkillsReviewed, "state.json.styleConsolidation.globalSkillsReviewed");
  requireArray(issues, styleConsolidation.appliedRules, "state.json.styleConsolidation.appliedRules");
  requireArray(issues, styleConsolidation.changedFiles, "state.json.styleConsolidation.changedFiles");
  requireArray(issues, styleConsolidation.skippedReasons, "state.json.styleConsolidation.skippedReasons");

  const mode = isStateObject(state) && isStateObject(state.mode) ? state.mode.mode : "unknown";
  const deliveryEvidence = isStateObject(state) && isStateObject(state.deliveryEvidence) ? state.deliveryEvidence : {};
  const isReadyOrDelivered = deliveryEvidence.status === "ready" || deliveryEvidence.status === "delivered";
  if (isReadyOrDelivered && isImplementationMode(mode) && styleConsolidation.status === "pending") {
    addError(issues, "实现类模式 deliveryEvidence ready/delivered 前 styleConsolidation.status 不得为 pending");
  }
  if (styleConsolidation.status === "completed") {
    if (Array.isArray(styleConsolidation.localSkillsReviewed) &&
      Array.isArray(styleConsolidation.globalSkillsReviewed) &&
      styleConsolidation.localSkillsReviewed.length === 0 &&
      styleConsolidation.globalSkillsReviewed.length === 0) {
      addError(issues, "styleConsolidation.status=completed 时必须记录已参考的本地或全局 skill");
    }
    if (Array.isArray(styleConsolidation.appliedRules) && styleConsolidation.appliedRules.length === 0) {
      addError(issues, "styleConsolidation.status=completed 时 appliedRules 不能为空");
    }
    if (typeof styleConsolidation.verificationSummary === "string" && /^(未运行|无|unknown|not_run)$/i.test(styleConsolidation.verificationSummary.trim())) {
      addError(issues, "styleConsolidation.status=completed 时 verificationSummary 必须记录整理后的验证结论");
    }
  }
  if (styleConsolidation.status === "not_applicable" &&
    Array.isArray(styleConsolidation.skippedReasons) &&
    styleConsolidation.skippedReasons.length === 0) {
    addError(issues, "styleConsolidation.status=not_applicable 时 skippedReasons 必须说明原因");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} review
 * @param {unknown} state
 * @returns {void}
 */
function validateContextResetReviewModel(issues: ValidationIssue[], review: unknown, state: unknown): void {
  const statusValues = ["pending", "passed", "failed", "blocked", "not_available", "user_accepted_limited"];
  const decisionValues = ["not_run", "pass", "reopen_requirements", "block", "limited_acceptance"];
  if (!requirePlainObject(issues, review, "state.json.contextResetReview")) {
    return;
  }

  requireEnumValue(issues, review.status, statusValues, "state.json.contextResetReview.status");
  requireEnumValue(issues, review.decision, decisionValues, "state.json.contextResetReview.decision");
  requireNonEmptyStringFields(issues, review, [
    "trigger",
    "sourceOfTruth",
    "lastRunSummary",
  ], "state.json.contextResetReview");
  requireNonNegativeIntegerFields(issues, review, [
    "reviewCyclesUsed",
    "maxReviewCycles",
  ], "state.json.contextResetReview");
  requireArray(issues, review.standardsFindings, "state.json.contextResetReview.standardsFindings");
  requireArray(issues, review.specFindings, "state.json.contextResetReview.specFindings");
  requireArray(issues, review.reopenedRequirements, "state.json.contextResetReview.reopenedRequirements");

  if (Number(review.reviewCyclesUsed) > Number(review.maxReviewCycles)) {
    addError(issues, "contextResetReview.reviewCyclesUsed 不得大于 maxReviewCycles");
  }

  const deliveryEvidence = isStateObject(state) && isStateObject(state.deliveryEvidence) ? state.deliveryEvidence : {};
  const isReadyOrDelivered = deliveryEvidence.status === "ready" || deliveryEvidence.status === "delivered";
  const canDeliverWithReview = review.status === "passed" || review.status === "user_accepted_limited";
  if (isReadyOrDelivered && !canDeliverWithReview) {
    addError(issues, "deliveryEvidence ready/delivered 前 contextResetReview.status 必须为 passed 或 user_accepted_limited");
  }
  if (isReadyOrDelivered && review.status === "pending") {
    addError(issues, "deliveryEvidence ready/delivered 前 contextResetReview.status 不得为 pending");
  }
  if (isReadyOrDelivered && review.status === "failed") {
    addError(issues, "contextResetReview.status=failed 时不得交付；必须重开 REQ 并回到实现循环");
  }
  if (isReadyOrDelivered && review.status === "passed" && review.decision !== "pass") {
    addError(issues, "contextResetReview.status=passed 时 decision 必须为 pass");
  }
  if (review.status === "passed") {
    if (Number(review.reviewCyclesUsed) < 1) {
      addError(issues, "contextResetReview.status=passed 时 reviewCyclesUsed 必须至少为 1");
    }
    if (Array.isArray(review.standardsFindings) &&
      Array.isArray(review.specFindings) &&
      Array.isArray(review.reopenedRequirements) &&
      (review.standardsFindings.length > 0 || review.specFindings.length > 0 || review.reopenedRequirements.length > 0)) {
      addError(issues, "contextResetReview.status=passed 时 findings 和 reopenedRequirements 必须为空");
    }
  }
  if (review.status === "failed" && Array.isArray(review.reopenedRequirements) && review.reopenedRequirements.length === 0) {
    addError(issues, "contextResetReview.status=failed 时必须记录 reopenedRequirements");
  }
  if (isReadyOrDelivered && review.status === "user_accepted_limited" && review.decision !== "limited_acceptance") {
    addError(issues, "contextResetReview.status=user_accepted_limited 时 decision 必须为 limited_acceptance");
  }
  if ((review.status === "blocked" || review.status === "not_available" || review.status === "user_accepted_limited") &&
    typeof review.lastRunSummary === "string" &&
    review.lastRunSummary.trim() === "未运行") {
    addError(issues, `contextResetReview.status=${review.status} 时 lastRunSummary 必须说明阻塞、不可用或有限接受原因`);
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} skillCapture
 * @param {unknown} evidence
 * @returns {void}
 */
function validateSkillCaptureModel(issues: ValidationIssue[], skillCapture: unknown, evidence: unknown): void {
  const statusValues = [
    "pending",
    "captured",
    "skipped_no_high_value",
    "blocked",
    "not_available",
  ];
  if (!requirePlainObject(issues, skillCapture, "state.json.skillCapture")) {
    return;
  }

  requireEnumValue(issues, skillCapture.status, statusValues, "state.json.skillCapture.status");
  requireNonEmptyStringFields(issues, skillCapture, [
    "root",
    "indexFile",
    "selectionCriteria",
    "lastRunSummary",
  ], "state.json.skillCapture");
  requireArray(issues, skillCapture.capturedFiles, "state.json.skillCapture.capturedFiles");
  requireArray(issues, skillCapture.pendingCandidates, "state.json.skillCapture.pendingCandidates");
  requireArray(issues, skillCapture.skippedReasons, "state.json.skillCapture.skippedReasons");

  if (normalizeRelativePathForCompare(String(skillCapture.root || "")) !== ".agents/skills") {
    addError(issues, "state.json.skillCapture.root 必须为 .agents/skills");
  }
  if (normalizeRelativePathForCompare(String(skillCapture.indexFile || "")) !== ".agents/skills/index.md") {
    addError(issues, "state.json.skillCapture.indexFile 必须为 .agents/skills/index.md");
  }

  const isDeliveryReady = isStateObject(evidence) && (evidence.status === "ready" || evidence.status === "delivered");
  if (isDeliveryReady && skillCapture.status === "pending") {
    addError(issues, "deliveryEvidence ready/delivered 时 skillCapture.status 不得为 pending");
  }
  if (skillCapture.status === "captured" && Array.isArray(skillCapture.capturedFiles) && skillCapture.capturedFiles.length === 0) {
    addError(issues, "state.json.skillCapture.status=captured 时 capturedFiles 不能为空");
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} deliveryDocs
 * @param {unknown} state
 * @returns {void}
 */
function validateDeliveryDocsModel(issues: ValidationIssue[], deliveryDocs: unknown, state: unknown): void {
  const statusValues = ["pending", "generated", "blocked", "not_available"];
  if (!requirePlainObject(issues, deliveryDocs, "state.json.deliveryDocs")) {
    return;
  }

  requireEnumValue(issues, deliveryDocs.status, statusValues, "state.json.deliveryDocs.status");
  requireNonEmptyString(issues, deliveryDocs.path || "docs", "state.json.deliveryDocs.path");
  requireArray(issues, deliveryDocs.files, "state.json.deliveryDocs.files");

  const session = isStateObject(state) && isStateObject(state.session) ? state.session.session : null;
  if (deliveryDocs.status !== "generated" || typeof session !== "string" || !session) {
    return;
  }

  const expectedDocsDir = `.agent-state/auto-iterate/${session}/docs`;
  const actualDocsDir = normalizeRelativePathForCompare(String(deliveryDocs.path || ""));
  if (actualDocsDir !== expectedDocsDir) {
    addError(issues, `deliveryDocs.status=generated 时 state.json.deliveryDocs.path=${actualDocsDir || "missing"} 必须属于当前 session ${session}: ${expectedDocsDir}`);
  }
  if (Array.isArray(deliveryDocs.files)) {
    const invalidFiles = deliveryDocs.files
      .map((file) => normalizeRelativePathForCompare(String(file || "")))
      .filter((file) => !file || !file.startsWith(`${expectedDocsDir}/`));
    if (invalidFiles.length > 0) {
      addError(issues, `deliveryDocs.status=generated 时 files 必须属于当前 session ${session}: ${invalidFiles.join(", ")}`);
    }
    if (deliveryDocs.files.length === 0) {
      addError(issues, `deliveryDocs.status=generated 时 files 不能为空，且必须属于当前 session ${session}`);
    }
  }
  if (!deliveryDocs.generatedAt) {
    addError(issues, `deliveryDocs.status=generated 时 generatedAt 不能为空，且必须属于当前 session ${session} 的真实生成记录`);
  }
}

/**
 * @param {ValidationIssue[]} issues
 * @param {unknown} gate
 * @returns {void}
 */
function validatePostAgentValidationGateModel(issues: ValidationIssue[], gate: unknown): void {
  const lastResultValues = ["passed", "failed", "not_run"];
  const nextActionValues = ["deliver", "context_reset_and_repair", "stop"];
  if (!requirePlainObject(issues, gate, "state.json.postAgentValidationGate")) {
    return;
  }
  requireBooleanFields(issues, gate, ["enabled"], "state.json.postAgentValidationGate");
  requireNonEmptyString(issues, gate.command, "state.json.postAgentValidationGate.command");
  requireEnumValue(issues, gate.lastResult, lastResultValues, "state.json.postAgentValidationGate.lastResult");
  requireNonNegativeIntegerFields(issues, gate, ["repairCyclesUsed", "maxRepairCycles"], "state.json.postAgentValidationGate");
  requireArray(issues, gate.failureSummary, "state.json.postAgentValidationGate.failureSummary");
  requireEnumValue(issues, gate.nextAction, nextActionValues, "state.json.postAgentValidationGate.nextAction");

  const command = typeof gate.command === "string" ? gate.command : "";
  const usesStrictValidateState = command.includes("--validate-state") && command.includes("--strict-state");
  const usesFinalize = command.includes("--finalize");
  if (gate.enabled && !usesStrictValidateState && !usesFinalize) {
    addError(issues, "state.json.postAgentValidationGate.command 必须包含 --finalize，或兼容旧格式 --validate-state 和 --strict-state");
  }
  if (gate.lastResult === "failed" && gate.nextAction !== "context_reset_and_repair" && gate.nextAction !== "stop") {
    addError(issues, "postAgentValidationGate.lastResult=failed 时 nextAction 必须为 context_reset_and_repair 或 stop");
  }
  if (Number(gate.repairCyclesUsed) > Number(gate.maxRepairCycles)) {
    addError(issues, "postAgentValidationGate.repairCyclesUsed 不得大于 maxRepairCycles");
  }
}

/**
 * @param {unknown} state
 * @param {{
 *   expected?: { session?: string };
 *   schemaVersion: number;
 *   validModes: string[];
 *   isValidationHistoryEntry: (value: unknown) => boolean;
 * }} options
 * @returns {ValidationIssue[]}
 */
function validateStateJsonModelCore(state: unknown, options: StateJsonModelCoreOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!requirePlainObject(issues, state, "state.json")) {
    return issues;
  }

  if (state.schemaVersion !== options.schemaVersion) {
    addError(issues, `state.json.schemaVersion=${state.schemaVersion || "missing"}，期望 ${options.schemaVersion}`);
  }

  REQUIRED_STATE_OBJECT_KEYS.forEach((key) => {
    requirePlainObject(issues, state[key], `state.json.${key}`);
  });
  if (state.language !== undefined) {
    validateLanguageModel(issues, state.language);
  }
  if (state.traceability !== undefined) {
    validateTraceabilityModel(issues, state.traceability);
  }
  if (state.documentation !== undefined) {
    validateDocumentationModel(issues, state.documentation);
  }
  if (state.deliveryDocs !== undefined) {
    validateDeliveryDocsModel(issues, state.deliveryDocs, state);
  }

  validateTaskModel(issues, state.task);
  validateSessionModel(issues, state.session || {}, options.expected || {});
  validateModeModel(issues, state.mode, options.validModes);
  validateBudgetsModel(issues, state.budgets);
  validateWatchdogModel(issues, state.watchdog, DEFAULT_ENUM_VALUES);
  const requirements = validateRequirementsModel(issues, state.requirements, state.watchdog, DEFAULT_ENUM_VALUES);

  const validation = validateValidationModel(issues, state.validation, DEFAULT_ENUM_VALUES, options.isValidationHistoryEntry);
  const cleanup = validateCleanupModel(issues, state.cleanup, DEFAULT_ENUM_VALUES);

  validatePhaseGateModel(issues, state.phaseGate);
  validateImplementationContractModel(issues, state.implementationContract, state.phaseGate);
  validateBaselineModel(issues, state.baseline, state.phaseGate);
  validateIterationPolicyModel(issues, state.iterationPolicy);
  validateTaskProfileModel(issues, state.taskProfile);
  validateDecisionRequestModel(issues, state.decisionRequest, state.taskProfile, state);
  validatePostChangeModel(issues, state.postChange);
  validateDeltaAssessmentModel(issues, state.deltaAssessment, state.postChange, state.iterationPolicy);
  validateDiffBudgetModel(issues, state.diffBudget, state.iterationPolicy);
  validateDeliveryEvidenceModel(issues, state.deliveryEvidence, validation, cleanup, requirements);
  validateStyleConsolidationModel(issues, state.styleConsolidation, state);
  validateContextResetReviewModel(issues, state.contextResetReview, state);
  validateSkillCaptureModel(issues, state.skillCapture, state.deliveryEvidence);
  validatePostAgentValidationGateModel(issues, state.postAgentValidationGate);
  validateDeliveryGateConsistencyModel(issues, state);

  return issues;
}

export {
  validateBaselineModel,
  validateBudgetsModel,
  validateContextResetReviewModel,
  validateCleanupModel,
  validateDecisionRequestModel,
  validateDeltaAssessmentModel,
  validateDeliveryDocsModel,
  validateDeliveryEvidenceModel,
  validateDeliveryGateConsistencyModel,
  validateDiffBudgetModel,
  validateDocumentationModel,
  validateImplementationContractModel,
  validateIterationPolicyModel,
  validateLanguageModel,
  validatePhaseGateModel,
  validatePostChangeModel,
  validatePostAgentValidationGateModel,
  validateSessionModel,
  validateSkillCaptureModel,
  validateStyleConsolidationModel,
  validateRequirementsModel,
  validateModeModel,
  validateTaskProfileModel,
  validateTaskModel,
  validateTraceabilityModel,
  validateValidationCommandsModel,
  validateValidationModel,
  validateStateJsonModelCore,
  validateWatchdogModel,
};
