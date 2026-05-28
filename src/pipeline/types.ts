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
  | "compat";

export interface FlagInfo {
  stage: FlagStage;
  kind: FlagKind;
  stable: boolean;
  stability?: "not_stable" | "experimental" | "stable";
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
}

export interface ValidationCommandConfig {
  command?: string;
  [key: string]: unknown;
}

export interface ValidationHistoryEntry {
  command?: string;
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

export interface IsolatedWorktreeOptions extends ProgressOptions {
  cleanupIsolatedWorktreeImpl?: (
    projectRoot: string,
    worktreePath: string,
  ) => IsolatedWorktreeOperationResult;
  [key: string]: unknown;
}

export interface IsolatedWorktreeOperationResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface IsolatedWorktreeCreateResult extends IsolatedWorktreeOperationResult {
  worktreePath: string;
}

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

export interface UntrackedWorktreeFile {
  relativePath: string;
  source: string;
  target: string;
}

export type CollectUntrackedWorktreeFilesResult =
  | {
      ok: true;
      files: UntrackedWorktreeFile[];
    }
  | {
      ok: false;
      skipped: false;
      error: string;
    };

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

export interface GitStatusSnapshot {
  ok: boolean;
  files: Map<string, string>;
  error?: string;
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
  budgets?: PipelineBudgets;
  requirements?: unknown[];
  optimization?: {
    status?: string;
    [key: string]: unknown;
  };
  deliveryEvidence?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  watchdog?: Record<string, unknown>;
  postChange?: Record<string, unknown>;
  postAgentValidationGate?: Record<string, unknown>;
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
  [key: string]: unknown;
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
  phase: "contract" | "coding" | "blocked" | "delivery";
  canProceed: boolean;
  reason: "plan_once" | "open_requirements" | "blocked_requirements" | "requirements_closed";
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

export interface PipelineTimeoutOptions {
  stepTimeoutSeconds?: number;
  inactivityTimeoutSeconds?: number;
}

export interface EffectiveTimeouts {
  timeoutMs: number;
  inactivityTimeoutMs: number;
  warnBeforeMs: number;
  graceKillMs: number;
  baseTimeoutMs: number;
  complexityMultiplier: number;
  retryBackoff: number;
  modeMultiplier: number;
}

export interface ProgressStatsContext {
  iteration?: number;
  startedAt?: number;
  mode?: string;
  focus?: PipelineFocus | null;
}

export interface ProgressStats {
  iter?: number;
  elapsed_ms: number;
  total_cycles: number;
  budget_left: number | null;
  total_reqs: number;
  req_counts: Record<string, number>;
  focus: PipelineFocus | null;
  phase?: string;
  watchdog_action?: string;
}

export interface PipelineWorkerOutput {
  event?: string;
  stream?: "stdout" | "stderr" | string;
  chunk?: string;
  reason?: string;
  remainingMs?: number | null;
  idleMs?: number;
}

export interface PipelineWorkerAdapterOptions {
  timeoutWarningPath?: string;
  timeoutMs?: number;
  inactivityTimeoutMs?: number;
  warnBeforeMs?: number;
  graceKillMs?: number;
  timeout?: number;
  commandTemplate?: string;
  promptPath?: string;
  resultPath?: string;
  session?: string;
  iteration?: number;
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
  shell?: boolean;
  commandLabel?: string;
  detached?: boolean;
  killOnTimeout?: boolean;
  agentFile?: string;
  maxStepsPerTurn?: number;
  stopWhenResultValid?: (resultPath?: string) => boolean;
  onOutput?: (output: PipelineWorkerOutput) => void;
  [key: string]: unknown;
}

export interface PipelineWorkerAdapter {
  run(options: PipelineWorkerAdapterOptions): Promise<PipelineWorkerBaseResult>;
  id?: string;
  [key: string]: unknown;
}

export interface PipelineWorkerBaseResult {
  command?: string | null;
  status?: number | null;
  signal?: string | null;
  error?: string | null;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  timeoutReason?: string | null;
  durationMs?: number;
  [key: string]: unknown;
}

export interface AdapterConfig {
  label: string;
  env: string;
  fallbackCommand: string;
  runNative?: (options: PipelineWorkerAdapterOptions) => Promise<PipelineWorkerBaseResult> | PipelineWorkerBaseResult;
}

export interface PipelineWorkerProgressOptions {
  session?: string;
  iteration?: number;
  heartbeatMs?: number;
  projectRoot: string;
  options?: ProgressOptions;
  state?: PipelineStateLike;
  focus?: PipelineFocus | null;
  timeoutPolicy?: EffectiveTimeouts | null;
}

export interface PipelineWorkerRunResult extends PipelineWorkerBaseResult {
  progressDurationMs: number;
  progressHeartbeats: number;
  stdoutBytes: number;
  stderrBytes: number;
  lastActivityMs: number;
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

export interface PipelineRunOptions extends StatePersistenceOptions, PipelineTimeoutOptions {
  projectRoot?: string;
  session: string;
  stateJsonPath: string;
  adapter?: PipelineWorkerAdapter;
  agent?: string;
  scope?: string | null;
  focus?: PipelineFocus | null;
  allowModify?: boolean;
  isolate?: boolean;
  once?: boolean;
  noValidate?: boolean;
  validateCommand?: unknown;
  validationTimeoutSeconds?: number;
  progressIntervalSeconds?: number;
}

export interface PipelineRunResult {
  state: PipelineStateLike;
  reason: string;
}

export interface RouterRunOptions {
  mode?: AutoIterateMode | string;
  session?: string;
  from?: string;
  goal?: string;
  validateCmd?: string;
  scope?: string;
}

export interface RouterPlanOptions extends RouterRunOptions {
  noRunMode?: string;
}

export interface RouterPlan {
  mode: "fallback" | "run";
  commands: string[][];
  userMessage: string;
  requiresUserShell: boolean;
  routeValidation: FlagValidationResult;
}

export interface WorkerCandidate {
  id: string;
  command: string;
  commandCandidates?: string[];
  env: string;
  priority: number;
}

export interface WorkerAvailability {
  id: string;
  command: string;
  env: string;
  available: boolean;
  source: "env" | "path" | "missing";
  reason: string | null;
  priority?: number;
}

export interface EnvCheckEvent {
  event: "env_check";
  cwd: string;
  usable: boolean;
  workers_available: Omit<WorkerAvailability, "priority" | "reason">[];
  workers_unavailable: Omit<WorkerAvailability, "priority">[];
  recommended: string | null;
  issues: string[];
}

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
