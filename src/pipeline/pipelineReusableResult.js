// @ts-check

const fs = require("fs");
const { parseAndValidateIterationResult } = require("./resultSchema");

/**
 * @param {import("./types").ParsedIterationResult | null | undefined} parsed
 * @param {import("./types").PipelineFocus | null | undefined} focus
 * @returns {boolean}
 */
function resultMatchesFocus(parsed, focus) {
  const rawResult = parsed && parsed.result && parsed.result.raw && typeof parsed.result.raw === "object"
    ? /** @type {{ focus?: unknown }} */ (parsed.result.raw)
    : {};
  const resultFocus = rawResult.focus;
  const expectedType = focus && focus.type ? focus.type : null;
  const expectedReqId = focus && focus.req_id ? focus.req_id : null;
  if (!resultFocus || typeof resultFocus !== "object") {
    return expectedType === "extract_requirements" && expectedReqId === "REQ-BOOTSTRAP";
  }
  const normalizedFocus = /** @type {{ type?: unknown; req_id?: unknown; reqId?: unknown }} */ (resultFocus);
  const actualType = typeof normalizedFocus.type === "string" ? normalizedFocus.type : null;
  const actualReqId = typeof normalizedFocus.req_id === "string"
    ? normalizedFocus.req_id
    : (typeof normalizedFocus.reqId === "string" ? normalizedFocus.reqId : null);
  return actualType === expectedType && actualReqId === expectedReqId;
}

/**
 * @param {string} resultPath
 * @param {string} promptPath
 * @returns {boolean}
 */
function resultHasPromptEvidence(resultPath, promptPath) {
  if (!fs.existsSync(resultPath) || !fs.existsSync(promptPath)) {
    return false;
  }
  const resultStat = fs.statSync(resultPath);
  const promptStat = fs.statSync(promptPath);
  return resultStat.mtimeMs >= promptStat.mtimeMs;
}

/**
 * @param {string} resultPath
 * @param {string} promptPath
 * @param {import("./types").PipelineFocus | null | undefined} focus
 * @returns {Promise<import("./types").ValidParsedIterationResult | null>}
 */
async function readReusableIterationResult(resultPath, promptPath, focus) {
  if (!resultHasPromptEvidence(resultPath, promptPath)) {
    return null;
  }
  /** @type {import("./types").ParsedIterationResult} */
  let parsed;
  try {
    parsed = parseAndValidateIterationResult(await fs.promises.readFile(resultPath, "utf8"));
  } catch {
    return null;
  }
  if (!parsed.valid || !resultMatchesFocus(parsed, focus)) {
    return null;
  }
  return parsed;
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @param {number} iteration
 * @returns {boolean}
 */
function hasMergedIteration(state, iteration) {
  const traceability = state && state.traceability && typeof state.traceability === "object"
    ? /** @type {{ iterations?: unknown }} */ (state.traceability)
    : {};
  const iterations = Array.isArray(traceability.iterations) ? traceability.iterations : [];
  return iterations.some((item) => {
    const entry = item && typeof item === "object" ? /** @type {{ iteration?: unknown }} */ (item) : {};
    return entry.iteration === iteration;
  });
}

module.exports = {
  hasMergedIteration,
  readReusableIterationResult,
  resultHasPromptEvidence,
  resultMatchesFocus,
};
