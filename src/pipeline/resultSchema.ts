import type {
  ParsedIterationResult,
  RequirementStatus,
  WorkerDecisionRequest,
  WorkerIterationResult,
  WorkerResultStatus,
} from "./types";
import { normalizeArrayLoose as normalizeArray } from "./valueUtils";

const VALID_STATUSES: ReadonlySet<WorkerResultStatus> = new Set(["completed", "failed", "blocked", "need_decision", "no_progress"]);
const VALID_REQUIREMENT_STATUSES: ReadonlySet<RequirementStatus> = new Set(["pending", "implemented", "passed", "blocked", "not_verified"]);
const MAX_TEXT_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 30;
const MAX_OBJECT_KEYS = 50;
const MAX_SANITIZE_DEPTH = 8;
const SENSITIVE_PATTERNS = [
  {
    pattern: /\b(authorization)\s*[:=]\s*["']?(?:bearer|basic)?\s*[^"'\s,;]+/gi,
    replacement: "$1=[REDACTED]",
  },
  {
    pattern: /\b(api[-_]?key|token|password|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi,
    replacement: "$1=[REDACTED]",
  },
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]",
  },
];

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeRelativePath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return null;
  }
  const parts = normalized.split("/");
  if (parts.includes("..")) {
    return null;
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  let text = String(value).replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
  for (const item of SENSITIVE_PATTERNS) {
    text = text.replace(item.pattern, item.replacement);
  }
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 3).trim()}...` : text;
}

/**
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_SANITIZE_DEPTH) {
    return "[TRUNCATED_DEPTH]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      result[key] = sanitizeValue(item, depth + 1);
    }
    return result;
  }
  return typeof value === "string" ? sanitizeText(value) : value;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown}
 */
function getObjectValue(value: unknown, key: string): unknown {
  return normalizeObject(value)[key];
}

/**
 * @param {unknown} value
 * @returns {value is import("./types").RequirementStatus}
 */
function isRequirementStatus(value: unknown): value is RequirementStatus {
  return typeof value === "string" && VALID_REQUIREMENT_STATUSES.has(value as RequirementStatus);
}

/**
 * @param {unknown} value
 * @returns {value is import("./types").WorkerResultStatus}
 */
function isWorkerResultStatus(value: unknown): value is WorkerResultStatus {
  return typeof value === "string" && VALID_STATUSES.has(value as WorkerResultStatus);
}

/**
 * @param {unknown} value
 * @returns {import("./types").WorkerIterationResult["trace"]}
 */
function normalizeTrace(value: unknown): WorkerIterationResult["trace"] {
  const trace = normalizeObject(value);
  return {
    rationaleSummary: sanitizeText(trace.rationaleSummary || trace.reasoningSummary || trace.summary || ""),
    decisions: normalizeArray(trace.decisions).slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item)),
    evidence: normalizeArray(trace.evidence).slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item)),
  };
}

/**
 * @param {unknown} value
 * @returns {import("./types").WorkerIterationResult["documentation"]}
 */
function normalizeDocumentation(value: unknown): WorkerIterationResult["documentation"] {
  const documentation = normalizeObject(value);
  return {
    apiChanges: normalizeArray(documentation.apiChanges || documentation.api_changes).slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item)),
    architectureNotes: normalizeArray(documentation.architectureNotes || documentation.architecture_notes).slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item)),
    implementationNotes: normalizeArray(documentation.implementationNotes || documentation.implementation_notes).slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item)),
    changelogEntries: normalizeArray(documentation.changelogEntries || documentation.changelog_entries).slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item)),
  };
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
function normalizeRequirements(value: unknown): unknown[] {
  return normalizeArray(value)
    .slice(0, MAX_ARRAY_LENGTH)
    .map((item) => sanitizeValue(item));
}

/**
 * @param {unknown} value
 * @param {string[]} errors
 * @returns {void}
 */
function validateRequirements(value: unknown, errors: string[]): void {
  normalizeArray(value).slice(0, MAX_ARRAY_LENGTH).forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`requirements[${index}] 必须是对象`);
      return;
    }
    const status = getObjectValue(item, "status");
    if (status !== undefined && !isRequirementStatus(status)) {
      errors.push(`requirements[${index}].status 必须是 pending / implemented / passed / blocked / not_verified`);
    }
  });
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function normalizeStatePatch(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? normalizeObject(sanitizeValue(value))
    : {};
}

/**
 * @param {unknown} value
 * @returns {import("./types").WorkerDecisionRequest | null}
 */
function normalizeDecisionRequest(value: unknown): WorkerDecisionRequest | null {
  const request = sanitizeValue(value);
  return request && typeof request === "object" && !Array.isArray(request)
    ? normalizeObject(request)
    : null;
}

/**
 * @param {Record<string, unknown>} result
 * @returns {unknown}
 */
function normalizeRaw(result: Record<string, unknown>): WorkerIterationResult["raw"] {
  const focus = result.focus && typeof result.focus === "object" && !Array.isArray(result.focus)
    ? normalizeObject(result.focus)
    : null;
  return {
    focus: focus ? {
      raw: sanitizeText(focus.raw || ""),
      type: focus.type === undefined || focus.type === null ? null : String(focus.type),
      req_id: focus.req_id === undefined || focus.req_id === null ? null : String(focus.req_id),
      reqId: focus.reqId === undefined || focus.reqId === null ? null : String(focus.reqId),
    } : sanitizeValue(result.focus),
  };
}

/**
 * @param {unknown} raw
 * @returns {import("./types").ParsedIterationResult}
 */
export function parseAndValidateIterationResult(raw: unknown): ParsedIterationResult {
  const errors: string[] = [];
  let result = raw;

  if (typeof raw === "string") {
    try {
      result = JSON.parse(raw.replace(/^\uFEFF/, ""));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        result: null,
        errors: [`result.json 不是合法 JSON: ${message}`],
      };
    }
  }

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return {
      valid: false,
      result: null,
      errors: ["result.json 顶层必须是对象"],
    };
  }

  const resultObject = normalizeObject(result);
  const status = getObjectValue(resultObject, "status");
  if (!isWorkerResultStatus(status)) {
    errors.push("result.status 必须是 completed / failed / blocked / need_decision / no_progress");
  }

  if (status === "need_decision") {
    const request = getObjectValue(resultObject, "decision_request") || getObjectValue(resultObject, "decisionRequest");
    if (!request || typeof request !== "object") {
      errors.push("need_decision 结果必须包含 decision_request 对象");
    } else if (!getObjectValue(request, "question")) {
      errors.push("decision_request.question 不能为空");
    }
  }
  const rawFilesChanged = normalizeArray(getObjectValue(resultObject, "files_changed") || getObjectValue(resultObject, "filesChanged"));
  const filesChanged: string[] = [];
  for (const file of rawFilesChanged) {
    const normalized = normalizeRelativePath(file);
    if (!normalized) {
      errors.push("files_changed 只能包含项目内相对路径，不能包含绝对路径、.. 或非字符串值");
      continue;
    }
    filesChanged.push(normalized);
  }
  validateRequirements(getObjectValue(resultObject, "requirements"), errors);

  const decisionRequest = normalizeDecisionRequest(getObjectValue(resultObject, "decision_request") || getObjectValue(resultObject, "decisionRequest"));
  const normalizedStatus = isWorkerResultStatus(status) ? status : "failed";
  return {
    valid: errors.length === 0,
    result: {
      status: normalizedStatus,
      summary: sanitizeText(getObjectValue(resultObject, "summary") || getObjectValue(resultObject, "handoff") || ""),
      files_changed: filesChanged,
      requirements: normalizeRequirements(getObjectValue(resultObject, "requirements")),
      state_patch: normalizeStatePatch(getObjectValue(resultObject, "state_patch")),
      validation: getObjectValue(resultObject, "validation") ? sanitizeValue(getObjectValue(resultObject, "validation")) : null,
      risks: sanitizeText(getObjectValue(resultObject, "risks") || ""),
      blocked_reason: sanitizeText(getObjectValue(resultObject, "blocked_reason") || getObjectValue(resultObject, "blockedReason") || ""),
      decision_request: decisionRequest,
      trace: normalizeTrace(getObjectValue(resultObject, "trace")),
      documentation: normalizeDocumentation(getObjectValue(resultObject, "documentation")),
      raw: normalizeRaw(resultObject),
    },
    errors,
  };
}

