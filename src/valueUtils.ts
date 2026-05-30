/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
export function normalizeArray(value: unknown): unknown[] {
  if (!value) {
    return [];
  }
  return (Array.isArray(value) ? value : [value])
    .filter((item) => item !== undefined && item !== null && item !== false && item !== "");
}

/**
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function stringValue(value: unknown, fallback = "unknown"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function nonEmptyString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * @param {string[]} reasons
 * @param {string} reason
 * @returns {void}
 */
export function addReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function statusOf(value: unknown): string {
  const record = asRecord(value);
  return typeof record.status === "string" ? record.status : "";
}
