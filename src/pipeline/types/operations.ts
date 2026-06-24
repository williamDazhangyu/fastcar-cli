// Pipeline operation interfaces — depends on core.ts

import type { AutoIterateMode, RequirementStatus, ValidationStatus, PostChangeStatus, WorkerResultStatus, StopReason, WatchdogAction, WriteGuardIssueReason, LanguageInfo, LanguageCode, ProgressOptions, StateValidationIssue } from "./core";
import type { PipelineFocus, RequirementItem, WorkerRequirementPatch, PipelineBudgets, PipelineStateLike, PickFocusStateLike, DiagnoseStateLike, HypothesisItem, MetricValue, MetricComparisonItem, MetricComparisonResult, StatePersistenceOptions } from "./models";

export type { PipelineFocus, RequirementItem, WorkerRequirementPatch, PipelineBudgets, PipelineStateLike, PickFocusStateLike, DiagnoseStateLike, HypothesisItem, MetricValue, MetricComparisonItem, MetricComparisonResult, StatePersistenceOptions };

export interface ValidationCommandResult {
  command: string;
  status: ValidationStatus;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  durationMs?: number;
  stdoutTail?: string;
  stderrTail?: string;
  summary?: string;
  executable?: string;
  args?: string[];
}

export interface DeterministicValidationCommand {
  command: string;
  executable: string;
  args: string[];
}

export interface ValidationCommandConfig {
  command?: string;
  executable?: string;
  args?: unknown;
  [key: string]: unknown;
}

export interface ValidationHistoryEntry {
  command?: string;
  executable?: string;
  args?: string[];
  iteration?: number;
  phase?: string;
  result?: string;
  status?: string;
  exitCode?: number | null;
  summary?: string;
  [key: string]: unknown;
}

export interface ValidationPerCommandItem {
  command: string;
  executable?: string;
  args?: string[];
  status: string;
  result: string | null;
  exitCode: number | null;
  signal: string;
  error: string;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
}

export interface ValidationResult {
  status: ValidationStatus;
  command: string | null;
  exitCode?: number | null;
  durationMs?: number;
  summary?: string;
  results?: ValidationCommandResult[];
}

export interface EffectiveValidationResult extends ValidationResult {
  status: ValidationStatus;
  command: string | null;
  exitCode?: number | null;
  summary?: string;
}

export interface PipelineValidationOptions {
  timeoutMs?: number;
  logFileName?: string;
}

export interface PipelineFailureInput {
  reason?: string;
  detail?: string;
  command?: string | null;
  exitCode?: number | null;
}

export interface PipelineFailurePersistResult {
  state: PipelineStateLike;
  ok: boolean;
  issues: StateValidationIssue[];
}

export interface IsolatedWorktreeOperationResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export type IsolatedWorktreeApplyResult =
  | {
      ok: true;
      skipped: boolean;
      copiedFiles: string[];
      reversePatch?: string;
    }
  | {
      ok: false;
      skipped: false;
      error: string;
    };

export interface DeliveryGateResult {
  ready: boolean;
  open_requirements: string[];
  blocked_requirements: string[];
  validation_verifiability: string;
  watchdog_verifiability: string;
  delivery_evidence_status: string;
  post_agent_gate: string;
  cleanup_status: string;
  style_consolidation_status: string;
  context_reset_review_status: string;
  skill_capture_status: string;
  blocking_reasons: string[];
}

export interface MergeIterationContext {
  iteration?: number;
  focus?: PipelineFocus | null;
  promptPath?: string;
  resultPath?: string;
  logPath?: string;
  workerLogPath?: string;
  mode?: AutoIterateMode | string;
  stateMode?: {
    mode?: AutoIterateMode | string;
    [key: string]: unknown;
  };
}

export interface MergeIterationResult {
  state: PipelineStateLike;
  issues: string[];
}

export interface MergeRequirementsContext {
  language?: unknown;
  workerStatus?: WorkerResultStatus | string;
}

export interface StatePatchResult {
  state: PipelineStateLike;
  issues: string[];
}

export interface BudgetProgressContext {
  mode?: AutoIterateMode | string;
  stateMode?: {
    mode?: AutoIterateMode | string;
    [key: string]: unknown;
  };
  focus?: PipelineFocus | null;
}

export interface ApplyIterationProjectionInput {
  state: PipelineStateLike;
  report: WorkerIterationResult;
  effectiveValidation: EffectiveValidationResult;
  status: WorkerResultStatus | string;
  ctx: MergeIterationContext;
  text: Record<string, unknown>;
}

export interface WriteGuardIssue {
  reason: WriteGuardIssueReason;
  files: string[];
}

