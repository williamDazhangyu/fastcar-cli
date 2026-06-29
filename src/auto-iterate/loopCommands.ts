/**
 * CLI 辅助循环命令 — Loop Commands
 *
 * `--next <session>` — 每轮开始前检查：shouldStop + pickNextFocus + validation.log 防偷懒
 * `--merge <session> [--round <N>]` — 每轮结束后合并：mergeState + 写 state.json/state.md，并派生可重建 trace artifacts
 */
import * as fs from "fs";
import * as path from "path";
import { getSessionPaths } from "./sessionPaths";
import { readJsonFile, writeJsonFileAtomic } from "./stateIO";
import { shouldStop } from "../pipeline/shouldStop";
import { pickNextFocus } from "../pipeline/pickFocus";
import { mergeIterationIntoState } from "../pipeline/mergeState";
import { evaluateWatchdog } from "../pipeline/watchdog";
import { refreshStateMarkdownView } from "../pipeline/pipelineStateIO";
import { parseAndValidateIterationResult } from "../pipeline/resultSchema";
import { refreshTraceArtifactsSafely } from "../pipeline/traceArtifacts";
import type {
  PipelineStateLike,
  PickFocusStateLike,
  ValidationResult,
  MergeIterationContext,
} from "../pipeline/types";

type ModeObj = { mode?: string; [key: string]: unknown };

// ── 工具函数 ──────────────────────────────────────────

function findLatestIteration(sessionDir: string): number {
  const iterationsDir = path.join(sessionDir, "iterations");
  if (!fs.existsSync(iterationsDir)) return 0;
  const entries = fs.readdirSync(iterationsDir, { withFileTypes: true });
  let max = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const num = Number(entry.name);
      if (Number.isInteger(num) && num > max) max = num;
    }
  }
  return max;
}

function fallbackValidation(): ValidationResult {
  return { status: "not_run", command: null };
}

function parseValidationLog(logPath: string): ValidationResult {
  if (!fs.existsSync(logPath)) {
    return fallbackValidation();
  }
  const content = fs.readFileSync(logPath, "utf-8");
  const lines = content.split("\n");

  const exitMatch = content.match(/(?:^|\n)\s*exit_code:\s*(\d+)\b/im);
  const exitCode = exitMatch ? Number(exitMatch[1]) : undefined;

  const durMatch = content.match(/(?:^|\n)\s*duration_ms:\s*(\d+)\b/im);
  const durationMs = durMatch ? Number(durMatch[1]) : 0;

  const cmdMatch = content.match(/(?:^|\n)\s*(?:command|\[0\]):\s*(.+)/im);
  const command = cmdMatch ? cmdMatch[1].trim() : null;

  return {
    status: exitCode === 0 ? "passed" : "failed",
    exitCode: exitCode ?? null,
    durationMs,
    command,
    summary: lines.slice(0, 5).join("; "),
  };
}

function parseValidationCommands(logPath: string): ValidationResult[] {
  if (!fs.existsSync(logPath)) return [];
  const content = fs.readFileSync(logPath, "utf-8");
  const results: ValidationResult[] = [];

  const cmdRegex = /(?:^|\n)\s*\[(\d+)\]\s+(.+?)\s+exit=(\d+)\s+duration_ms=(\d+)/gm;
  let match;
  while ((match = cmdRegex.exec(content)) !== null) {
    results.push({
      status: Number(match[3]) === 0 ? "passed" : "failed",
      command: match[2].trim(),
      exitCode: Number(match[3]),
      durationMs: Number(match[4]),
      summary: `${match[2].trim()} exit=${match[3]} duration_ms=${match[4]}`,
    });
  }
  if (results.length === 0) {
    results.push(parseValidationLog(logPath));
  }
  return results;
}

function allRequirementsPassed(state: PipelineStateLike): boolean {
  const reqs = Array.isArray(state.requirements) ? state.requirements : [];
  return reqs.length > 0 && reqs.every((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return record.status === "passed";
  });
}

function deriveFocusFromState(state: PipelineStateLike): MergeIterationContext["focus"] {
  const currentState = state.currentState && typeof state.currentState === "object"
    ? state.currentState as Record<string, unknown>
    : {};
  const currentTask = typeof currentState.currentTask === "string" ? currentState.currentTask : "";
  if (!currentTask || currentTask === "pipeline_iteration") {
    return null;
  }
  const [type, ...idParts] = currentTask.split(":");
  const reqId = idParts.join(":");
  return {
    type: type || "unknown",
    req_id: reqId || null,
    summary: typeof currentState.currentPhase === "string" ? currentState.currentPhase : currentTask,
  };
}

