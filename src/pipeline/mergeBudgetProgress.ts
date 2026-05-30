import type { BudgetProgressContext } from "./types";
import { asRecord } from "./valueUtils";

function hasFocusType(focus: unknown): focus is { type?: string } {
  return Boolean(focus && typeof focus === "object" && !Array.isArray(focus));
}

export function isImplementationFocus(focus: unknown): boolean {
  return hasFocusType(focus) && ["implement_req", "fix_bug"].includes(focus.type || "");
}

export function isOptimizationFocus(focus: unknown, mode: unknown): boolean {
  return mode === "optimize" && hasFocusType(focus) && focus.type === "optimize";
}

function countValue(value: unknown): number {
  return Number(value || 0);
}

export function mergeBudgetProgress(
  budgets: unknown,
  ctx: BudgetProgressContext,
): Record<string, unknown> {
  const current = asRecord(budgets);
  const next: Record<string, unknown> = {
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
