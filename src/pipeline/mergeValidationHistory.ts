import { isValidationHistoryEntry } from "./validationCommands";
import type {
  ValidationHistoryEntry,
  ValidationResult,
} from "./types";

const MAX_VALIDATION_HISTORY_ITEMS = 200;

function normalizeArray(value: unknown): unknown[] {
  if (!value) {
    return [];
  }
  return (Array.isArray(value) ? value : [value])
    .filter((item) => item !== undefined && item !== null && item !== false && item !== "");
}

function hasCommand(item: unknown): item is { command?: unknown } {
  return Boolean(item && typeof item === "object" && !Array.isArray(item));
}

export function normalizeValidationCommandHistory(commands: unknown): unknown[] {
  return normalizeArray(commands).filter((item) => {
    if (typeof item === "string") {
      return item.trim();
    }
    return hasCommand(item) && typeof item.command === "string" && item.command.trim();
  });
}

export function mergeValidationCommandHistory(
  existing: unknown,
  incoming: unknown,
): unknown[] {
  const normalizedExisting = normalizeValidationCommandHistory(existing);
  const configCommands = normalizedExisting.filter((item) => !isValidationHistoryEntry(item));
  const historicalEntries = normalizedExisting.filter(isValidationHistoryEntry);
  return [
    ...configCommands,
    ...normalizeArray([
      ...historicalEntries,
      ...normalizeArray(incoming),
    ]).slice(-MAX_VALIDATION_HISTORY_ITEMS),
  ];
}

export function validationHistoryEntries(
  cliValidation: ValidationResult,
  iteration: unknown,
): ValidationHistoryEntry[] {
  if (Array.isArray(cliValidation.results) && cliValidation.results.length > 0) {
    return cliValidation.results.map((item) => ({
      command: item.command || "not_run",
      result: item.status || "not_run",
      summary: [item.stdoutTail, item.stderrTail].filter(Boolean).join("\n"),
      exitCode: item.exitCode === undefined ? null : item.exitCode,
      iteration: Number.isInteger(iteration) ? Number(iteration) : undefined,
    }));
  }
  return cliValidation.command
    ? [{
        command: cliValidation.command,
        result: cliValidation.status,
        summary: cliValidation.summary || "",
        exitCode: cliValidation.exitCode,
        iteration: Number.isInteger(iteration) ? Number(iteration) : undefined,
      }]
    : [];
}
