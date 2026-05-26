const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { isFocusAllowedForMode, pickNextFocus } = require("../src/pipeline/pickFocus");
const { shouldStop } = require("../src/pipeline/shouldStop");
const { mergeIterationIntoState } = require("../src/pipeline/mergeState");
const { parseAndValidateIterationResult } = require("../src/pipeline/resultSchema");
const { buildIterationPrompt } = require("../src/pipeline/iterationPrompt");
const { buildDocs } = require("../src/pipeline/deliveryDocs");
const { runValidationCommands, updateNoProgressState, needsValidationReconcile, buildDeliveryGate, buildPipelineSnapshot } = require("../src/pipeline/runPipeline");
const { resolveLoopPolicy } = require("../src/pipeline/loopPolicy");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "cli.js");
const workerPath = path.join(repoRoot, "test", "fixtures", "pipeline-worker.js");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function makeProject() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-pipeline-"));
  fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({ name: "fixture", private: true }, null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "README.md"), "# fixture\n", "utf8");
  return projectDir;
}

function makeGitProject() {
  const projectDir = makeProject();
  let result = spawnSync("git", ["init"], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync("git", ["add", "."], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync("git", [
    "-c",
    "user.name=FastCar Test",
    "-c",
    "user.email=fastcar-test@example.invalid",
    "commit",
    "-m",
    "fixture",
  ], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  return projectDir;
}

function runCli(cwd, args, env = {}) {
  return spawnSync(process.execPath, [cliPath, "auto-iterate", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      AUTO_ITERATE_CODEX_CMD: `"${process.execPath}" "${workerPath}" "{result}" "{prompt}"`,
      ...env,
    },
  });
}

function ndjson(stdout) {
  return stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("resultSchema 校验 worker result.json", () => {
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "ok",
    files_changed: ["src/a.js"],
  }));
  assert.strictEqual(parsed.valid, true);
  assert.deepStrictEqual(parsed.result.files_changed, ["src/a.js"]);

  const invalid = parseAndValidateIterationResult("{");
  assert.strictEqual(invalid.valid, false);

  const noProgress = parseAndValidateIterationResult(JSON.stringify({
    status: "no_progress",
    summary: "nothing safe to do",
  }));
  assert.strictEqual(noProgress.valid, true);
  assert.strictEqual(noProgress.result.status, "no_progress");

  const withBom = parseAndValidateIterationResult(`\uFEFF${JSON.stringify({
    status: "completed",
    summary: "bom ok",
  })}`);
  assert.strictEqual(withBom.valid, true);
  assert.strictEqual(withBom.result.summary, "bom ok");

  const withTrace = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "trace ok",
    trace: {
      rationaleSummary: "public summary password=secret",
      decisions: [{ topic: "A", reason: "B" }],
      evidence: ["file checked"],
    },
    documentation: {
      apiChanges: ["new endpoint"],
      architectureNotes: ["new boundary"],
      implementationNotes: ["core flow"],
      changelogEntries: ["changed behavior"],
    },
  }));
  assert.strictEqual(withTrace.valid, true);
  assert.ok(withTrace.result.trace.rationaleSummary.includes("[REDACTED]"));
  assert.deepStrictEqual(withTrace.result.documentation.apiChanges, ["new endpoint"]);
});

test("pickFocus 和 shouldStop 纯函数覆盖最小路径", () => {
  const state = {
    mode: { mode: "quick" },
    budgets: { remainingImplementationIterations: 1, totalCycles: 0 },
    watchdog: { requiredAction: "continue" },
    requirements: [{ id: "REQ-001", summary: "one", status: "pending" }],
  };
  assert.deepStrictEqual(pickNextFocus(state, null, "quick"), {
    type: "implement_req",
    req_id: "REQ-001",
    summary: "one",
  });
  assert.strictEqual(shouldStop(state, null, { once: true }, "quick").stop, false);
  state.budgets.totalCycles = 1;
  assert.strictEqual(shouldStop(state, null, { once: true }, "quick").reason, "once_completed");
});

test("loopPolicy 集中解析 once/plan/autopilot/maxSteps 语义", () => {
  assert.deepStrictEqual(resolveLoopPolicy({ once: true, autopilotRun: true }, { mode: { mode: "quick" } }), {
    mode: "quick",
    runtimeAutopilot: true,
    loopShape: "autopilot",
    maxSteps: 1,
  });
  assert.deepStrictEqual(resolveLoopPolicy({ autopilotRun: true, maxSteps: 7 }, { mode: { mode: "plan" } }), {
    mode: "plan",
    runtimeAutopilot: true,
    loopShape: "plan_once",
    maxSteps: 1,
  });
  assert.deepStrictEqual(resolveLoopPolicy({ autopilotRun: true, autopilotMaxIterations: 9 }, { mode: { mode: "diagnose" } }), {
    mode: "diagnose",
    runtimeAutopilot: true,
    loopShape: "autopilot",
    maxSteps: 9,
  });
  assert.deepStrictEqual(resolveLoopPolicy({ maxSteps: 3 }, { mode: { mode: "optimize" } }), {
    mode: "optimize",
    runtimeAutopilot: false,
    loopShape: "default",
    maxSteps: 3,
  });
});

