import type {
  DiagnoseStateLike,
  HypothesisItem,
} from "./types";

const MAX_DIAGNOSE_ITEMS = 200;

function normalizeArray(value: unknown): unknown[] {
  if (!value) {
    return [];
  }
  return (Array.isArray(value) ? value : [value])
    .filter((item) => item !== undefined && item !== null && item !== false && item !== "");
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function collectHypothesisIds(items: unknown): Set<string> {
  const ids = new Set<string>();
  for (const item of normalizeArray(items)) {
    const record = toRecord(item);
    if (record.id) {
      ids.add(String(record.id));
    }
  }
  return ids;
}

export function nextHypothesisId(usedIds: Set<string>): string {
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

export function normalizeHypothesisItem(
  value: unknown,
  index: number,
  usedIds?: Set<string>,
): HypothesisItem {
  const ids = usedIds || new Set<string>();
  const record = toRecord(value);
  const proposedId = record.id ? String(record.id) : "";
  const id = proposedId && !ids.has(proposedId) ? proposedId : nextHypothesisId(ids);
  ids.add(id);
  if (Object.keys(record).length > 0) {
    return {
      id,
      summary: String(record.summary || record.text || record.hypothesis || record.id || ""),
      priority: typeof record.priority === "number" && Number.isFinite(record.priority)
        ? Number(record.priority)
        : index + 1,
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

export function normalizeHypothesisQueue(
  diagnose: DiagnoseStateLike | null | undefined,
): unknown[] {
  const existingQueue = normalizeArray(diagnose && diagnose.hypothesisQueue);
  if (existingQueue.length > 0) {
    return existingQueue;
  }
  const usedIds = new Set<string>();
  return normalizeArray(diagnose && diagnose.hypotheses)
    .map((item, index) => normalizeHypothesisItem(item, index, usedIds));
}

export function appendHypothesesPatch(
  currentDiagnose: unknown,
  value: unknown,
): DiagnoseStateLike {
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
