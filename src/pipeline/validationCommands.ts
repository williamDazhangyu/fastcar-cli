import type {
  ValidationCommandConfig,
  ValidationHistoryEntry,
} from "./types";

function normalizeArray(value: unknown): unknown[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function isValidationHistoryEntry(item: unknown): item is ValidationHistoryEntry {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return false;
  }
  const entry = item as Record<string, unknown>;
  return (
    entry.iteration !== undefined ||
    entry.phase !== undefined ||
    entry.result !== undefined ||
    entry.status !== undefined ||
    entry.exitCode !== undefined ||
    entry.summary !== undefined
  );
}

export function validationCommandText(item: unknown): string | null {
  if (typeof item === "string") {
    return item;
  }
  if (item && typeof item === "object" && !isValidationHistoryEntry(item)) {
    const command = (item as ValidationCommandConfig).command;
    return typeof command === "string" ? command : null;
  }
  return null;
}

export function validationHistoryText(item: unknown): string | null {
  if (item && typeof item === "object" && isValidationHistoryEntry(item)) {
    return typeof item.command === "string" ? item.command : null;
  }
  return null;
}

function isNonEmptyString(item: unknown): item is string {
  return typeof item === "string" && Boolean(item.trim());
}

export function validationConfigCommands(commands: unknown): string[] {
  return normalizeArray(commands)
    .map(validationCommandText)
    .filter(isNonEmptyString);
}

export function validationHistoryEntries(commands: unknown): ValidationHistoryEntry[] {
  return normalizeArray(commands)
    .filter(isValidationHistoryEntry);
}