test("delivery gate 阻止仅因 requirements passed 就提前完成", () => {
  const notReady = {
    budgets: { remainingImplementationIterations: 1, totalCycles: 1 },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    validation: { finalVerifiability: "unknown" },
    deliveryEvidence: { status: "pending" },
    postAgentValidationGate: { enabled: true, lastResult: "not_run" },
    requirements: [{ id: "REQ-1", summary: "done", status: "passed" }],
  };
  assert.strictEqual(shouldStop(notReady, null, {}, "quick").stop, false);
  const gate = buildDeliveryGate(notReady);
  assert.strictEqual(gate.ready, false);
  assert.ok(gate.blocking_reasons.includes("delivery_evidence_not_ready"));

  const ready = {
    ...notReady,
    watchdog: { requiredAction: "continue", deliveryVerifiability: "partially_verifiable" },
    validation: { finalVerifiability: "partially_verifiable" },
    deliveryEvidence: { status: "ready" },
    postAgentValidationGate: { enabled: true, lastResult: "passed" },
  };
  assert.strictEqual(shouldStop(ready, null, {}, "quick").reason, "delivery_ready");
});

test("pickFocus 支持 fix/harden/optimize 和 mode-specific focus", () => {
  assert.strictEqual(pickNextFocus({
    requirements: [{ id: "REQ-BUG", summary: "bug", status: "failed" }],
  }, null, "quick").type, "fix_bug");

  assert.deepStrictEqual(pickNextFocus({
    postChange: { status: "failed" },
    requirements: [{ id: "REQ-VALIDATION", summary: "validation failed", status: "implemented" }],
  }, null, "quick"), {
    type: "fix_bug",
    req_id: "REQ-VALIDATION",
    summary: "validation failed",
  });

  assert.strictEqual(pickNextFocus({
    requirements: [{ id: "REQ-1", summary: "done", status: "passed" }],
    watchdog: {},
  }, null, "quick").type, "harden_validation");

  assert.strictEqual(pickNextFocus({
    requirements: [{ id: "REQ-1", summary: "done", status: "passed" }],
    watchdog: { validationHardeningStatus: "passed" },
  }, null, "strict").type, "optimize");

  assert.strictEqual(pickNextFocus({
    baseline: { status: "ready" },
    diagnose: { hypotheses: ["maybe cache"] },
    requirements: [],
  }, null, "diagnose").type, "hypothesis_test");

  assert.strictEqual(pickNextFocus({
    baseline: { status: "ready" },
    requirements: [{ id: "REQ-BUG", summary: "bug", status: "implemented" }],
  }, null, "diagnose").type, "fix_bug");

  assert.strictEqual(pickNextFocus({
    baseline: { status: "ready" },
    requirements: [],
  }, null, "diagnose").type, "regression_check");

  assert.strictEqual(pickNextFocus({
    baseline: { status: "ready" },
    optimization: { status: "implemented" },
  }, null, "optimize").type, "verify_optimization");

  assert.strictEqual(pickNextFocus({
    baseline: { status: "ready" },
    optimization: { status: "passed" },
  }, null, "optimize"), null);

  assert.strictEqual(pickNextFocus({
    baseline: { status: "ready" },
    optimization: { status: "pending" },
  }, null, "optimize").type, "optimize");
});

test("--focus override 必须符合当前 mode 允许集合", () => {
  assert.strictEqual(isFocusAllowedForMode({ type: "verify_req" }, "verify"), true);
  assert.strictEqual(isFocusAllowedForMode({ type: "optimize" }, "verify"), false);

  assert.strictEqual(pickNextFocus({}, "optimize", "verify"), null);
  assert.deepStrictEqual(pickNextFocus({}, "verify_req:REQ-1", "verify"), {
    type: "verify_req",
    req_id: "REQ-1",
    summary: "verify_req:REQ-1",
  });
  assert.deepStrictEqual(pickNextFocus({}, "reproduce", "diagnose"), {
    type: "reproduce",
    req_id: null,
    summary: "reproduce",
  });
});

test("iterationPrompt 注入文件范围、上一轮验证、focus 动态规则和完整 schema", () => {
  const prompt = buildIterationPrompt({
    session: "s",
    iteration: 2,
    mode: "quick",
    focus: { type: "fix_bug", req_id: "REQ-1", summary: "fix it" },
    resultPath: ".agent-state/auto-iterate/s/iterations/2/result.json",
    writeScope: "src/**",
    lastValidation: { status: "failed", command: "npm test", exitCode: 1, summary: "boom" },
    autopilotRun: true,
  });
  assert.ok(prompt.includes("Allowed file scope:"));
  assert.ok(prompt.includes("- src/**"));
  assert.ok(prompt.includes("先写或定位一个最小复现测试"));
  assert.ok(prompt.includes('"status": "failed"'));
  assert.ok(prompt.includes("completed|failed|blocked|need_decision|no_progress"));
  assert.ok(prompt.includes("notes"));
  assert.ok(prompt.includes("hypotheses"));
  assert.ok(prompt.includes("optimizationMetrics"));
  assert.ok(prompt.includes("trace"));
  assert.ok(prompt.includes("documentation"));
  assert.ok(prompt.includes("不得输出私有思考链"));
});

