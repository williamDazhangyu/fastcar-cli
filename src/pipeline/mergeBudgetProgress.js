// @ts-check

/**
 * @param {unknown} focus
 * @returns {focus is { type?: string }}
 */
function hasFocusType(focus) {
  return Boolean(focus && typeof focus === "object" && !Array.isArray(focus));
}

/**
 * @param {unknown} focus
 * @returns {boolean}
 */
function isImplementationFocus(focus) {
  return hasFocusType(focus) && ["implement_req", "fix_bug"].includes(focus.type || "");
}

/**
 * @param {unknown} focus
 * @param {unknown} mode
 * @returns {boolean}
 */
function isOptimizationFocus(focus, mode) {
  return mode === "optimize" && hasFocusType(focus) && focus.type === "optimize";
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
 * @param {unknown} value
 * @returns {number}
 */
function countValue(value) {
  return Number(value || 0);
}

/**
 * @param {unknown} budgets
 * @param {import("./types").BudgetProgressContext} ctx
 * @returns {Record<string, unknown>}
 */
function mergeBudgetProgress(budgets, ctx) {
  const current = toRecord(budgets);
  /** @type {Record<string, unknown>} */
  const next = {
    ...current,
    totalCycles: countValue(current.totalCycles) + 1,
  };
  const mode = ctx.mode || (ctx.stateMode && ctx.stateMode.mode) || "strict";
  const focus = ctx.focus || null;

  if (isOptimizationFocus(focus, mode)) {
    next.optimizationIterationsUsed = countValue(current.optimizationIterationsUsed) + 1;
    if (Number.isInteger(next.remainingOptimizationIterations)) {
      next.remainingOptimizationIterations = Math.max(0, Number(next.remainingOptimizationIterations) - 1);
    }
    return next;
  }

  if (isImplementationFocus(focus)) {
    next.implementationIterationsUsed = countValue(current.implementationIterationsUsed) + 1;
    if (Number.isInteger(next.remainingImplementationIterations)) {
      next.remainingImplementationIterations = Math.max(0, Number(next.remainingImplementationIterations) - 1);
    }
    return next;
  }

  next.nonImplementationIterationsUsed = countValue(current.nonImplementationIterationsUsed) + 1;
  return next;
}

module.exports = {
  isImplementationFocus,
  isOptimizationFocus,
  mergeBudgetProgress,
};
