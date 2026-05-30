import fs from "fs";
import path from "path";
import { getAdapter } from "../adapters";
import { emitProgress } from "./progress";
import { pickNextFocus } from "./pickFocus";
import { shouldStop } from "./shouldStop";
import { mergeIterationIntoState } from "./mergeState";
import { parseAndValidateIterationResult } from "./resultSchema";
import { buildIterationPrompt } from "./iterationPrompt";
import { buildIterationPaths } from "./iterationPaths";
import { evaluateWriteGuard } from "./writeGuard";
import { evaluateWatchdog } from "./watchdog";
import { applyPhaseGateToState, checkPhaseGate } from "./phaseGate";
import { resolveLoopPolicy } from "./loopPolicy";
import { getLanguageText, inferLanguageFromState } from "./language";
import {
  parseValidationCommands,
  runValidationCommands,
  skipValidation,
} from "./pipelineValidationRunner";
import {
  diffStatusSnapshots,
  getDirectorySignature,
  getGitStatusSnapshot,
  mergeActualFilesChanged,
  normalizeActualFilesChanged,
  runGit,
} from "./pipelineGitAudit";
import {
  buildProgressStats,
  computeEffectiveTimeouts,
  getBudgetLeft,
  runWorkerWithProgress,
  tail,
  toRelative,
} from "./pipelineWorkerProgress";
import {
  buildPipelineSnapshot,
  buildRequirementStatus,
  readJson,
  refreshStateMarkdownView,
} from "./pipelineStateIO";
import {
  applyIsolatedWorktreeDiff,
  cleanupIsolatedWorktreeForExit,
  ensureGitWorktree,
  makeIsolatedWorktree,
  rollbackAppliedIsolatedWorktreeDiff,
} from "./pipelineIsolateWorktree";
import {
  hasMergedIteration,
  readReusableIterationResult,
} from "./pipelineReusableResult";
import {
  buildDeliveryGate,
  needsValidationReconcile,
  updateNoProgressState,
} from "./pipelineDeliveryGate";
import { finalizeDeliveryState } from "./pipelineFinalization";
import { applyPostMergeValidationState } from "./pipelinePostMergeValidation";
import {
  markIsolateCleanupFailed,
  markIsolateMergeFailed,
  persistPipelineFailureState,
  writeValidatedState,
} from "./pipelineFailureState";
import type {
  GitStatusSnapshot,
  ParsedIterationResult,
  PipelineRunOptions,
  PipelineRunResult,
  PipelineStateLike,
  ValidationResult,
} from "./types";

export {
  buildIterationPrompt,
  parseValidationCommands,
  runValidationCommands,
  skipValidation,
  updateNoProgressState,
  needsValidationReconcile,
  buildDeliveryGate,
  buildRequirementStatus,
  buildPipelineSnapshot,
  computeEffectiveTimeouts,
  normalizeActualFilesChanged,
  getDirectorySignature,
};

/**
 * @param {import("./types").PipelineRunOptions} options
 * @returns {Promise<import("./types").PipelineRunResult>}
 */
