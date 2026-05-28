// @ts-check

const MAX_DIAGNOSE_ITEMS = 200;

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
 * @returns {Set<string>}
 */
function collectHypothesisIds(items) {
  const ids = new Set();
  for (const item of normalizeArray(items)) {
    const record = toRecord(item);
    if (record.id) {
      ids.add(String(record.id));
    }
  }
  return ids;
}

/**
 * @param {Set<string>} usedIds
 * @returns {string}
 */
function nextHypothesisId(usedIds) {
  let max = 0;
  for (const id of usedIds) {
    const match = /^H(\d+)$/.exec(String(id));
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  let next = max + 1;
  let candidate = `H${next}`;
  while (usedIds.has(candidate)) {
    next += 1;
    candidate = `H${next}`;
  }
  usedIds.add(candidate);
  return candidate;
}

/**
 * @param {unknown} value
 * @param {number} index
 * @param {Set<string>} [usedIds]
 * @returns {import("./types").HypothesisItem}
 */
function normalizeHypothesisItem(value, index, usedIds) {
  const ids = usedIds || new Set();
  const record = toRecord(value);
  const proposedId = record.id ? String(record.id) : "";
  const id = proposedId && !ids.has(proposedId) ? proposedId : nextHypothesisId(ids);
  ids.add(id);
  if (Object.keys(record).length > 0) {
    return {
      id,
      summary: String(record.summary || record.text || record.hypothesis || record.id || ""),
      priority: Number.isFinite(record.priority) ? Number(record.priority) : index + 1,
      status: String(record.status || "pending"),
      evidence: record.evidence || "",
    };
  }
  return {
    id,
    summary: String(value),
    priority: index + 1,
    status: "pending",
    evidence: "",
  };
}

/**
 * @param {import("./types").DiagnoseStateLike | null | undefined} diagnose
 * @returns {unknown[]}
 */
function normalizeHypothesisQueue(diagnose) {
  const existingQueue = normalizeArray(diagnose && diagnose.hypothesisQueue);
  if (existingQueue.length > 0) {
    return existingQueue;
  }
  const usedIds = new Set();
  return normalizeArray(diagnose && diagnose.hypotheses)
    .map((item, index) => normalizeHypothesisItem(item, index, usedIds));
}

/**
 * @param {unknown} currentDiagnose
 * @param {unknown} value
 * @returns {import("./types").DiagnoseStateLike}
 */
function appendHypothesesPatch(currentDiagnose, value) {
  const diagnose = toRecord(currentDiagnose);
  const incoming = normalizeArray(value);
  const existingQueue = normalizeArray(diagnose.hypothesisQueue);
  const usedIds = collectHypothesisIds(existingQueue);
  const normalizedIncoming = incoming.map((item, index) => normalizeHypothesisItem(item, index, usedIds));
  return {
    ...diagnose,
    hypotheses: normalizeArray([
      ...normalizeArray(diagnose.hypotheses),
      ...incoming.map((item) => {
        const record = toRecord(item);
        return typeof item === "string" ? item : String(record.summary || record.text || record.id || "");
      }),
    ].filter(Boolean)).slice(-MAX_DIAGNOSE_ITEMS),
    hypothesisQueue: normalizeArray([
      ...existingQueue,
      ...normalizedIncoming,
    ]).slice(-MAX_DIAGNOSE_ITEMS),
  };
}

module.exports = {
  appendHypothesesPatch,
  collectHypothesisIds,
  nextHypothesisId,
  normalizeHypothesisItem,
  normalizeHypothesisQueue,
};