test("iterationPrompt 英文语言跟随但保留机器枚举", () => {
  const prompt = buildIterationPrompt({
    session: "s",
    iteration: 1,
    mode: "quick",
    focus: { type: "implement_req", req_id: "REQ-1", summary: "fix login bug" },
    resultPath: ".agent-state/auto-iterate/s/iterations/1/result.json",
    language: { code: "en" },
  });
  assert.ok(prompt.includes("Write all human-readable summary/risk/evidence fields in English"));
  assert.ok(prompt.includes("What changed, failed, or made no progress this iteration"));
  assert.ok(prompt.includes("pending|implemented|passed|blocked|not_verified"));
  assert.ok(!prompt.includes("本轮完成内容"));
});

test("mergeState 白名单合并并禁止 worker 覆盖预算", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 2 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    requirements: [{ id: "REQ-001", summary: "old", status: "pending", type: "验证", relatedFiles: [], evidence: "无", blockedReason: "无", nextStep: "无" }],
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "completed",
      summary: "done",
      files_changed: [],
      requirements: [{ id: "REQ-001", status: "passed", evidence: "worker" }],
      state_patch: {
        budgets: { totalCycles: 100 },
        currentState: { currentTask: "patched" },
        notes: ["note 1"],
        hypotheses: ["hypothesis 1"],
      },
    },
    { status: "not_run", command: null },
    { iteration: 1, focus: { type: "implement_req", req_id: "REQ-001" } },
  );
  assert.strictEqual(merged.state.budgets.totalCycles, 1);
  assert.strictEqual(merged.state.requirements[0].status, "implemented");
  assert.deepStrictEqual(merged.state.notes, ["note 1"]);
  assert.deepStrictEqual(merged.state.diagnose.hypotheses, ["hypothesis 1"]);
  assert.strictEqual(merged.state.diagnose.hypothesisQueue[0].status, "pending");
  assert.strictEqual(merged.state.traceability.iterations.length, 1);
  assert.strictEqual(merged.state.traceability.iterations[0].iteration, 1);
  assert.strictEqual(merged.state.traceability.iterations[0].resultPath, undefined);
  assert.ok(merged.issues.some((item) => item.includes("budgets")));
});

test("mergeState 合并公开 trace 与文档建议", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 2 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    requirements: [],
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "completed",
      summary: "done",
      files_changed: ["src/a.js"],
      requirements: [],
      state_patch: {},
      trace: {
        rationaleSummary: "公开推理摘要",
        decisions: [{ topic: "选型", reason: "兼容现有结构" }],
        evidence: [{ source: "src/a.js", detail: "已检查" }],
      },
      documentation: {
        apiChanges: ["无 API 变化"],
        architectureNotes: ["保持 CLI/Worker 分层"],
        implementationNotes: ["新增可追溯状态合并"],
        changelogEntries: ["记录公开推理摘要"],
      },
    },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    {
      iteration: 3,
      focus: { type: "implement_req", req_id: "REQ-1", summary: "one" },
      promptPath: ".agent-state/auto-iterate/s/iterations/3/prompt.md",
      resultPath: ".agent-state/auto-iterate/s/iterations/3/result.json",
      logPath: ".agent-state/auto-iterate/s/iterations/3/worker.log",
    },
  ).state;
  assert.strictEqual(merged.traceability.iterations[0].rationaleSummary, "公开推理摘要");
  assert.strictEqual(merged.traceability.iterations[0].focus.reqId, "REQ-1");
  assert.strictEqual(merged.traceability.iterations[0].resultPath, ".agent-state/auto-iterate/s/iterations/3/result.json");
  assert.deepStrictEqual(merged.documentation.implementationNotes, ["新增可追溯状态合并"]);
});

test("mergeState 将 establish_baseline 写入 baseline 供 diagnose/optimize 后续推进", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 2 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    baseline: { status: "pending", command: "not_run", result: null, reason: "pending", failureCategory: "unknown", allowsCoding: false },
    requirements: [],
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "completed",
      summary: "baseline captured",
      files_changed: [],
      requirements: [],
      state_patch: {},
    },
    { status: "failed", command: "npm test", exitCode: 1, summary: "existing failure" },
    { iteration: 1, focus: { type: "establish_baseline", req_id: null } },
  );
  assert.strictEqual(merged.state.baseline.status, "failed");
  assert.strictEqual(merged.state.baseline.allowsCoding, true);
  assert.strictEqual(merged.state.baseline.failureCategory, "existing_failure");
});

