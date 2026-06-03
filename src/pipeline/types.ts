export type AutoIterateMode =
  | "strict"
  | "quick"
  | "diagnose"
  | "verify"
  | "plan"
  | "optimize"
  | "prototype";

export type WorkerResultStatus =
  | "completed"
  | "failed"
  | "blocked"
  | "need_decision"
  | "no_progress";

export type RequirementStatus =
  | "pending"
  | "implemented"
  | "passed"
  | "blocked"
  | "not_verified";

export type ValidationStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "not_available"
  | "not_run";

export type FlagStage =
  | "documented"
  | "parsed"
  | "implemented"
  | "routable"
  | "stable";

export type FlagKind =
  | "pipeline"
  | "legacy"
  | "mode"
  | "input"
  | "session"
  | "compat"
  | "dispatch"
  | "skill"
  | "other";

export interface FlagInfo {
  stage: FlagStage;
  kind: FlagKind;
  stable: boolean;
  stability?: "not_stable" | "experimental" | "stable";
  help?: string;
  aliases?: string[];
}

export interface FlagIssue {
  flag: string;
  reason: string;
}

export interface FlagValidationResult {
  ok: boolean;
  issues: FlagIssue[];
}

export interface PipelineFocus {
  type?: string;
  req_id?: string | null;
  reqId?: string | null;
  summary?: string;
  raw?: string;
}

export interface PickFocusStateLike extends PipelineStateLike {
  baseline?: Record<string, unknown>;
  currentState?: Record<string, unknown>;
  diagnose?: Record<string, unknown>;
  phaseGate?: Record<string, unknown>;
  postChange?: Record<string, unknown>;
}

export interface RequirementItem {
  id: string;
  summary?: string;
  type?: string;
  status?: RequirementStatus;
  relatedFiles?: string[];
  evidence?: string;
  blockedReason?: string;
  nextStep?: string;
}

export interface WorkerRequirementPatch {
  id?: string;
  summary?: string;
  type?: string;
  status?: RequirementStatus;
  relatedFiles?: string[];
  evidence?: string;
  blockedReason?: string;
  nextStep?: string;
  [key: string]: unknown;
}

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

export type PostChangeStatus =
  | "passed"
  | "failed"
  | "skipped_with_reason"
  | "not_available"
  | "not_run";

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

export interface PipelineValidationOptions {
  timeoutMs?: number;
  logFileName?: string;
}

export interface PipelineMarkdownIssue {
  severity: "warning";
  code: string;
  message: string;
  [key: string]: unknown;
}

export interface StateValidationIssue {
  severity: "error" | "warning" | string;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export interface StatePersistenceOptions extends ProgressOptions {
  validateStateModel?: (
    state: PipelineStateLike,
    context: { session?: string },
  ) => StateValidationIssue[];
  [key: string]: unknown;
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

export interface MergeIterationResult {
  state: PipelineStateLike;
  issues: string[];
}

export interface MetricValue {
  name: string;
  value: unknown;
  unit: string;
  direction: string;
  source: string;
}

export interface MetricComparisonItem {
  name: string;
  baseline: unknown;
  post: unknown;
  unit: string;
  direction: string;
  status: "not_comparable" | "unchanged" | "improved" | "regression";
}

export interface MetricComparisonResult {
  status: "regression" | "improved" | "unchanged" | "unknown";
  comparisons: MetricComparisonItem[];
}

export interface HypothesisItem {
  id: string;
  summary: string;
  priority: number;
  status: string;
  evidence: unknown;
  [key: string]: unknown;
}

export interface DiagnoseStateLike {
  hypotheses?: unknown;
  hypothesisQueue?: unknown;
  [key: string]: unknown;
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

export interface EffectiveValidationResult extends ValidationResult {
  status: ValidationStatus;
  command: string | null;
  exitCode?: number | null;
  summary?: string;
}

export interface ApplyIterationProjectionInput {
  state: PipelineStateLike;
  report: WorkerIterationResult;
  effectiveValidation: EffectiveValidationResult;
  status: WorkerResultStatus | string;
  ctx: MergeIterationContext;
  text: Record<string, unknown>;
}

export type WriteGuardIssueReason =
  | "invalid_path"
  | "mode_write_forbidden"
  | "scope_violation"
  | "agent_state_write_forbidden";

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

export interface PipelineBudgets {
  remainingOptimizationIterations?: number;
  remainingImplementationIterations?: number;
  remainingValidationHardeningIterations?: number;
  autopilotMaxIterations?: number;
  implementationIterationsUsed?: number;
  validationHardeningIterationsUsed?: number;
  minimumValidationHardeningIterations?: number;
  totalCycles?: number;
}

export interface PipelineStateLike {
  updatedAt?: string;
  session?: Record<string, unknown>;
  task?: Record<string, unknown>;
  language?: Record<string, unknown>;
  sourceChecklist?: Record<string, unknown>;
  budgets?: PipelineBudgets;
  requirements?: unknown[];
  baseline?: Record<string, unknown>;
  optimization?: {
    status?: string;
    [key: string]: unknown;
  };
  traceability?: Record<string, unknown>;
  documentation?: Record<string, unknown>;
  notes?: unknown[];
  deliveryEvidence?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  watchdog?: Record<string, unknown>;
  postChange?: Record<string, unknown>;
  postAgentValidationGate?: Record<string, unknown>;
  decisionRequest?: Record<string, unknown>;
  implementationContract?: Record<string, unknown>;
  phaseGate?: Record<string, unknown>;
  isolate?: Record<string, unknown>;
  cleanup?: Record<string, unknown>;
  currentState?: Record<string, unknown>;
  deltaAssessment?: Record<string, unknown>;
  iterationPolicy?: Record<string, unknown>;
  diagnose?: Record<string, unknown>;
  styleConsolidation?: Record<string, unknown>;
  contextResetReview?: Record<string, unknown>;
  skillCapture?: Record<string, unknown>;
  mode?: {
    mode?: AutoIterateMode | string;
    [key: string]: unknown;
  };
}

export interface ShouldStopContext {
  once?: boolean;
  runCyclesCompleted?: number;
  stopOnValidationFailure?: boolean;
}

export type StopReason =
  | "need_decision"
  | "watchdog_stop"
  | "no_progress_streak"
  | "once_completed"
  | "plan_once_completed"
  | "requirements_blocked"
  | "delivery_ready"
  | "budget_exhausted"
  | "validation_failed"
  | "continue";

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

export type WatchdogAction = "ask_user" | "stop" | "continue";

export interface WatchdogContext {
  validation?: ValidationResult | null;
}

export interface WatchdogResult {
  triggered: boolean;
  requiredAction: WatchdogAction;
  reason: "need_decision" | "watchdog_stop" | "validation_failed" | "no_progress_streak" | "clear";
}

export interface ProgressOptions {
  jsonProgress?: boolean;
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

export type LanguageCode = "zh" | "en";

export interface LanguageInfo {
  code: LanguageCode;
  source: "text" | "default" | "state" | string;
  confidence: "high" | "medium" | "low" | string;
}

export interface LanguageAnswersLike {
  goal?: unknown;
  sourceChecklist?: unknown;
  successCriteria?: unknown;
  nonGoals?: unknown;
  allowedScope?: unknown;
  compatibility?: unknown;
  constraints?: unknown;
  deliveryFormat?: unknown;
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
