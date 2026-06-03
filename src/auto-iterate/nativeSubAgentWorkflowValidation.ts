import { promises as fsPromises } from "fs";
import path from "path";
import { pathExists } from "../fsUtils";
import { toRelative } from "./sessionPaths";
import { readJsonFileWithError } from "./stateIO";

type ValidationIssue = {
  severity: "error" | "warning";
  message: string;
};

type StateObject = Record<string, unknown>;

type NativeWorkflowArtifactName = "result.json" | "validation.json" | "decision.json";

const NATIVE_WORKFLOW_ARTIFACTS: NativeWorkflowArtifactName[] = [
  "result.json",
  "validation.json",
  "decision.json",
];

const VALID_RESULT_STATUSES = new Set([
  "completed",
  "failed",
  "blocked",
  "need_decision",
  "no_progress",
]);

const VALID_DECISION_ACTIONS = new Set([
  "continue",
  "delivery_ready",
  "budget_exhausted",
  "need_decision",
  "watchdog",
  "reject",
]);

const SUCCESS_ACTIONS = new Set(["continue", "delivery_ready"]);

interface NativeWorkflowIterationArtifacts {
  iteration: string;
  dir: string;
  resultPath: string;
  validationPath: string;
  decisionPath: string;
  present: Set<NativeWorkflowArtifactName>;
}

export interface NativeSubAgentWorkflowValidationResult {
  issues: ValidationIssue[];
}

function addIssue(
  issues: ValidationIssue[],
  severity: ValidationIssue["severity"],
  message: string,
): void {
  issues.push({ severity, message });
}

function isObject(value: unknown): value is StateObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function readJsonArtifact(filePath: string): Promise<{
  data: StateObject | null;
  errorMessage: string | null;
}> {
  const result = await readJsonFileWithError(filePath);
  if (isObject(result.data)) {
    return { data: result.data, errorMessage: null };
  }
  const error = result.error instanceof Error
    ? result.error.message
    : result.error
      ? String(result.error)
      : "JSON root is not an object";
  return { data: null, errorMessage: error };
}

async function listNativeWorkflowIterations(sessionDir: string): Promise<NativeWorkflowIterationArtifacts[]> {
  const iterationsDir = path.join(sessionDir, "iterations");
  if (!(await pathExists(iterationsDir))) {
    return [];
  }

  const entries = await fsPromises.readdir(iterationsDir, { withFileTypes: true });
  const iterations: NativeWorkflowIterationArtifacts[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = path.join(iterationsDir, entry.name);
    const present = new Set<NativeWorkflowArtifactName>();
    const resultPath = path.join(dir, "result.json");
    const validationPath = path.join(dir, "validation.json");
    const decisionPath = path.join(dir, "decision.json");
    for (const artifact of NATIVE_WORKFLOW_ARTIFACTS) {
      if (await pathExists(path.join(dir, artifact))) {
        present.add(artifact);
      }
    }
    if (present.size > 0) {
      iterations.push({
        iteration: entry.name,
        dir,
        resultPath,
        validationPath,
        decisionPath,
        present,
      });
    }
  }
  return iterations;
}

function validateResultJson(
  issues: ValidationIssue[],
  iteration: NativeWorkflowIterationArtifacts,
  result: StateObject | null,
  errorMessage: string | null,
): void {
  const label = toRelative(iteration.resultPath);
  if (!result) {
    addIssue(issues, "error", `严格工作流 ${label} 非法: ${errorMessage || "无法解析 JSON"}`);
    return;
  }

  const status = String(result.status || "");
  if (!VALID_RESULT_STATUSES.has(status)) {
    addIssue(issues, "error", `严格工作流 ${label} status=${status || "missing"} 非法`);
  }

  if (!Array.isArray(result.files_changed)) {
    addIssue(issues, "error", `严格工作流 ${label} files_changed 必须是字符串数组`);
  } else if (result.files_changed.some((item) => typeof item !== "string" || path.isAbsolute(item) || item.includes(".."))) {
    addIssue(issues, "error", `严格工作流 ${label} files_changed 包含绝对路径或 ..`);
  }

  if (!Array.isArray(result.requirements)) {
    addIssue(issues, "error", `严格工作流 ${label} requirements 必须是数组`);
    return;
  }

  for (const [index, requirement] of result.requirements.entries()) {
    if (!isObject(requirement) || !requirement.id || !requirement.status) {
      addIssue(issues, "error", `严格工作流 ${label} requirements[${index}] 缺少 id 或 status`);
    }
  }
}

