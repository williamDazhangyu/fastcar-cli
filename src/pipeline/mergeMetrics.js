// @ts-check

/**
 * @param {unknown} value
 * @returns {import("./types").MetricValue | null}
 */
function normalizeMetric(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const metric = /** @type {Record<string, unknown>} */ (value);
  return {
    name: String(metric.name || "metric"),
    value: metric.value === undefined || metric.value === null ? null : metric.value,
    unit: String(metric.unit || ""),
    direction: String(metric.direction || "lower_is_better"),
    source: String(metric.source || ""),
  };
}

/**
 * @param {unknown} values
 * @returns {import("./types").MetricValue[]}
 */
function normalizeMetrics(values) {
  const items = Array.isArray(values) ? values : [];
  return items.map(normalizeMetric).filter((item) => item !== null);
}

/**
 * @param {unknown} baselineMetrics
 * @param {unknown} postMetrics
 * @returns {import("./types").MetricComparisonResult}
 */
function compareMetrics(baselineMetrics, postMetrics) {
  const baseline = normalizeMetrics(baselineMetrics);
  const post = normalizeMetrics(postMetrics);
  const postByName = new Map(post.map((item) => [item.name, item]));
  let improved = false;
  let regression = false;
  /** @type {import("./types").MetricComparisonItem[]} */
  const comparisons = [];
  for (const item of baseline) {
    const next = postByName.get(item.name);
    if (!next) {
      continue;
    }
    const before = Number(item.value);
    const after = Number(next.value);
    const direction = next.direction || item.direction || "lower_is_better";
    /** @type {import("./types").MetricComparisonItem["status"]} */
    let status = "not_comparable";
    if (Number.isFinite(before) && Number.isFinite(after)) {
      if (after === before) {
        status = "unchanged";
      } else if ((direction === "higher_is_better" && after > before) ||
        (direction !== "higher_is_better" && after < before)) {
        status = "improved";
        improved = true;
      } else {
        status = "regression";
        regression = true;
      }
    }
    comparisons.push({
      name: item.name,
      baseline: item.value,
      post: next.value,
      unit: next.unit || item.unit || "",
      direction,
      status,
    });
  }
  return {
    status: regression ? "regression" : improved ? "improved" : comparisons.length > 0 ? "unchanged" : "unknown",
    comparisons,
  };
}

module.exports = {
  compareMetrics,
  normalizeMetric,
  normalizeMetrics,
};
