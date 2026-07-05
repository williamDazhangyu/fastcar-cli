// State/data model interfaces — depends on core.ts

import type { AutoIterateMode, RequirementStatus, LanguageInfo, LanguageCode, ProgressOptions, StateValidationIssue } from "./core";

export type { AutoIterateMode, RequirementStatus, LanguageInfo, LanguageCode, ProgressOptions, StateValidationIssue };

export interface PipelineFocus {
  type?: string;
  req_id?: string | null;
  reqId?: string | null;
  summary?: string;
  raw?: string;
}

export interface RequirementItem {
  id: string;
  summary?: string;
  userVisibleBehavior?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  reproSteps?: string[];
  acceptanceImpact?: string;
  type?: string;
  status?: RequirementStatus;
  dependsOn?: string[];
  blockedBy?: string[];
  canStartImmediately?: boolean;
  relatedFiles?: string[];
  evidence?: string;
  blockedReason?: string;
  nextStep?: string;
  [key: string]: unknown;
}

export interface WorkerRequirementPatch {
  id?: string;
  summary?: string;
  userVisibleBehavior?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  reproSteps?: string[];
  acceptanceImpact?: string;
  type?: string;
  status?: RequirementStatus;
  dependsOn?: string[];
  blockedBy?: string[];
  canStartImmediately?: boolean;
  relatedFiles?: string[];
  evidence?: string;
  blockedReason?: string;
  nextStep?: string;
  [key: string]: unknown;
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

export interface PickFocusStateLike extends PipelineStateLike {
  baseline?: Record<string, unknown>;
  currentState?: Record<string, unknown>;
  diagnose?: Record<string, unknown>;
  phaseGate?: Record<string, unknown>;
  postChange?: Record<string, unknown>;
}

export interface DiagnoseStateLike {
  hypotheses?: unknown;
  hypothesisQueue?: unknown;
  [key: string]: unknown;
}

export interface HypothesisItem {
  id: string;
  summary: string;
  priority: number;
  status: string;
  evidence: unknown;
  [key: string]: unknown;
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

export interface StatePersistenceOptions extends ProgressOptions {
  validateStateModel?: (
    state: PipelineStateLike,
    context: { session?: string },
  ) => StateValidationIssue[];
  [key: string]: unknown;
}