export interface WriteGuardContext {
  mode?: AutoIterateMode | string;
  allowModify?: boolean;
  scope?: string | null;
  allowedInternalWrites?: unknown[];
}

export interface WriteGuardReport {
  files_changed?: unknown[];
}

export interface WriteGuardResult {
  ok: boolean;
  issues: WriteGuardIssue[];
  filesChanged: string[];
}

export interface ShouldStopContext {
  once?: boolean;
  runCyclesCompleted?: number;
  stopOnValidationFailure?: boolean;
}

export interface ShouldStopResult {
  stop: boolean;
  reason: StopReason;
}

export interface PhaseGateContext {
  mode?: string;
}

export interface PhaseGateResult {
  phase: "requirement" | "contract" | "baseline" | "coding" | "validation" | "cleanup" | "delivery";
  canProceed: boolean;
  reason:
    | "plan_once"
    | "open_requirements"
    | "blocked_requirements"
    | "delivery_blocked"
    | "requirements_closed";
  blockingReasons: string[];
}

export interface LoopPolicyOptions {
  mode?: AutoIterateMode | string;
  autopilotRun?: boolean;
  once?: boolean;
  maxSteps?: number | null;
  autopilotMaxIterations?: number | null;
}

export interface LoopPolicyResult {
  mode: AutoIterateMode | string;
  runtimeAutopilot: boolean;
  loopShape: "plan_once" | "autopilot" | "default";
  maxSteps: number;
}

export interface WatchdogContext {
  validation?: ValidationResult | null;
  reconcileStatus?: string;
  allRequirementsPassed?: boolean;
}

export interface WatchdogResult {
  triggered: boolean;
  requiredAction: WatchdogAction;
  reason: "need_decision" | "watchdog_stop" | "validation_failed" | "no_progress_streak" | "state_drift" | "fresh_eyes_required" | "hardening_gap" | "clear";
}

export interface ProgressPayload {
  event?: string;
  iter?: number;
  focus?: PipelineFocus | null;
  timeout_ms?: number | null;
  stream?: string;
  bytes?: number;
  elapsed_ms?: number;
  stage?: string;
  last_activity_ms?: number;
  budget_left?: number | null;
  req_counts?: Record<string, number>;
  req_status?: Record<string, string>;
  last_output?: string;
  exit_code?: number | null;
  duration_ms?: number;
  stdout_bytes?: number;
  stderr_bytes?: number;
  status?: string;
  command?: string | null;
  summary?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface EmittedProgressPayload extends ProgressPayload {
  ts: string;
}

export interface IterationPaths {
  iterationDir: string;
  promptPath: string;
  resultPath: string;
  workerLogPath: string;
  validationLogPath: string;
}

export interface WorkerDecisionRequest {
  question?: string;
  topic?: string;
  background?: string;
  options?: unknown[];
  recommended?: string;
  impact?: string;
  targetField?: string;
}

export interface WorkerIterationResult {
  status: WorkerResultStatus;
  summary: string;
  files_changed: string[];
  requirements: unknown[];
  state_patch: Record<string, unknown>;
  validation: unknown | null;
  risks: string;
  blocked_reason: string;
  decision_request: WorkerDecisionRequest | null;
  trace: {
    rationaleSummary: string;
    decisions: unknown[];
    evidence: unknown[];
  };
  documentation: {
    apiChanges: unknown[];
    architectureNotes: unknown[];
    implementationNotes: unknown[];
    changelogEntries: unknown[];
  };
  raw: unknown;
}

export type ParsedIterationResult =
  | {
      valid: true;
      result: WorkerIterationResult;
      errors: string[];
    }
  | {
      valid: false;
      result: WorkerIterationResult;
      errors: string[];
    }
  | {
      valid: false;
      result: null;
      errors: string[];
    };

export type ValidParsedIterationResult = Extract<ParsedIterationResult, { valid: true }>;

export interface DeliveryDocsOptions {
  state: PipelineStateLike & {
    session?: {
      session?: string;
      [key: string]: unknown;
    };
  };
  stateJsonPath: string;
  sessionDir?: string;
}

export interface DeliveryDocsResult {
  status: "generated";
  path: string;
  files: string[];
  generatedAt: string;
}

export interface BuildIterationPromptContext {
  session: string;
  iteration: number;
  mode: AutoIterateMode | string;
  focus: PipelineFocus;
  resultPath: string;
  lastValidation?: ValidationResult | null;
  writeScope?: unknown;
  scope?: unknown;
  sourceChecklist?: unknown;
  allowModify?: boolean;
  autopilotRun?: boolean;
  language?: LanguageInfo | LanguageCode | string;
}