test("mergeState 推进 diagnose/optimize 专用 focus 状态", () => {
  const base = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 4 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    baseline: { status: "pending", command: "not_run", result: null, reason: "pending", failureCategory: "unknown", allowsCoding: false },
    requirements: [],
    diagnose: { hypotheses: [] },
  };

  const reproduced = mergeIterationIntoState(
    base,
    { status: "completed", summary: "reproduced", files_changed: [], requirements: [], state_patch: {} },
    { status: "failed", command: "npm test", exitCode: 1, summary: "boom" },
    { iteration: 1, focus: { type: "reproduce", req_id: null } },
  ).state;
  assert.strictEqual(reproduced.diagnose.reproduceBaseline.status, "failed");

  const optimized = mergeIterationIntoState(
    base,
    { status: "completed", summary: "optimized", files_changed: [], requirements: [], state_patch: {} },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "optimize", req_id: null } },
  ).state;
  assert.strictEqual(optimized.optimization.status, "implemented");

  const verified = mergeIterationIntoState(
    { ...base, optimization: { status: "implemented" } },
    { status: "completed", summary: "verified", files_changed: [], requirements: [], state_patch: {} },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "verify_optimization", req_id: null } },
  ).state;
  assert.strictEqual(verified.optimization.status, "passed");

  const regression = mergeIterationIntoState(
    base,
    { status: "completed", summary: "regression checked", files_changed: [], requirements: [], state_patch: {} },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "regression_check", req_id: null } },
  ).state;
  assert.strictEqual(regression.diagnose.regressionCheckStatus, "passed");
});

test("diagnose hypothesisQueue 消费 pending 假设并避免重复验证", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 4 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    baseline: { status: "ready" },
    requirements: [],
    diagnose: {
      hypotheses: ["maybe cache"],
      hypothesisQueue: [{ id: "H1", summary: "maybe cache", priority: 1, status: "pending", evidence: "" }],
    },
  };
  assert.strictEqual(pickNextFocus(state, null, "diagnose").type, "hypothesis_test");
  const merged = mergeIterationIntoState(
    state,
    { status: "completed", summary: "cache excluded", files_changed: [], requirements: [], state_patch: {} },
    { status: "failed", command: "npm test", exitCode: 1, summary: "still fails" },
    { iteration: 1, focus: { type: "hypothesis_test", req_id: null } },
  ).state;
  assert.strictEqual(merged.diagnose.hypothesisQueue[0].status, "rejected");
  assert.strictEqual(pickNextFocus(merged, null, "diagnose").type, "regression_check");
});

test("optimize 比较 baseline/post metrics 并在连续无改善后停止", () => {
  const base = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 5 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    baseline: { status: "ready" },
    requirements: [],
    optimization: {
      status: "implemented",
      baselineMetrics: [{ name: "duration", value: 100, unit: "ms", direction: "lower_is_better", source: "bench" }],
      noImprovementStreak: 2,
      maxNoImprovementIterations: 3,
    },
  };
  const verified = mergeIterationIntoState(
    base,
    {
      status: "completed",
      summary: "same speed",
      files_changed: [],
      requirements: [],
      state_patch: {
        optimizationMetrics: [{ name: "duration", value: 100, unit: "ms", direction: "lower_is_better", source: "bench" }],
      },
    },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "verify_optimization", req_id: null } },
  ).state;
  assert.strictEqual(verified.optimization.status, "no_improvement");
  assert.strictEqual(verified.optimization.metricComparison.status, "unchanged");
  assert.strictEqual(verified.optimization.noImprovementStreak, 3);
  assert.strictEqual(verified.optimization.stopReason, "no_improvement");
  assert.strictEqual(pickNextFocus(verified, null, "optimize"), null);
});

test("Worker claimed passed 但 CLI 验证失败时需要 reconcile 并降级 REQ", () => {
  assert.strictEqual(needsValidationReconcile({
    requirements: [{ id: "REQ-1", status: "passed" }],
  }, { status: "failed" }), true);
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 2 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    requirements: [{ id: "REQ-1", summary: "old", status: "pending", type: "验证", relatedFiles: [], evidence: "无", blockedReason: "无", nextStep: "无" }],
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "completed",
      summary: "claimed passed",
      files_changed: [],
      requirements: [{ id: "REQ-1", status: "passed", evidence: "worker claimed" }],
      state_patch: {},
    },
    { status: "failed", command: "npm test", exitCode: 1 },
    { iteration: 1, focus: { type: "implement_req", req_id: "REQ-1" } },
  );
  assert.strictEqual(merged.state.requirements[0].status, "implemented");
  assert.ok(merged.state.requirements[0].evidence.includes("CLI 验证失败"));
  assert.strictEqual(merged.state.postChange.regressionDetected, true);
  assert.strictEqual(merged.state.deltaAssessment.status, "regression");
  assert.strictEqual(merged.state.deltaAssessment.decision, "retry_new_direction");
});

test("runValidationCommands 依次执行全部命令并在失败时停止", async () => {
  const projectDir = makeProject();
  const iterationDir = path.join(projectDir, "iteration");
  fs.mkdirSync(iterationDir);
  fs.writeFileSync(path.join(projectDir, "marker.txt"), "", "utf8");
  const result = await runValidationCommands([
    `"${process.execPath}" -e "require('fs').appendFileSync('marker.txt','1')"`,
    `"${process.execPath}" -e "require('fs').appendFileSync('marker.txt','2'); process.exit(1)"`,
    `"${process.execPath}" -e "require('fs').appendFileSync('marker.txt','3')"`,
  ], projectDir, iterationDir);
  assert.strictEqual(result.status, "failed");
  assert.strictEqual(result.results.length, 2);
  assert.strictEqual(fs.readFileSync(path.join(projectDir, "marker.txt"), "utf8"), "12");
});