export async function runPipeline(options: PipelineRunOptions): Promise<PipelineRunResult> {
  const projectRoot = options.projectRoot || process.cwd();
  const session = options.session;
  const stateJsonPath = options.stateJsonPath;
  let state = await readJson(stateJsonPath) as PipelineStateLike;
  const loopPolicy = resolveLoopPolicy(options, state);
  const { mode, runtimeAutopilot, maxSteps } = loopPolicy;
  const adapter = options.adapter || getAdapter(options.agent || "codex");
  const effectiveScope = options.scope || (mode === "prototype" ? "prototype/**" : null);
  const projectIsGitWorktree = ensureGitWorktree(projectRoot);
  state.mode = {
    ...(state.mode || {}),
    runtimeAutopilot,
    loopShape: loopPolicy.loopShape,
  };
  state.updatedAt = new Date().toISOString();
  const startupSchemaIssues = await writeValidatedState(stateJsonPath, state, options);
  if (startupSchemaIssues.some((issue) => issue.severity === "error")) {
    emitProgress({ event: "error", reason: "state_schema_failed", errors: startupSchemaIssues }, options);
    process.exitCode = 1;
    return { state, reason: "state_schema_failed" };
  }

  emitProgress({
    event: "session_started",
    session,
    mode,
    total_reqs: Array.isArray(state.requirements) ? state.requirements.length : 0,
    agent: adapter.id,
    loop_shape: state.mode.loopShape,
    runtime_autopilot: runtimeAutopilot,
    scope: effectiveScope,
    isolated: Boolean(options.isolate),
  }, options);
  emitProgress({
    event: "mode_branch",
    session,
    mode,
    branch: loopPolicy.loopShape,
    denyWrite: (mode === "verify" && !options.allowModify) || mode === "plan",
    scope: effectiveScope || "unrestricted",
  }, options);

  let lastValidation: ValidationResult | null = null;
  let runCyclesCompleted = 0;
  /**
   * @param {string} reason
   * @returns {Promise<{ finalized: boolean; stopped: boolean; reason?: string }>}
   */
  async function maybeFinalizeAndStop(reason: string): Promise<{ finalized: boolean; stopped: boolean; reason?: string }> {
    if (!runtimeAutopilot || options.once || !["strict", "quick", "diagnose", "prototype"].includes(String(mode))) {
      return { finalized: false, stopped: false };
    }
    const finalized = finalizeDeliveryState(state, { session, mode, reason });
    if (!finalized.changed) {
      return { finalized: false, stopped: false };
    }
    state = finalized.state;
    const schemaIssues = await writeValidatedState(stateJsonPath, state, options);
    if (schemaIssues.some((issue) => issue.severity === "error")) {
      emitProgress({ event: "error", reason: "state_schema_failed", errors: schemaIssues }, options);
      process.exitCode = 1;
      return { finalized: true, stopped: true, reason: "state_schema_failed" };
    }
    emitProgress({ event: "delivery_gate", session, reason: "delivery_ready", finalized_from: reason, ...buildDeliveryGate(state) }, options);
    emitProgress({ event: "pipeline_stopped", reason: "delivery_ready", session }, options);
    return { finalized: true, stopped: true, reason: "delivery_ready" };
  }
  for (let index = 0; index < maxSteps; index += 1) {
    const stopBefore = shouldStop(state, lastValidation, { once: options.once, runCyclesCompleted }, mode);
    if (stopBefore.stop) {
      if (stopBefore.reason === "delivery_ready") {
        const finalizedStop = await maybeFinalizeAndStop("pre_iteration");
        if (finalizedStop.stopped) {
          return { state, reason: finalizedStop.reason || "delivery_ready" };
        }
      }
      if (stopBefore.reason === "delivery_ready" || stopBefore.reason === "requirements_blocked") {
        emitProgress({ event: "delivery_gate", session, reason: stopBefore.reason, ...buildDeliveryGate(state) }, options);
      }
      emitProgress({ event: "pipeline_stopped", reason: stopBefore.reason, session }, options);
      return { state, reason: stopBefore.reason };
    }

    const iteration = ((state.budgets && state.budgets.totalCycles) || 0) + 1;
    const focus = pickNextFocus(state, options.focus, mode);
    if (!focus) {
      const finalizedStop = await maybeFinalizeAndStop("no_focus");
      if (finalizedStop.stopped) {
        return { state, reason: finalizedStop.reason || "delivery_ready" };
      }
      emitProgress({ event: "pipeline_stopped", reason: "no_focus", session }, options);
      return { state, reason: "no_focus" };
    }

    const {
      iterationDir,
      promptPath,
      resultPath,
      workerLogPath,
    } = buildIterationPaths(stateJsonPath, iteration);
    await fs.promises.mkdir(iterationDir, { recursive: true });
    const reusableResult = hasMergedIteration(state, iteration) ? null : await readReusableIterationResult(resultPath, promptPath, focus);
    if (!reusableResult) {
      await fs.promises.writeFile(promptPath, buildIterationPrompt({
        session,
        iteration,
        mode,
        focus,
        resultPath: toRelative(projectRoot, resultPath),
        lastValidation,
        writeScope: effectiveScope,
        scope: effectiveScope,
        allowModify: options.allowModify,
        autopilotRun: runtimeAutopilot,
        language: inferLanguageFromState(state),
      }), "utf8");
    }

    emitProgress({
      event: "iteration_start",
      iter: iteration,
      focus,
      prompt: toRelative(projectRoot, promptPath),
      reused_result: Boolean(reusableResult),
      prompt_preserved: Boolean(reusableResult),
      progress: buildProgressStats(state, { iteration, focus }),
    }, options);
    let workerCwd = projectRoot;
    let isolatedWorktree: string | null = null;
    let writeGuardBefore: GitStatusSnapshot | null = null;
    let mainWriteGuardBefore: GitStatusSnapshot | null = null;
    if (options.isolate && !reusableResult) {
      if (!projectIsGitWorktree) {
        emitProgress({ event: "error", iter: iteration, reason: "worktree_create_failed", detail: "当前目录不是 git worktree" }, options);
        process.exitCode = 1;
        return { state, reason: "worktree_create_failed" };
      }
      const created = makeIsolatedWorktree(projectRoot, session, iteration);
      if (!created.ok) {
        emitProgress({ event: "error", iter: iteration, reason: "worktree_create_failed", detail: created.error }, options);
        process.exitCode = 1;
        return { state, reason: "worktree_create_failed" };
      }
      isolatedWorktree = created.worktreePath;
      workerCwd = isolatedWorktree;
      emitProgress({ event: "worktree_created", iter: iteration, path: toRelative(projectRoot, isolatedWorktree) }, options);
    }
    if (!reusableResult && projectIsGitWorktree) {
      writeGuardBefore = getGitStatusSnapshot(workerCwd);
      if (isolatedWorktree) {
        mainWriteGuardBefore = getGitStatusSnapshot(projectRoot);
      }
    }
    let parsed: ParsedIterationResult | null = reusableResult;
    if (reusableResult) {
      await fs.promises.writeFile(workerLogPath, [
        "command: reused existing result.json",
        "exit_code: 0",
        "signal: none",
        "error: none",
        "stdout:",
        `reused_result: ${toRelative(projectRoot, resultPath)}`,
        "stderr:",
        "",
      ].join("\n"), "utf8");
      emitProgress({
        event: "agent_result_reused",
        iter: iteration,
        result: toRelative(projectRoot, resultPath),
        log: toRelative(projectRoot, workerLogPath),
      }, options);
    } else {
      const timeoutPolicy = computeEffectiveTimeouts(state, options, focus);
      const worker = await runWorkerWithProgress(adapter, {
        cwd: workerCwd,
        promptPath,
        resultPath,
        session,
        iteration,
        timeoutMs: timeoutPolicy.timeoutMs,
        inactivityTimeoutMs: timeoutPolicy.inactivityTimeoutMs,
        warnBeforeMs: timeoutPolicy.warnBeforeMs,
        graceKillMs: timeoutPolicy.graceKillMs,
        timeoutWarningPath: path.join(iterationDir, "timeout-warning.json"),
      }, {
        projectRoot,
        session,
        iteration,
        focus,
        state,
        options,
        timeoutPolicy,
        heartbeatMs: options.progressIntervalSeconds ? options.progressIntervalSeconds * 1000 : 15000,
      });
      await fs.promises.writeFile(workerLogPath, [
        `command: ${worker.command || "none"}`,
        `exit_code: ${worker.status}`,
        `signal: ${worker.signal || "none"}`,
        `error: ${worker.error || "none"}`,
        `duration_ms: ${worker.durationMs || worker.progressDurationMs || 0}`,
        `progress_heartbeats: ${worker.progressHeartbeats || 0}`,
        `stdout_bytes: ${worker.stdoutBytes || Buffer.byteLength(worker.stdout || "", "utf8")}`,
        `stderr_bytes: ${worker.stderrBytes || Buffer.byteLength(worker.stderr || "", "utf8")}`,
        `last_activity_ms: ${worker.lastActivityMs === undefined ? 0 : worker.lastActivityMs}`,
        "stdout:",
        worker.stdout || "",
        "stderr:",
        worker.stderr || "",
      ].join("\n"), "utf8");
      emitProgress({
        event: "agent_done",
        iter: iteration,
        exit_code: worker.status,
        timed_out: Boolean(worker.timedOut),
        duration_ms: worker.durationMs || worker.progressDurationMs || 0,
        progress_heartbeats: worker.progressHeartbeats || 0,
        stdout_bytes: worker.stdoutBytes || Buffer.byteLength(worker.stdout || "", "utf8"),
        stderr_bytes: worker.stderrBytes || Buffer.byteLength(worker.stderr || "", "utf8"),
        last_activity_ms: worker.lastActivityMs === undefined ? 0 : worker.lastActivityMs,
        result: toRelative(projectRoot, resultPath),
        log: toRelative(projectRoot, workerLogPath),
      }, options);

      if (worker.status !== 0) {
        if (worker.timedOut) {
          emitProgress({
            event: "agent_timeout",
            iter: iteration,
            timeout_ms: timeoutPolicy.timeoutMs,
            inactivity_timeout_ms: timeoutPolicy.inactivityTimeoutMs,
            timeout_reason: worker.timeoutReason || null,
            detail: worker.error || "worker timed out",
          }, options);
        }
        const recoveredResult = await readReusableIterationResult(resultPath, promptPath, focus);
        if (recoveredResult) {
          parsed = recoveredResult;
          emitProgress({
            event: "agent_result_recovered",
            iter: iteration,
            result: toRelative(projectRoot, resultPath),
            log: toRelative(projectRoot, workerLogPath),
            exit_code: worker.status,
            timed_out: Boolean(worker.timedOut),
            detail: worker.error || tail(worker.stderr) || `worker exited with ${worker.status}`,
          }, options);
        } else {
          const detail = worker.error || tail(worker.stderr) || `worker exited with ${worker.status}`;
          const failureWrite = await persistPipelineFailureState(stateJsonPath, state, {
            reason: worker.timedOut ? "worker_timeout" : "worker_failed",
            detail,
            command: worker.command || "worker",
            exitCode: worker.status || 1,
          }, options);
          state = failureWrite.state;
          if (!failureWrite.ok) {
            emitProgress({ event: "error", iter: iteration, reason: "state_schema_failed", errors: failureWrite.issues }, options);
            cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
            process.exitCode = 1;
            return { state, reason: "state_schema_failed" };
          }
          emitProgress({
            event: "error",
            iter: iteration,
            reason: worker.errorReason || "worker_failed",
            detail,
            path: worker.errorPath || null,
            code: worker.errorCode || null,
          }, options);
          cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
          process.exitCode = worker.status || 1;
          return { state, reason: "worker_failed" };
        }
      }
    }

    if (!parsed) {
      try {
        const parsedCandidate = parseAndValidateIterationResult(await fs.promises.readFile(resultPath, "utf8"));
        parsed = parsedCandidate;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failureWrite = await persistPipelineFailureState(stateJsonPath, state, {
          reason: "missing_result_json",
          detail: message,
          command: "read result.json",
          exitCode: 1,
        }, options);
        state = failureWrite.state;
        if (!failureWrite.ok) {
          emitProgress({ event: "error", iter: iteration, reason: "state_schema_failed", errors: failureWrite.issues }, options);
          cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
          process.exitCode = 1;
          return { state, reason: "state_schema_failed" };
        }
        emitProgress({ event: "error", iter: iteration, reason: "missing_result_json", detail: message }, options);
        cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
        process.exitCode = 1;
        return { state, reason: "missing_result_json" };
      }
      if (!parsed || !parsed.valid) {
        const failureWrite = await persistPipelineFailureState(stateJsonPath, state, {
          reason: "invalid_result_json",
          detail: parsed ? parsed.errors.join("; ") : "invalid result",
          command: "validate result.json",
          exitCode: 1,
        }, options);
        state = failureWrite.state;
        if (!failureWrite.ok) {
          emitProgress({ event: "error", iter: iteration, reason: "state_schema_failed", errors: failureWrite.issues }, options);
          cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
          process.exitCode = 1;
          return { state, reason: "state_schema_failed" };
        }
        emitProgress({ event: "error", iter: iteration, reason: "invalid_result_json", errors: parsed ? parsed.errors : ["invalid result"] }, options);
        cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
        process.exitCode = 1;
        return { state, reason: "invalid_result_json" };
      }
    }
    const report = parsed.result;

    const writeGuardAfter = writeGuardBefore
      ? getGitStatusSnapshot(workerCwd, writeGuardBefore.files)
      : null;
    const mainWriteGuardAfter = mainWriteGuardBefore
      ? getGitStatusSnapshot(projectRoot, mainWriteGuardBefore.files)
      : null;
    const allowedInternalWrites = new Set([
      toRelative(projectRoot, resultPath),
      toRelative(projectRoot, workerLogPath),
      toRelative(projectRoot, path.join(iterationDir, "codex-prompt.md")),
      toRelative(projectRoot, path.join(iterationDir, "codex-last-message.txt")),
      toRelative(projectRoot, path.join(iterationDir, "timeout-warning.json")),
    ]);
    const actualFilesSource = [
      ...diffStatusSnapshots(writeGuardBefore, writeGuardAfter),
      ...diffStatusSnapshots(mainWriteGuardBefore, mainWriteGuardAfter),
    ];
    const actualFilesChanged = normalizeActualFilesChanged(actualFilesSource, allowedInternalWrites);
    const guardedResult = mergeActualFilesChanged(report, actualFilesChanged);
    if (actualFilesChanged.length > 0) {
      emitProgress({
        event: "write_audit",
        iter: iteration,
        reported_files: Array.isArray(report.files_changed) ? report.files_changed : [],
        actual_files: actualFilesChanged,
      }, options);
    }

    const writeGuard = evaluateWriteGuard(guardedResult, {
      mode,
      scope: effectiveScope,
      allowModify: options.allowModify,
      allowedInternalWrites: Array.from(allowedInternalWrites),
    });
    if (!writeGuard.ok) {
      emitProgress({ event: "write_violation", iter: iteration, issues: writeGuard.issues }, options);
      state = updateNoProgressState(state, false);
      state.watchdog = {
        ...(state.watchdog || {}),
        triggered: true,
        requiredAction: "stop",
      };
      const schemaIssues = await writeValidatedState(stateJsonPath, state, options);
      if (schemaIssues.some((issue) => issue.severity === "error")) {
        emitProgress({ event: "error", iter: iteration, reason: "state_schema_failed", errors: schemaIssues }, options);
        cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
        process.exitCode = 1;
        return { state, reason: "state_schema_failed" };
      }
      cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
      process.exitCode = 1;
      return { state, reason: "write_violation" };
    }

    if (report.status === "need_decision") {
      const merged = mergeIterationIntoState(state, report, { status: "not_run", command: null }, {
        focus,
        iteration,
        promptPath: toRelative(projectRoot, promptPath),
        resultPath: toRelative(projectRoot, resultPath),
        logPath: toRelative(projectRoot, workerLogPath),
      });
      state = merged.state;
      const schemaIssues = await writeValidatedState(stateJsonPath, state, options);
      if (schemaIssues.some((issue) => issue.severity === "error")) {
        emitProgress({ event: "error", iter: iteration, reason: "state_schema_failed", errors: schemaIssues }, options);
        cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
        process.exitCode = 1;
        return { state, reason: "state_schema_failed" };
      }
      const request = report.decision_request;
      cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
      emitProgress({
        event: "need_decision",
        iter: iteration,
        question: request ? request.question : "",
        options: request && Array.isArray(request.options) ? request.options : [],
        resume_hint: `fastcar-cli auto-iterate --resume ${session} --run --autopilot --answer <id> --json-progress`,
      }, options);
      process.exitCode = 42;
      return { state, reason: "need_decision" };
    }

    lastValidation = mode === "plan"
      ? await skipValidation(iterationDir, getLanguageText(inferLanguageFromState(state)).planModeSkipped)
      : await runValidationCommands(
        options.noValidate ? [] : parseValidationCommands(state, options.validateCommand),
        workerCwd,
        iterationDir,
        inferLanguageFromState(state),
        {
          timeoutMs: typeof options.validationTimeoutSeconds === "number" && Number.isFinite(options.validationTimeoutSeconds)
            ? options.validationTimeoutSeconds * 1000
            : undefined,
        },
      );
    emitProgress({
      event: "validation_done",
      iter: iteration,
      status: lastValidation.status,
      command: lastValidation.command,
      exit_code: lastValidation.exitCode,
      duration_ms: lastValidation.durationMs || 0,
      summary: lastValidation.summary,
      progress: buildProgressStats(state, { iteration, focus }),
    }, options);

    const merged = mergeIterationIntoState(state, report, lastValidation, {
      focus,
      iteration,
      promptPath: toRelative(projectRoot, promptPath),
      resultPath: toRelative(projectRoot, resultPath),
      logPath: toRelative(projectRoot, workerLogPath),
    });
    if (needsValidationReconcile(report, lastValidation)) {
      emitProgress({
        event: "reconcile",
        iter: iteration,
        reason: "worker_claimed_passed_but_cli_validation_failed",
      }, options);
    }
    const hasProgress = report.status !== "no_progress" &&
      report.status === "completed" &&
      lastValidation.status !== "failed";
    state = updateNoProgressState(merged.state, hasProgress);
    const phaseGate = checkPhaseGate(state, { mode });
    state = applyPhaseGateToState(state, phaseGate);
    const watchdog = evaluateWatchdog(state, { validation: lastValidation });
    if (watchdog.triggered) {
      state.watchdog = {
        ...(state.watchdog || {}),
        triggered: true,
        requiredAction: watchdog.requiredAction,
      };
      emitProgress({ event: "watchdog_triggered", iter: iteration, required_action: watchdog.requiredAction, reason: watchdog.reason }, options);
    }
    const schemaIssues = await writeValidatedState(stateJsonPath, state, options);
    if (schemaIssues.some((issue) => issue.severity === "error")) {
      emitProgress({ event: "error", iter: iteration, reason: "state_schema_failed", errors: schemaIssues }, options);
      cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
      process.exitCode = 1;
      return { state, reason: "state_schema_failed" };
    }
    emitProgress({
      event: "state_merged",
      iter: iteration,
      issues: merged.issues,
      state: toRelative(projectRoot, stateJsonPath),
      req_status: buildRequirementStatus(state),
      budget_left: getBudgetLeft(state),
      progress: buildProgressStats(state, { iteration, focus }),
    }, options);
    if (isolatedWorktree) {
      const applied = applyIsolatedWorktreeDiff(projectRoot, isolatedWorktree);
      if (!applied.ok) {
        state = markIsolateMergeFailed(state, report, applied, isolatedWorktree);
        const schemaIssues = await writeValidatedState(stateJsonPath, state, options);
        if (schemaIssues.some((issue) => issue.severity === "error")) {
          emitProgress({ event: "error", iter: iteration, reason: "state_schema_failed", errors: schemaIssues }, options);
          process.exitCode = 1;
          return { state, reason: "state_schema_failed" };
        }
        emitProgress({
          event: "error",
          iter: iteration,
          reason: "worktree_merge_failed",
          detail: applied.error,
          preserved_worktree: toRelative(projectRoot, isolatedWorktree),
        }, options);
        process.exitCode = 1;
        return { state, reason: "worktree_merge_failed" };
      }
      emitProgress({ event: "worktree_merged", iter: iteration, skipped: applied.skipped }, options);
      const postMergeValidation = mode === "plan"
        ? await skipValidation(iterationDir, `${getLanguageText(inferLanguageFromState(state)).planModeSkipped}(post_merge)`, {
          logFileName: "post-merge-validation.log",
        })
        : await runValidationCommands(
          options.noValidate ? [] : parseValidationCommands(state, options.validateCommand),
          projectRoot,
          iterationDir,
          inferLanguageFromState(state),
          {
            timeoutMs: typeof options.validationTimeoutSeconds === "number" && Number.isFinite(options.validationTimeoutSeconds)
              ? options.validationTimeoutSeconds * 1000
              : undefined,
            logFileName: "post-merge-validation.log",
          },
        );
      lastValidation = postMergeValidation;
      emitProgress({
        event: "post_merge_validation_done",
        iter: iteration,
        status: postMergeValidation.status,
        command: postMergeValidation.command,
        exit_code: postMergeValidation.exitCode,
        duration_ms: postMergeValidation.durationMs || 0,
        summary: postMergeValidation.summary,
        progress: buildProgressStats(state, { iteration, focus }),
      }, options);
      state = applyPostMergeValidationState(state, postMergeValidation, iteration);
      const postMergeSchemaIssues = await writeValidatedState(stateJsonPath, state, options);
      if (postMergeSchemaIssues.some((issue) => issue.severity === "error")) {
        emitProgress({ event: "error", iter: iteration, reason: "state_schema_failed", errors: postMergeSchemaIssues }, options);
        cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
        process.exitCode = 1;
        return { state, reason: "state_schema_failed" };
      }
      if (postMergeValidation.status === "failed") {
        const rollback = rollbackAppliedIsolatedWorktreeDiff(projectRoot, applied);
        if (!rollback.ok) {
          emitProgress({
            event: "error",
            iter: iteration,
            reason: "worktree_rollback_failed",
            detail: rollback.error,
          }, options);
          state.watchdog = {
            ...(state.watchdog || {}),
            triggered: true,
            requiredAction: "stop",
          };
          const rollbackSchemaIssues = await writeValidatedState(stateJsonPath, state, options);
          if (rollbackSchemaIssues.some((issue) => issue.severity === "error")) {
            emitProgress({ event: "error", iter: iteration, reason: "state_schema_failed", errors: rollbackSchemaIssues }, options);
            cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
            process.exitCode = 1;
            return { state, reason: "state_schema_failed" };
          }
          cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
          process.exitCode = 1;
          return { state, reason: "worktree_rollback_failed" };
        }
        emitProgress({ event: "worktree_rolled_back", iter: iteration, reason: "post_merge_validation_failed" }, options);
        emitProgress({
          event: "reconcile",
          iter: iteration,
          reason: "post_merge_validation_failed",
        }, options);
        process.exitCode = 1;
      }
      const cleanup = cleanupIsolatedWorktreeForExit(projectRoot, isolatedWorktree, iteration, options);
      if (!cleanup.ok) {
        state = markIsolateCleanupFailed(state, cleanup);
        const cleanupSchemaIssues = await writeValidatedState(stateJsonPath, state, options);
        if (cleanupSchemaIssues.some((issue) => issue.severity === "error")) {
          emitProgress({ event: "error", iter: iteration, reason: "state_schema_failed", errors: cleanupSchemaIssues }, options);
          process.exitCode = 1;
          return { state, reason: "state_schema_failed" };
        }
        process.exitCode = 1;
        return { state, reason: "worktree_cleanup_failed" };
      }
      if (postMergeValidation.status === "failed") {
        return { state, reason: "post_merge_validation_failed" };
      }
    }

    runCyclesCompleted += 1;
    const finalizedStop = await maybeFinalizeAndStop("iteration_completed");
    if (finalizedStop.stopped) {
      return { state, reason: finalizedStop.reason || "delivery_ready" };
    }
    const stopAfter = shouldStop(state, lastValidation, { once: options.once, runCyclesCompleted }, mode);
    if (stopAfter.stop) {
      if (stopAfter.reason === "delivery_ready" || stopAfter.reason === "requirements_blocked") {
        emitProgress({ event: "delivery_gate", session, reason: stopAfter.reason, ...buildDeliveryGate(state) }, options);
      }
      emitProgress({ event: "pipeline_stopped", reason: stopAfter.reason, session }, options);
      return { state, reason: stopAfter.reason };
    }
  }

  emitProgress({ event: "pipeline_stopped", reason: "max_steps_reached", session }, options);
  return { state, reason: "max_steps_reached" };
}

