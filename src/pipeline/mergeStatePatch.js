// @ts-check

const { appendHypothesesPatch } = require("./mergeHypotheses");
const { normalizeMetrics } = require("./mergeMetrics");

const MAX_NOTES_ITEMS = 200;

const FORBIDDEN_PATCH_KEYS = new Set([
  "budgets",
  "watchdog",
  "postChange",
  "validation",
  "session",
  "mode",
  "schemaVersion",
]);

const ALLOWED_CURRENT_STATE_PATCH_KEYS = new Set([
  "currentTask",
  "recentChanges",
  "keyFiles",
]);

const ALLOWED_DELIVERY_EVIDENCE_PATCH_KEYS = new Set([
  "changes",
  "changedFiles",
  "validationSummary",
  "baselineComparison",
  "cleanupSummary",
  "risks",
  "unfinishedItems",
  "userConfirmation",
  "summary",
  "note",
]);

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
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {unknown} items
 * @param {number} maxItems
 * @returns {unknown[]}
 */
function takeLast(items, maxItems) {
  return normalizeArray(items).slice(-maxItems);
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {unknown} patch
 * @param {string[]} [existingIssues]
 * @returns {import("./types").StatePatchResult}
 */
function applyAllowedPatch(state, patch, existingIssues = []) {
  const next = { ...state };
  const issues = existingIssues;
  for (const [key, value] of Object.entries(toRecord(patch))) {
    if (FORBIDDEN_PATCH_KEYS.has(key)) {
      issues.push(`忽略 Worker 禁止写入字段: ${key}`);
      continue;
    }
    if (key === "currentState" && value && typeof value === "object") {
      /** @type {Record<string, unknown>} */
      const safePatch = {};
      for (const [stateKey, stateValue] of Object.entries(toRecord(value))) {
        if (ALLOWED_CURRENT_STATE_PATCH_KEYS.has(stateKey)) {
          safePatch[stateKey] = stateValue;
        } else {
          issues.push(`忽略 Worker 禁止写入 currentState 字段: ${stateKey}`);
        }
      }
      next.currentState = { ...toRecord(next.currentState), ...safePatch };
      continue;
    }
    if (key === "deliveryEvidence" && value && typeof value === "object") {
      /** @type {Record<string, unknown>} */
      const safePatch = {};
      for (const [deliveryKey, deliveryValue] of Object.entries(toRecord(value))) {
        if (ALLOWED_DELIVERY_EVIDENCE_PATCH_KEYS.has(deliveryKey)) {
          safePatch[deliveryKey] = deliveryValue;
        } else {
          issues.push(`忽略 Worker 禁止写入 deliveryEvidence 字段: ${deliveryKey}`);
        }
      }
      next.deliveryEvidence = { ...toRecord(next.deliveryEvidence), ...safePatch };
      continue;
    }
    if (key === "notes") {
      next.notes = takeLast([
        ...normalizeArray(next.notes),
        ...normalizeArray(value).map((item) => String(item)),
      ], MAX_NOTES_ITEMS);
      continue;
    }
    if (key === "hypotheses") {
      next.diagnose = appendHypothesesPatch(next.diagnose, value);
      continue;
    }
    if (key === "optimizationMetrics" || key === "metrics") {
      next.optimization = {
        ...toRecord(next.optimization),
        pendingMetrics: normalizeMetrics(value),
      };
      continue;
    }
    issues.push(`忽略未列入白名单的 state_patch 字段: ${key}`);
  }
  return { state: next, issues };
}

module.exports = {
  applyAllowedPatch,
};