test("noProgressStreak 连续无进展后触发 stop", () => {
  let state = { watchdog: { requiredAction: "continue" } };
  state = updateNoProgressState(state, false, 2);
  assert.strictEqual(state.watchdog.noProgressStreak, 1);
  assert.strictEqual(state.watchdog.requiredAction, "continue");
  state = updateNoProgressState(state, false, 2);
  assert.strictEqual(state.watchdog.noProgressStreak, 2);
  assert.strictEqual(state.watchdog.requiredAction, "stop");
  state = updateNoProgressState(state, true, 2);
  assert.strictEqual(state.watchdog.noProgressStreak, 0);
});

test("--run --once 端到端执行 worker、验证并合并 state", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "fixture pipeline",
    "--session",
    "pipe-once",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ]);
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "session_started"));
  assert.ok(events.some((event) => event.event === "mode_branch" && event.branch === "default"));
  assert.ok(events.some((event) => event.event === "iteration_start"));
  assert.ok(events.some((event) => event.event === "validation_done" && event.status === "passed"));
  const stateMerged = events.find((event) => event.event === "state_merged");
  assert.ok(stateMerged);
  assert.strictEqual(stateMerged.req_status["REQ-BOOTSTRAP"], "implemented");
  assert.strictEqual(stateMerged.budget_left, 9);

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-once", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.budgets.totalCycles, 1);
  assert.strictEqual(state.postChange.status, "passed");
  assert.strictEqual(state.postChange.perCommand.length, 1);
  assert.ok(state.postChange.perCommand[0].command.includes("-e"));
  assert.strictEqual(state.traceability.iterations.length, 1);
  assert.ok(state.traceability.iterations[0].rationaleSummary.includes("公开推理摘要"));
  assert.deepStrictEqual(state.documentation.architectureNotes, ["CLI 负责合并状态，Worker 只提交建议"]);
  const stateMd = fs.readFileSync(path.join(projectDir, ".agent-state", "auto-iterate", "pipe-once", "state.md"), "utf8");
  assert.ok(stateMd.includes("## Pipeline Runtime Snapshot / CLI 运行投影"));
  assert.ok(stateMd.includes("budget_left：9"));
  assert.ok(fs.existsSync(path.join(projectDir, ".agent-state", "auto-iterate", "pipe-once", "iterations", "1", "prompt.md")));
  assert.ok(fs.existsSync(path.join(projectDir, ".agent-state", "auto-iterate", "pipe-once", "iterations", "1", "validation.log")));
});

test("deliveryDocs 根据 state 生成四类可追溯文档内容", () => {
  const docs = buildDocs({
    language: { code: "zh", source: "test", confidence: "high" },
    task: { goal: "实现可追溯交付文档" },
    session: { session: "docs-session" },
    requirements: [{ id: "REQ-1", summary: "生成 docs", status: "passed" }],
    traceability: {
      iterations: [{
        iteration: 1,
        focus: { type: "implement_req", reqId: "REQ-1" },
        rationaleSummary: "公开推理摘要",
        decisions: [{ topic: "位置", reason: "session 内聚" }],
        filesChanged: ["src/a.js"],
      }],
    },
    documentation: {
      apiChanges: ["新增 api.md"],
      architectureNotes: ["新增系统架构说明"],
      implementationNotes: ["新增核心实现说明"],
      changelogEntries: ["新增 changelog.md"],
    },
    validation: { commands: [{ command: "npm test", result: "passed", summary: "ok" }] },
    deliveryEvidence: { changedFiles: ["src/a.js"], validationSummary: "npm test passed" },
  });
  assert.ok(docs["api.md"].includes("新增 api.md"));
  assert.ok(docs["changelog.md"].includes("npm test"));
  assert.ok(docs["architecture.md"].includes("不记录私有思考链"));
  assert.ok(docs["implementation.md"].includes("公开推理摘要"));
});

test("buildPipelineSnapshot 从 state.json 派生 state.md 运行投影", () => {
  const snapshot = buildPipelineSnapshot({
    updatedAt: "2026-05-24T00:00:00.000Z",
    mode: { mode: "quick", runtimeAutopilot: true, loopShape: "autopilot" },
    budgets: { totalCycles: 2, remainingImplementationIterations: 8 },
    postChange: { status: "passed", command: "npm test" },
    validation: { finalVerifiability: "partially_verifiable" },
    requirements: [{ id: "REQ-1", status: "passed" }],
  }, "state.json");
  assert.ok(snapshot.includes("机器权威仍是 state.json"));
  assert.ok(snapshot.includes("REQ-1: passed"));
  assert.ok(snapshot.includes("budget_left：8"));
});

