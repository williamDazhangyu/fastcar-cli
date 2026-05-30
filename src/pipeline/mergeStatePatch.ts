import { appendHypothesesPatch } from "./mergeHypotheses";
import { normalizeMetrics } from "./mergeMetrics";
import type {
  PipelineStateLike,
  StatePatchResult,
} from "./types";
import { asRecord, normalizeArray } from "./valueUtils";


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
 * @param {unknown} items
 * @param {number} maxItems
 * @returns {unknown[]}
 */
function takeLast(items: unknown, maxItems: number): unknown[] {
  return normalizeArray(items).slice(-maxItems);
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {unknown} patch
 * @param {string[]} [existingIssues]
 * @returns {import("./types").StatePatchResult}
 */
export function applyAllowedPatch(
  state: PipelineStateLike,
  patch: unknown,
  existingIssues: string[] = [],
): StatePatchResult {
  const next = { ...state };
  const issues = existingIssues;
  for (const [key, value] of Object.entries(asRecord(patch))) {
    if (FORBIDDEN_PATCH_KEYS.has(key)) {
      issues.push(`忽略 Worker 禁止写入字段: ${key}`);
      continue;
    }
    if (key === "currentState" && value && typeof value === "object") {
      const safePatch: Record<string, unknown> = {};
      for (const [stateKey, stateValue] of Object.entries(asRecord(value))) {
        if (ALLOWED_CURRENT_STATE_PATCH_KEYS.has(stateKey)) {
          safePatch[stateKey] = stateValue;
        } else {
          issues.push(`忽略 Worker 禁止写入 currentState 字段: ${stateKey}`);
        }
      }
      next.currentState = { ...asRecord(next.currentState), ...safePatch };
      continue;
    }
    if (key === "deliveryEvidence" && value && typeof value === "object") {
      const safePatch: Record<string, unknown> = {};
      for (const [deliveryKey, deliveryValue] of Object.entries(asRecord(value))) {
        if (ALLOWED_DELIVERY_EVIDENCE_PATCH_KEYS.has(deliveryKey)) {
          safePatch[deliveryKey] = deliveryValue;
        } else {
          issues.push(`忽略 Worker 禁止写入 deliveryEvidence 字段: ${deliveryKey}`);
        }
      }
      next.deliveryEvidence = { ...asRecord(next.deliveryEvidence), ...safePatch };
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
        ...asRecord(next.optimization),
        pendingMetrics: normalizeMetrics(value),
      };
      continue;
    }
    issues.push(`忽略未列入白名单的 state_patch 字段: ${key}`);
  }
  return { state: next, issues };
}

