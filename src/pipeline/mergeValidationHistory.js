// @ts-check

const { isValidationHistoryEntry } = require("./validationCommands");

const MAX_VALIDATION_HISTORY_ITEMS = 200;

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return (Array.isArray(value) ? value : [value])
    .filter((item) => item !== undefined && item !== null && item !== false && item !== "");
}

/**
 * @param {unknown} item
 * @returns {item is { command?: unknown }}
 */
function hasCommand(item) {
  return Boolean(item && typeof item === "object" && !Array.isArray(item));
}

/**
 * @param {unknown} commands
 * @returns {unknown[]}
 */
function normalizeValidationCommandHistory(commands) {
  return normalizeArray(commands).filter((item) => {
    if (typeof item === "string") {
      return item.trim();
    }
    return hasCommand(item) && typeof item.command === "string" && item.command.trim();
  });
}

/**
 * @param {unknown} existing
 * @param {unknown} incoming
 * @returns {unknown[]}
 */
function mergeValidationCommandHistory(existing, incoming) {
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

/**
 * @param {import("./types").ValidationResult} cliValidation
 * @param {unknown} iteration
 * @returns {import("./types").ValidationHistoryEntry[]}
 */
function validationHistoryEntries(cliValidation, iteration) {
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

module.exports = {
  mergeValidationCommandHistory,
  normalizeValidationCommandHistory,
  validationHistoryEntries,
};
