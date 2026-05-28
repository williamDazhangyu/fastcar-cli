// @ts-check

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * @param {unknown} item
 * @returns {item is import("./types").ValidationHistoryEntry}
 */
function isValidationHistoryEntry(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return false;
  }
  const entry = /** @type {Record<string, unknown>} */ (item);
  return (
    entry.iteration !== undefined ||
    entry.phase !== undefined ||
    entry.result !== undefined ||
    entry.status !== undefined ||
    entry.exitCode !== undefined ||
    entry.summary !== undefined
  );
}

/**
 * @param {unknown} item
 * @returns {string | null}
 */
function validationCommandText(item) {
  if (typeof item === "string") {
    return item;
  }
  if (item && typeof item === "object" && !isValidationHistoryEntry(item)) {
    const command = /** @type {import("./types").ValidationCommandConfig} */ (item).command;
    return typeof command === "string" ? command : null;
  }
  return null;
}

/**
 * @param {unknown} item
 * @returns {string | null}
 */
function validationHistoryText(item) {
  if (item && typeof item === "object" && isValidationHistoryEntry(item)) {
    return typeof item.command === "string" ? item.command : null;
  }
  return null;
}

/**
 * @param {unknown} item
 * @returns {item is string}
 */
function isNonEmptyString(item) {
  return typeof item === "string" && Boolean(item.trim());
}

/**
 * @param {unknown} commands
 * @returns {string[]}
 */
function validationConfigCommands(commands) {
  return normalizeArray(commands)
    .map(validationCommandText)
    .filter(isNonEmptyString);
}

/**
 * @param {unknown} commands
 * @returns {import("./types").ValidationHistoryEntry[]}
 */
function validationHistoryEntries(commands) {
  return normalizeArray(commands)
    .filter(isValidationHistoryEntry);
}

module.exports = {
  isValidationHistoryEntry,
  validationCommandText,
  validationConfigCommands,
  validationHistoryEntries,
  validationHistoryText,
};
