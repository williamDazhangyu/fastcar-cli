import fs from "fs";
import path from "path";
import { asArray, asRecord, nonEmptyString, stringValue } from "./valueUtils";
import { writeTextAtomic } from "./pipelineStateIO";
import type { PipelineStateLike } from "./types";

export interface TraceArtifactPaths {
  sessionDir: string;
  traceJsonlPath: string;
  decisionsPath: string;
  handoffPath: string;
}

export interface TraceArtifactResult {
  traceJsonlPath: string;
  decisionsPath: string;
  handoffPath: string;
}

export interface TraceArtifactRefreshIssue {
  severity: "warning";
  code: "trace_artifacts_refresh_failed";
  message: string;
}

const TRACE_POLICY = "只记录公开可审计执行摘要、决策、证据和验证结果；不得记录私有 chain-of-thought。";
const MAX_TEXT_LENGTH = 2000;
const SENSITIVE_PATTERNS = [
  /\b(authorization)\s*[:=]\s*["']?(?:bearer|basic)?\s*[^"'\s,;]+/gi,
  /\b(api[-_]?key|token|password|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
];

function sanitizeText(value: unknown): string {
  let text = String(value || "").replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
  for (const pattern of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 3).trim()}...` : text;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth >= 8) {
    return "[TRUNCATED_DEPTH]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      result[key] = sanitizeValue(item, depth + 1);
    }
    return result;
  }
  return typeof value === "string" ? sanitizeText(value) : value;
}

function markdownList(value: unknown): string {
  const items = asArray(value).map((item) => {
    if (typeof item === "string") {
      return sanitizeText(item);
    }
    if (item && typeof item === "object") {
      return JSON.stringify(sanitizeValue(item));
    }
    return sanitizeText(item);
  }).filter(Boolean);
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- 无";
}

function inlineList(value: unknown): string {
  const items = asArray(value).map((item) => sanitizeText(item)).filter(Boolean);
  return items.length > 0 ? items.join("；") : "无";
}

function requirementStatusCounts(state: PipelineStateLike): string {
  const counts = new Map<string, number>();
  for (const item of Array.isArray(state.requirements) ? state.requirements : []) {
    const req = asRecord(item);
    const status = stringValue(req.status, "unknown");
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  if (counts.size === 0) {
    return "无需求记录";
  }
  return Array.from(counts.entries()).map(([status, count]) => `${status} ${count}`).join("；");
}

function latestTraceIteration(state: PipelineStateLike): Record<string, unknown> {
  const traceability = asRecord(state.traceability);
  const iterations = asArray(traceability.iterations);
  return asRecord(iterations.length > 0 ? iterations[iterations.length - 1] : null);
}

function compactTraceEntry(iteration: unknown): Record<string, unknown> {
  const entry = asRecord(iteration);
  return {
    iteration: entry.iteration ?? null,
    createdAt: entry.createdAt ?? null,
    focus: entry.focus ?? null,
    status: sanitizeText(entry.status ?? "unknown"),
    summary: sanitizeText(entry.summary),
    rationaleSummary: sanitizeText(entry.rationaleSummary),
    decisions: asArray(entry.decisions).map((item) => sanitizeValue(item)),
    evidence: asArray(entry.evidence).map((item) => sanitizeValue(item)),
    filesChanged: asArray(entry.filesChanged).map((item) => sanitizeText(item)),
    validation: sanitizeValue(entry.validation ?? null),
    risks: sanitizeText(entry.risks),
    promptPath: sanitizeText(entry.promptPath),
    resultPath: sanitizeText(entry.resultPath),
    logPath: sanitizeText(entry.logPath),
  };
}

export function buildTraceJsonlContent(state: PipelineStateLike): string {
  const traceability = asRecord(state.traceability);
  const iterations = asArray(traceability.iterations);
  if (iterations.length === 0) {
    return "";
  }
  return `${iterations.map((iteration) => JSON.stringify(compactTraceEntry(iteration))).join("\n")}\n`;
}

export function buildDecisionsMarkdown(state: PipelineStateLike): string {
  const traceability = asRecord(state.traceability);
  const iterations = asArray(traceability.iterations);
  const sections = [
    "# Decisions / 决策记录",
    "",
    `Policy: ${sanitizeText(nonEmptyString(traceability.policy) || TRACE_POLICY)}`,
    "",
    "> 本文件是 state.json.traceability.iterations 的派生视图；state.json 仍是机器权威源。",
  ];

  if (iterations.length === 0) {
    sections.push("", "## No Iterations", "", "暂无决策记录。");
    return `${sections.join("\n")}\n`;
  }

  for (const item of iterations) {
    const entry = asRecord(item);
    const focus = asRecord(entry.focus);
    const validation = asRecord(entry.validation);
    sections.push(
      "",
      `## Round ${entry.iteration ?? "unknown"}`,
      "",
      `Focus: ${stringValue(focus.type, "unknown")}${focus.reqId ? ` (${String(focus.reqId)})` : ""}`,
      `Status: ${sanitizeText(stringValue(entry.status, "unknown"))}`,
      `Summary: ${sanitizeText(stringValue(entry.summary, "无"))}`,
      "",
      "### Rationale Summary",
      sanitizeText(stringValue(entry.rationaleSummary, "无")),
      "",
      "### Decisions",
      markdownList(entry.decisions),
      "",
      "### Evidence",
      markdownList(entry.evidence),
      "",
      "### Validation",
      `- status: ${sanitizeText(stringValue(validation.status, "unknown"))}`,
      `- command: ${sanitizeText(stringValue(validation.command, "not_run"))}`,
      `- exitCode: ${validation.exitCode === undefined || validation.exitCode === null ? "null" : String(validation.exitCode)}`,
      `- summary: ${sanitizeText(stringValue(validation.summary, "无"))}`,
      "",
      "### Risks",
      sanitizeText(stringValue(entry.risks, "无")),
    );
  }

  return `${sections.join("\n")}\n`;
}