function validationPassed(validation: StateObject | null): boolean | null {
  if (!validation) {
    return null;
  }
  if (typeof validation.passed === "boolean") {
    return validation.passed;
  }
  const commands = Array.isArray(validation.commands) ? validation.commands : [];
  if (commands.length === 0) {
    return null;
  }
  return commands.every((command) => isObject(command) && command.passed === true);
}

function validateValidationJson(
  issues: ValidationIssue[],
  iteration: NativeWorkflowIterationArtifacts,
  validation: StateObject | null,
  errorMessage: string | null,
): void {
  const label = toRelative(iteration.validationPath);
  if (!validation) {
    addIssue(issues, "error", `严格工作流 ${label} 非法: ${errorMessage || "无法解析 JSON"}`);
    return;
  }

  const commands = Array.isArray(validation.commands) ? validation.commands : [];
  if (commands.length === 0 && typeof validation.passed !== "boolean") {
    addIssue(issues, "warning", `严格工作流 ${label} 缺少 commands 或 passed 证据`);
  }
  for (const [index, command] of commands.entries()) {
    if (!isObject(command) || !command.command || typeof command.passed !== "boolean") {
      addIssue(issues, "error", `严格工作流 ${label} commands[${index}] 缺少 command 或 passed`);
    }
  }
}

function writeAuditViolations(decision: StateObject | null): unknown[] {
  const writeAudit = isObject(decision?.write_audit) ? decision.write_audit : null;
  return Array.isArray(writeAudit?.violations) ? writeAudit.violations : [];
}

function isSchemaInvalidReject(decision: StateObject | null): boolean {
  return Boolean(decision &&
    decision.action === "reject" &&
    decision.reason === "schema_invalid" &&
    decision.state_written === false);
}

function validateDecisionJson(
  issues: ValidationIssue[],
  iteration: NativeWorkflowIterationArtifacts,
  result: StateObject | null,
  decision: StateObject | null,
  errorMessage: string | null,
  validation: StateObject | null,
): void {
  const label = toRelative(iteration.decisionPath);
  if (!decision) {
    addIssue(issues, "error", `严格工作流 ${label} 非法: ${errorMessage || "无法解析 JSON"}`);
    return;
  }

  const action = String(decision.action || "");
  if (!VALID_DECISION_ACTIONS.has(action)) {
    addIssue(issues, "error", `严格工作流 ${label} action=${action || "missing"} 非法`);
    return;
  }

  if (result?.status === "need_decision" && action !== "need_decision") {
    addIssue(issues, "error", `严格工作流 ${label} result.status=need_decision 时 action 必须是 need_decision`);
  }

  if (SUCCESS_ACTIONS.has(action) && !iteration.present.has("validation.json")) {
    addIssue(issues, "error", `严格工作流 ${label} action=${action} 但缺少 validation.json`);
  }

  const passed = validationPassed(validation);
  if (action === "delivery_ready" && passed !== true) {
    addIssue(issues, "error", `严格工作流 ${label} delivery_ready 必须有通过的 validation.json 证据`);
  }

  if (action === "delivery_ready" && decision.state_written !== true) {
    addIssue(issues, "error", `严格工作流 ${label} delivery_ready 必须 state_written=true`);
  }

  const violations = writeAuditViolations(decision);
  if (violations.length > 0 && action !== "reject") {
    addIssue(issues, "error", `严格工作流 ${label} 存在 write_audit.violations 但 action=${action}`);
  } else if (violations.length > 0 && decision.reason !== "scope_violation") {
    addIssue(issues, "error", `严格工作流 ${label} 存在 write_audit.violations 但 reason=${String(decision.reason || "missing")}`);
  } else if (violations.length > 0 && decision.state_written !== false) {
    addIssue(issues, "error", `严格工作流 ${label} scope_violation 必须 state_written=false`);
  }
}

