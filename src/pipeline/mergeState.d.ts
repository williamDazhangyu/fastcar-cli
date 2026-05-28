import type {
  MergeIterationContext,
  MergeIterationResult,
  PipelineStateLike,
  ValidationHistoryEntry,
  ValidationResult,
  WorkerIterationResult,
} from "./types";

export function mergeIterationIntoState(
  state: PipelineStateLike,
  report: WorkerIterationResult,
  cliValidation: ValidationResult,
  ctx?: MergeIterationContext,
): MergeIterationResult;

export function mergeValidationCommandHistory(
  existing: unknown,
  incoming: unknown,
): Array<string | ValidationHistoryEntry | unknown>;
