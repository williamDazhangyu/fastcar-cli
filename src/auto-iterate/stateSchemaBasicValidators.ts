import {
  type ValidationIssue,
  addError,
  requireArray,
  requireBooleanFields,
  requireEnumValue,
  requireNonEmptyString,
  requireNonEmptyStringFields,
  requireNonNegativeIntegerFields,
  requireNormalizedPath,
  requirePlainObject,
} from "./stateValidationPrimitives";
import {
  countJsonRequirementStates,
  hasOpenRequirementCounts,
  validateBudgetRelationships,
} from "./stateValidationHelpers";

type StateObject = Record<string, unknown>;

function isStateObject(value: unknown): value is StateObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateLanguageModel(issues: ValidationIssue[], language: unknown): void {
  if (!requirePlainObject(issues, language, "state.json.language")) {
    return;
  }
  requireEnumValue(issues, language.code, ["zh", "en"], "state.json.language.code");
  requireNonEmptyString(issues, language.source || "inferred", "state.json.language.source");
  requireEnumValue(issues, language.confidence || "medium", ["low", "medium", "high"], "state.json.language.confidence");
}

export function validateTraceabilityModel(issues: ValidationIssue[], traceability: unknown): void {
  if (!requirePlainObject(issues, traceability, "state.json.traceability")) {
    return;
  }
  requireNonEmptyString(issues, traceability.policy || "public audit summaries only", "state.json.traceability.policy");
  requireArray(issues, traceability.iterations, "state.json.traceability.iterations");
}

export function validateDocumentationModel(issues: ValidationIssue[], documentation: unknown): void {
  if (!requirePlainObject(issues, documentation, "state.json.documentation")) {
    return;
  }
  ["apiChanges", "architectureNotes", "implementationNotes", "changelogEntries"].forEach((key) => {
    requireArray(issues, documentation[key], `state.json.documentation.${key}`);
  });
}

export function validateSessionModel(
  issues: ValidationIssue[],
  session: unknown,
  expected: { session?: string } = {},
): void {
  if (!requirePlainObject(issues, session, "state.json.session")) {
    return;
  }
  requireNonEmptyStringFields(issues, session, ["session", "stateJsonFile", "stateFile", "promptFile", "currentFile"], "state.json.session");
  if (expected.session && session.session !== expected.session) {
    addError(issues, `state.json.session.session=${session.session || "missing"}，期望 ${expected.session}`);
  }
  if (typeof session.session !== "string" || !session.session) {
    return;
  }
  const expectedStateJson = `.agent-state/auto-iterate/${session.session}/state.json`;
  const expectedStateMd = `.agent-state/auto-iterate/${session.session}/state.md`;
  const expectedPrompt = `.agent-state/auto-iterate/${session.session}/start-prompt.md`;
  requireNormalizedPath(issues, String(session.stateJsonFile || ""), expectedStateJson, "state.json.session.stateJsonFile");
  requireNormalizedPath(issues, String(session.stateFile || ""), expectedStateMd, "state.json.session.stateFile");
  requireNormalizedPath(issues, String(session.promptFile || ""), expectedPrompt, "state.json.session.promptFile");
}

export function validateTaskModel(issues: ValidationIssue[], task: unknown): void {
  if (!requirePlainObject(issues, task, "state.json.task")) {
    return;
  }
  requireNonEmptyString(issues, task.goal, "state.json.task.goal");
  requireArray(issues, task.successCriteria, "state.json.task.successCriteria");
  requireArray(issues, task.nonGoals, "state.json.task.nonGoals");
  requireNonEmptyString(issues, task.allowedScope, "state.json.task.allowedScope");
  requireArray(issues, task.compatibility, "state.json.task.compatibility");
  if (Array.isArray(task.successCriteria) && task.successCriteria.length === 0) {
    addError(issues, "state.json.task.successCriteria 不能为空；缺少成功标准时不得进入自动迭代交付门禁");
  }
}

export function validateModeModel(issues: ValidationIssue[], mode: unknown, validModes: readonly string[]): void {
  if (!requirePlainObject(issues, mode, "state.json.mode")) {
    return;
  }
  if (!mode.mode || !validModes.includes(String(mode.mode))) {
    addError(issues, `state.json.mode.mode=${mode.mode || "missing"} 不是有效模式`);
  }
  requireBooleanFields(issues, mode, ["autopilot", "runtimeAutopilot", "allowAgentInference", "allowModify"], "state.json.mode");
  requireEnumValue(issues, mode.loopShape, ["default", "autopilot", "plan_once"], "state.json.mode.loopShape");
}

export function validateBudgetsModel(issues: ValidationIssue[], budgets: unknown): void {
  if (!requirePlainObject(issues, budgets, "state.json.budgets")) {
    return;
  }
  requireNonNegativeIntegerFields(issues, budgets, [
    "maxIterations",
    "autopilotMaxIterations",
    "implementationIterationsUsed",
    "nonImplementationIterationsUsed",
    "validationHardeningIterationsUsed",
    "minimumValidationHardeningIterations",
    "optimizationIterationsUsed",
    "totalCycles",
    "remainingImplementationIterations",
    "remainingValidationHardeningIterations",
  ], "state.json.budgets");
  validateBudgetRelationships(issues, budgets, "state.json.budgets");
}

export function validateWatchdogModel(
  issues: ValidationIssue[],
  watchdog: unknown,
  enumValues: { deliveryVerifiability: string[]; requiredAction: string[] },
): void {
  if (!requirePlainObject(issues, watchdog, "state.json.watchdog")) {
    return;
  }
  requireEnumValue(issues, watchdog.deliveryVerifiability, enumValues.deliveryVerifiability, "state.json.watchdog.deliveryVerifiability");
  requireEnumValue(issues, watchdog.requiredAction, enumValues.requiredAction, "state.json.watchdog.requiredAction");
  requireBooleanFields(issues, watchdog, ["enabled", "triggered", "freshEyesRequired"], "state.json.watchdog");
}

export function validateRequirementsModel(
  issues: ValidationIssue[],
  requirements: unknown,
  watchdog: unknown,
  enumValues: { requirementStatus: string[] },
): StateObject[] {
  requireArray(issues, requirements, "state.json.requirements");
  const requirementList = Array.isArray(requirements) ? requirements : [];
  const requirementCounts = countJsonRequirementStates(requirementList);
  requirementList.forEach((item, index) => {
    if (!requirePlainObject(issues, item, `state.json.requirements[${index}]`)) {
      return;
    }
    requireNonEmptyStringFields(issues, item, ["id", "summary", "type", "status", "evidence", "blockedReason", "nextStep"], `state.json.requirements[${index}]`);
    requireEnumValue(issues, item.status, enumValues.requirementStatus, `state.json.requirements[${index}].status`);
    requireArray(issues, item.relatedFiles, `state.json.requirements[${index}].relatedFiles`);
  });
  const watchdogObject = isStateObject(watchdog) ? watchdog : {};
  if (hasOpenRequirementCounts(requirementCounts) && watchdogObject.deliveryVerifiability === "verifiable") {
    addError(issues, "state.json.requirements 仍有开放项，但 watchdog.deliveryVerifiability=verifiable");
  }
  return requirementList.filter(isStateObject);
}

export function validateCleanupModel(
  issues: ValidationIssue[],
  cleanup: unknown,
  enumValues: { cleanupStatus: string[] },
): StateObject {
  if (!requirePlainObject(issues, cleanup, "state.json.cleanup")) {
    return {};
  }
  requireEnumValue(issues, cleanup.status, enumValues.cleanupStatus, "state.json.cleanup.status");
  return cleanup;
}
