import type {
  MetricComparisonItem,
  MetricComparisonResult,
  MetricValue,
} from "./types";

export function normalizeMetric(value: unknown): MetricValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const metric = value as Record<string, unknown>;
  return {
    name: String(metric.name || "metric"),
    value: metric.value === undefined || metric.value === null ? null : metric.value,
    unit: String(metric.unit || ""),
    direction: String(metric.direction || "lower_is_better"),
    source: String(metric.source || ""),
  };
}

function isMetricValue(item: MetricValue | null): item is MetricValue {
  return item !== null;
}

export function normalizeMetrics(values: unknown): MetricValue[] {
  const items = Array.isArray(values) ? values : [];
  return items.map(normalizeMetric).filter(isMetricValue);
}

export function compareMetrics(
  baselineMetrics: unknown,
  postMetrics: unknown,
): MetricComparisonResult {
  const baseline = normalizeMetrics(baselineMetrics);
  const post = normalizeMetrics(postMetrics);
  const postByName = new Map(post.map((item) => [item.name, item]));
  let improved = false;
  let regression = false;
  const comparisons: MetricComparisonItem[] = [];
  for (const item of baseline) {
    const next = postByName.get(item.name);
    if (!next) {
      continue;
    }
    const before = Number(item.value);
    const after = Number(next.value);
    const direction = next.direction || item.direction || "lower_is_better";
    let status: MetricComparisonItem["status"] = "not_comparable";
    if (Number.isFinite(before) && Number.isFinite(after)) {
      if (after === before) {
        status = "unchanged";
      } else if (
        (direction === "higher_is_better" && after > before) ||
        (direction !== "higher_is_better" && after < before)
      ) {
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
