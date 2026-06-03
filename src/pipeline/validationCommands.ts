import type {
  DeterministicValidationCommand,
  ValidationCommandConfig,
  ValidationHistoryEntry,
} from "./types";
import { asArray } from "./valueUtils";

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

function shellQuote(value: string): string {
  return /[\s"]/u.test(value) ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : value;
}

function hasShellControlSyntax(value: string): boolean {
  return /[&|;<>(){}[\]`$*?#!\n\r]/u.test(value);
}

function splitDeterministicCommand(command: string): string[] | null {
  const source = command.trim();
  if (!source || hasShellControlSyntax(source)) {
    return null;
  }
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/u.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) {
    return null;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens.length > 0 ? tokens : null;
}

function normalizeExecutable(value: string): string | null {
  const executable = value.trim();
  if (!executable || hasShellControlSyntax(executable)) {
    return null;
  }
  return executable;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const args = value.map((item) => typeof item === "string" ? item : null);
  return args.every((item): item is string => item !== null) ? args : null;
}

export function normalizeValidationCommand(item: unknown): DeterministicValidationCommand | null {
  if (typeof item === "string") {
    const tokens = splitDeterministicCommand(item);
    if (!tokens) {
      return null;
    }
    const [executable, ...args] = tokens;
    return {
      command: item,
      executable,
      args,
    };
  }

  if (item && typeof item === "object" && !isValidationHistoryEntry(item)) {
    const config = item as ValidationCommandConfig;
    const executable = typeof config.executable === "string" ? normalizeExecutable(config.executable) : null;
    const args = stringArray(config.args);
    if (executable && args) {
      return {
        command: typeof config.command === "string"
          ? config.command
          : [executable, ...args.map(shellQuote)].join(" "),
        executable,
        args,
      };
    }
    const command = typeof config.command === "string" ? config.command : null;
    return command ? normalizeValidationCommand(command) : null;
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
  return asArray(commands)
    .map(validationCommandText)
    .filter(isNonEmptyString);
}

export function validationConfigDeterministicCommands(commands: unknown): DeterministicValidationCommand[] {
  return asArray(commands)
    .map(normalizeValidationCommand)
    .filter((item): item is DeterministicValidationCommand => Boolean(item));
}

export function validationHistoryEntries(commands: unknown): ValidationHistoryEntry[] {
  return asArray(commands)
    .filter(isValidationHistoryEntry);
}
