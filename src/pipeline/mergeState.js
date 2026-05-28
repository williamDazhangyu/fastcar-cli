// @ts-check

const MAX_TRACEABILITY_ITERATIONS = 200;
const MAX_DOCUMENTATION_ITEMS = 200;
const MAX_NOTES_ITEMS = 200;
const MAX_DIAGNOSE_ITEMS = 200;

const { getLanguageText, inferLanguageFromState } = require("./language");
const { mergeRequirements } = require("./mergeRequirements");
const { applyAllowedPatch } = require("./mergeStatePatch");
const { mergeBudgetProgress } = require("./mergeBudgetProgress");
const { mergeBaseline, mergeModeProgress } = require("./mergeModeProgress");
const {
  applyIterationProjection,
  normalizeEffectiveValidation,
} = require("./mergeIterationProjection");
const { mergeValidationCommandHistory } = require("./mergeValidationHistory");

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
 * @param {Record<string, unknown>} value
 * @returns {Record<string, unknown>}
 */
function compactObject(value) {
  /** @type {Record<string, unknown>} */
  const compacted = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) {
      continue;
    }
    if (Array.isArray(item) && item.length === 0) {
      continue;
    }
    if (typeof item === "string" && item === "") {
      continue;
    }
    compacted[key] = item;
  }
  return compacted;
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
 * @param {unknown} existing
 * @param {unknown} incoming
 * @returns {import("./types").WorkerIterationResult["documentation"]}
 */
function appendDocumentation(existing, incoming) {
  const current = toRecord(existing);
  const report = toRecord(incoming);
  return {
    apiChanges: takeLast([
      ...normalizeArray(current.apiChanges),
      ...normalizeArray(report.apiChanges),
    ], MAX_DOCUMENTATION_ITEMS),
    architectureNotes: takeLast([
      ...normalizeArray(current.architectureNotes),
      ...normalizeArray(report.architectureNotes),
    ], MAX_DOCUMENTATION_ITEMS),
    implementationNotes: takeLast([
      ...normalizeArray(current.implementationNotes),
      ...normalizeArray(report.implementationNotes),
    ], MAX_DOCUMENTATION_ITEMS),
    changelogEntries: takeLast([
      ...normalizeArray(current.changelogEntries),
      ...normalizeArray(report.changelogEntries),
    ], MAX_DOCUMENTATION_ITEMS),
  };
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {import("./types").PipelineStateLike}
 */
function boundWorkerPatchHistory(state) {
  const next = { ...state };
  if (Array.isArray(next.notes)) {
    next.notes = takeLast(next.notes.map((item) => String(item)), MAX_NOTES_ITEMS);
  }
  if (next.diagnose && typeof next.diagnose === "object") {
    next.diagnose = {
      ...next.diagnose,
      hypotheses: takeLast(normalizeArray(next.diagnose.hypotheses).map((item) => String(item)), MAX_DIAGNOSE_ITEMS),
      hypothesisQueue: takeLast(next.diagnose.hypothesisQueue, MAX_DIAGNOSE_ITEMS),
    };
  }
  return next;
}

/**
 * @param {import("./types").WorkerIterationResult} report
 * @param {import("./types").EffectiveValidationResult} cliValidation
 * @param {import("./types").MergeIterationContext} ctx
 * @param {string} now
 * @returns {Record<string, unknown>}
 */
function buildTraceEntry(report, cliValidation, ctx, now) {
  const trace = report.trace || {};
  return compactObject({
    iteration: ctx.iteration,
    focus: ctx.focus ? {
      type: ctx.focus.type || "unknown",
      reqId: ctx.focus.req_id || null,
      summary: ctx.focus.summary || "",
    } : null,
    status: report.status || "failed",
    summary: report.summary || "",
    rationaleSummary: trace.rationaleSummary || "",
    decisions: normalizeArray(trace.decisions),
    evidence: normalizeArray(trace.evidence),
    filesChanged: normalizeArray(report.files_changed),
    validation: cliValidation ? {
      status: cliValidation.status || "not_run",
      command: cliValidation.command || "not_run",
      exitCode: cliValidation.exitCode === undefined ? null : cliValidation.exitCode,
      summary: cliValidation.summary || "",
    } : null,
    risks: report.risks || "",
    promptPath: ctx.promptPath || "",
    resultPath: ctx.resultPath || "",
    logPath: ctx.logPath || ctx.workerLogPath || "",
    createdAt: now,
  });
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").WorkerIterationResult} report
 * @param {import("./types").EffectiveValidationResult} cliValidation
 * @param {import("./types").MergeIterationContext} ctx
 * @returns {import("./types").PipelineStateLike}
 */
function closeVerifiedBootstrapRequirement(state, report, cliValidation, ctx) {
  if (!ctx.focus || ctx.focus.type !== "extract_requirements" || ctx.focus.req_id !== "REQ-BOOTSTRAP" || cliValidation.status !== "passed") {
    return state;
  }
  if (!Array.isArray(state.requirements)) {
    return state;
  }
  return {
    ...state,
    requirements: state.requirements.map((item) => {
      const record = toRecord(item);
      if (record.id !== "REQ-BOOTSTRAP") {
        return item;
      }
      return {
        ...record,
        status: "passed",
        evidence: report.summary || cliValidation.summary || record.evidence || "Requirement extraction bootstrap completed",
        nextStep: "进入下一阶段门禁",
      };
    }),
  };
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").WorkerIterationResult} report
 * @param {import("./types").ValidationResult} cliValidation
 * @param {import("./types").MergeIterationContext} [ctx]
 * @returns {import("./types").MergeIterationResult}
 */
function mergeIterationIntoState(state, report, cliValidation, ctx = {}) {
  /** @type {string[]} */
  const issues = [];
  const language = inferLanguageFromState(state);
  const text = getLanguageText(language);
  const now = new Date().toISOString();
  const patched = applyAllowedPatch(state || {}, report.state_patch, issues);
  let next = patched.state;
  const status = report.status || "failed";
  const effectiveValidation = normalizeEffectiveValidation(status, cliValidation);
  next = mergeBaseline(next, report, effectiveValidation, ctx);
  next = mergeModeProgress(next, report, effectiveValidation, ctx);
  next = boundWorkerPatchHistory(next);

  next.requirements = mergeRequirements(next, report, effectiveValidation);
  const traceability = toRecord(next.traceability);
  next.traceability = {
    ...traceability,
    policy: traceability.policy || "Record public audit summaries only; never record private chain-of-thought.",
    iterations: takeLast([
      ...normalizeArray(traceability.iterations),
      buildTraceEntry(report, effectiveValidation, ctx, now),
    ], MAX_TRACEABILITY_ITERATIONS),
  };
  next.documentation = appendDocumentation(next.documentation, report.documentation);
  next.updatedAt = now;
  next.budgets = mergeBudgetProgress(next.budgets, {
    ...ctx,
    stateMode: next.mode,
  });

  next = applyIterationProjection({
    state: next,
    report,
    effectiveValidation,
    status,
    ctx,
    text,
  });
  next = closeVerifiedBootstrapRequirement(next, report, effectiveValidation, ctx);

  return { state: next, issues };
}

module.exports = {
  mergeIterationIntoState,
  mergeValidationCommandHistory,
};