async function validateNativeWorkflowIteration(
  issues: ValidationIssue[],
  iteration: NativeWorkflowIterationArtifacts,
): Promise<void> {
  const hasStrictOrchestratorArtifacts = iteration.present.has("validation.json") ||
    iteration.present.has("decision.json");
  if (!iteration.present.has("result.json")) {
    addIssue(issues, "error", `严格工作流 ${toRelative(iteration.dir)} 缺少 result.json，不能进入 orchestrator 成功路径`);
    return;
  }

  const resultRead = await readJsonArtifact(iteration.resultPath);
  if (!hasStrictOrchestratorArtifacts && !isNativeStrictResult(resultRead.data)) {
    return;
  }

  let validation: StateObject | null = null;
  let decision: StateObject | null = null;
  let decisionErrorMessage: string | null = null;
  if (iteration.present.has("decision.json")) {
    const decisionRead = await readJsonArtifact(iteration.decisionPath);
    decision = decisionRead.data;
    decisionErrorMessage = decisionRead.errorMessage;
  }

  // A schema_invalid reject is the expected orchestrator outcome for an invalid
  // coder result; the consistency check should validate the reject decision
  // instead of failing again on the known-bad result payload.
  if (!isSchemaInvalidReject(decision)) {
    validateResultJson(issues, iteration, resultRead.data, resultRead.errorMessage);
  }

  if (iteration.present.has("validation.json")) {
    const validationRead = await readJsonArtifact(iteration.validationPath);
    validation = validationRead.data;
    validateValidationJson(issues, iteration, validationRead.data, validationRead.errorMessage);
  } else if (!iteration.present.has("decision.json")) {
    addIssue(issues, "warning", `严格工作流 ${toRelative(iteration.dir)} 有 result.json 但缺少 decision.json；恢复时必须先派发 orchestrator`);
  } else if (!isSchemaInvalidReject(decision)) {
    addIssue(issues, "error", `严格工作流 ${toRelative(iteration.dir)} 有 decision.json 但缺少 validation.json`);
  }

  if (iteration.present.has("decision.json")) {
    validateDecisionJson(
      issues,
      iteration,
      resultRead.data,
      decision,
      decisionErrorMessage,
      validation,
    );
  } else if (iteration.present.has("validation.json")) {
    addIssue(issues, "warning", `严格工作流 ${toRelative(iteration.dir)} 有 validation.json 但缺少 decision.json；不得进入下一轮`);
  }
}

function isNativeStrictResult(result: StateObject | null): boolean {
  if (!result) {
    return false;
  }
  const workflow = String(
    result.workflow ||
    result.workflowMode ||
    result.workflow_mode ||
    result.mode ||
    "",
  );
  return result.nativeStrictWorkflow === true ||
    result.llmNativeStrictWorkflow === true ||
    /llm[_-]?native[_-]?strict|native[_-]?sub[_-]?agent[_-]?strict/i.test(workflow);
}

export async function validateNativeSubAgentWorkflowArtifacts(
  stateJsonPath: string,
): Promise<NativeSubAgentWorkflowValidationResult> {
  const sessionDir = path.dirname(stateJsonPath);
  const iterations = await listNativeWorkflowIterations(sessionDir);
  const issues: ValidationIssue[] = [];

  for (const iteration of iterations) {
    await validateNativeWorkflowIteration(issues, iteration);
  }

  return { issues };
}
