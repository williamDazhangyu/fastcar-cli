import {
  getLanguageText,
  inferLanguageFromState,
} from "./language";
import { asRecord } from "./valueUtils";
import type {
  PipelineStateLike,
  PipelineFocus,
  ValidationResult,
  WorkerIterationResult,
} from "./types";

export function isSuccessfulWorkerStatus(status: unknown): boolean {
  return status === "completed";
}

function getFocusRequirementId(focus: PipelineFocus | null | undefined): unknown {
  return focus?.req_id || focus?.reqId || null;
}

function belongsToCurrentRequirementReport(
  patch: Record<string, unknown>,
  focus: PipelineFocus | null | undefined,
): boolean {
  const focusRequirementId = getFocusRequirementId(focus);
  return !focusRequirementId || patch.id === focusRequirementId;
}

function canAdvanceImplementedToPassed(
  patch: Record<string, unknown>,
  cliValidation: ValidationResult,
  workerStatus: unknown,
  focus: PipelineFocus | null | undefined,
): boolean {
  return patch.status === "implemented"
    && isSuccessfulWorkerStatus(workerStatus)
    && cliValidation.status === "passed"
    && belongsToCurrentRequirementReport(patch, focus);
}

export function mergeRequirement(
  existing: unknown,
  incoming: unknown,
  cliValidation: ValidationResult,
  language: unknown,
  workerStatus: unknown,
  focus?: PipelineFocus | null,
): Record<string, unknown> {
  const text = getLanguageText(language);
  const next = { ...asRecord(existing) };
  const patch = asRecord(incoming);
  if (patch.summary) {
    next.summary = patch.summary;
  }
  for (const field of ["userVisibleBehavior", "expectedBehavior", "actualBehavior", "acceptanceImpact"]) {
    if (patch[field]) {
      next[field] = patch[field];
    }
  }
  for (const field of ["reproSteps", "dependsOn", "blockedBy"]) {
    if (Array.isArray(patch[field])) {
      next[field] = patch[field];
    }
  }
  if (typeof patch.canStartImmediately === "boolean") {
    next.canStartImmediately = patch.canStartImmediately;
  }
  if (patch.type) {
    next.type = patch.type;
  }
  if (Array.isArray(patch.relatedFiles)) {
    next.relatedFiles = patch.relatedFiles;
  }
  if (patch.nextStep) {
    next.nextStep = patch.nextStep;
  }
  if (patch.blockedReason !== undefined) {
    next.blockedReason = patch.blockedReason || text.none;
  }
  if (patch.evidence) {
    next.evidence = patch.evidence;
  }
  if (patch.status) {
    if (next.status === "passed" && patch.status === "implemented") {
      next.evidence = next.evidence || patch.evidence || text.none;
      return next;
    }
    next.status = canAdvanceImplementedToPassed(patch, cliValidation, workerStatus, focus)
      ? "passed"
      : patch.status === "passed" && (!isSuccessfulWorkerStatus(workerStatus) || cliValidation.status !== "passed")
      ? "implemented"
      : patch.status;
    if (patch.status === "passed" && !isSuccessfulWorkerStatus(workerStatus)) {
      next.evidence = `${next.evidence || text.none}；Worker status ${workerStatus || "unknown"} cannot mark requirement passed`;
      next.nextStep = text.chooseNextFocus;
    }
    if (patch.status === "passed" && cliValidation.status === "failed") {
      next.evidence = `${next.evidence || text.none}；${text.validationFailureDowngrade}`;
      next.nextStep = text.fixAfterValidationFailure;
    }
  }
  return next;
}

export function mergeRequirements(
  state: PipelineStateLike,
  report: WorkerIterationResult,
  cliValidation: ValidationResult,
  focus?: PipelineFocus | null,
): unknown[] {
  const text = getLanguageText(inferLanguageFromState(state));
  const current = Array.isArray(state.requirements) ? state.requirements : [];
  const incoming = Array.isArray(report.requirements) ? report.requirements : [];
  if (incoming.length === 0) {
    return current;
  }

  const byId = new Map<unknown, Record<string, unknown>>(current.map((item) => {
    const record = asRecord(item);
    return [record.id, record];
  }));
  for (const item of incoming) {
    const patch = asRecord(item);
    if (!patch.id) {
      continue;
    }
    const existing = byId.get(patch.id) || {
      id: patch.id,
      summary: patch.summary || patch.id,
      type: patch.type || "功能",
      status: "pending",
      userVisibleBehavior: patch.userVisibleBehavior || patch.summary || patch.id,
      expectedBehavior: patch.expectedBehavior || text.none,
      actualBehavior: patch.actualBehavior || text.none,
      reproSteps: Array.isArray(patch.reproSteps) ? patch.reproSteps : [],
      acceptanceImpact: patch.acceptanceImpact || text.none,
      dependsOn: Array.isArray(patch.dependsOn) ? patch.dependsOn : [],
      blockedBy: Array.isArray(patch.blockedBy) ? patch.blockedBy : [],
      canStartImmediately: typeof patch.canStartImmediately === "boolean" ? patch.canStartImmediately : true,
      relatedFiles: [],
      evidence: text.none,
      blockedReason: text.none,
      nextStep: text.none,
    };
    byId.set(patch.id, mergeRequirement(existing, patch, cliValidation, inferLanguageFromState(state), report.status, focus));
  }
  return Array.from(byId.values());
}