function deriveFocusFromTrace(state: PipelineStateLike): MergeIterationContext["focus"] {
  const traceability = state.traceability && typeof state.traceability === "object"
    ? state.traceability as Record<string, unknown>
    : {};
  const iterations = Array.isArray(traceability.iterations) ? traceability.iterations : [];
  const latest = iterations.length > 0 ? iterations[iterations.length - 1] : null;
  const focus = latest && typeof latest === "object" ? (latest as Record<string, unknown>).focus : null;
  if (!focus || typeof focus !== "object") {
    return null;
  }
  const record = focus as Record<string, unknown>;
  return {
    type: typeof record.type === "string" ? record.type : "unknown",
    req_id: typeof record.reqId === "string" ? record.reqId : typeof record.req_id === "string" ? record.req_id : null,
    summary: typeof record.summary === "string" ? record.summary : "",
  };
}

function deriveMergeFocus(
  state: PipelineStateLike,
  rawObj: Record<string, unknown> | null,
): MergeIterationContext["focus"] {
  const focusData = rawObj && rawObj.focus as Record<string, unknown> | undefined;
  if (focusData) {
    return {
      type: (focusData.type as string) || "unknown",
      req_id: (focusData.req_id as string) || null,
      summary: (focusData.summary as string) || "",
    };
  }
  return deriveFocusFromState(state) || deriveFocusFromTrace(state) || undefined;
}

// ── --next ────────────────────────────────────────────

