import { compareMetrics, normalizeMetrics } from "./mergeMetrics";
import { normalizeHypothesisQueue } from "./mergeHypotheses";
import { asRecord } from "./valueUtils";
import type {
  MergeIterationContext,
  PipelineStateLike,
  ValidationResult,
  WorkerIterationResult,
} from "./types";

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").WorkerIterationResult} report
 * @param {import("./types").ValidationResult} cliValidation
 * @param {import("./types").MergeIterationContext} ctx
 * @returns {import("./types").PipelineStateLike}
 */
export function mergeBaseline(
  state: PipelineStateLike,
  report: WorkerIterationResult,
  cliValidation: ValidationResult,
  ctx: MergeIterationContext,
): PipelineStateLike {
  if (!ctx.focus || !["establish_baseline", "reproduce"].includes(ctx.focus.type || "")) {
    return state;
  }
  const baseline = {
    ...asRecord(state.baseline),
    status: cliValidation.status === "passed" ? "passed" :
      cliValidation.status === "failed" ? "failed" :
        cliValidation.status === "skipped" ? "skipped_with_reason" : "not_available",
    command: cliValidation.command || "not_run",
    result: cliValidation.exitCode === null || cliValidation.exitCode === undefined ? null : String(cliValidation.exitCode),
    reason: report.summary || cliValidation.summary || "pipeline baseline",
    failureCategory: cliValidation.status === "failed" ? "existing_failure" : "none",
    allowsCoding: true,
  };
  const next = {
    ...state,
    baseline,
  };
  const metrics = normalizeMetrics(report.state_patch && (report.state_patch.optimizationMetrics || report.state_patch.metrics));
  if (metrics.length > 0) {
    next.optimization = {
      ...asRecord(next.optimization),
      baselineMetrics: metrics,
      pendingMetrics: [],
    };
  }
  if (ctx.focus.type === "reproduce") {
    next.diagnose = {
      ...asRecord(next.diagnose),
      reproduceBaseline: {
        status: baseline.status,
        command: baseline.command,
        summary: baseline.reason,
      },
    };
  }
  return next;
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {import("./types").WorkerIterationResult} report
 * @param {import("./types").ValidationResult} cliValidation
 * @param {import("./types").MergeIterationContext} ctx
 * @returns {import("./types").PipelineStateLike}
 */
export function mergeModeProgress(
  state: PipelineStateLike,
  report: WorkerIterationResult,
  cliValidation: ValidationResult,
  ctx: MergeIterationContext,
): PipelineStateLike {
  if (!ctx.focus) {
    return state;
  }
  if (ctx.focus.type === "optimize") {
    const pendingMetrics = normalizeMetrics(report.state_patch && (report.state_patch.optimizationMetrics || report.state_patch.metrics));
    const optimization = asRecord(state.optimization);
    return {
      ...state,
      optimization: {
        ...optimization,
        status: cliValidation.status === "failed" ? "not_verified" : "implemented",
        lastSummary: report.summary || "optimization focus completed",
        pendingMetrics: pendingMetrics.length > 0 ? pendingMetrics : (optimization.pendingMetrics || []),
      },
    };
  }
  if (ctx.focus.type === "verify_optimization") {
    const optimization = asRecord(state.optimization);
    const postMetrics = normalizeMetrics(report.state_patch && (report.state_patch.optimizationMetrics || report.state_patch.metrics));
    const effectivePostMetrics = postMetrics.length > 0 ? postMetrics : (optimization.pendingMetrics || []);
    const comparison = compareMetrics(optimization.baselineMetrics || [], effectivePostMetrics);
    const comparable = comparison.status !== "unknown";
    const noImprovementStreak = comparison.status === "improved" ? 0 :
      comparable ? Number(optimization.noImprovementStreak || 0) + 1 :
        Number(optimization.noImprovementStreak || 0) + 1;
    const maxNoImprovementIterations = Number(optimization.maxNoImprovementIterations || 3);
    const verifiedStatus = cliValidation.status === "passed" && comparison.status !== "regression" ?
      (comparison.status === "unchanged" ? "no_improvement" : "passed") :
      "not_verified";
    return {
      ...state,
      optimization: {
        ...optimization,
        status: verifiedStatus,
        verificationCommand: cliValidation.command || "not_run",
        verificationSummary: cliValidation.summary || "",
        postMetrics: effectivePostMetrics,
        metricComparison: comparison,
        noImprovementStreak,
        maxNoImprovementIterations,
        stopReason: noImprovementStreak >= maxNoImprovementIterations ? "no_improvement" : (optimization.stopReason || ""),
      },
    };
  }
  if (ctx.focus.type === "regression_check") {
    return {
      ...state,
      diagnose: {
        ...asRecord(state.diagnose),
        regressionCheckStatus: cliValidation.status === "passed" ? "passed" : "not_verified",
        regressionCheckSummary: cliValidation.summary || report.summary || "",
      },
    };
  }
  if (ctx.focus.type === "harden_validation") {
    const watchdog = asRecord(state.watchdog);
    return {
      ...state,
      watchdog: {
        ...watchdog,
        validationHardeningStatus: cliValidation.status === "passed" ? "passed" : "not_verified",
        validationHardeningDimensionsDone: Array.from(new Set([
          ...(Array.isArray(watchdog.validationHardeningDimensionsDone) ? watchdog.validationHardeningDimensionsDone : []),
          "regression",
        ])),
      },
    };
  }
  if (ctx.focus.type === "hypothesis_test") {
    const diagnose = asRecord(state.diagnose);
    const queue = normalizeHypothesisQueue(diagnose);
    const focusId = ctx.focus.req_id ? String(ctx.focus.req_id) : "";
    const focusedPendingIndex = focusId
      ? queue.findIndex((candidate) => {
        const item = asRecord(candidate);
        return item.status === "pending" && String(item.id) === focusId;
      })
      : -1;
    const firstPendingIndex = queue.findIndex((candidate) => asRecord(candidate).status === "pending");
    const targetIndex = focusedPendingIndex >= 0 ? focusedPendingIndex : firstPendingIndex;
    const nextQueue = queue.length > 0
      ? queue.map((item, index) => {
          if (index !== targetIndex) {
            return item;
          }
          return {
            ...asRecord(item),
            status: cliValidation.status === "passed" ? "supported" : "rejected",
            evidence: report.summary || cliValidation.summary || "",
          };
        })
      : queue;
    return {
      ...state,
      diagnose: {
        ...diagnose,
        hypothesisQueue: nextQueue,
        lastHypothesisResult: report.summary || cliValidation.summary || "",
      },
    };
  }
  return {
    ...state,
  };
}

