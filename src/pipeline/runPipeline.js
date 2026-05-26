const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { getAdapter } = require("../adapters");
const { emitProgress } = require("./progress");
const { pickNextFocus } = require("./pickFocus");
const { shouldStop, deliveryReady } = require("./shouldStop");
const { mergeIterationIntoState } = require("./mergeState");
const { parseAndValidateIterationResult } = require("./resultSchema");
const { buildIterationPrompt } = require("./iterationPrompt");
const { buildIterationPaths } = require("./iterationPaths");
const { evaluateWriteGuard } = require("./writeGuard");
const { evaluateWatchdog } = require("./watchdog");
const { checkPhaseGate } = require("./phaseGate");
const { resolveLoopPolicy } = require("./loopPolicy");
const { getLanguageText, inferLanguageFromState, localizedStatusLabel } = require("./language");

function tail(value, max = 4096) {
  const text = String(value || "");
  return text.length > max ? text.slice(text.length - max) : text;
}

function toRelative(projectRoot, filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

function buildRequirementStatus(state) {
  const requirements = Array.isArray(state && state.requirements) ? state.requirements : [];
  return requirements.reduce((result, item) => {
    if (item && item.id) {
      result[item.id] = item.status || "unknown";
    }
    return result;
  }, {});
}

function getBudgetLeft(state) {
  const budgets = (state && state.budgets) || {};
  return Number.isInteger(budgets.remainingImplementationIterations)
    ? budgets.remainingImplementationIterations
    : null;
}

function buildProgressStats(state, context = {}) {
  const requirements = Array.isArray(state && state.requirements) ? state.requirements : [];
  const counts = requirements.reduce((result, item) => {
    const status = item && item.status ? item.status : "unknown";
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  const budgets = (state && state.budgets) || {};
  return {
    iter: context.iteration,
    elapsed_ms: context.startedAt ? Date.now() - context.startedAt : 0,
    total_cycles: Number.isInteger(budgets.totalCycles) ? budgets.totalCycles : 0,
    budget_left: getBudgetLeft(state),
    total_reqs: requirements.length,
    req_counts: counts,
    focus: context.focus || null,
    phase: state && state.phaseGate ? state.phaseGate.currentPhase : undefined,
    watchdog_action: state && state.watchdog ? state.watchdog.requiredAction : undefined,
  };
}

async function runWorkerWithProgress(adapter, adapterOptions, progressOptions) {
  const heartbeatMs = progressOptions.heartbeatMs || 15000;
  let heartbeatCount = 0;
  const startedAt = Date.now();
  const timer = setInterval(() => {
    heartbeatCount += 1;
    emitProgress({
      event: "pipeline_progress",
      session: progressOptions.session,
      stage: "worker_running",
      heartbeat: heartbeatCount,
      ...buildProgressStats(progressOptions.state, {
        iteration: progressOptions.iteration,
        focus: progressOptions.focus,
        startedAt,
      }),
    }, progressOptions.options);
  }, heartbeatMs);
  if (timer.unref) {
    timer.unref();
  }
  try {
    const worker = await adapter.run(adapterOptions);
    return {
      ...worker,
      progressDurationMs: Date.now() - startedAt,
      progressHeartbeats: heartbeatCount,
    };
  } finally {
    clearInterval(timer);
  }
}

function buildPipelineSnapshot(state, stateJsonPath) {
  const language = inferLanguageFromState(state);
  const text = getLanguageText(language);
  const reqStatus = buildRequirementStatus(state);
  const reqLines = Object.keys(reqStatus).length > 0
    ? Object.entries(reqStatus)
      .map(([id, status]) => `- ${id}: ${status} (${localizedStatusLabel(status, language)})`)
      .join("\n")
    : text.noRequirements;
  const budgets = (state && state.budgets) || {};
  const postChange = (state && state.postChange) || {};
  const validation = (state && state.validation) || {};
  return [
    "<!-- pipeline-runtime-snapshot:start -->",
    text.stateSnapshotTitle,
    "",
    text.stateSnapshotNotice(path.basename(stateJsonPath)),
    "",
    `updated_at：${state.updatedAt || "unknown"}`,
    `language：${language.code}`,
    `mode：${state.mode && state.mode.mode ? state.mode.mode : "unknown"}`,
    `runtime_autopilot：${state.mode && state.mode.runtimeAutopilot === true ? "true" : "false"}`,
    `loop_shape：${state.mode && state.mode.loopShape ? state.mode.loopShape : "unknown"}`,
    `total_cycles：${Number.isInteger(budgets.totalCycles) ? budgets.totalCycles : 0}`,
    `budget_left：${getBudgetLeft(state) === null ? "unknown" : getBudgetLeft(state)}`,
    `post_change_status：${postChange.status || "unknown"}`,
    `post_change_command：${postChange.command || "not_run"}`,
    `validation_verifiability：${validation.finalVerifiability || "unknown"}`,
    "",
    "requirements：",
    reqLines,
    "<!-- pipeline-runtime-snapshot:end -->",
  ].join("\n");
}

async function refreshStateMarkdownView(stateJsonPath, state) {
  const stateMdPath = stateJsonPath.replace(/state\.json$/, "state.md");
  if (stateMdPath === stateJsonPath || !fs.existsSync(stateMdPath)) {
    return;
  }
  const snapshot = buildPipelineSnapshot(state, stateJsonPath);
  const content = await fs.promises.readFile(stateMdPath, "utf8");
  const pattern = /<!-- pipeline-runtime-snapshot:start -->[\s\S]*?<!-- pipeline-runtime-snapshot:end -->/;
  const nextContent = pattern.test(content)
    ? content.replace(pattern, snapshot)
    : `${content.trimEnd()}\n\n${snapshot}\n`;
  await fs.promises.writeFile(stateMdPath, nextContent, "utf8");
}

async function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  await fs.promises.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.promises.rename(tmpPath, filePath);
}

function parseValidationCommands(state, explicit) {
  if (explicit) {
    return [explicit];
  }
  const commands = state && state.validation && Array.isArray(state.validation.commands)
    ? state.validation.commands
    : [];
  return commands
    .map((item) => typeof item === "string" ? item : item && item.command)
    .filter(Boolean)
    .filter((item) => !/由 Agent|缺失|not_run|未指定|一个原型运行命令/i.test(item));
}

async function readJson(filePath) {
  return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
}

function runGit(args, cwd) {
  const safeDirectory = path.resolve(cwd).replace(/\\/g, "/");
  return spawnSync("git", ["-c", `safe.directory=${safeDirectory}`, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
}

function ensureGitWorktree(projectRoot) {
  const result = runGit(["rev-parse", "--is-inside-work-tree"], projectRoot);
  return result.status === 0 && String(result.stdout).trim() === "true";
}

function makeIsolatedWorktree(projectRoot, session, iteration) {
  const tmpRoot = path.join(path.dirname(projectRoot), ".auto-iterate-worktrees");
  const worktreePath = path.join(tmpRoot, `${session}-${iteration}-${Date.now()}`);
  fs.mkdirSync(tmpRoot, { recursive: true });
  const result = runGit(["worktree", "add", "--detach", worktreePath, "HEAD"], projectRoot);
  if (result.status !== 0) {
    return {
      ok: false,
      worktreePath,
      error: result.stderr || result.stdout || "git worktree add failed",
    };
  }
  return {
    ok: true,
    worktreePath,
  };
}

function cleanupIsolatedWorktree(projectRoot, worktreePath) {
  const remove = runGit(["worktree", "remove", "--force", worktreePath], projectRoot);
  if (remove.status !== 0) {
    return {
      ok: false,
      error: remove.stderr || remove.stdout || "git worktree remove failed",
    };
  }
  return { ok: true };
}

function applyIsolatedWorktreeDiff(projectRoot, worktreePath) {
  const diff = runGit(["diff", "--binary", "HEAD"], worktreePath);
  if (diff.status !== 0) {
    return {
      ok: false,
      skipped: false,
      error: diff.stderr || diff.stdout || "git diff failed",
    };
  }
  if (!String(diff.stdout || "").trim()) {
    return {
      ok: true,
      skipped: true,
    };
  }
  const apply = spawnSync("git", ["apply", "--binary", "--whitespace=nowarn"], {
    cwd: projectRoot,
    input: diff.stdout,
    encoding: "utf8",
    shell: false,
  });
  if (apply.status !== 0) {
    return {
      ok: false,
      skipped: false,
      error: apply.stderr || apply.stdout || "git apply failed",
    };
  }
  return {
    ok: true,
    skipped: false,
  };
}

async function runValidationCommands(commands, projectRoot, iterationDir, language) {
  if (commands.length === 0) {
    return {
      status: "not_run",
      command: null,
      exitCode: null,
      summary: getLanguageText(language).validationNotConfigured,
    };
  }

  const results = [];
  for (const command of commands) {
    const startedAt = Date.now();
    const result = spawnSync(command, {
      cwd: projectRoot,
      encoding: "utf8",
      shell: true,
      timeout: 10 * 60 * 1000,
    });
    results.push({
      command,
      status: result.status === 0 ? "passed" : "failed",
      exitCode: result.status === null ? 1 : result.status,
      signal: result.signal || "none",
      error: result.error ? result.error.message : "none",
      durationMs: Date.now() - startedAt,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    });
    if (result.status !== 0) {
      break;
    }
  }
  const log = results.map((item) => [
    `command: ${item.command}`,
    `exit_code: ${item.exitCode}`,
    `signal: ${item.signal}`,
    `error: ${item.error}`,
    `duration_ms: ${item.durationMs}`,
    "stdout:",
    item.stdout,
    "stderr:",
    item.stderr,
  ].join("\n")).join("\n\n---\n\n");
  await fs.promises.writeFile(path.join(iterationDir, "validation.log"), log, "utf8");
  const failed = results.find((item) => item.status === "failed");
  const last = failed || results[results.length - 1];
  return {
    status: failed ? "failed" : "passed",
    command: commands.join(" && "),
    exitCode: last.exitCode,
    durationMs: results.reduce((total, item) => total + item.durationMs, 0),
    summary: tail(`${last.stdout || ""}\n${last.stderr || ""}`.trim()),
    results: results.map(({ stdout, stderr, ...item }) => ({
      ...item,
      stdoutTail: tail(stdout),
      stderrTail: tail(stderr),
    })),
  };
}

async function skipValidation(iterationDir, reason) {
  await fs.promises.writeFile(
    path.join(iterationDir, "validation.log"),
    `validation skipped: ${reason}\n`,
    "utf8",
  );
  return {
    status: "skipped",
    command: null,
    exitCode: null,
    summary: reason,
  };
}

async function readReusableIterationResult(resultPath) {
  if (!fs.existsSync(resultPath)) {
    return null;
  }
  let parsed;
  try {
    parsed = parseAndValidateIterationResult(await fs.promises.readFile(resultPath, "utf8"));
  } catch {
    return null;
  }
  return parsed.valid ? parsed : null;
}

function hasMergedIteration(state, iteration) {
  const iterations = state && state.traceability && Array.isArray(state.traceability.iterations)
    ? state.traceability.iterations
    : [];
  return iterations.some((item) => item && item.iteration === iteration);
}

function updateNoProgressState(state, hasProgress, maxNoProgressIterations = 3) {
  const current = Number.isInteger(state.watchdog && state.watchdog.noProgressStreak)
    ? state.watchdog.noProgressStreak
    : 0;
  const nextCount = hasProgress ? 0 : current + 1;
  return {
    ...state,
    watchdog: {
      ...(state.watchdog || {}),
      noProgressStreak: nextCount,
      maxNoProgressIterations,
      triggered: nextCount >= maxNoProgressIterations ? true : (state.watchdog || {}).triggered,
      requiredAction: nextCount >= maxNoProgressIterations ? "stop" : ((state.watchdog || {}).requiredAction || "continue"),
    },
  };
}

function needsValidationReconcile(report, cliValidation) {
  const requirements = Array.isArray(report && report.requirements) ? report.requirements : [];
  return cliValidation && cliValidation.status === "failed" &&
    requirements.some((item) => item && item.status === "passed");
}

function buildDeliveryGate(state) {
  const requirements = Array.isArray(state && state.requirements) ? state.requirements : [];
  const openRequirements = requirements
    .filter((item) => item && !["passed", "blocked"].includes(item.status))
    .map((item) => item.id);
  const blockedRequirements = requirements
    .filter((item) => item && item.status === "blocked")
    .map((item) => item.id);
  const validation = (state && state.validation) || {};
  const watchdog = (state && state.watchdog) || {};
  const evidence = (state && state.deliveryEvidence) || {};
  const postAgentGate = (state && state.postAgentValidationGate) || {};
  const blockingReasons = [];
  if (openRequirements.length > 0) {
    blockingReasons.push("open_requirements");
  }
  if (blockedRequirements.length > 0) {
    blockingReasons.push("blocked_requirements");
  }
  if (validation.finalVerifiability === "unknown" || watchdog.deliveryVerifiability === "unknown") {
    blockingReasons.push("unknown_verifiability");
  }
  if (watchdog.deliveryVerifiability === "not_verifiable") {
    blockingReasons.push("not_verifiable");
  }
  if (evidence.status !== "ready" && evidence.status !== "delivered") {
    blockingReasons.push("delivery_evidence_not_ready");
  }
  if (postAgentGate.enabled === true &&
    postAgentGate.lastResult !== "passed" &&
    postAgentGate.lastResult !== "not_run") {
    blockingReasons.push("post_agent_gate_not_passed");
  }
  return {
    ready: deliveryReady(state),
    open_requirements: openRequirements,
    blocked_requirements: blockedRequirements,
    validation_verifiability: validation.finalVerifiability || "unknown",
    watchdog_verifiability: watchdog.deliveryVerifiability || "unknown",
    delivery_evidence_status: evidence.status || "unknown",
    post_agent_gate: postAgentGate.lastResult || "not_run",
    blocking_reasons: blockingReasons,
  };
}

async function writeValidatedState(stateJsonPath, state, options = {}) {
  if (typeof options.validateStateModel !== "function") {
    await writeJsonAtomic(stateJsonPath, state);
    await refreshStateMarkdownView(stateJsonPath, state);
    return [];
  }
  const issues = options.validateStateModel(state, {
    session: state.session && state.session.session,
  });
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    return errors;
  }
  await writeJsonAtomic(stateJsonPath, state);
  await refreshStateMarkdownView(stateJsonPath, state);
  return issues;
}

async function runPipeline(options) {
  const projectRoot = options.projectRoot || process.cwd();
  const session = options.session;
  const stateJsonPath = options.stateJsonPath;
  let state = await readJson(stateJsonPath);
  const loopPolicy = resolveLoopPolicy(options, state);
  const { mode, runtimeAutopilot, maxSteps } = loopPolicy;
  const adapter = options.adapter || getAdapter(options.agent || "codex");
  const effectiveScope = options.scope || (mode === "prototype" ? "prototype/**" : null);
  state.mode = {
    ...(state.mode || {}),
    runtimeAutopilot,
    loopShape: loopPolicy.loopShape,
  };
  state.updatedAt = new Date().toISOString();
  await writeValidatedState(stateJsonPath, state, options);

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

  let lastValidation = null;
  for (let index = 0; index < maxSteps; index += 1) {
    const stopBefore = shouldStop(state, lastValidation, { once: options.once }, mode);
    if (stopBefore.stop) {
      if (stopBefore.reason === "delivery_ready" || stopBefore.reason === "requirements_blocked") {
        emitProgress({ event: "delivery_gate", session, reason: stopBefore.reason, ...buildDeliveryGate(state) }, options);
      }
      emitProgress({ event: "pipeline_stopped", reason: stopBefore.reason, session }, options);
      return { state, reason: stopBefore.reason };
    }

    const iteration = ((state.budgets && state.budgets.totalCycles) || 0) + 1;
    const focus = pickNextFocus(state, options.focus, mode);
    if (!focus) {
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
    const reusableResult = hasMergedIteration(state, iteration) ? null : await readReusableIterationResult(resultPath);
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

    emitProgress({
      event: "iteration_start",
      iter: iteration,
      focus,
      prompt: toRelative(projectRoot, promptPath),
      reused_result: Boolean(reusableResult),
      progress: buildProgressStats(state, { iteration, focus }),
    }, options);
    let workerCwd = projectRoot;
    let isolatedWorktree = null;
    if (options.isolate && !reusableResult) {
      if (!ensureGitWorktree(projectRoot)) {
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
      const worker = await runWorkerWithProgress(adapter, {
        cwd: workerCwd,
        promptPath,
        resultPath,
        session,
        iteration,
        timeoutMs: (options.stepTimeoutSeconds || 300) * 1000,
      }, {
        session,
        iteration,
        focus,
        state,
        options,
        heartbeatMs: options.progressIntervalSeconds ? options.progressIntervalSeconds * 1000 : 15000,
      });
      await fs.promises.writeFile(workerLogPath, [
        `command: ${worker.command || "none"}`,
        `exit_code: ${worker.status}`,
        `signal: ${worker.signal || "none"}`,
        `error: ${worker.error || "none"}`,
        `duration_ms: ${worker.durationMs || worker.progressDurationMs || 0}`,
        `progress_heartbeats: ${worker.progressHeartbeats || 0}`,
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
        result: toRelative(projectRoot, resultPath),
        log: toRelative(projectRoot, workerLogPath),
      }, options);

      if (worker.status !== 0) {
        if (worker.timedOut) {
          emitProgress({
            event: "agent_timeout",
            iter: iteration,
            timeout_ms: (options.stepTimeoutSeconds || 300) * 1000,
            detail: worker.error || "worker timed out",
          }, options);
        }
        emitProgress({ event: "error", iter: iteration, reason: "worker_failed", detail: worker.error || tail(worker.stderr) }, options);
        if (isolatedWorktree) {
          const cleanup = cleanupIsolatedWorktree(projectRoot, isolatedWorktree);
          if (!cleanup.ok) {
            emitProgress({ event: "error", iter: iteration, reason: "worktree_cleanup_failed", detail: cleanup.error }, options);
          }
        }
        process.exitCode = worker.status || 1;
        return { state, reason: "worker_failed" };
      }
    }

    let parsed = reusableResult;
    if (!parsed) {
      try {
        parsed = parseAndValidateIterationResult(await fs.promises.readFile(resultPath, "utf8"));
      } catch (error) {
        emitProgress({ event: "error", iter: iteration, reason: "missing_result_json", detail: error.message }, options);
        if (isolatedWorktree) {
          const cleanup = cleanupIsolatedWorktree(projectRoot, isolatedWorktree);
          if (!cleanup.ok) {
            emitProgress({ event: "error", iter: iteration, reason: "worktree_cleanup_failed", detail: cleanup.error }, options);
          }
        }
        process.exitCode = 1;
        return { state, reason: "missing_result_json" };
      }
      if (!parsed.valid) {
        emitProgress({ event: "error", iter: iteration, reason: "invalid_result_json", errors: parsed.errors }, options);
        if (isolatedWorktree) {
          const cleanup = cleanupIsolatedWorktree(projectRoot, isolatedWorktree);
          if (!cleanup.ok) {
            emitProgress({ event: "error", iter: iteration, reason: "worktree_cleanup_failed", detail: cleanup.error }, options);
          }
        }
        process.exitCode = 1;
        return { state, reason: "invalid_result_json" };
      }
    }

    const writeGuard = evaluateWriteGuard(parsed.result, {
      mode,
      scope: effectiveScope,
      allowModify: options.allowModify,
      allowedInternalWrites: [toRelative(projectRoot, resultPath)],
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
      }
      if (isolatedWorktree) {
        const cleanup = cleanupIsolatedWorktree(projectRoot, isolatedWorktree);
        if (!cleanup.ok) {
          emitProgress({ event: "error", iter: iteration, reason: "worktree_cleanup_failed", detail: cleanup.error }, options);
        }
      }
      process.exitCode = 1;
      return { state, reason: "write_violation" };
    }

    if (parsed.result.status === "need_decision") {
      const merged = mergeIterationIntoState(state, parsed.result, { status: "not_run", command: null }, {
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
        process.exitCode = 1;
        return { state, reason: "state_schema_failed" };
      }
      const request = parsed.result.decision_request;
      emitProgress({
        event: "need_decision",
        iter: iteration,
        question: request.question,
        options: request.options || [],
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

    const merged = mergeIterationIntoState(state, parsed.result, lastValidation, {
      focus,
      iteration,
      promptPath: toRelative(projectRoot, promptPath),
      resultPath: toRelative(projectRoot, resultPath),
      logPath: toRelative(projectRoot, workerLogPath),
    });
    if (needsValidationReconcile(parsed.result, lastValidation)) {
      emitProgress({
        event: "reconcile",
        iter: iteration,
        reason: "worker_claimed_passed_but_cli_validation_failed",
      }, options);
    }
    const hasProgress = parsed.result.status !== "no_progress" &&
      parsed.result.status === "completed" &&
      lastValidation.status !== "failed";
    state = updateNoProgressState(merged.state, hasProgress);
    const phaseGate = checkPhaseGate(state, { mode });
    state.phaseGate = {
      ...(state.phaseGate || {}),
      currentPhase: phaseGate.phase,
      canProceed: phaseGate.canProceed,
      blockingReasons: phaseGate.canProceed ? [] : [phaseGate.reason],
    };
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
        state.watchdog = {
          ...(state.watchdog || {}),
          triggered: true,
          requiredAction: "stop",
        };
        state.isolate = {
          ...(state.isolate || {}),
          conflictWorktree: isolatedWorktree,
          conflictReason: applied.error,
        };
        await writeValidatedState(stateJsonPath, state, options);
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
      const cleanup = cleanupIsolatedWorktree(projectRoot, isolatedWorktree);
      if (!cleanup.ok) {
        emitProgress({ event: "error", iter: iteration, reason: "worktree_cleanup_failed", detail: cleanup.error }, options);
        process.exitCode = 1;
        return { state, reason: "worktree_cleanup_failed" };
      }
      emitProgress({ event: "worktree_cleaned", iter: iteration }, options);
    }

    const stopAfter = shouldStop(state, lastValidation, { once: options.once }, mode);
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

module.exports = {
  buildIterationPrompt,
  parseValidationCommands,
  runPipeline,
  runValidationCommands,
  skipValidation,
  updateNoProgressState,
  needsValidationReconcile,
  buildDeliveryGate,
  buildRequirementStatus,
  buildPipelineSnapshot,
};