export async function runNextCheck(sessionName: string): Promise<void> {
  const paths = getSessionPaths(sessionName);
  const statePath = paths.sessionStateJsonPath;
  const sessionDir = paths.sessionDir;

  // 1. 读 state.json
  let raw: unknown;
  raw = await readJsonFile(statePath);
  const state = raw as unknown as PipelineStateLike;
  if (!state) {
    console.log(`❌ state.json 为空: ${statePath}`);
    process.exitCode = 1;
    return;
  }

  const latestIteration = findLatestIteration(sessionDir);
  const round = latestIteration + 1;

  // 2. 读上一轮 validation.log
  let lastValidation: ValidationResult = fallbackValidation();
  if (latestIteration > 0) {
    const iterDir = path.join(sessionDir, "iterations", String(latestIteration));
    const resultPath = path.join(iterDir, "result.json");
    const logPath = path.join(iterDir, "validation.log");

    if (fs.existsSync(resultPath) && !fs.existsSync(logPath)) {
      console.log(`## Round ${round} 检查\n`);
      console.log(`❌ 上一轮有 result.json 但缺少 validation.log`);
      console.log(`   路径: ${logPath}`);
      console.log(`   请先运行验证命令并写入 validation.log，再继续下一轮。`);
      process.exitCode = 1;
      return;
    }

    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, "utf-8");
      const hasRealEvidence = /(?:^|\n)\s*exit_code:\s*\d+\b/im.test(logContent) &&
        /(?:^|\n)\s*duration_ms:\s*[1-9]\d*\b/im.test(logContent);

      if (!hasRealEvidence) {
        console.log(`## Round ${round} 检查\n`);
        console.log(`❌ 上一轮 validation.log 缺少真实验证证据`);
        console.log(`   路径: ${logPath}`);
        console.log(`   要求: exit_code 有值 且 duration_ms > 0`);
        process.exitCode = 1;
        return;
      }
      lastValidation = parseValidationLog(logPath);
    }
  }

  // 3. 读上一轮 result.json（如有）
  if (latestIteration > 0) {
    const resultPath = path.join(sessionDir, "iterations", String(latestIteration), "result.json");
    if (fs.existsSync(resultPath)) {
      try {
        const result = await readJsonFile(resultPath) as Record<string, unknown> | null;
        if (result && result.scope_violation) {
          console.log(`## Round ${round} 检查\n`);
          console.log(`⚠️  上一轮存在 scope violation，收窄范围后重试`);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  // 4. shouldStop
  const modeObj = state.mode as ModeObj | undefined;
  const mode = modeObj && typeof modeObj.mode === "string" ? modeObj.mode : "strict";
  const stopResult = shouldStop(state, lastValidation, {}, mode);
  const budgets = (state.budgets || {}) as Record<string, unknown>;
  const remaining = budgets.remainingImplementationIterations ?? budgets.autopilotMaxIterations ?? "?";

  console.log(`## Round ${round} 检查\n`);

  if (stopResult.stop) {
    console.log(`Stop check:  ${stopResult.reason}`);
    if (stopResult.reason === "delivery_ready") {
      console.log(`  ✅ 所有需求已通过，可以交付`);
      console.log(`  下一步: fastcar-cli auto-iterate --finalize ${sessionName} --yes`);
    } else if (stopResult.reason === "need_decision") {
      console.log(`  ⚠️  需要用户决策`);
    } else if (stopResult.reason === "budget_exhausted") {
      console.log(`  ❌ 预算耗尽`);
      console.log(`  已用: ${budgets.implementationIterationsUsed ?? "?"}`);
    } else {
      console.log(`  ❌ 停止原因: ${stopResult.reason}`);
    }
    process.exitCode = stopResult.reason !== "delivery_ready" ? 1 : 0;
    return;
  }

  console.log(`Stop check:  continue`);
  console.log(`  ✅ 预算: 剩余 ${remaining}`);

  // protocol-only 提示
  const subAgentDispatch = ((state as Record<string, unknown>).subAgentDispatch || {}) as Record<string, unknown>;
  if (subAgentDispatch.enabled === false) {
    console.log(`  ℹ️  protocol-only 模式，不派发 coder subagent；当前 LLM 自律执行`);
  }

  const watchdogResult = evaluateWatchdog(state, {
    validation: lastValidation.status === "not_run" ? null : lastValidation,
    allRequirementsPassed: allRequirementsPassed(state),
  });
  if (watchdogResult.triggered) {
    console.log(`  ⚠️  Watchdog: triggered (${watchdogResult.requiredAction}, ${watchdogResult.reason})`);
    if (watchdogResult.requiredAction !== "continue") {
      console.log(`  下一步: 先处理 watchdog requiredAction=${watchdogResult.requiredAction}`);
      process.exitCode = 1;
      return;
    }
  } else {
    console.log(`  ✅ Watchdog: clear`);
  }

  if (latestIteration > 0 && lastValidation.status !== "not_run") {
    console.log(`  ✅ 上轮 validation.log: 已验证 (${lastValidation.command || "unknown"} exit=${lastValidation.exitCode})`);
  }

  console.log("");

  // 5. pickNextFocus
  const focus = pickNextFocus(state as unknown as PickFocusStateLike, undefined, mode);
  if (focus) {
    console.log(`Next focus:  ${focus.type}${focus.req_id ? ` (${focus.req_id})` : ""}`);
    console.log(`  📝 ${focus.summary || "无描述"}`);
  } else {
    console.log(`Next focus:  无法确定，请手动选择`);
  }

  const reqs = Array.isArray(state.requirements) ? state.requirements : [];
  const counts: Record<string, number> = {};
  for (const r of reqs) {
    const s = (r && typeof r === "object" ? (r as Record<string, unknown>).status : "unknown") as string;
    counts[s] = (counts[s] || 0) + 1;
  }
  if (reqs.length > 0) {
    const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`);
    console.log(`  📋 需求状态: ${parts.join(", ")}`);
  }

  if (focus && focus.req_id) {
    const targetReq = reqs.find((r) => r && typeof r === "object" && (r as Record<string, unknown>).id === focus.req_id) as Record<string, unknown> | undefined;
    if (targetReq) {
      console.log(`  🔧 验证命令: ${(targetReq.verify_command as string) || "npm run build && npm test"}`);
    }
  }
}

// ── --merge ───────────────────────────────────────────

export async function runMerge(sessionName: string, roundOverride?: number): Promise<void> {
  const paths = getSessionPaths(sessionName);
  const statePath = paths.sessionStateJsonPath;
  const sessionDir = paths.sessionDir;

  // 1. 读 state.json
  let raw: unknown;
  try {
    raw = await readJsonFile(statePath);
  } catch {
    console.log(`❌ 无法读取 state.json: ${statePath}`);
    process.exitCode = 1;
    return;
  }
  const state = raw as unknown as PipelineStateLike;
  if (!state) {
    console.log(`❌ state.json 为空: ${statePath}`);
    process.exitCode = 1;
    return;
  }

  // 2. 确定轮次
  const round = roundOverride || findLatestIteration(sessionDir);
  if (round === 0) {
    console.log("❌ 没有找到任何迭代轮次。请先派发 coder 并写入 result.json。");
    process.exitCode = 1;
    return;
  }

  const iterDir = path.join(sessionDir, "iterations", String(round));
  const resultPath = path.join(iterDir, "result.json");
  const logPath = path.join(iterDir, "validation.log");

  if (!fs.existsSync(resultPath)) {
    console.log(`❌ 未找到 result.json: ${resultPath}`);
    process.exitCode = 1;
    return;
  }

  // 3. 读 result.json
  let reportRaw: unknown;
  reportRaw = await readJsonFile(resultPath);
  if (!reportRaw || typeof reportRaw !== "object") {
    console.log(`❌ 无法解析 result.json: ${resultPath}`);
    process.exitCode = 1;
    return;
  }
  const parsedReport = parseAndValidateIterationResult(reportRaw);
  if (!parsedReport.valid || !parsedReport.result) {
    console.log(`❌ result.json 未通过 schema 校验: ${resultPath}`);
    for (const error of parsedReport.errors.slice(0, 5)) {
      console.log(`   - ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  const report = parsedReport.result;

  // 4. 读 validation.log + 证据检查
  if (!fs.existsSync(logPath)) {
    console.log(`❌ 缺少 validation.log: ${logPath}`);
    process.exitCode = 1;
    return;
  }

  const logContent = fs.readFileSync(logPath, "utf-8");
  const hasRealEvidence = /(?:^|\n)\s*exit_code:\s*\d+\b/im.test(logContent) &&
    /(?:^|\n)\s*duration_ms:\s*[1-9]\d*\b/im.test(logContent);
  if (!hasRealEvidence) {
    console.log(`❌ validation.log 缺少真实验证证据`);
    console.log(`   路径: ${logPath}`);
    console.log(`   要求: exit_code 有值 且 duration_ms > 0`);
    process.exitCode = 1;
    return;
  }

  const validationCommands = parseValidationCommands(logPath);
  const lastValidation: ValidationResult = validationCommands.length > 0
    ? validationCommands[validationCommands.length - 1]
    : fallbackValidation();

  // 5. 构建 context（focus 从 raw json 提取）
  const rawObj = reportRaw as Record<string, unknown> | null;
  const ctx: MergeIterationContext = {
    iteration: round,
    focus: deriveMergeFocus(state, rawObj),
    resultPath,
    logPath,
  };

  // 6. merge
  const merged = mergeIterationIntoState(state, report, lastValidation, ctx);

  // 7. 写回
  try {
    await writeJsonFileAtomic(statePath, merged.state);
    const refreshIssue = await refreshStateMarkdownView(statePath, merged.state);
    if (refreshIssue) {
      merged.issues.push(refreshIssue.message || "state.md refresh failed");
    }
    const traceIssue = await refreshTraceArtifactsSafely(merged.state, {
      sessionDir: paths.sessionDir,
      traceJsonlPath: paths.sessionTraceJsonlPath,
      decisionsPath: paths.sessionDecisionsPath,
      handoffPath: paths.sessionHandoffPath,
    });
    if (traceIssue) {
      merged.issues.push(traceIssue.message);
    }
  } catch (err) {
    console.log(`❌ 无法写入 state.json: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  // 8. 输出摘要
  console.log(`## Round ${round} 合并完成\n`);

  const filesChanged = Array.isArray(report.files_changed) ? report.files_changed : [];
  if (filesChanged.length > 0) {
    console.log(`修改: ${filesChanged.join(", ")}`);
  }

  console.log(`验证: ${lastValidation.command || "unknown"} (exit=${lastValidation.exitCode ?? "?"}${lastValidation.durationMs ? `, ${lastValidation.durationMs}ms` : ""})`);

  const beforeReqs = Array.isArray(state.requirements) ? state.requirements : [];
  const afterReqs = Array.isArray(merged.state.requirements) ? merged.state.requirements : [];
  for (let i = 0; i < Math.max(beforeReqs.length, afterReqs.length); i++) {
    const b = beforeReqs[i] as Record<string, unknown> | undefined;
    const a = afterReqs[i] as Record<string, unknown> | undefined;
    if (b && a && b.status !== a.status) {
      console.log(`需求: ${a.id || `REQ-${i}`} ${b.status} → ${a.status} ${a.status === "passed" ? "✅" : ""}`);
    }
  }

  const newBudgets = (merged.state.budgets || {}) as Record<string, unknown>;
  console.log(`预算: 剩余 ${newBudgets.remainingImplementationIterations ?? "?"}`);
  const newWatchdog = (merged.state.watchdog || {}) as Record<string, unknown>;
  console.log(`Watchdog: ${newWatchdog.triggered ? "triggered" : "clear"}`);
  console.log(`轨迹: trace.jsonl / decisions.md / handoff.md（可从 state.json 重建）`);

  if (merged.issues && merged.issues.length > 0) {
    console.log(`\n⚠️  Issues: ${merged.issues.join("; ")}`);
  }

  // 9. 下一步
  if (lastValidation.status === "passed") {
    const stopCheck = shouldStop(merged.state, lastValidation, {});
    if (stopCheck.stop && stopCheck.reason === "delivery_ready") {
      console.log(`\n✅ 所有需求已通过，可以交付`);
      console.log(`下一步: fastcar-cli auto-iterate --finalize ${sessionName} --yes`);
    } else if (stopCheck.stop) {
      console.log(`\n⏹  ${stopCheck.reason}`);
    } else {
      console.log(`\n下一步: fastcar-cli auto-iterate --next ${sessionName}`);
    }
  } else {
    console.log(`\n下一步: fastcar-cli auto-iterate --next ${sessionName}`);
  }
}
