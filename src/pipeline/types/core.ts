// Core enums and base types — zero dependencies on other type modules.

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

export type PostChangeStatus =
  | "passed"
  | "failed"
  | "skipped_with_reason"
  | "not_available"
  | "not_run";

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

export type WatchdogAction = "ask_user" | "stop" | "continue";

export type WriteGuardIssueReason =
  | "invalid_path"
  | "mode_write_forbidden"
  | "scope_violation"
  | "agent_state_write_forbidden";

export type LanguageCode = "zh" | "en";

export type FlagStage =
  | "documented"
  | "parsed"
  | "implemented"
  | "routable"
  | "stable";

export type FlagKind =
  | "legacy"
  | "mode"
  | "input"
  | "session"
  | "compat"
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

export interface ProgressOptions {
  jsonProgress?: boolean;
}

export interface StateValidationIssue {
  severity: "error" | "warning" | string;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export interface PipelineMarkdownIssue {
  severity: "warning";
  code: string;
  message: string;
  [key: string]: unknown;
}