export function buildHandoffMarkdown(state: PipelineStateLike): string {
  const task = asRecord(state.task);
  const currentState = asRecord(state.currentState);
  const validation = asRecord(state.validation);
  const postChange = asRecord(state.postChange);
  const watchdog = asRecord(state.watchdog);
  const deliveryEvidence = asRecord(state.deliveryEvidence);
  const budgets = asRecord(state.budgets);
  const latest = latestTraceIteration(state);
  const latestValidation = asRecord(latest.validation);
  const latestFocus = asRecord(latest.focus);

  return [
    "# Context Handoff / 上下文交接",
    "",
    "> 本文件由 CLI 从 state.json 派生，用于快速恢复和人工复盘；不要在这里记录私有 chain-of-thought。",
    "",
    "## Goal",
    sanitizeText(stringValue(task.goal, "未指定")),
    "",
    "## Current State",
    `- phase: ${sanitizeText(stringValue(currentState.currentPhase, "unknown"))}`,
    `- task: ${sanitizeText(stringValue(currentState.currentTask, "unknown"))}`,
    `- overallStatus: ${sanitizeText(stringValue(currentState.overallStatus, "unknown"))}`,
    `- nextAction: ${sanitizeText(stringValue(currentState.nextAction, "unknown"))}`,
    "",
    "## Requirement Status",
    requirementStatusCounts(state),
    "",
    "## Latest Iteration",
    `- iteration: ${latest.iteration ?? "none"}`,
    `- focus: ${sanitizeText(stringValue(latestFocus.type, "unknown"))}${latestFocus.reqId ? ` (${sanitizeText(latestFocus.reqId)})` : ""}`,
    `- summary: ${sanitizeText(stringValue(latest.summary, "无"))}`,
    `- filesChanged: ${inlineList(latest.filesChanged)}`,
    "",
    "## Validation",
    `- lastCommand: ${sanitizeText(stringValue(latestValidation.command || postChange.command, "not_run"))}`,
    `- lastResult: ${sanitizeText(stringValue(latestValidation.status || postChange.status, "not_run"))}`,
    `- finalVerifiability: ${sanitizeText(stringValue(validation.finalVerifiability, "unknown"))}`,
    "",
    "## Watchdog",
    `- triggered: ${watchdog.triggered === true ? "true" : "false"}`,
    `- requiredAction: ${sanitizeText(stringValue(watchdog.requiredAction, "continue"))}`,
    `- deliveryVerifiability: ${sanitizeText(stringValue(watchdog.deliveryVerifiability, "unknown"))}`,
    "",
    "## Delivery",
    `- status: ${sanitizeText(stringValue(deliveryEvidence.status, "pending"))}`,
    `- unfinishedItems: ${sanitizeText(stringValue(deliveryEvidence.unfinishedItems, "unknown"))}`,
    `- risks: ${sanitizeText(stringValue(deliveryEvidence.risks, "unknown"))}`,
    "",
    "## Budgets",
    `- remainingImplementationIterations: ${budgets.remainingImplementationIterations ?? "unknown"}`,
    `- remainingValidationHardeningIterations: ${budgets.remainingValidationHardeningIterations ?? "unknown"}`,
    `- totalCycles: ${budgets.totalCycles ?? 0}`,
    "",
    "## Next",
    sanitizeText(stringValue(currentState.nextAction, "读取 state.json，执行 reconcile/next check 后继续。")),
  ].join("\n") + "\n";
}

export async function refreshTraceArtifacts(
  state: PipelineStateLike,
  paths: TraceArtifactPaths,
): Promise<TraceArtifactResult> {
  await fs.promises.mkdir(paths.sessionDir, { recursive: true });
  await writeTextAtomic(paths.traceJsonlPath, buildTraceJsonlContent(state));
  await writeTextAtomic(paths.decisionsPath, buildDecisionsMarkdown(state));
  await writeTextAtomic(paths.handoffPath, buildHandoffMarkdown(state));
  return {
    traceJsonlPath: path.relative(process.cwd(), paths.traceJsonlPath).replace(/\\/g, "/"),
    decisionsPath: path.relative(process.cwd(), paths.decisionsPath).replace(/\\/g, "/"),
    handoffPath: path.relative(process.cwd(), paths.handoffPath).replace(/\\/g, "/"),
  };
}

export async function refreshTraceArtifactsSafely(
  state: PipelineStateLike,
  paths: TraceArtifactPaths,
): Promise<TraceArtifactRefreshIssue | null> {
  try {
    await refreshTraceArtifacts(state, paths);
    return null;
  } catch (error) {
    return {
      severity: "warning",
      code: "trace_artifacts_refresh_failed",
      message: `trace artifacts refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