test("buildPipelineSnapshot 英文语言跟随并显示本地化状态标签", () => {
  const snapshot = buildPipelineSnapshot({
    language: { code: "en", source: "text", confidence: "medium" },
    updatedAt: "2026-05-24T00:00:00.000Z",
    mode: { mode: "quick", runtimeAutopilot: true, loopShape: "autopilot" },
    budgets: { totalCycles: 2, remainingImplementationIterations: 8 },
    postChange: { status: "passed", command: "npm test" },
    validation: { finalVerifiability: "partially_verifiable" },
    requirements: [{ id: "REQ-1", status: "passed" }],
  }, "state.json");
  assert.ok(snapshot.includes("## Pipeline Runtime Snapshot"));
  assert.ok(snapshot.includes("This section is refreshed by fastcar-cli"));
  assert.ok(snapshot.includes("language：en"));
  assert.ok(snapshot.includes("REQ-1: passed (passed)"));
  assert.ok(!snapshot.includes("机器权威仍是 state.json"));
});

test("diagnose 模式 CLI 多轮端到端推进 reproduce/hypothesis/fix/regression", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--diagnose",
    "--goal",
    "fixture diagnose",
    "--session",
    "pipe-diagnose",
    "--json-progress",
    "--max-steps",
    "5",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_MODE_AWARE: "1",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  const focusTypes = events
    .filter((event) => event.event === "iteration_start")
    .map((event) => event.focus && event.focus.type);
  assert.deepStrictEqual(focusTypes, ["reproduce", "hypothesis_test", "fix_bug", "regression_check"]);
  assert.ok(events.some((event) => event.event === "pipeline_stopped" && event.reason === "no_focus"));

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-diagnose", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.diagnose.reproduceBaseline.status, "passed");
  assert.strictEqual(state.diagnose.hypothesisQueue[0].status, "supported");
  assert.strictEqual(state.diagnose.regressionCheckStatus, "passed");
  assert.strictEqual(state.requirements.find((item) => item.id === "REQ-BOOTSTRAP").status, "passed");
});

test("optimize 模式 CLI 多轮端到端推进 baseline/optimize/verify 后停止", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--optimize",
    "--goal",
    "fixture optimize",
    "--session",
    "pipe-optimize",
    "--json-progress",
    "--max-steps",
    "5",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_MODE_AWARE: "1",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  const focusTypes = events
    .filter((event) => event.event === "iteration_start")
    .map((event) => event.focus && event.focus.type);
  assert.deepStrictEqual(focusTypes, ["establish_baseline", "optimize", "verify_optimization"]);
  assert.ok(events.some((event) => event.event === "pipeline_stopped" && event.reason === "no_focus"));

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-optimize", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.baseline.status, "passed");
  assert.strictEqual(state.optimization.status, "passed");
  assert.strictEqual(state.optimization.metricComparison.status, "improved");
  assert.strictEqual(state.optimization.noImprovementStreak, 0);
});

test("Worker 集成矩阵：result.json 缺失时输出 missing_result_json", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "missing result",
    "--session",
    "missing-result",
    "--json-progress",
  ], {
    PIPELINE_WORKER_SKIP_RESULT: "1",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.ok(ndjson(result.stdout).some((event) => event.event === "error" && event.reason === "missing_result_json"));
});

test("Worker 集成矩阵：非零退出时输出 worker_failed", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "worker failed",
    "--session",
    "worker-failed",
    "--json-progress",
  ], {
    PIPELINE_WORKER_EXIT_CODE: "7",
  });
  assert.strictEqual(result.status, 7, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "agent_done" && event.exit_code === 7));
  assert.ok(events.some((event) => event.event === "error" && event.reason === "worker_failed"));
});

test("Worker 集成矩阵：超时时输出 agent_timeout 和 worker_failed", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "worker timeout",
    "--session",
    "worker-timeout",
    "--json-progress",
    "--step-timeout",
    "1",
  ], {
    PIPELINE_WORKER_SLEEP_MS: "3000",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "agent_done" && event.timed_out === true));
  assert.ok(events.some((event) => event.event === "agent_timeout"));
  assert.ok(events.some((event) => event.event === "error" && event.reason === "worker_failed"));
});

test("长时间 Worker 运行时输出 pipeline_progress 统计", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "worker progress",
    "--session",
    "worker-progress",
    "--json-progress",
    "--progress-interval",
    "1",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_SLEEP_MS: "1300",
    PIPELINE_WORKER_CHANGED_FILE: "",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  const progress = events.find((event) => event.event === "pipeline_progress");
  assert.ok(progress, "expected pipeline_progress heartbeat");
  assert.strictEqual(progress.stage, "worker_running");
  assert.strictEqual(progress.iter, 1);
  assert.strictEqual(progress.total_reqs, 1);
  assert.ok(progress.elapsed_ms >= 900);
  assert.ok(Object.prototype.hasOwnProperty.call(progress, "budget_left"));
  assert.ok(events.some((event) => event.event === "agent_done" && event.progress_heartbeats >= 1));
  assert.ok(events.some((event) => event.event === "state_merged" && event.progress && event.progress.total_reqs >= 1));
});

