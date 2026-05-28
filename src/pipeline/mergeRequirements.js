// @ts-check

const { getLanguageText, inferLanguageFromState } = require("./language");

/**
 * @param {unknown} status
 * @returns {boolean}
 */
function isSuccessfulWorkerStatus(status) {
  return status === "completed";
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
 * @param {unknown} existing
 * @param {unknown} incoming
 * @param {import("./types").ValidationResult} cliValidation
 * @param {unknown} language
 * @param {unknown} workerStatus
 * @returns {Record<string, unknown>}
 */
function mergeRequirement(existing, incoming, cliValidation, language, workerStatus) {
  const text = getLanguageText(language);
  const next = { ...toRecord(existing) };
  const patch = toRecord(incoming);
  if (patch.summary) {
    next.summary = patch.summary;
  }
  if (patch.type) {
    next.type = patch.type;
  }
  if (Array.isArray(patch.relatedFiles)) {
    next.relatedFiles = patch.relatedFiles;
  }
  if (patch.nextStep) {
    next.nextStep = patch.nextStep;
  }
  if (patch.blockedReason !== undefined) {
    next.blockedReason = patch.blockedReason || text.none;
  }
  if (patch.evidence) {
    next.evidence = patch.evidence;
  }
  if (patch.status) {
    if (next.status === "passed" && patch.status === "implemented") {
      next.evidence = next.evidence || patch.evidence || text.none;
      return next;
    }
    next.status = patch.status === "passed" && (!isSuccessfulWorkerStatus(workerStatus) || cliValidation.status !== "passed")
      ? "implemented"
      : patch.status;
    if (patch.status === "passed" && !isSuccessfulWorkerStatus(workerStatus)) {
      next.evidence = `${next.evidence || text.none}；Worker status ${workerStatus || "unknown"} cannot mark requirement passed`;
      next.nextStep = text.chooseNextFocus;
    }
    if (patch.status === "passed" && cliValidation.status === "failed") {
      next.evidence = `${next.evidence || text.none}；${text.validationFailureDowngrade}`;
      next.nextStep = text.fixAfterValidationFailure;
    }
  }
  return next;
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").WorkerIterationResult} report
 * @param {import("./types").ValidationResult} cliValidation
 * @returns {unknown[]}
 */
function mergeRequirements(state, report, cliValidation) {
  const text = getLanguageText(inferLanguageFromState(state));
  const current = Array.isArray(state.requirements) ? state.requirements : [];
  const incoming = Array.isArray(report.requirements) ? report.requirements : [];
  if (incoming.length === 0) {
    return current;
  }

  const byId = new Map(current.map((item) => {
    const record = toRecord(item);
    return [record.id, record];
  }));
  for (const item of incoming) {
    const patch = toRecord(item);
    if (!patch.id) {
      continue;
    }
    const existing = byId.get(patch.id) || {
      id: patch.id,
      summary: patch.summary || patch.id,
      type: patch.type || "功能",
      status: "pending",
      relatedFiles: [],
      evidence: text.none,
      blockedReason: text.none,
      nextStep: text.none,
    };
    byId.set(patch.id, mergeRequirement(existing, patch, cliValidation, inferLanguageFromState(state), report.status));
  }
  return Array.from(byId.values());
}

module.exports = {
  isSuccessfulWorkerStatus,
  mergeRequirement,
  mergeRequirements,
};
