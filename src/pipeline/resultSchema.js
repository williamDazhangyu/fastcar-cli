const VALID_STATUSES = new Set(["completed", "failed", "blocked", "need_decision", "no_progress"]);
const MAX_TEXT_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 30;
const SENSITIVE_PATTERNS = [
  {
    pattern: /\b(authorization|api[-_]?key|token|password|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi,
    replacement: "$1=[REDACTED]",
  },
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]",
  },
];

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function sanitizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  let text = String(value).replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
  for (const item of SENSITIVE_PATTERNS) {
    text = text.replace(item.pattern, item.replacement);
  }
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 3).trim()}...` : text;
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).reduce((result, [key, item]) => {
      result[key] = sanitizeValue(item);
      return result;
    }, {});
  }
  return sanitizeText(value);
}

function normalizeTrace(value) {
  const trace = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    rationaleSummary: sanitizeText(trace.rationaleSummary || trace.reasoningSummary || trace.summary || ""),
    decisions: normalizeArray(trace.decisions).slice(0, MAX_ARRAY_LENGTH).map(sanitizeValue),
    evidence: normalizeArray(trace.evidence).slice(0, MAX_ARRAY_LENGTH).map(sanitizeValue),
  };
}

function normalizeDocumentation(value) {
  const documentation = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    apiChanges: normalizeArray(documentation.apiChanges || documentation.api_changes).slice(0, MAX_ARRAY_LENGTH).map(sanitizeValue),
    architectureNotes: normalizeArray(documentation.architectureNotes || documentation.architecture_notes).slice(0, MAX_ARRAY_LENGTH).map(sanitizeValue),
    implementationNotes: normalizeArray(documentation.implementationNotes || documentation.implementation_notes).slice(0, MAX_ARRAY_LENGTH).map(sanitizeValue),
    changelogEntries: normalizeArray(documentation.changelogEntries || documentation.changelog_entries).slice(0, MAX_ARRAY_LENGTH).map(sanitizeValue),
  };
}

function parseAndValidateIterationResult(raw) {
  const errors = [];
  let result = raw;

  if (typeof raw === "string") {
    try {
      result = JSON.parse(raw.replace(/^\uFEFF/, ""));
    } catch (error) {
      return {
        valid: false,
        result: null,
        errors: [`result.json 不是合法 JSON: ${error.message}`],
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

  if (!VALID_STATUSES.has(result.status)) {
    errors.push("result.status 必须是 completed / failed / blocked / need_decision / no_progress");
  }

  if (result.status === "need_decision") {
    const request = result.decision_request || result.decisionRequest;
    if (!request || typeof request !== "object") {
      errors.push("need_decision 结果必须包含 decision_request 对象");
    } else if (!request.question) {
      errors.push("decision_request.question 不能为空");
    }
  }

  return {
    valid: errors.length === 0,
    result: {
      status: result.status,
      summary: String(result.summary || result.handoff || ""),
      files_changed: normalizeArray(result.files_changed || result.filesChanged),
      requirements: normalizeArray(result.requirements),
      state_patch: result.state_patch && typeof result.state_patch === "object"
        ? result.state_patch
        : {},
      validation: result.validation || null,
      risks: String(result.risks || ""),
      blocked_reason: String(result.blocked_reason || result.blockedReason || ""),
      decision_request: result.decision_request || result.decisionRequest || null,
      trace: normalizeTrace(result.trace),
      documentation: normalizeDocumentation(result.documentation),
      raw: result,
    },
    errors,
  };
}

module.exports = {
  parseAndValidateIterationResult,
};