test("Worker 集成矩阵：非法 result.json 时输出 invalid_result_json", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "invalid result",
    "--session",
    "invalid-result",
    "--json-progress",
  ], {
    PIPELINE_WORKER_INVALID_RESULT: "1",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.ok(ndjson(result.stdout).some((event) => event.event === "error" && event.reason === "invalid_result_json"));
});

test("Worker 集成矩阵：Claude/Gemini/Cursor env template 可跑通 pipeline", () => {
  const matrix = [
    { agent: "claude", env: "AUTO_ITERATE_CLAUDE_CMD", session: "pipe-claude-template" },
    { agent: "gemini", env: "AUTO_ITERATE_GEMINI_CMD", session: "pipe-gemini-template" },
    { agent: "cursor", env: "AUTO_ITERATE_CURSOR_CMD", session: "pipe-cursor-template" },
  ];
  for (const item of matrix) {
    const projectDir = makeProject();
    const result = runCli(projectDir, [
      "--run",
      "--once",
      "--quick",
      "--agent",
      item.agent,
      "--goal",
      `${item.agent} template smoke`,
      "--session",
      item.session,
      "--json-progress",
      "--validate-cmd",
      `"${process.execPath}" -e "process.exit(0)"`,
    ], {
      [item.env]: `"${process.execPath}" "${workerPath}" "{result}" "{prompt}"`,
    });
    assert.strictEqual(result.status, 0, `agent=${item.agent}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    const events = ndjson(result.stdout);
    assert.ok(events.some((event) => event.event === "session_started" && event.agent === item.agent));
    assert.ok(events.some((event) => event.event === "validation_done" && event.status === "passed"));
    assert.ok(events.some((event) => event.event === "pipeline_stopped" && event.reason === "once_completed"));
  }
});

test("no_progress result 直接累加 noProgressStreak", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "fixture no progress",
    "--session",
    "pipe-no-progress",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_STATUS: "no_progress",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-no-progress", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.watchdog.noProgressStreak, 1);
});

test("plan 模式跳过 CLI 验证并记录 skipped_with_reason", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--plan-only",
    "--goal",
    "fixture plan",
    "--session",
    "pipe-plan",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(1)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "validation_done" && event.status === "skipped"));
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-plan", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.postChange.status, "skipped_with_reason");
  assert.strictEqual(state.postChange.reason, "skipped(plan_mode)");
});

test("need_decision 输出事件并以 42 退出", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "fixture decision",
    "--session",
    "pipe-decision",
    "--json-progress",
  ], {
    PIPELINE_WORKER_STATUS: "need_decision",
  });
  assert.strictEqual(result.status, 42, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "need_decision"));
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-decision", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.decisionRequest.status, "pending");
  assert.strictEqual(state.watchdog.requiredAction, "ask_user");
});

test("--answer resume 将 pending decision 写入 decisions 并续跑", () => {
  const projectDir = makeProject();
  const first = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "fixture answer",
    "--session",
    "pipe-answer",
    "--json-progress",
  ], {
    PIPELINE_WORKER_STATUS: "need_decision",
  });
  assert.strictEqual(first.status, 42, `STDOUT:\n${first.stdout}\nSTDERR:\n${first.stderr}`);

  const second = runCli(projectDir, [
    "--resume",
    "pipe-answer",
    "--run",
    "--once",
    "--quick",
    "--answer",
    "A",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ]);
  assert.strictEqual(second.status, 0, `STDOUT:\n${second.stdout}\nSTDERR:\n${second.stderr}`);
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-answer", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.decisionRequest.status, "approved");
  assert.strictEqual(state.decisionRequest.answer, "A");
  assert.strictEqual(state.decisions.lastAnswer, "A");
  assert.strictEqual(state.watchdog.requiredAction, "continue");
});

test("verify 模式默认禁止 worker 写文件，--allow-modify 可放行", () => {
  const blockedDir = makeProject();
  const blocked = runCli(blockedDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify write guard",
    "--session",
    "verify-guard",
    "--json-progress",
  ]);
  assert.strictEqual(blocked.status, 1, `STDOUT:\n${blocked.stdout}\nSTDERR:\n${blocked.stderr}`);
  assert.ok(ndjson(blocked.stdout).some((event) => event.event === "write_violation"));

  const allowedDir = makeProject();
  const allowed = runCli(allowedDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify allow modify",
    "--session",
    "verify-allow",
    "--allow-modify",
    "--json-progress",
  ]);
  assert.strictEqual(allowed.status, 0, `STDOUT:\n${allowed.stdout}\nSTDERR:\n${allowed.stderr}`);
});

test("write guard 允许 worker 报告本轮 result.json", () => {
  const projectDir = makeProject();
  const resultPath = ".agent-state/auto-iterate/result-allowed/iterations/1/result.json";
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "result file write guard",
    "--session",
    "result-allowed",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: resultPath,
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
});

test("--scope 阻止范围外文件", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "scope guard",
    "--session",
    "scope-guard",
    "--scope",
    "src/**",
    "--json-progress",
  ]);
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.ok(ndjson(result.stdout).some((event) => event.event === "write_violation"));
});

test("prototype 模式默认限制 prototype/** scope", () => {
  const projectDir = makeProject();
  const blocked = runCli(projectDir, [
    "--run",
    "--once",
    "--prototype",
    "--goal",
    "prototype default scope",
    "--session",
    "prototype-scope",
    "--json-progress",
  ]);
  assert.strictEqual(blocked.status, 1, `STDOUT:\n${blocked.stdout}\nSTDERR:\n${blocked.stderr}`);
  assert.ok(ndjson(blocked.stdout).some((event) => event.event === "write_violation"));

  const allowedDir = makeProject();
  const allowed = runCli(allowedDir, [
    "--run",
    "--once",
    "--prototype",
    "--goal",
    "prototype default scope allowed",
    "--session",
    "prototype-allowed",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "prototype/demo.md",
  });
  assert.strictEqual(allowed.status, 0, `STDOUT:\n${allowed.stdout}\nSTDERR:\n${allowed.stderr}`);
  assert.ok(ndjson(allowed.stdout).some((event) => event.event === "session_started" && event.scope === "prototype/**"));
});

test("auto-iterate help 展示 --scope", () => {
  const result = spawnSync(process.execPath, [cliPath, "auto-iterate", "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("--scope <glob[,glob]>"));
});

test("--isolate 在临时 worktree 运行并把 diff 合并回主工作区", () => {
  const projectDir = makeGitProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate",
    "--session",
    "isolate-run",
    "--isolate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_WRITE_FILE: "\nchanged in isolate\n",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "worktree_created"));
  assert.ok(events.some((event) => event.event === "worktree_merged"));
  assert.ok(events.some((event) => event.event === "worktree_cleaned"));
  assert.ok(fs.readFileSync(path.join(projectDir, "README.md"), "utf8").includes("changed in isolate"));
});

test("--isolate 合并冲突时保留 worktree 并记录 stop", () => {
  const projectDir = makeGitProject();
  fs.writeFileSync(path.join(projectDir, "README.md"), "# fixture main side\n", "utf8");
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate conflict",
    "--session",
    "isolate-conflict",
    "--isolate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_SET_FILE: "# fixture worker side\n",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  const error = events.find((event) => event.event === "error" && event.reason === "worktree_merge_failed");
  assert.ok(error, "expected worktree_merge_failed event");
  assert.ok(error.preserved_worktree, "expected preserved worktree path");
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "isolate-conflict", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.watchdog.requiredAction, "stop");
  assert.ok(state.isolate.conflictWorktree);
  assert.ok(fs.existsSync(state.isolate.conflictWorktree));
});

test("验证失败合并时同步 iterationPolicy.lastDecision，避免 strict schema 自相矛盾", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 2 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    iterationPolicy: {
      currentIterationGoal: "one",
      maxGoalsPerIteration: 1,
      maxChangedFiles: 8,
      maxDiffLines: 800,
      maxNoProgressIterations: 3,
      consecutiveFailureCount: 0,
      allowedFiles: [],
      stopConditions: [],
      rollbackPlan: [],
      lastDecision: "continue",
    },
    requirements: [{ id: "REQ-1", summary: "one", status: "pending" }],
  };
  const merged = mergeIterationIntoState(
    state,
    { status: "completed", summary: "done", files_changed: [], requirements: [] },
    { status: "failed", command: "npm test", exitCode: 7, summary: "baseline failing" },
    { iteration: 1, focus: { type: "extract_requirements", req_id: "REQ-BOOTSTRAP" } },
  ).state;
  assert.strictEqual(merged.deltaAssessment.status, "regression");
  assert.strictEqual(merged.deltaAssessment.decision, "retry_new_direction");
  assert.strictEqual(merged.iterationPolicy.lastDecision, "replan");
});

test("resume 时复用未合并的合法 result.json，避免重复启动会超时的 Worker", () => {
  const projectDir = makeProject();
  const first = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "resume reusable result",
    "--session",
    "resume-reuse",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(1)"`,
  ]);
  assert.strictEqual(first.status, 0, `STDOUT:\n${first.stdout}\nSTDERR:\n${first.stderr}`);

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "resume-reuse", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  state.budgets.totalCycles = 0;
  state.budgets.implementationIterationsUsed = 0;
  state.budgets.remainingImplementationIterations = 20;
  state.traceability.iterations = [];
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  const second = runCli(projectDir, [
    "--resume",
    "resume-reuse",
    "--run",
    "--once",
    "--quick",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
    "--step-timeout",
    "1",
  ], {
    PIPELINE_WORKER_SLEEP_MS: "3000",
  });
  assert.strictEqual(second.status, 0, `STDOUT:\n${second.stdout}\nSTDERR:\n${second.stderr}`);
  const events = ndjson(second.stdout);
  assert.ok(events.some((event) => event.event === "agent_result_reused"));
  assert.ok(!events.some((event) => event.event === "agent_timeout"));
});

async function main() {
  const failures = [];
  for (const item of tests) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      failures.push({ name: item.name, error });
      console.error(`✗ ${item.name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} test(s) failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${tests.length} test(s) passed.`);
}

main();
