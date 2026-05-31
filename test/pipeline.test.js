const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { pickNextFocus } = require("../dist/pipeline/pickFocus");
const { shouldStop, deliveryReady } = require("../dist/pipeline/shouldStop");
const { canFinalizeDelivery, finalizeDeliveryState } = require("../dist/pipeline/pipelineFinalization");
const { applyPhaseGateToState, checkPhaseGate } = require("../dist/pipeline/phaseGate");
const { mergeIterationIntoState } = require("../dist/pipeline/mergeState");
const { parseAndValidateIterationResult } = require("../dist/pipeline/resultSchema");
const { buildIterationPrompt } = require("../dist/pipeline/iterationPrompt");
const { buildDocs } = require("../dist/pipeline/deliveryDocs");
const { runPipeline, updateNoProgressState, needsValidationReconcile, buildDeliveryGate, buildPipelineSnapshot, parseValidationCommands, normalizeActualFilesChanged, getDirectorySignature } = require("../dist/pipeline/runPipeline");
const { evaluateWriteGuard, isInsideScope } = require("../dist/pipeline/writeGuard");
const { makeIsolatedWorktree } = require("../dist/pipeline/pipelineIsolateWorktree");

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

test("writeGuard scope 支持目录前缀和常用 glob", () => {
  assert.strictEqual(isInsideScope("src/a.ts", ["src"]), true);
  assert.strictEqual(isInsideScope("src/a.ts", ["src/"]), true);
  assert.strictEqual(isInsideScope("src2/a.ts", ["src"]), false);
  assert.strictEqual(isInsideScope("src/a.ts", ["src/**"]), true);
  assert.strictEqual(isInsideScope("src/nested/a.ts", ["src/**/*.ts"]), true);
  assert.strictEqual(isInsideScope("src/a.js", ["src/**/*.ts"]), false);
  assert.strictEqual(isInsideScope("README.md", ["*.md"]), true);
  assert.strictEqual(isInsideScope("docs/README.md", ["*.md"]), false);
  assert.strictEqual(isInsideScope("test/a.test.js", ["test/*.test.js"]), true);
  assert.strictEqual(isInsideScope("test/unit/a.test.js", ["test/*.test.js"]), false);
  assert.strictEqual(isInsideScope("docs/space file.md", ["docs/space file.md"]), true);
  assert.strictEqual(isInsideScope("../outside.ts", ["**"]), false);
  assert.strictEqual(isInsideScope("C:/tmp/outside.ts", ["**"]), false);
});

test("writeGuard 显式拒绝非法自报路径", () => {
  const result = evaluateWriteGuard({
    files_changed: ["src/ok.ts", "../outside.ts", "C:/tmp/outside.ts", { file: "src/object.ts" }],
  }, {
    mode: "quick",
    scope: "**",
  });
  assert.strictEqual(result.ok, false);
  assert.deepStrictEqual(result.filesChanged, ["src/ok.ts"]);
  assert.ok(result.issues.some((issue) =>
    issue.reason === "invalid_path" &&
    issue.files.includes("../outside.ts") &&
    issue.files.includes("C:/tmp/outside.ts") &&
    issue.files.includes("[object Object]")));
});

test("delivery gate 阻止仅因 requirements passed 就提前完成", () => {
  const notReady = {
    budgets: { remainingImplementationIterations: 1, totalCycles: 1 },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    validation: { finalVerifiability: "unknown" },
    deliveryEvidence: { status: "pending" },
    postChange: { status: "not_run", regressionDetected: false },
    postAgentValidationGate: { enabled: true, lastResult: "not_run" },
    requirements: [{ id: "REQ-1", summary: "done", status: "passed" }],
  };
  assert.strictEqual(shouldStop(notReady, null, {}, "quick").stop, false);
  const gate = buildDeliveryGate(notReady);
  assert.strictEqual(gate.ready, false);
  assert.ok(gate.blocking_reasons.includes("post_change_not_passed"));
  assert.ok(gate.blocking_reasons.includes("delivery_evidence_not_ready"));

  const ready = {
    ...notReady,
    watchdog: { requiredAction: "continue", deliveryVerifiability: "partially_verifiable" },
    validation: { finalVerifiability: "partially_verifiable" },
    deliveryEvidence: { status: "ready" },
    postChange: { status: "passed", regressionDetected: false },
    postAgentValidationGate: { enabled: true, lastResult: "passed", nextAction: "deliver" },
    cleanup: { status: "completed" },
    styleConsolidation: { status: "completed" },
    contextResetReview: { status: "passed" },
    skillCapture: { status: "captured" },
  };
  assert.strictEqual(shouldStop(ready, null, {}, "quick").reason, "delivery_ready");
  assert.strictEqual(shouldStop({
    ...ready,
    budgets: { remainingImplementationIterations: 0, totalCycles: 10 },
  }, null, {}, "quick").reason, "delivery_ready");

  assert.strictEqual(shouldStop({
    ...notReady,
    budgets: { remainingImplementationIterations: 0, totalCycles: 10 },
    watchdog: { requiredAction: "ask_user", deliveryVerifiability: "unknown" },
  }, null, {}, "quick").reason, "need_decision");

  const gateNotRun = {
    ...ready,
    postAgentValidationGate: { enabled: true, lastResult: "not_run", nextAction: "context_reset_and_repair" },
  };
  assert.strictEqual(shouldStop(gateNotRun, null, {}, "quick").stop, false);
  assert.ok(buildDeliveryGate(gateNotRun).blocking_reasons.includes("post_agent_gate_not_passed"));

  const gateMissing = {
    ...ready,
    postAgentValidationGate: undefined,
  };
  assert.strictEqual(shouldStop(gateMissing, null, {}, "quick").reason, "delivery_ready");
  assert.strictEqual(buildDeliveryGate(gateMissing).ready, true);
  assert.ok(!buildDeliveryGate(gateMissing).blocking_reasons.includes("post_agent_gate_not_passed"));

  const gateWrongAction = {
    ...ready,
    postAgentValidationGate: { enabled: true, lastResult: "passed", nextAction: "stop" },
  };
  assert.strictEqual(shouldStop(gateWrongAction, null, {}, "quick").stop, false);
  assert.ok(buildDeliveryGate(gateWrongAction).blocking_reasons.includes("post_agent_gate_not_passed"));

  const regression = {
    ...ready,
    postChange: { status: "failed", regressionDetected: true },
  };
  assert.strictEqual(shouldStop(regression, null, {}, "quick").stop, false);
  const regressionGate = buildDeliveryGate(regression);
  assert.ok(regressionGate.blocking_reasons.includes("post_change_not_passed"));
  assert.ok(regressionGate.blocking_reasons.includes("regression_detected"));

  const notVerifiable = {
    ...ready,
    validation: { finalVerifiability: "not_verifiable" },
  };
  assert.strictEqual(shouldStop(notVerifiable, null, {}, "quick").stop, false);
  assert.ok(buildDeliveryGate(notVerifiable).blocking_reasons.includes("not_verifiable"));

  const missingVerifiability = {
    ...ready,
    validation: {},
    watchdog: { requiredAction: "continue" },
  };
  assert.strictEqual(shouldStop(missingVerifiability, null, {}, "quick").stop, false);
  assert.strictEqual(deliveryReady(missingVerifiability), false);
  assert.ok(buildDeliveryGate(missingVerifiability).blocking_reasons.includes("unknown_verifiability"));

  const openRequirement = {
    ...ready,
    requirements: [{ id: "REQ-OPEN", summary: "still open", status: "implemented" }],
  };
  const openGate = buildDeliveryGate(openRequirement);
  assert.strictEqual(openGate.ready, false);
  assert.deepStrictEqual(openGate.open_requirements, ["REQ-OPEN"]);
  assert.ok(openGate.blocking_reasons.includes("open_requirements"));

  const blockedRequirement = {
    ...ready,
    requirements: [{ id: "REQ-BLOCKED", summary: "needs decision", status: "blocked" }],
  };
  const blockedGate = buildDeliveryGate(blockedRequirement);
  assert.strictEqual(blockedGate.ready, false);
  assert.deepStrictEqual(blockedGate.blocked_requirements, ["REQ-BLOCKED"]);
  assert.ok(blockedGate.blocking_reasons.includes("blocked_requirements"));

  const mixedRequirements = {
    ...ready,
    implementationContract: { status: "approved" },
    baseline: { status: "passed", allowsCoding: true },
    requirements: [
      { id: "REQ-BLOCKED", summary: "needs decision", status: "blocked" },
      { id: "REQ-OPEN", summary: "still open", status: "implemented" },
    ],
  };
  const mixedGate = buildDeliveryGate(mixedRequirements);
  assert.strictEqual(mixedGate.ready, false);
  assert.deepStrictEqual(mixedGate.blocked_requirements, ["REQ-BLOCKED"]);
  assert.deepStrictEqual(mixedGate.open_requirements, ["REQ-OPEN"]);
  assert.ok(mixedGate.blocking_reasons.includes("blocked_requirements"));
  assert.ok(mixedGate.blocking_reasons.includes("open_requirements"));
  assert.strictEqual(checkPhaseGate(mixedRequirements, { mode: "strict" }).reason, "blocked_requirements");
  assert.strictEqual(shouldStop(mixedRequirements, null, {}, "strict").reason, "requirements_blocked");

  const incompletePostAgentGates = {
    cleanupMissing: [{ ...ready, cleanup: { status: "pending" } }, "cleanup_not_completed"],
    styleMissing: [{ ...ready, styleConsolidation: { status: "pending" } }, "style_consolidation_pending"],
    contextMissing: [{ ...ready, contextResetReview: { status: "pending" } }, "context_reset_review_not_passed"],
    skillMissing: [{ ...ready, skillCapture: { status: "pending" } }, "skill_capture_pending"],
  };
  for (const [state, reason] of Object.values(incompletePostAgentGates)) {
    assert.strictEqual(deliveryReady(state), false);
    assert.strictEqual(shouldStop(state, null, {}, "quick").stop, false);
    assert.ok(buildDeliveryGate(state).blocking_reasons.includes(reason));
  }

  const optionalGatesMissing = {
    ...ready,
    postAgentValidationGate: undefined,
    cleanup: undefined,
    styleConsolidation: undefined,
    contextResetReview: undefined,
    skillCapture: undefined,
  };
  assert.strictEqual(deliveryReady(optionalGatesMissing), true);
  assert.strictEqual(shouldStop(optionalGatesMissing, null, {}, "quick").reason, "delivery_ready");
  assert.deepStrictEqual(buildDeliveryGate(optionalGatesMissing).blocking_reasons, []);
});

test("finalizeDeliveryState 不伪造未完成的交付门禁", () => {
  const base = {
    mode: { mode: "quick" },
    budgets: {
      remainingImplementationIterations: 2,
      validationHardeningIterationsUsed: 0,
      minimumValidationHardeningIterations: 2,
    },
    watchdog: {
      requiredAction: "continue",
      deliveryVerifiability: "partially_verifiable",
      validationHardeningStatus: "pending",
      validationHardeningDimensionsDone: [],
    },
    validation: { finalVerifiability: "partially_verifiable" },
    deliveryEvidence: { status: "ready" },
    postChange: { status: "passed", regressionDetected: false, command: "npm test" },
    postAgentValidationGate: { enabled: true, lastResult: "passed", nextAction: "deliver" },
    cleanup: { status: "completed" },
    styleConsolidation: { status: "pending" },
    contextResetReview: { status: "pending" },
    skillCapture: { status: "pending" },
    requirements: [{ id: "REQ-1", summary: "done", status: "passed" }],
  };
  assert.strictEqual(canFinalizeDelivery(base), false);
  const blocked = finalizeDeliveryState(base, { session: "finalize-safety", mode: "quick" });
  assert.strictEqual(blocked.changed, false);
  assert.strictEqual(blocked.state.styleConsolidation.status, "pending");
  assert.strictEqual(blocked.state.contextResetReview.status, "pending");
  assert.strictEqual(blocked.state.skillCapture.status, "pending");
  assert.strictEqual(blocked.state.budgets.validationHardeningIterationsUsed, 0);

  const ready = {
    ...base,
    budgets: {
      ...base.budgets,
      validationHardeningIterationsUsed: 2,
    },
    watchdog: {
      ...base.watchdog,
      validationHardeningStatus: "passed",
      validationHardeningDimensionsDone: ["boundary", "negative", "regression"],
    },
    styleConsolidation: { status: "completed" },
    contextResetReview: { status: "passed" },
    skillCapture: { status: "skipped_no_high_value" },
  };
  assert.strictEqual(canFinalizeDelivery(ready), true);
  const finalized = finalizeDeliveryState(ready, { session: "finalize-safety", mode: "quick" });
  assert.strictEqual(finalized.changed, true);
  assert.strictEqual(finalized.state.budgets.validationHardeningIterationsUsed, 2);
  assert.strictEqual(finalized.state.styleConsolidation.status, "completed");
  assert.strictEqual(finalized.state.contextResetReview.status, "passed");
  assert.strictEqual(finalized.state.skillCapture.status, "skipped_no_high_value");
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

test("phaseGate 输出协议级交付阻断原因", () => {
  const state = {
    mode: { mode: "quick" },
    implementationContract: { status: "approved" },
    baseline: { status: "passed", allowsCoding: true },
    requirements: [{ id: "REQ-1", status: "passed" }],
    budgets: { minimumValidationHardeningIterations: 1, validationHardeningIterationsUsed: 0 },
    watchdog: { validationHardeningStatus: "pending", deliveryVerifiability: "unknown" },
    validation: { finalVerifiability: "unknown" },
    postChange: { status: "not_run" },
    cleanup: { status: "pending" },
    styleConsolidation: { status: "pending" },
    contextResetReview: { status: "pending" },
    skillCapture: { status: "pending" },
    deliveryEvidence: { status: "pending" },
    postAgentValidationGate: { enabled: true, lastResult: "not_run", nextAction: "stop" },
  };
  const gate = checkPhaseGate(state, { mode: "quick" });

  assert.strictEqual(gate.phase, "validation");
  assert.strictEqual(gate.canProceed, false);
  assert.strictEqual(gate.reason, "delivery_blocked");
  for (const reason of [
    "validation_hardening_not_passed",
    "delivery_not_verifiable",
    "post_change_not_passed",
    "cleanup_not_completed",
    "style_consolidation_pending",
    "context_reset_review_not_passed",
    "skill_capture_pending",
    "delivery_evidence_not_ready",
    "post_agent_gate_not_passed",
  ]) {
    assert.ok(gate.blockingReasons.includes(reason), reason);
  }
});

test("phaseGate 同步更新结构化 gates 状态", () => {
  const state = {
    phaseGate: {
      currentPhase: "requirement",
      canProceed: false,
      blockingReasons: ["old"],
      gates: [
        { phase: "requirement", entryCriteria: ["r"], exitCriteria: ["r"], blockingRules: ["r"], status: "pending" },
        { phase: "contract", entryCriteria: ["c"], exitCriteria: ["c"], blockingRules: ["c"], status: "blocked" },
        { phase: "baseline", entryCriteria: [], exitCriteria: [], blockingRules: [], status: "blocked" },
        { phase: "coding", entryCriteria: [], exitCriteria: [], blockingRules: [], status: "blocked" },
        { phase: "validation", entryCriteria: [], exitCriteria: [], blockingRules: [], status: "blocked" },
        { phase: "cleanup", entryCriteria: [], exitCriteria: [], blockingRules: [], status: "blocked" },
        { phase: "delivery", entryCriteria: [], exitCriteria: [], blockingRules: [], status: "blocked" },
      ],
    },
  };
  const updated = applyPhaseGateToState(state, {
    phase: "validation",
    canProceed: false,
    reason: "delivery_blocked",
    blockingReasons: ["cleanup_not_completed"],
  });
  const byPhase = new Map(updated.phaseGate.gates.map((gate) => [gate.phase, gate.status]));

  assert.strictEqual(updated.phaseGate.currentPhase, "validation");
  assert.strictEqual(updated.phaseGate.canProceed, false);
  assert.deepStrictEqual(updated.phaseGate.blockingReasons, ["cleanup_not_completed"]);
  assert.strictEqual(byPhase.get("requirement"), "passed");
  assert.strictEqual(byPhase.get("contract"), "passed");
  assert.strictEqual(byPhase.get("baseline"), "passed");
  assert.strictEqual(byPhase.get("coding"), "passed");
  assert.strictEqual(byPhase.get("validation"), "pending");
  assert.strictEqual(byPhase.get("cleanup"), "blocked");
  assert.strictEqual(byPhase.get("delivery"), "blocked");
  assert.deepStrictEqual(updated.phaseGate.gates[1].entryCriteria, ["c"]);
});

test("phaseGate 全部通过时清空 blockingReasons 并标记 gates passed", () => {
  const updated = applyPhaseGateToState({ phaseGate: { gates: [] } }, {
    phase: "delivery",
    canProceed: true,
    reason: "requirements_closed",
    blockingReasons: [],
  });

  assert.strictEqual(updated.phaseGate.currentPhase, "delivery");
  assert.strictEqual(updated.phaseGate.canProceed, true);
  assert.deepStrictEqual(updated.phaseGate.blockingReasons, []);
  assert.ok(updated.phaseGate.gates.every((gate) => gate.status === "passed"));
});

test("phaseGate 阻断未批准 contract 或未建立 baseline 的编码推进", () => {
  const gate = checkPhaseGate({
    implementationContract: { status: "pending" },
    baseline: { status: "pending", allowsCoding: false },
    requirements: [{ id: "REQ-1", status: "pending" }],
  }, { mode: "quick" });

  assert.strictEqual(gate.phase, "contract");
  assert.strictEqual(gate.canProceed, false);
  assert.deepStrictEqual(gate.blockingReasons, [
    "implementation_contract_not_approved",
    "baseline_not_ready",
  ]);
});

test("phaseGate 在需求关闭后仍阻断缺失 contract 或 baseline", () => {
  const missingContract = checkPhaseGate({
    implementationContract: { status: "pending" },
    baseline: { status: "passed", allowsCoding: true },
    requirements: [{ id: "REQ-1", status: "passed" }],
  }, { mode: "quick" });
  const missingBaseline = checkPhaseGate({
    implementationContract: { status: "approved" },
    baseline: { status: "pending", allowsCoding: false },
    requirements: [{ id: "REQ-1", status: "passed" }],
  }, { mode: "quick" });

  assert.strictEqual(missingContract.phase, "contract");
  assert.strictEqual(missingContract.canProceed, false);
  assert.ok(missingContract.blockingReasons.includes("implementation_contract_not_approved"));
  assert.strictEqual(missingBaseline.phase, "baseline");
  assert.strictEqual(missingBaseline.canProceed, false);
  assert.ok(missingBaseline.blockingReasons.includes("baseline_not_ready"));
});

test("phaseGate 将 blocked requirements 映射为合法 delivery 阶段阻断", () => {
  const gate = checkPhaseGate({
    implementationContract: { status: "approved" },
    baseline: { status: "passed", allowsCoding: true },
    requirements: [{ id: "REQ-1", status: "blocked" }],
  }, { mode: "quick" });
  const updated = applyPhaseGateToState({ phaseGate: { gates: [] } }, gate);

  assert.strictEqual(gate.phase, "delivery");
  assert.strictEqual(gate.canProceed, false);
  assert.strictEqual(gate.reason, "blocked_requirements");
  assert.deepStrictEqual(gate.blockingReasons, ["blocked_requirements"]);
  assert.strictEqual(updated.phaseGate.currentPhase, "delivery");
  assert.strictEqual(updated.phaseGate.gates.find((item) => item.phase === "delivery").status, "pending");
});

test("mergeState 保留验证历史对象并区分实现预算", () => {
  const state = {
    budgets: { implementationIterationsUsed: 1, totalCycles: 2, remainingImplementationIterations: 3 },
    currentState: {},
    validation: { commands: [{ command: "npm test", result: "passed", iteration: 1 }, "npm run build"] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    requirements: [],
  };
  const planned = mergeIterationIntoState(
    state,
    { status: "completed", summary: "planned", files_changed: [], requirements: [], state_patch: { notes: [null, undefined, "note"] } },
    { status: "skipped", command: null, exitCode: null, summary: "plan" },
    { iteration: 2, focus: { type: "plan_once" }, mode: "plan" },
  ).state;
  assert.strictEqual(planned.budgets.implementationIterationsUsed, 1);
  assert.strictEqual(planned.budgets.remainingImplementationIterations, 3);
  assert.strictEqual(planned.budgets.nonImplementationIterationsUsed, 1);
  assert.ok(planned.validation.commands.some((item) => item && item.command === "npm test"));
  assert.deepStrictEqual(planned.notes, ["note"]);

  const implemented = mergeIterationIntoState(
    planned,
    { status: "completed", summary: "implemented", files_changed: [], requirements: [], state_patch: {} },
    { status: "passed", command: "node smoke.js", exitCode: 0, summary: "ok" },
    { iteration: 3, focus: { type: "implement_req", req_id: "REQ-1" }, mode: "quick" },
  ).state;
  assert.strictEqual(implemented.budgets.implementationIterationsUsed, 2);
  assert.strictEqual(implemented.budgets.remainingImplementationIterations, 2);
  assert.ok(implemented.validation.commands.some((item) => item && item.command === "node smoke.js"));
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

test("mergeState 对 traceability 和 documentation 使用有界历史", () => {
  const state = {
    budgets: { remainingImplementationIterations: 3 },
    currentState: {},
    validation: { commands: [] },
    watchdog: {},
    requirements: [],
    traceability: {
      policy: "public audit summaries only",
      iterations: Array.from({ length: 200 }, (_, index) => ({ iteration: index + 1, summary: `old-${index + 1}` })),
    },
    documentation: {
      apiChanges: Array.from({ length: 200 }, (_, index) => `api-${index + 1}`),
      architectureNotes: Array.from({ length: 200 }, (_, index) => `arch-${index + 1}`),
      implementationNotes: Array.from({ length: 200 }, (_, index) => `impl-${index + 1}`),
      changelogEntries: Array.from({ length: 200 }, (_, index) => `change-${index + 1}`),
    },
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "completed",
      summary: "new trace",
      files_changed: [],
      requirements: [],
      state_patch: {},
      documentation: {
        apiChanges: ["api-new"],
        architectureNotes: ["arch-new"],
        implementationNotes: ["impl-new"],
        changelogEntries: ["change-new"],
      },
    },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 201, focus: { type: "implement_req", req_id: "REQ-1" } },
  ).state;
  assert.strictEqual(merged.traceability.iterations.length, 200);
  assert.strictEqual(merged.traceability.iterations[0].iteration, 2);
  assert.strictEqual(merged.traceability.iterations[199].iteration, 201);
  assert.strictEqual(merged.documentation.apiChanges.length, 200);
  assert.strictEqual(merged.documentation.apiChanges[0], "api-2");
  assert.strictEqual(merged.documentation.apiChanges[199], "api-new");
  assert.strictEqual(merged.documentation.architectureNotes[0], "arch-2");
  assert.strictEqual(merged.documentation.implementationNotes[199], "impl-new");
  assert.strictEqual(merged.documentation.changelogEntries[199], "change-new");
});

test("mergeState 对 notes 和 diagnose 假设使用有界历史", () => {
  const state = {
    budgets: { remainingImplementationIterations: 3 },
    currentState: {},
    validation: { commands: [] },
    watchdog: {},
    requirements: [],
    notes: Array.from({ length: 200 }, (_, index) => `note-${index + 1}`),
    diagnose: {
      hypotheses: Array.from({ length: 200 }, (_, index) => `hyp-${index + 1}`),
      hypothesisQueue: Array.from({ length: 200 }, (_, index) => ({
        id: `H${index + 1}`,
        summary: `hyp-${index + 1}`,
        priority: index + 1,
        status: "pending",
        evidence: "",
      })),
    },
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "completed",
      summary: "new bounded state patch",
      files_changed: [],
      requirements: [],
      state_patch: {
        notes: ["note-new"],
        hypotheses: [{ id: "H-new", summary: "hyp-new", priority: 201 }],
      },
    },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 201, focus: { type: "hypothesis_test" }, mode: "diagnose" },
  ).state;

  assert.strictEqual(merged.notes.length, 200);
  assert.strictEqual(merged.notes[0], "note-2");
  assert.strictEqual(merged.notes[199], "note-new");
  assert.strictEqual(merged.diagnose.hypotheses.length, 200);
  assert.strictEqual(merged.diagnose.hypotheses[0], "hyp-2");
  assert.strictEqual(merged.diagnose.hypotheses[199], "hyp-new");
  assert.strictEqual(merged.diagnose.hypothesisQueue.length, 200);
  assert.strictEqual(merged.diagnose.hypothesisQueue[0].id, "H2");
  assert.strictEqual(merged.diagnose.hypothesisQueue[199].id, "H-new");
});

test("mergeState 新增诊断假设时生成唯一队列 ID", () => {
  const state = {
    budgets: { remainingImplementationIterations: 3 },
    currentState: {},
    validation: { commands: [] },
    watchdog: {},
    requirements: [],
    diagnose: {
      hypotheses: ["old"],
      hypothesisQueue: [
        { id: "H1", summary: "old", priority: 1, status: "pending", evidence: "" },
      ],
    },
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "completed",
      summary: "new hypotheses",
      files_changed: [],
      requirements: [],
      state_patch: {
        hypotheses: [
          { id: "H1", summary: "duplicate incoming id" },
          "string hypothesis",
        ],
      },
    },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "reproduce", req_id: null }, mode: "diagnose" },
  ).state;

  assert.deepStrictEqual(
    merged.diagnose.hypothesisQueue.map((item) => item.id),
    ["H1", "H2", "H3"],
  );
  assert.strictEqual(merged.diagnose.hypothesisQueue[1].summary, "duplicate incoming id");
  assert.strictEqual(merged.diagnose.hypothesisQueue[2].summary, "string hypothesis");
});

test("mergeState 不持久化 resultSchema 已脱敏的 Worker 敏感字段", () => {
  const state = {
    budgets: { remainingImplementationIterations: 3 },
    currentState: {},
    validation: { commands: [] },
    watchdog: {},
    requirements: [],
  };
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "done token=abc123",
    requirements: [{
      id: "REQ-SECRET",
      summary: "keep api_key=raw-key",
      status: "implemented",
      evidence: "password=raw-password",
    }],
    state_patch: {
      notes: ["secret=raw-note"],
      currentState: { currentTask: "authorization=raw-auth" },
    },
    risks: "risk token=raw-risk",
    trace: {
      rationaleSummary: "trace secret=raw-trace",
    },
    documentation: {
      implementationNotes: ["doc password=raw-doc"],
    },
  }));
  assert.strictEqual(parsed.valid, true);
  const merged = mergeIterationIntoState(
    state,
    parsed.result,
    { status: "passed", command: "node smoke.js", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "implement_req", req_id: "REQ-SECRET" }, mode: "quick" },
  ).state;
  const persisted = JSON.stringify(merged);
  assert.ok(!persisted.includes("abc123"));
  assert.ok(!persisted.includes("raw-key"));
  assert.ok(!persisted.includes("raw-password"));
  assert.ok(!persisted.includes("raw-note"));
  assert.ok(!persisted.includes("raw-auth"));
  assert.ok(!persisted.includes("raw-risk"));
  assert.ok(!persisted.includes("raw-trace"));
  assert.ok(!persisted.includes("raw-doc"));
  assert.ok(persisted.includes("[REDACTED]"));
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

test("extract_requirements bootstrap 通过 CLI 验证后关闭，避免重复选择同一 focus", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 4 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    requirements: [{ id: "REQ-BOOTSTRAP", summary: "bootstrap", status: "pending" }],
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "completed",
      summary: "bootstrap extracted",
      files_changed: [],
      requirements: [{ id: "REQ-BOOTSTRAP", summary: "bootstrap", status: "implemented" }],
      state_patch: {},
    },
    { status: "passed", command: "node smoke.js", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "extract_requirements", req_id: "REQ-BOOTSTRAP", summary: "bootstrap" } },
  ).state;

  assert.strictEqual(merged.requirements[0].status, "passed");
  assert.notStrictEqual(pickNextFocus(merged, null, "quick")?.type, "extract_requirements");
});

test("harden_validation 不会把已 passed 的 bootstrap 降级回 implemented", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 4 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    requirements: [{ id: "REQ-BOOTSTRAP", summary: "bootstrap", status: "passed", evidence: "done" }],
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "completed",
      summary: "hardened",
      files_changed: [],
      requirements: [{ id: "REQ-BOOTSTRAP", summary: "hardening", status: "implemented" }],
      state_patch: {},
    },
    { status: "passed", command: "node smoke.js", exitCode: 0, summary: "ok" },
    { iteration: 2, focus: { type: "harden_validation", req_id: null, summary: "harden" } },
  ).state;

  assert.strictEqual(merged.requirements[0].status, "passed");
  assert.strictEqual(merged.watchdog.validationHardeningStatus, "passed");
  assert.strictEqual(pickNextFocus(merged, null, "quick").type, "optimize");
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
  assert.deepStrictEqual(pickNextFocus(state, null, "diagnose"), {
    type: "hypothesis_test",
    req_id: "H1",
    summary: "验证诊断假设 H1: maybe cache",
  });
  const merged = mergeIterationIntoState(
    state,
    { status: "completed", summary: "cache excluded", files_changed: [], requirements: [], state_patch: {} },
    { status: "failed", command: "npm test", exitCode: 1, summary: "still fails" },
    { iteration: 1, focus: { type: "hypothesis_test", req_id: "H1" } },
  ).state;
  assert.strictEqual(merged.diagnose.hypothesisQueue[0].status, "rejected");
  assert.strictEqual(pickNextFocus(merged, null, "diagnose").type, "regression_check");
});

test("diagnose hypothesis_test 按 focus req_id 更新匹配假设", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 4 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    baseline: { status: "ready" },
    requirements: [],
    diagnose: {
      hypothesisQueue: [
        { id: "H1", summary: "wrong first", priority: 1, status: "pending", evidence: "" },
        { id: "H2", summary: "target", priority: 2, status: "pending", evidence: "" },
      ],
    },
  };
  const merged = mergeIterationIntoState(
    state,
    { status: "completed", summary: "target supported", files_changed: [], requirements: [], state_patch: {} },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "hypothesis_test", req_id: "H2" }, mode: "diagnose" },
  ).state;

  assert.strictEqual(merged.diagnose.hypothesisQueue[0].status, "pending");
  assert.strictEqual(merged.diagnose.hypothesisQueue[1].status, "supported");
  assert.strictEqual(merged.diagnose.hypothesisQueue[1].evidence, "target supported");
});

test("diagnose hypothesis_test 将 legacy hypotheses 物化为队列并逐条消费", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 4 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    baseline: { status: "ready" },
    requirements: [],
    diagnose: {
      hypotheses: ["first legacy", "second legacy"],
    },
  };

  assert.deepStrictEqual(pickNextFocus(state, null, "diagnose"), {
    type: "hypothesis_test",
    req_id: "H1",
    summary: "验证诊断假设 H1: first legacy",
  });

  const merged = mergeIterationIntoState(
    state,
    { status: "completed", summary: "first excluded", files_changed: [], requirements: [], state_patch: {} },
    { status: "failed", command: "npm test", exitCode: 1, summary: "still fails" },
    { iteration: 1, focus: { type: "hypothesis_test", req_id: "H1" }, mode: "diagnose" },
  ).state;

  assert.deepStrictEqual(
    merged.diagnose.hypothesisQueue.map((item) => [item.id, item.summary, item.status]),
    [
      ["H1", "first legacy", "rejected"],
      ["H2", "second legacy", "pending"],
    ],
  );
  assert.deepStrictEqual(pickNextFocus(merged, null, "diagnose"), {
    type: "hypothesis_test",
    req_id: "H2",
    summary: "验证诊断假设 H2: second legacy",
  });
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

test("verify_optimization 缺少可比指标时也推进 noImprovementStreak", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 5 },
    currentState: {},
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    baseline: { status: "ready" },
    requirements: [],
    optimization: {
      status: "implemented",
      baselineMetrics: [],
      pendingMetrics: [],
      noImprovementStreak: 2,
      maxNoImprovementIterations: 3,
    },
  };
  const merged = mergeIterationIntoState(
    state,
    { status: "completed", summary: "no comparable metrics", files_changed: [], requirements: [], state_patch: {} },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "verify_optimization", req_id: null } },
  ).state;
  assert.strictEqual(merged.optimization.metricComparison.status, "unknown");
  assert.strictEqual(merged.optimization.noImprovementStreak, 3);
  assert.strictEqual(merged.optimization.stopReason, "no_improvement");
});

test("parse 后的 optimizationMetrics 保持数值类型并参与性能比较", () => {
  const state = {
    baseline: { status: "ready" },
    optimization: {
      status: "implemented",
      baselineMetrics: [{ name: "duration", value: 100, unit: "ms", direction: "lower_is_better", source: "bench" }],
      noImprovementStreak: 0,
    },
    budgets: { remainingOptimizationIterations: 2 },
    currentState: {},
    validation: { commands: [] },
    watchdog: {},
    requirements: [],
  };
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "verified token=secret",
    state_patch: {
      optimizationMetrics: [
        { name: "duration", value: 80, unit: "ms", direction: "lower_is_better", source: "bench" },
      ],
    },
  }));
  assert.strictEqual(parsed.valid, true);
  const merged = mergeIterationIntoState(
    state,
    parsed.result,
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "verify_optimization" }, mode: "optimize" },
  ).state;
  assert.strictEqual(merged.optimization.postMetrics[0].value, 80);
  assert.strictEqual(typeof merged.optimization.postMetrics[0].value, "number");
  assert.strictEqual(merged.optimization.metricComparison.status, "improved");
});

test("Worker claimed passed 但 CLI 验证失败时需要 reconcile 并降级 REQ", () => {
  assert.strictEqual(needsValidationReconcile({
    requirements: [{ id: "REQ-1", status: "passed" }],
  }, { status: "failed" }), true);
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 2 },
    currentState: {},
    validation: { commands: [], finalVerifiability: "partially_verifiable" },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "partially_verifiable" },
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
  assert.strictEqual(merged.state.validation.finalVerifiability, "unknown");
  assert.strictEqual(merged.state.watchdog.deliveryVerifiability, "unknown");
  assert.strictEqual(merged.state.deltaAssessment.status, "regression");
  assert.strictEqual(merged.state.deltaAssessment.decision, "retry_new_direction");
});

test("Worker 顶层失败时即使 CLI 验证通过也不得推进交付状态", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 2 },
    currentState: {},
    validation: { commands: [], finalVerifiability: "partially_verifiable" },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "partially_verifiable" },
    deliveryEvidence: { status: "ready" },
    postAgentValidationGate: { enabled: true, lastResult: "passed", nextAction: "deliver" },
    requirements: [{ id: "REQ-1", summary: "old", status: "pending", type: "验证", relatedFiles: [], evidence: "无", blockedReason: "无", nextStep: "无" }],
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "failed",
      summary: "worker could not finish",
      files_changed: [],
      requirements: [{ id: "REQ-1", status: "passed", evidence: "worker claimed despite failure" }],
      state_patch: {
        deliveryEvidence: { status: "ready", summary: "worker attempted delivery" },
      },
    },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "implement_req", req_id: "REQ-1" } },
  );
  assert.strictEqual(merged.state.requirements[0].status, "implemented");
  assert.strictEqual(merged.state.postChange.status, "failed");
  assert.strictEqual(merged.state.postChange.regressionDetected, true);
  assert.strictEqual(merged.state.validation.finalVerifiability, "unknown");
  assert.strictEqual(merged.state.watchdog.deliveryVerifiability, "unknown");
  assert.strictEqual(merged.state.currentState.lastValidationResult, "failed");
  assert.strictEqual(buildDeliveryGate(merged.state).ready, false);
});

test("mergeState 禁止 Worker 通过 state_patch 推进 deliveryEvidence 权威状态", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 2 },
    currentState: {},
    validation: { commands: [], finalVerifiability: "unknown" },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    deliveryEvidence: { status: "pending", changes: "none" },
    postAgentValidationGate: { enabled: true, lastResult: "not_run", nextAction: "context_reset_and_repair" },
    requirements: [{ id: "REQ-1", summary: "old", status: "pending", type: "验证", relatedFiles: [], evidence: "无", blockedReason: "无", nextStep: "无" }],
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "completed",
      summary: "worker attempted delivery evidence",
      files_changed: [],
      requirements: [{ id: "REQ-1", status: "implemented", evidence: "worker implementation evidence" }],
      state_patch: {
        deliveryEvidence: {
          status: "ready",
          goal: "worker should not own this",
          changes: "worker summary",
          validationSummary: "worker observed validation",
        },
      },
    },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "implement_req", req_id: "REQ-1" } },
  );
  assert.strictEqual(merged.state.deliveryEvidence.status, "pending");
  assert.strictEqual(merged.state.deliveryEvidence.goal, undefined);
  assert.strictEqual(merged.state.deliveryEvidence.changes, "worker summary");
  assert.strictEqual(merged.state.deliveryEvidence.validationSummary, "worker observed validation");
  assert.ok(merged.issues.some((issue) => issue.includes("deliveryEvidence 字段: status")));
  assert.ok(merged.issues.some((issue) => issue.includes("deliveryEvidence 字段: goal")));
});

test("mergeState 禁止 Worker 通过 state_patch 写入 currentState 权威或未知字段", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 2 },
    currentState: {
      currentPhase: "coding",
      currentTask: "old task",
      nextAction: "old next action",
      overallStatus: "in_progress",
      recentChanges: "old changes",
      keyFiles: "old files",
      lastValidationCommand: "not_run",
      lastValidationResult: "not_run",
    },
    validation: { commands: [] },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    requirements: [{ id: "REQ-1", summary: "old", status: "pending", type: "验证", relatedFiles: [], evidence: "无", blockedReason: "无", nextStep: "无" }],
  };
  const merged = mergeIterationIntoState(
    state,
    {
      status: "completed",
      summary: "worker summary",
      files_changed: [],
      requirements: [{ id: "REQ-1", status: "implemented", evidence: "worker implementation evidence" }],
      state_patch: {
        currentState: {
          currentTask: "worker focus summary",
          recentChanges: "worker change summary",
          keyFiles: "src/a.js",
          nextAction: "deliver now",
          overallStatus: "completed",
          lastValidationResult: "passed",
          arbitraryWorkerField: "state bloat",
        },
      },
    },
    { status: "passed", command: "npm test", exitCode: 0, summary: "ok" },
    { iteration: 1, focus: { type: "implement_req", req_id: "REQ-1" } },
  );
  assert.strictEqual(merged.state.currentState.currentTask, "implement_req:REQ-1");
  assert.strictEqual(merged.state.currentState.recentChanges, "worker summary");
  assert.strictEqual(merged.state.currentState.keyFiles, "未报告");
  assert.strictEqual(merged.state.currentState.nextAction, "由 CLI 选择下一轮 focus");
  assert.strictEqual(merged.state.currentState.overallStatus, "in_progress");
  assert.strictEqual(merged.state.currentState.lastValidationResult, "passed");
  assert.strictEqual(merged.state.currentState.arbitraryWorkerField, undefined);
  assert.ok(merged.issues.some((issue) => issue.includes("currentState 字段: nextAction")));
  assert.ok(merged.issues.some((issue) => issue.includes("currentState 字段: overallStatus")));
  assert.ok(merged.issues.some((issue) => issue.includes("currentState 字段: arbitraryWorkerField")));
});

test("mergeState 保留验证配置命令并对历史对象使用有界历史", () => {
  const state = {
    budgets: { implementationIterationsUsed: 0, totalCycles: 0, remainingImplementationIterations: 2 },
    currentState: {},
    validation: {
      commands: [
        "npm test",
        { command: "npm run lint", note: "configuration object" },
        ...Array.from({ length: 200 }, (_, index) => ({
          command: `node old-${index + 1}.js`,
          result: "passed",
          iteration: index + 1,
        })),
      ],
    },
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    requirements: [],
  };
  const merged = mergeIterationIntoState(
    state,
    { status: "completed", summary: "validated", files_changed: [], requirements: [], state_patch: {} },
    { status: "passed", command: "node new.js", exitCode: 0, summary: "ok" },
    { iteration: 201, focus: { type: "implement_req", req_id: "REQ-1" } },
  ).state;
  assert.strictEqual(merged.validation.commands.length, 202);
  assert.strictEqual(merged.validation.commands[0], "npm test");
  assert.deepStrictEqual(merged.validation.commands[1], { command: "npm run lint", note: "configuration object" });
  assert.strictEqual(merged.validation.commands[2].command, "node old-2.js");
  assert.strictEqual(merged.validation.commands[201].command, "node new.js");
  assert.deepStrictEqual(parseValidationCommands(merged), ["npm test", "npm run lint"]);
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

test("runPipeline 启动阶段 state schema 失败时停止且不进入迭代", async () => {
  const projectDir = makeProject();
  const stateDir = path.join(projectDir, ".agent-state", "auto-iterate", "startup-schema-fail");
  fs.mkdirSync(stateDir, { recursive: true });
  const stateJsonPath = path.join(stateDir, "state.json");
  const stateMdPath = path.join(stateDir, "state.md");
  const state = {
    schemaVersion: 1,
    session: {
      session: "startup-schema-fail",
      stateJsonFile: ".agent-state/auto-iterate/startup-schema-fail/state.json",
      stateFile: ".agent-state/auto-iterate/startup-schema-fail/state.md",
      promptFile: ".agent-state/auto-iterate/startup-schema-fail/start-prompt.md",
      currentFile: ".agent-state/auto-iterate-current.json",
    },
    mode: { mode: "quick", runtimeAutopilot: true, loopShape: "autopilot" },
    budgets: { totalCycles: 0, remainingImplementationIterations: 1 },
    currentState: {},
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    validation: { commands: [] },
    requirements: [{ id: "REQ-1", summary: "one", status: "pending" }],
  };
  fs.writeFileSync(stateJsonPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.writeFileSync(stateMdPath, "# state\n", "utf8");
  const events = [];
  const originalWrite = process.stdout.write;
  process.exitCode = 0;
  process.stdout.write = (chunk, encoding, callback) => {
    events.push(JSON.parse(String(chunk)));
    if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    const result = await runPipeline({
      session: "startup-schema-fail",
      stateJsonPath,
      projectRoot: projectDir,
      mode: "quick",
      once: true,
      jsonProgress: true,
      validateStateModel() {
        return [{ severity: "error", message: "startup schema invalid" }];
      },
    });
    assert.strictEqual(result.reason, "state_schema_failed");
    assert.strictEqual(process.exitCode, 1);
    assert.ok(events.some((event) => event.event === "error" && event.reason === "state_schema_failed"));
    assert.ok(!events.some((event) => event.event === "session_started"));
    assert.ok(!fs.existsSync(path.join(stateDir, "iterations")), "iteration dir should not be created");
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = 0;
  }
});

test("state.md 刷新失败只降级为 warning，不阻断 state.json 权威写入", async () => {
  const projectDir = makeProject();
  const stateDir = path.join(projectDir, ".agent-state", "auto-iterate", "state-md-refresh-warning");
  const statePath = path.join(stateDir, "state.json");
  fs.mkdirSync(path.join(stateDir, "state.md"), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({
    mode: { mode: "quick" },
    budgets: { totalCycles: 0, remainingImplementationIterations: 1 },
    requirements: [{ id: "REQ-BOOTSTRAP", summary: "warning", status: "pending" }],
    watchdog: { requiredAction: "continue" },
    phaseGate: { currentPhase: "coding" },
    validation: { commands: [] },
  }), "utf8");
  const events = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk, encoding, callback) => {
    events.push(JSON.parse(String(chunk)));
    if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    const result = await runPipeline({
      projectRoot: projectDir,
      session: "state-md-refresh-warning",
      stateJsonPath: statePath,
      once: true,
      jsonProgress: true,
      validateStateModel() {
        return [];
      },
      adapter: {
        id: "inline",
        async run({ resultPath }) {
          await fs.promises.writeFile(resultPath, JSON.stringify({
            status: "completed",
            summary: "ok",
            files_changed: [],
            requirements: [{ id: "REQ-BOOTSTRAP", status: "passed", evidence: "inline worker" }],
          }), "utf8");
          return { command: "inline", status: 0, stdout: "", stderr: "" };
        },
      },
    });
    assert.strictEqual(result.reason, "once_completed");
    assert.ok(events.some((event) => event.event === "warning" && event.reason === "state_markdown_refresh_failed"));
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.strictEqual(state.postChange.status, "not_run");
    assert.strictEqual(state.requirements[0].status, "implemented");
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = 0;
  }
});

test("write violation 后 state schema 失败时优先停止为 state_schema_failed", async () => {
  const projectDir = makeProject();
  const stateDir = path.join(projectDir, ".agent-state", "auto-iterate", "write-violation-schema-fail");
  fs.mkdirSync(stateDir, { recursive: true });
  const stateJsonPath = path.join(stateDir, "state.json");
  fs.writeFileSync(stateJsonPath, `${JSON.stringify({
    schemaVersion: 1,
    session: { session: "write-violation-schema-fail" },
    mode: { mode: "verify", runtimeAutopilot: true, loopShape: "autopilot" },
    budgets: { totalCycles: 0, remainingImplementationIterations: 1 },
    currentState: {},
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    validation: { commands: [] },
    requirements: [{ id: "REQ-1", summary: "one", status: "pending" }],
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(stateDir, "state.md"), "# state\n", "utf8");
  const events = [];
  const originalWrite = process.stdout.write;
  process.exitCode = 0;
  process.stdout.write = (chunk, encoding, callback) => {
    events.push(JSON.parse(String(chunk)));
    if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    const result = await runPipeline({
      session: "write-violation-schema-fail",
      stateJsonPath,
      projectRoot: projectDir,
      mode: "verify",
      once: true,
      jsonProgress: true,
      adapter: {
        id: "fixture",
        async run({ resultPath }) {
          fs.writeFileSync(path.join(projectDir, "README.md"), "changed\n", "utf8");
          fs.writeFileSync(resultPath, `${JSON.stringify({
            status: "completed",
            summary: "changed in verify mode",
            files_changed: ["README.md"],
          })}\n`, "utf8");
          return { status: 0, stdout: "", stderr: "", command: "fixture" };
        },
      },
      validateStateModel(state) {
        return state.watchdog && state.watchdog.requiredAction === "stop"
          ? [{ severity: "error", message: "write violation state invalid" }]
          : [];
      },
    });
    assert.strictEqual(result.reason, "state_schema_failed");
    assert.strictEqual(process.exitCode, 1);
    assert.ok(events.some((event) => event.event === "write_violation"));
    assert.ok(events.some((event) => event.event === "error" && event.reason === "state_schema_failed"));
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = 0;
  }
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
  assert.strictEqual(stateMerged.req_status["REQ-BOOTSTRAP"], "passed");
  assert.strictEqual(stateMerged.budget_left, 10);

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
  assert.ok(stateMd.includes("budget_left：10"));
  assert.ok(fs.existsSync(path.join(projectDir, ".agent-state", "auto-iterate", "pipe-once", "iterations", "1", "prompt.md")));
  assert.ok(fs.existsSync(path.join(projectDir, ".agent-state", "auto-iterate", "pipe-once", "iterations", "1", "validation.log")));
});

test("--run 支持多个 --validate-cmd 并全部执行", () => {
  const projectDir = makeProject();
  const marker = path.join(projectDir, "validation-order.txt");
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "multi validate commands",
    "--session",
    "pipe-multi-validate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "require('fs').appendFileSync('validation-order.txt','1')"`,
    "--validate-cmd",
    `"${process.execPath}" -e "require('fs').appendFileSync('validation-order.txt','2')"`,
  ]);
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.strictEqual(fs.readFileSync(marker, "utf8"), "12");

  const events = ndjson(result.stdout);
  assert.ok(events.some((event) =>
    event.event === "validation_done" &&
    event.status === "passed" &&
    event.command.includes("validation-order.txt")));
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-multi-validate", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.postChange.status, "passed");
  assert.strictEqual(state.postChange.perCommand.length, 2);
  const history = state.validation.commands.filter((item) =>
    item && typeof item === "object" && String(item.command || "").includes("validation-order.txt"));
  assert.strictEqual(history.length, 2);
  assert.ok(history.every((item) => item.result === "passed" && item.iteration === 1));
});

test("--run 多个 --validate-cmd 在首个失败后停止并记录已执行历史", () => {
  const projectDir = makeProject();
  const marker = path.join(projectDir, "validation-stop.txt");
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "multi validate stop",
    "--session",
    "pipe-multi-validate-fail",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "require('fs').appendFileSync('validation-stop.txt','1')"`,
    "--validate-cmd",
    `"${process.execPath}" -e "require('fs').appendFileSync('validation-stop.txt','2'); process.exit(7)"`,
    "--validate-cmd",
    `"${process.execPath}" -e "require('fs').appendFileSync('validation-stop.txt','3')"`,
  ]);
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.strictEqual(fs.readFileSync(marker, "utf8"), "12");

  const events = ndjson(result.stdout);
  assert.ok(events.some((event) =>
    event.event === "validation_done" &&
    event.status === "failed" &&
    event.exit_code === 7));
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-multi-validate-fail", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.postChange.status, "failed");
  assert.strictEqual(state.postChange.perCommand.length, 2);
  assert.deepStrictEqual(state.postChange.perCommand.map((item) => item.status), ["passed", "failed"]);
  assert.ok(state.postChange.perCommand.every((item) => !item.command.includes("validation-stop.txt','3")));
  const history = state.validation.commands.filter((item) =>
    item && typeof item === "object" && String(item.command || "").includes("validation-stop.txt"));
  assert.strictEqual(history.length, 2);
  assert.deepStrictEqual(history.map((item) => item.result), ["passed", "failed"]);
});

test("--validate-state 拒绝多命令验证历史与 postChange 不一致", () => {
  const projectDir = makeProject();
  const session = "invalid-validation-state";
  const created = runCli(projectDir, [
    "--quick",
    "--goal",
    "invalid validation state",
    "--session",
    session,
    "--yes",
  ]);
  assert.strictEqual(created.status, 0, `STDOUT:\n${created.stdout}\nSTDERR:\n${created.stderr}`);

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", session, "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  state.validation.commands = [
    { command: "", result: "passed", iteration: 0 },
    { command: "npm test", result: "maybe" },
  ];
  state.postChange.status = "passed";
  state.postChange.command = "npm test";
  state.postChange.result = "0";
  state.postChange.reason = "corrupted fixture";
  state.postChange.perCommand = [
    { command: "npm test", status: "failed", exitCode: 1, signal: "none", error: "none" },
  ];
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  const validation = runCli(projectDir, [
    "--validate-state",
    session,
    "--strict-state",
  ]);
  assert.strictEqual(validation.status, 1, `STDOUT:\n${validation.stdout}\nSTDERR:\n${validation.stderr}`);
  assert.ok(validation.stdout.includes("state.json.validation.commands[0].command"));
  assert.ok(validation.stdout.includes("state.json.validation.commands[0].iteration"));
  assert.ok(validation.stdout.includes("state.json.validation.commands[1].result"));
  assert.ok(validation.stdout.includes("postChange.status=passed"));
});

test("--validate-state 允许未执行验证配置对象但继续校验历史对象", () => {
  const projectDir = makeProject();
  const session = "validation-config-object";
  const created = runCli(projectDir, [
    "--quick",
    "--goal",
    "validation config object",
    "--session",
    session,
    "--yes",
  ]);
  assert.strictEqual(created.status, 0, `STDOUT:\n${created.stdout}\nSTDERR:\n${created.stderr}`);

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", session, "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  state.validation.commands = [
    { command: "npm test", note: "configuration object" },
    { command: "npm run build", result: "passed", iteration: 1 },
  ];
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  const validation = runCli(projectDir, [
    "--validate-state",
    session,
    "--strict-state",
  ]);
  assert.strictEqual(validation.status, 0, `STDOUT:\n${validation.stdout}\nSTDERR:\n${validation.stderr}`);

  state.validation.commands = [
    { command: "npm test", note: "configuration object" },
    { command: "npm run build", result: "maybe", iteration: 1 },
  ];
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const invalid = runCli(projectDir, [
    "--validate-state",
    session,
    "--strict-state",
  ]);
  assert.strictEqual(invalid.status, 1, `STDOUT:\n${invalid.stdout}\nSTDERR:\n${invalid.stderr}`);
  assert.ok(invalid.stdout.includes("state.json.validation.commands[1].result"));
});

test("--run 无 mode flag 时默认 quick 且不进入交互 prompt", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--goal",
    "default run mode",
    "--session",
    "run-default-mode",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.ok(!result.stdout.includes("请选择 auto-iterate 启动模式"));
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "session_started" && event.mode === "quick"));
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "run-default-mode", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.mode.mode, "quick");
});

test("--run --autopilot 不会自动伪造未完成的交付门禁", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--autopilot",
    "--quick",
    "--goal",
    "one command delivery",
    "--session",
    "one-command-delivery",
    "--json-progress",
    "--autopilot-max-iterations",
    "3",
    "--max-steps",
    "3",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(!events.some((event) =>
    event.event === "delivery_gate" &&
    event.reason === "delivery_ready" &&
    event.ready === true));
  assert.ok(events.some((event) => event.event === "pipeline_stopped" && event.reason !== "delivery_ready"));

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "one-command-delivery", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.requirements.find((item) => item.id === "REQ-BOOTSTRAP").status, "passed");
  assert.strictEqual(state.deliveryEvidence.status, "pending");
  assert.notStrictEqual(state.cleanup.status, "completed");
  assert.strictEqual(state.styleConsolidation.status, "pending");
  assert.strictEqual(state.contextResetReview.status, "pending");
  assert.notStrictEqual(state.postAgentValidationGate.nextAction, "deliver");
  assert.strictEqual(state.skillCapture.status, "pending");

  const validation = runCli(projectDir, [
    "--validate-state",
    "one-command-delivery",
    "--strict-state",
  ]);
  assert.strictEqual(validation.status, 0, `STDOUT:\n${validation.stdout}\nSTDERR:\n${validation.stderr}`);
  assert.ok(validation.stdout.includes("交付前不得声称完整完成"));
});

test("runPipeline 在启动即 delivery_ready 时会先执行 finalize 收口", async () => {
  const projectDir = makeProject();
  const stateDir = path.join(projectDir, ".agent-state", "auto-iterate", "startup-delivery-ready");
  fs.mkdirSync(stateDir, { recursive: true });
  const statePath = path.join(stateDir, "state.json");
  fs.writeFileSync(statePath, JSON.stringify({
    mode: { mode: "quick", runtimeAutopilot: true, loopShape: "autopilot" },
    session: { session: "startup-delivery-ready" },
    budgets: { totalCycles: 0, remainingImplementationIterations: 1, remainingValidationHardeningIterations: 1, minimumValidationHardeningIterations: 1, validationHardeningIterationsUsed: 1 },
    currentState: {},
    watchdog: {
      requiredAction: "continue",
      deliveryVerifiability: "verifiable",
      validationHardeningStatus: "passed",
      validationHardeningDimensionsDone: ["boundary", "negative", "regression"],
    },
    validation: { finalVerifiability: "verifiable", commands: [] },
    requirements: [{ id: "REQ-BOOTSTRAP", summary: "done", status: "passed" }],
    deliveryEvidence: {
      status: "ready",
      goal: "startup delivery ready",
      changes: "ready",
      validationSummary: "passed",
      baselineComparison: "baseline",
      cleanupSummary: "cleanup",
      risks: "有限风险：外部验证不在本轮范围内",
      unfinishedItems: "无",
      userConfirmation: "无需额外确认",
    },
    postChange: { status: "passed", regressionDetected: false, command: "validate", reason: "ok" },
    postAgentValidationGate: { enabled: true, lastResult: "passed", nextAction: "deliver" },
    cleanup: { status: "completed" },
    styleConsolidation: { status: "completed" },
    contextResetReview: { status: "passed" },
    skillCapture: { status: "captured" },
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(stateDir, "state.md"), "# state\n", "utf8");
  const events = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      events.push(JSON.parse(text));
    }
    return true;
  };
  try {
    const { runPipeline } = require("../dist/pipeline/runPipeline");
    const result = await runPipeline({
      projectRoot: projectDir,
      session: "startup-delivery-ready",
      stateJsonPath: statePath,
      mode: "quick",
      once: false,
      jsonProgress: true,
      autopilotRun: true,
      adapter: {
        id: "inline",
        async run() {
          throw new Error("worker should not run when delivery is already ready");
        },
      },
      validateStateModel() {
        return [];
      },
    });

    assert.strictEqual(result.reason, "delivery_ready");
    assert.ok(events.some((event) => event.event === "delivery_gate" && event.reason === "delivery_ready"));
    assert.ok(events.some((event) => event.event === "pipeline_stopped" && event.reason === "delivery_ready"));
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.strictEqual(state.phaseGate.currentPhase, "delivery");
    assert.strictEqual(state.phaseGate.canProceed, true);
    assert.deepStrictEqual(state.phaseGate.blockingReasons, []);
    assert.strictEqual(state.currentState.currentPhase, "delivery_ready");
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = 0;
  }
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

test("optimize 模式只用实际优化轮次消耗 remainingOptimizationIterations", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--optimize",
    "--goal",
    "fixture optimize budget",
    "--session",
    "pipe-optimize-budget",
    "--json-progress",
    "--max-iterations",
    "1",
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

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-optimize-budget", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.budgets.implementationIterationsUsed, 0);
  assert.strictEqual(state.budgets.optimizationIterationsUsed, 1);
  assert.strictEqual(state.budgets.nonImplementationIterationsUsed, 2);
  assert.strictEqual(state.budgets.remainingImplementationIterations, 1);
  assert.strictEqual(state.budgets.remainingOptimizationIterations, 0);
  assert.strictEqual(state.optimization.status, "passed");
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
  const state = JSON.parse(fs.readFileSync(path.join(projectDir, ".agent-state", "auto-iterate", "missing-result", "state.json"), "utf8"));
  assert.strictEqual(state.postChange.status, "failed");
  assert.strictEqual(state.postChange.command, "read result.json");
  assert.strictEqual(state.currentState.lastValidationResult, "failed");
  assert.strictEqual(state.watchdog.requiredAction, "stop");
  assert.strictEqual(state.validation.finalVerifiability, "unknown");
  assert.strictEqual(state.deltaAssessment.decision, "stop");
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
  const state = JSON.parse(fs.readFileSync(path.join(projectDir, ".agent-state", "auto-iterate", "worker-failed", "state.json"), "utf8"));
  assert.strictEqual(state.postChange.status, "failed");
  assert.ok(state.postChange.command.includes("pipeline-worker.js"));
  assert.strictEqual(state.postChange.result, "7");
  assert.strictEqual(state.currentState.lastValidationResult, "failed");
  assert.strictEqual(state.watchdog.deliveryVerifiability, "unknown");
  assert.strictEqual(state.iterationPolicy.lastDecision, "stop");
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
    PIPELINE_WORKER_SLEEP_MS: "7000",
    PIPELINE_WORKER_SKIP_RESULT: "1",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "agent_done" && event.timed_out === true));
  assert.ok(events.some((event) => event.event === "agent_timeout"));
  assert.ok(events.some((event) => event.event === "worker_timeout_warning"));
  assert.ok(events.some((event) => event.event === "error" && event.reason === "worker_failed"));
  assert.ok(fs.existsSync(path.join(projectDir, ".agent-state", "auto-iterate", "worker-timeout", "iterations", "1", "timeout-warning.json")));
});

test("Worker 集成矩阵：无输出超时时输出 inactive timeout", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "worker inactivity timeout",
    "--session",
    "worker-inactivity-timeout",
    "--json-progress",
    "--step-timeout",
    "10",
    "--inactivity-timeout",
    "5",
  ], {
    PIPELINE_WORKER_SLEEP_MS: "7000",
    PIPELINE_WORKER_SKIP_RESULT: "1",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "agent_done" && event.timed_out === true));
  assert.ok(events.some((event) => event.event === "error" && event.reason === "worker_failed" && /inactive|timed out/.test(String(event.detail))));
});

test("Worker 集成矩阵：result.json 有效时主动停止挂起 Worker 并继续合并", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "worker result then stop",
    "--session",
    "worker-result-then-stop",
    "--json-progress",
    "--step-timeout",
    "10",
    "--inactivity-timeout",
    "5",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "",
    PIPELINE_WORKER_STDOUT: "fixture worker produced output before writing result",
    PIPELINE_WORKER_SLEEP_AFTER_RESULT: "1",
    PIPELINE_WORKER_SLEEP_MS: "7000",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "agent_done" && event.timed_out === false));
  assert.ok(!events.some((event) => event.event === "agent_timeout"));
  assert.ok(!events.some((event) => event.event === "agent_result_recovered"));
  assert.ok(!events.some((event) => event.event === "error" && event.reason === "worker_failed"));
  assert.ok(events.some((event) => event.event === "validation_done" && event.status === "passed"));

  const state = JSON.parse(fs.readFileSync(path.join(
    projectDir,
    ".agent-state",
    "auto-iterate",
    "worker-result-then-stop",
    "state.json",
  ), "utf8"));
  assert.strictEqual(state.postChange.status, "passed");
  assert.strictEqual(state.watchdog.requiredAction, "continue");
});

test("Worker 集成矩阵：持续输出不会触发 inactivity timeout", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "worker active output",
    "--session",
    "worker-active-output",
    "--json-progress",
    "--step-timeout",
    "0",
    "--inactivity-timeout",
    "1",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_TICK_COUNT: "5",
    PIPELINE_WORKER_TICK_INTERVAL_MS: "300",
    PIPELINE_WORKER_CHANGED_FILE: "",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "worker_output" && event.summary.includes("fixture tick")));
  assert.ok(!events.some((event) => event.event === "agent_timeout"));
});

test("Worker 集成矩阵：CLI 可显式关闭 inactivity timeout", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "worker disabled inactivity timeout",
    "--session",
    "worker-disabled-inactivity-timeout",
    "--json-progress",
    "--step-timeout",
    "0",
    "--inactivity-timeout",
    "0",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_SLEEP_MS: "1200",
    PIPELINE_WORKER_CHANGED_FILE: "",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  const started = events.find((event) => event.event === "worker_started");
  assert.ok(started);
  assert.strictEqual(started.timeout_ms, null);
  assert.strictEqual(started.inactivity_timeout_ms, null);
  assert.ok(!events.some((event) => event.event === "agent_timeout"));
});

test("Worker 集成矩阵：CLI 可显式关闭 validation timeout", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "validation disabled timeout",
    "--session",
    "validation-disabled-timeout",
    "--json-progress",
    "--step-timeout",
    "0",
    "--inactivity-timeout",
    "0",
    "--validation-timeout",
    "0",
    "--validate-cmd",
    `"${process.execPath}" -e "setTimeout(()=>process.exit(0), 120)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "validation_done" && event.status === "passed"));
});

test("Worker 集成矩阵：adapter 内部异常转为 worker_failed", async () => {
  const projectDir = makeProject();
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "adapter-throws", "state.json");
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({
    mode: { mode: "quick" },
    budgets: { totalCycles: 0, remainingImplementationIterations: 1 },
    requirements: [{ id: "REQ-BOOTSTRAP", summary: "throw", status: "pending" }],
    watchdog: { requiredAction: "continue" },
    phaseGate: { currentPhase: "coding" },
    validation: { commands: [] },
  }), "utf8");
  const { runPipeline } = require("../dist/pipeline/runPipeline");
  const events = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    events.push(JSON.parse(String(chunk).trim()));
    return true;
  };
  try {
    const result = await runPipeline({
      projectRoot: projectDir,
      session: "adapter-throws",
      stateJsonPath: statePath,
      once: true,
      jsonProgress: true,
      adapter: {
        id: "thrower",
        run() {
          throw new Error("adapter exploded");
        },
      },
    });
    assert.strictEqual(result.reason, "worker_failed");
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = 0;
  }
  assert.ok(events.some((event) => event.event === "error" && event.reason === "worker_failed" && event.detail === "adapter exploded"));
});

test("Worker 集成矩阵：adapter 缺失 prompt 文件输出结构化 prompt_file_missing", async () => {
  const projectDir = makeProject();
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "adapter-missing-prompt", "state.json");
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({
    mode: { mode: "quick" },
    budgets: { totalCycles: 0, remainingImplementationIterations: 1 },
    requirements: [{ id: "REQ-BOOTSTRAP", summary: "missing prompt", status: "pending" }],
    watchdog: { requiredAction: "continue" },
    phaseGate: { currentPhase: "coding" },
    validation: { commands: [] },
  }), "utf8");
  const { runPipeline } = require("../dist/pipeline/runPipeline");
  const { runCodexAdapter } = require("../dist/adapters/codex");
  const events = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    events.push(JSON.parse(String(chunk).trim()));
    return true;
  };
  try {
    const result = await runPipeline({
      projectRoot: projectDir,
      session: "adapter-missing-prompt",
      stateJsonPath: statePath,
      once: true,
      jsonProgress: true,
      adapter: {
        id: "codex",
        run(options) {
          fs.rmSync(options.promptPath, { force: true });
          return runCodexAdapter(options);
        },
      },
    });
    assert.strictEqual(result.reason, "worker_failed");
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = 0;
  }
  assert.ok(events.some((event) => event.event === "error"
    && event.reason === "prompt_file_missing"
    && String(event.detail || "").includes("prompt_file_missing")
    && String(event.path || "").endsWith("prompt.md")));
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
    PIPELINE_WORKER_STDOUT: "fixture progress stdout",
    PIPELINE_WORKER_STDERR: "fixture progress stderr",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "worker_started" && event.iter === 1));
  assert.ok(events.some((event) => event.event === "worker_output" && event.stream === "stdout" && event.summary.includes("fixture progress stdout")));
  assert.ok(events.some((event) => event.event === "worker_output" && event.stream === "stderr" && event.summary.includes("fixture progress stderr")));
  const progress = events.find((event) => event.event === "pipeline_progress");
  assert.ok(progress, "expected pipeline_progress heartbeat");
  assert.strictEqual(progress.stage, "worker_running");
  assert.strictEqual(progress.iter, 1);
  assert.strictEqual(progress.total_reqs, 1);
  assert.ok(progress.elapsed_ms >= 900);
  assert.ok(Object.prototype.hasOwnProperty.call(progress, "last_activity_ms"));
  assert.ok(Object.prototype.hasOwnProperty.call(progress, "stdout_bytes"));
  assert.ok(Object.prototype.hasOwnProperty.call(progress, "stderr_bytes"));
  assert.ok(Object.prototype.hasOwnProperty.call(progress, "budget_left"));
  assert.ok(events.some((event) => event.event === "agent_done" && event.progress_heartbeats >= 1 && event.stdout_bytes > 0 && event.stderr_bytes > 0));
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
  const state = JSON.parse(fs.readFileSync(path.join(projectDir, ".agent-state", "auto-iterate", "invalid-result", "state.json"), "utf8"));
  assert.strictEqual(state.postChange.status, "failed");
  assert.strictEqual(state.postChange.command, "validate result.json");
  assert.ok(state.postChange.reason.includes("JSON"));
  assert.strictEqual(state.watchdog.requiredAction, "stop");
  assert.strictEqual(state.deltaAssessment.postChangeRef, "pipelineExecution");
});

test("Worker 集成矩阵：非法 files_changed 路径时输出 invalid_result_json", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "invalid files changed",
    "--session",
    "worker-invalid-files-changed",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "",
    PIPELINE_WORKER_FILES_CHANGED_JSON: JSON.stringify(["../outside.js"]),
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "error" &&
    event.reason === "invalid_result_json" &&
    event.errors.some((item) => item.includes("files_changed"))));
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

test("worker failed result 不得因 CLI 验证通过而写成 postChange passed", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "fixture failed worker result",
    "--session",
    "pipe-worker-result-failed",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_STATUS: "failed",
    PIPELINE_WORKER_REQ_STATUS: "passed",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-worker-result-failed", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.postChange.status, "failed");
  assert.strictEqual(state.postChange.regressionDetected, true);
  assert.strictEqual(state.validation.finalVerifiability, "unknown");
  assert.strictEqual(state.watchdog.deliveryVerifiability, "unknown");
  assert.strictEqual(state.currentState.lastValidationResult, "failed");
  assert.strictEqual(state.requirements.find((item) => item.id === "REQ-BOOTSTRAP").status, "implemented");
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

test("--no-validate 仍写入 validation.log 说明验证未运行", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "no validate evidence",
    "--session",
    "no-validate-evidence",
    "--json-progress",
    "--no-validate",
  ]);
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const logPath = path.join(projectDir, ".agent-state", "auto-iterate", "no-validate-evidence", "iterations", "1", "validation.log");
  assert.ok(fs.existsSync(logPath));
  const log = fs.readFileSync(logPath, "utf8");
  assert.ok(log.includes("status: not_run"));
  assert.ok(log.includes("command: none"));
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

test("strict 模式 need_decision 可写入 pending 并以 42 退出", () => {
  const projectDir = makeProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--strict",
    "--goal",
    "strict fixture decision",
    "--session",
    "strict-pipe-decision",
    "--json-progress",
  ], {
    PIPELINE_WORKER_STATUS: "need_decision",
  });
  assert.strictEqual(result.status, 42, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "need_decision"));
  assert.ok(!events.some((event) => event.event === "error" && event.reason === "state_schema_failed"));
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "strict-pipe-decision", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.taskProfile.needsUserConfirmation, true);
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

test("strict 模式 --answer 先批准 pending decision 再执行 resume strict 门禁", () => {
  const projectDir = makeProject();
  const first = runCli(projectDir, [
    "--run",
    "--once",
    "--strict",
    "--goal",
    "strict fixture answer",
    "--session",
    "strict-pipe-answer",
    "--json-progress",
  ], {
    PIPELINE_WORKER_STATUS: "need_decision",
  });
  assert.strictEqual(first.status, 42, `STDOUT:\n${first.stdout}\nSTDERR:\n${first.stderr}`);

  const second = runCli(projectDir, [
    "--resume",
    "strict-pipe-answer",
    "--run",
    "--once",
    "--strict",
    "--answer",
    "A",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ]);
  assert.strictEqual(second.status, 0, `STDOUT:\n${second.stdout}\nSTDERR:\n${second.stderr}`);
  const events = ndjson(second.stdout);
  assert.ok(events.some((event) => event.event === "worker_started"));
  assert.ok(!events.some((event) => event.event === "error" && event.reason === "pipeline_start_failed"));
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "strict-pipe-answer", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.taskProfile.needsUserConfirmation, true);
  assert.strictEqual(state.decisionRequest.status, "approved");
  assert.strictEqual(state.decisionRequest.answer, "A");
  assert.strictEqual(state.decisions.lastAnswer, "A");
});

test("--answer 拒绝不在 pending decision options 中的答案", () => {
  const projectDir = makeProject();
  const first = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "fixture invalid answer",
    "--session",
    "pipe-invalid-answer",
    "--json-progress",
  ], {
    PIPELINE_WORKER_STATUS: "need_decision",
  });
  assert.strictEqual(first.status, 42, `STDOUT:\n${first.stdout}\nSTDERR:\n${first.stderr}`);

  const second = runCli(projectDir, [
    "--resume",
    "pipe-invalid-answer",
    "--run",
    "--once",
    "--quick",
    "--answer",
    "Z",
    "--json-progress",
  ]);
  assert.strictEqual(second.status, 1, `STDOUT:\n${second.stdout}\nSTDERR:\n${second.stderr}`);
  const events = ndjson(second.stdout);
  assert.ok(events.some((event) => event.event === "error" && event.reason === "invalid_decision_answer"));
  assert.ok(!events.some((event) => event.event === "worker_started"));

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-invalid-answer", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.decisionRequest.status, "pending");
  assert.strictEqual(state.decisionRequest.answer, null);
  assert.notStrictEqual(state.decisions.lastAnswer, "Z");
  assert.strictEqual(state.watchdog.requiredAction, "ask_user");
});

test("--answer 在 state schema 失败时不落盘污染 pending decision", () => {
  const projectDir = makeProject();
  const first = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "fixture answer schema blocked",
    "--session",
    "pipe-answer-schema-blocked",
    "--json-progress",
  ], {
    PIPELINE_WORKER_STATUS: "need_decision",
  });
  assert.strictEqual(first.status, 42, `STDOUT:\n${first.stdout}\nSTDERR:\n${first.stderr}`);

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-answer-schema-blocked", "state.json");
  const before = JSON.parse(fs.readFileSync(statePath, "utf8"));
  before.requirements[0].status = "finished";
  fs.writeFileSync(statePath, `${JSON.stringify(before, null, 2)}\n`, "utf8");

  const second = runCli(projectDir, [
    "--resume",
    "pipe-answer-schema-blocked",
    "--run",
    "--once",
    "--quick",
    "--answer",
    "A",
    "--json-progress",
  ]);
  assert.strictEqual(second.status, 1, `STDOUT:\n${second.stdout}\nSTDERR:\n${second.stderr}`);
  const events = ndjson(second.stdout);
  assert.ok(events.some((event) => event.event === "error" && event.reason === "state_schema_failed"));
  assert.ok(!events.some((event) => event.event === "worker_started"));

  const after = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(after.requirements[0].status, "finished");
  assert.strictEqual(after.decisionRequest.status, "pending");
  assert.strictEqual(after.decisionRequest.answer, null);
  assert.notStrictEqual(after.decisions.lastAnswer, "A");
  assert.strictEqual(after.watchdog.requiredAction, "ask_user");
});

test("--answer 在无 pending decision 时不污染 state", () => {
  const projectDir = makeProject();
  const first = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "fixture answer ignored",
    "--session",
    "pipe-answer-ignored",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ]);
  assert.strictEqual(first.status, 0, `STDOUT:\n${first.stdout}\nSTDERR:\n${first.stderr}`);
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "pipe-answer-ignored", "state.json");
  const before = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(before.decisionRequest.status, "not_needed");

  const second = runCli(projectDir, [
    "--resume",
    "pipe-answer-ignored",
    "--run",
    "--once",
    "--quick",
    "--answer",
    "A",
    "--json-progress",
  ]);
  assert.strictEqual(second.status, 0, `STDOUT:\n${second.stdout}\nSTDERR:\n${second.stderr}`);
  const after = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(after.decisionRequest.status, "not_needed");
  assert.notStrictEqual(after.decisions.lastAnswer, "A");
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

test("write guard 使用 git 实际变更阻止漏报写文件", () => {
  const projectDir = makeGitProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify unreported write",
    "--session",
    "verify-unreported-write",
    "--json-progress",
  ], {
    PIPELINE_WORKER_WRITE_FILE: "\nunreported write\n",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("README.md")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "mode_write_forbidden" && issue.files.includes("README.md"))));
});

test("write guard 使用 git 实际变更阻止漏报已脏文件二次修改", () => {
  const projectDir = makeGitProject();
  fs.appendFileSync(path.join(projectDir, "README.md"), "\npreexisting dirty\n", "utf8");

  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify dirty unreported write",
    "--session",
    "verify-dirty-unreported-write",
    "--json-progress",
  ], {
    PIPELINE_WORKER_WRITE_FILE: "\nworker extra dirty\n",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("README.md")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "mode_write_forbidden" && issue.files.includes("README.md"))));
});

test("write guard 使用 git -z 实际审计支持带空格路径", () => {
  const projectDir = makeGitProject();
  fs.mkdirSync(path.join(projectDir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "docs", "space file.md"), "tracked\n", "utf8");
  let result = spawnSync("git", ["add", "."], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync("git", [
    "-c",
    "user.name=FastCar Test",
    "-c",
    "user.email=fastcar-test@example.invalid",
    "commit",
    "-m",
    "space path",
  ], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  fs.appendFileSync(path.join(projectDir, "docs", "space file.md"), "\npreexisting dirty\n", "utf8");

  const cliResult = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify space path unreported write",
    "--session",
    "verify-space-path-unreported-write",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "docs/space file.md",
    PIPELINE_WORKER_WRITE_FILE: "\nworker extra dirty\n",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(cliResult.status, 1, `STDOUT:\n${cliResult.stdout}\nSTDERR:\n${cliResult.stderr}`);
  const events = ndjson(cliResult.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("docs/space file.md")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "mode_write_forbidden" && issue.files.includes("docs/space file.md"))));
});

test("normalizeActualFilesChanged 过滤非法路径并忽略内部产物", () => {
  const actual = normalizeActualFilesChanged(
    [
      "./README.md",
      "src\\inside.ts",
      "../outside.ts",
      "C:/tmp/outside.ts",
      ".agent-state/auto-iterate/s/iterations/1/result.json",
      "src/inside.ts",
    ],
    new Set([".agent-state/auto-iterate/s/iterations/1/result.json"]),
  );
  assert.deepStrictEqual(actual, ["README.md", "src/inside.ts"]);
});

test("write guard 使用 git 实际变更阻止漏报 ignored 文件", () => {
  const projectDir = makeGitProject();
  fs.writeFileSync(path.join(projectDir, ".gitignore"), "logs/\n", "utf8");
  let result = spawnSync("git", ["add", ".gitignore"], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync("git", [
    "-c",
    "user.name=FastCar Test",
    "-c",
    "user.email=fastcar-test@example.invalid",
    "commit",
    "-m",
    "ignore logs",
  ], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);

  const cliResult = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify ignored unreported write",
    "--session",
    "verify-ignored-unreported-write",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "logs/ignored.log",
    PIPELINE_WORKER_SET_FILE: "ignored write",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(cliResult.status, 1, `STDOUT:\n${cliResult.stdout}\nSTDERR:\n${cliResult.stderr}`);
  const events = ndjson(cliResult.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("logs/")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "mode_write_forbidden" && issue.files.includes("logs/"))));
});

test("write guard 使用 git 实际变更阻止漏报已有 ignored 文件二次修改", () => {
  const projectDir = makeGitProject();
  fs.writeFileSync(path.join(projectDir, ".gitignore"), "logs/\n", "utf8");
  let result = spawnSync("git", ["add", ".gitignore"], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync("git", [
    "-c",
    "user.name=FastCar Test",
    "-c",
    "user.email=fastcar-test@example.invalid",
    "commit",
    "-m",
    "ignore logs",
  ], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  fs.mkdirSync(path.join(projectDir, "logs"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "logs", "ignored.log"), "preexisting ignored\n", "utf8");

  const cliResult = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify existing ignored unreported write",
    "--session",
    "verify-existing-ignored-unreported-write",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "logs/ignored.log",
    PIPELINE_WORKER_SET_FILE: "worker changed ignored",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(cliResult.status, 1, `STDOUT:\n${cliResult.stdout}\nSTDERR:\n${cliResult.stderr}`);
  const events = ndjson(cliResult.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("logs/")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "mode_write_forbidden" && issue.files.includes("logs/"))));
});

test("write guard 对大型 ignored 文件使用有界摘要并阻止漏报", () => {
  const projectDir = makeGitProject();
  fs.writeFileSync(path.join(projectDir, ".gitignore"), "logs/\n", "utf8");
  let result = spawnSync("git", ["add", ".gitignore"], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync("git", [
    "-c",
    "user.name=FastCar Test",
    "-c",
    "user.email=fastcar-test@example.invalid",
    "commit",
    "-m",
    "ignore logs",
  ], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  fs.mkdirSync(path.join(projectDir, "logs"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "logs", "large.log"), "a".repeat(6 * 1024 * 1024), "utf8");

  const cliResult = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify large ignored unreported write",
    "--session",
    "verify-large-ignored-unreported-write",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "logs/large.log",
    PIPELINE_WORKER_WRITE_FILE: "worker changed ignored",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(cliResult.status, 1, `STDOUT:\n${cliResult.stdout}\nSTDERR:\n${cliResult.stderr}`);
  const events = ndjson(cliResult.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("logs/")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "mode_write_forbidden" && issue.files.includes("logs/"))));
});

test("write guard 对大量 ignored 文件使用 bounded 摘要且仍发现二次修改", () => {
  const projectDir = makeGitProject();
  fs.writeFileSync(path.join(projectDir, ".gitignore"), "logs/\n", "utf8");
  let result = spawnSync("git", ["add", ".gitignore"], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync("git", [
    "-c",
    "user.name=FastCar Test",
    "-c",
    "user.email=fastcar-test@example.invalid",
    "commit",
    "-m",
    "ignore many logs",
  ], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  fs.mkdirSync(path.join(projectDir, "logs"), { recursive: true });
  for (let index = 0; index < 1005; index += 1) {
    fs.writeFileSync(path.join(projectDir, "logs", `ignored-${index}.log`), `ignored ${index}\n`, "utf8");
  }

  const cliResult = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify many ignored unreported write",
    "--session",
    "verify-many-ignored-unreported-write",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "logs/ignored-1004.log",
    PIPELINE_WORKER_SET_FILE: "worker changed many ignored",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(cliResult.status, 1, `STDOUT:\n${cliResult.stdout}\nSTDERR:\n${cliResult.stderr}`);
  const events = ndjson(cliResult.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("logs/")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "mode_write_forbidden" && issue.files.includes("logs/"))));
});

test("getDirectorySignature 超过阈值后使用 bounded metadata 摘要", () => {
  const projectDir = makeProject();
  const logsDir = path.join(projectDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  for (let index = 0; index < 1005; index += 1) {
    fs.writeFileSync(path.join(logsDir, `ignored-${index}.log`), `ignored ${index}\n`, "utf8");
  }
  const signature = getDirectorySignature(projectDir, logsDir, "!!");
  assert.ok(signature.startsWith("!!:directory:bounded:1005:"));
  assert.ok(signature.includes(":metadata:"));
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

test("write guard 的 git 实际审计忽略 CLI 内部迭代产物", () => {
  const projectDir = makeGitProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify internal audit",
    "--session",
    "verify-internal-audit",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(!events.some((event) => event.event === "write_violation"));
  assert.ok(!events.some((event) => event.event === "write_audit"));
});

test("write guard 展开 ignored .agent-state 目录并允许本轮 result.json 实际写入", () => {
  const projectDir = makeGitProject();
  const session = "verify-internal-result-directory-audit";
  const resultPath = `.agent-state/auto-iterate/${session}/iterations/1/result.json`;
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify internal result directory audit",
    "--session",
    session,
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: resultPath,
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(!events.some((event) => event.event === "write_violation"));
  assert.ok(!events.some((event) => event.event === "write_audit" &&
    event.actual_files.includes(".agent-state/auto-iterate/")));
});

test("write guard 允许本轮 adapter 内部辅助产物", () => {
  const projectDir = makeGitProject();
  const session = "verify-internal-adapter-artifacts";
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify internal adapter artifacts",
    "--session",
    session,
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: `.agent-state/auto-iterate/${session}/iterations/1/codex-prompt.md`,
    PIPELINE_WORKER_SET_FILE: "adapter prompt",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(!events.some((event) => event.event === "write_violation"));
  assert.ok(!events.some((event) => event.event === "write_audit" &&
    event.actual_files.includes(".agent-state/auto-iterate/")));
});

test("write guard 的 git 实际审计阻止 worker 篡改其它内部迭代产物", () => {
  const projectDir = makeGitProject();
  const foreignLog = path.join(projectDir, ".agent-state", "auto-iterate", "other-session", "iterations", "99", "worker.log");
  fs.mkdirSync(path.dirname(foreignLog), { recursive: true });
  fs.writeFileSync(foreignLog, "original\n", "utf8");

  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--verify",
    "--goal",
    "verify foreign internal audit",
    "--session",
    "verify-foreign-internal-audit",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: ".agent-state/auto-iterate/other-session/iterations/99/worker.log",
    PIPELINE_WORKER_WRITE_FILE: "tampered\n",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  const file = ".agent-state/auto-iterate/other-session/iterations/99/worker.log";
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes(file)));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "mode_write_forbidden" && issue.files.includes(file))));
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

test("--scope 支持常用 glob 匹配", () => {
  const allowedDir = makeProject();
  const allowed = runCli(allowedDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "scope glob allow markdown",
    "--session",
    "scope-glob-allow",
    "--scope",
    "*.md",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "README.md",
  });
  assert.strictEqual(allowed.status, 0, `STDOUT:\n${allowed.stdout}\nSTDERR:\n${allowed.stderr}`);

  const blockedDir = makeProject();
  const blocked = runCli(blockedDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "scope glob block nested markdown",
    "--session",
    "scope-glob-block",
    "--scope",
    "*.md",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "docs/README.md",
  });
  assert.strictEqual(blocked.status, 1, `STDOUT:\n${blocked.stdout}\nSTDERR:\n${blocked.stderr}`);
  assert.ok(ndjson(blocked.stdout).some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "scope_violation" && issue.files.includes("docs/README.md"))));
});

test("--scope 保留路径中的空格", () => {
  const allowedDir = makeProject();
  const allowed = runCli(allowedDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "scope spaced path allow",
    "--session",
    "scope-spaced-path-allow",
    "--scope",
    "docs/space file.md",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "docs/space file.md",
  });
  assert.strictEqual(allowed.status, 0, `STDOUT:\n${allowed.stdout}\nSTDERR:\n${allowed.stderr}`);

  const blockedDir = makeProject();
  const blocked = runCli(blockedDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "scope spaced path block",
    "--session",
    "scope-spaced-path-block",
    "--scope",
    "docs/space file.md",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "README.md",
  });
  assert.strictEqual(blocked.status, 1, `STDOUT:\n${blocked.stdout}\nSTDERR:\n${blocked.stderr}`);
  assert.ok(ndjson(blocked.stdout).some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "scope_violation" && issue.files.includes("README.md"))));
});

test("--scope 支持多 scope 列表并保留路径空格", () => {
  const spacedDir = makeProject();
  const spaced = runCli(spacedDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "scope list spaced path",
    "--session",
    "scope-list-spaced-path",
    "--scope",
    "docs/space file.md,src/**",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "docs/space file.md",
  });
  assert.strictEqual(spaced.status, 0, `STDOUT:\n${spaced.stdout}\nSTDERR:\n${spaced.stderr}`);

  const globDir = makeProject();
  const glob = runCli(globDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "scope list glob path",
    "--session",
    "scope-list-glob-path",
    "--scope",
    "docs/space file.md,src/**",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "src/nested/file.ts",
  });
  assert.strictEqual(glob.status, 0, `STDOUT:\n${glob.stdout}\nSTDERR:\n${glob.stderr}`);
});

test("--scope 使用 git 实际变更阻止漏报越界文件", () => {
  const projectDir = makeGitProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "scope unreported write",
    "--session",
    "scope-unreported-write",
    "--scope",
    "src/**",
    "--json-progress",
  ], {
    PIPELINE_WORKER_WRITE_FILE: "\nunreported out of scope\n",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("README.md")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "scope_violation" && issue.files.includes("README.md"))));
});

test("--scope 使用 git 实际变更阻止漏报已脏越界文件二次修改", () => {
  const projectDir = makeGitProject();
  fs.appendFileSync(path.join(projectDir, "README.md"), "\npreexisting out of scope dirty\n", "utf8");

  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "scope dirty unreported write",
    "--session",
    "scope-dirty-unreported-write",
    "--scope",
    "src/**",
    "--json-progress",
  ], {
    PIPELINE_WORKER_WRITE_FILE: "\nworker extra out of scope dirty\n",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("README.md")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "scope_violation" && issue.files.includes("README.md"))));
});

test("--scope 使用 git 实际变更阻止漏报 ignored 越界文件", () => {
  const projectDir = makeGitProject();
  fs.writeFileSync(path.join(projectDir, ".gitignore"), "logs/\n", "utf8");
  let result = spawnSync("git", ["add", ".gitignore"], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync("git", [
    "-c",
    "user.name=FastCar Test",
    "-c",
    "user.email=fastcar-test@example.invalid",
    "commit",
    "-m",
    "ignore logs",
  ], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);

  const cliResult = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "scope ignored unreported write",
    "--session",
    "scope-ignored-unreported-write",
    "--scope",
    "src/**",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "logs/ignored.log",
    PIPELINE_WORKER_SET_FILE: "ignored write",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(cliResult.status, 1, `STDOUT:\n${cliResult.stdout}\nSTDERR:\n${cliResult.stderr}`);
  const events = ndjson(cliResult.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("logs/")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "scope_violation" && issue.files.includes("logs/"))));
});

test("--scope 使用 git 实际变更阻止漏报已有 ignored 越界文件二次修改", () => {
  const projectDir = makeGitProject();
  fs.writeFileSync(path.join(projectDir, ".gitignore"), "logs/\n", "utf8");
  let result = spawnSync("git", ["add", ".gitignore"], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync("git", [
    "-c",
    "user.name=FastCar Test",
    "-c",
    "user.email=fastcar-test@example.invalid",
    "commit",
    "-m",
    "ignore logs",
  ], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  fs.mkdirSync(path.join(projectDir, "logs"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "logs", "ignored.log"), "preexisting ignored\n", "utf8");

  const cliResult = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "scope existing ignored unreported write",
    "--session",
    "scope-existing-ignored-unreported-write",
    "--scope",
    "src/**",
    "--json-progress",
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "logs/ignored.log",
    PIPELINE_WORKER_SET_FILE: "worker changed ignored",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(cliResult.status, 1, `STDOUT:\n${cliResult.stdout}\nSTDERR:\n${cliResult.stderr}`);
  const events = ndjson(cliResult.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("logs/")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "scope_violation" && issue.files.includes("logs/"))));
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

test("makeIsolatedWorktree 创建失败后不留下目标目录", () => {
  const projectDir = makeProject();
  const created = makeIsolatedWorktree(projectDir, "create-fail-cleanup", 1);
  assert.strictEqual(created.ok, false);
  assert.ok(!fs.existsSync(created.worktreePath), `leaked worktree path: ${created.worktreePath}`);
});

test("--isolate 合并后在主工作区重新验证最终代码组合", () => {
  const projectDir = makeGitProject();
  fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "src", "main-dirty.txt"), "main dirty\n", "utf8");

  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate post merge validation",
    "--session",
    "isolate-post-merge-validation",
    "--isolate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "console.log('post-merge-first-pass')"`,
    "--validate-cmd",
    `"${process.execPath}" -e "const fs=require('fs'); const main=fs.existsSync('src/main-dirty.txt'); console.log(main ? ['main','worktree','validation'].join('-') : ['isolated','validation'].join('-')); process.exit(main ? 1 : 0)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "src/isolated-change.txt",
    PIPELINE_WORKER_SET_FILE: "isolated change",
  });

  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "validation_done" && event.status === "passed"));
  assert.ok(events.some((event) => event.event === "worktree_merged"));
  assert.ok(events.some((event) => event.event === "post_merge_validation_done" && event.status === "failed"));
  assert.ok(events.some((event) => event.event === "worktree_rolled_back" && event.reason === "post_merge_validation_failed"));
  assert.ok(events.some((event) => event.event === "reconcile" && event.reason === "post_merge_validation_failed"));
  assert.ok(events.some((event) => event.event === "worktree_cleaned"));
  assert.ok(!fs.existsSync(path.join(projectDir, "src", "isolated-change.txt")));
  const iterationDir = path.join(projectDir, ".agent-state", "auto-iterate", "isolate-post-merge-validation", "iterations", "1");
  const isolateValidationLog = fs.readFileSync(path.join(iterationDir, "validation.log"), "utf8");
  const postMergeValidationLog = fs.readFileSync(path.join(iterationDir, "post-merge-validation.log"), "utf8");
  assert.ok(isolateValidationLog.includes("isolated-validation"));
  assert.ok(!isolateValidationLog.includes("main-worktree-validation"));
  assert.ok(postMergeValidationLog.includes("main-worktree-validation"));

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "isolate-post-merge-validation", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.postChange.status, "failed");
  assert.strictEqual(state.postChange.regressionDetected, true);
  assert.strictEqual(state.currentState.lastValidationResult, "failed");
  assert.strictEqual(state.validation.finalVerifiability, "unknown");
  assert.strictEqual(state.watchdog.deliveryVerifiability, "unknown");
  assert.strictEqual(state.deltaAssessment.status, "regression");
  assert.strictEqual(state.deltaAssessment.postChangeRef, "postMergeValidation");
  assert.strictEqual(state.iterationPolicy.lastDecision, "replan");
  const postMergeHistory = state.validation.commands.filter((item) => item && item.phase === "post_merge");
  assert.strictEqual(postMergeHistory.length, 2);
  assert.deepStrictEqual(postMergeHistory.map((item) => item.result), ["passed", "failed"]);
  assert.ok(postMergeHistory[0].command.includes("post-merge-first-pass"));
  assert.ok(postMergeHistory[1].command.includes("main-dirty.txt"));
});

test("--isolate 使用 git 实际变更阻止漏报越界文件", () => {
  const projectDir = makeGitProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate scope unreported write",
    "--session",
    "isolate-scope-unreported-write",
    "--isolate",
    "--scope",
    "src/**",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_WRITE_FILE: "\nisolate unreported out of scope\n",
    PIPELINE_WORKER_REPORTED_FILE: "",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("README.md")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "scope_violation" && issue.files.includes("README.md"))));
  assert.ok(!fs.readFileSync(path.join(projectDir, "README.md"), "utf8").includes("isolate unreported out of scope"));
});

test("--isolate 使用主工作区审计阻止绝对路径漏报写入", () => {
  const projectDir = makeGitProject();
  const readmePath = path.join(projectDir, "README.md");
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate absolute unreported write",
    "--session",
    "isolate-absolute-unreported-write",
    "--isolate",
    "--scope",
    "src/**",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "",
    PIPELINE_WORKER_REPORTED_FILE: "",
    PIPELINE_WORKER_ABSOLUTE_WRITE_FILE: readmePath,
    PIPELINE_WORKER_ABSOLUTE_WRITE_CONTENT: "\nmain worktree absolute write\n",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "write_audit" && event.actual_files.includes("README.md")));
  assert.ok(events.some((event) => event.event === "write_violation" &&
    event.issues.some((issue) => issue.reason === "scope_violation" && issue.files.includes("README.md"))));
  assert.ok(fs.readFileSync(readmePath, "utf8").includes("main worktree absolute write"));
});

test("--isolate 在 need_decision 中断前清理临时 worktree", () => {
  const projectDir = makeGitProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate need decision cleanup",
    "--session",
    "isolate-need-decision-cleanup",
    "--isolate",
    "--json-progress",
  ], {
    PIPELINE_WORKER_STATUS: "need_decision",
  });
  assert.strictEqual(result.status, 42, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  const created = events.find((event) => event.event === "worktree_created");
  assert.ok(created);
  assert.ok(events.some((event) => event.event === "worktree_cleaned"));
  assert.ok(events.some((event) => event.event === "need_decision"));
  assert.ok(!fs.existsSync(path.join(projectDir, created.path)));
  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "isolate-need-decision-cleanup", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.decisionRequest.status, "pending");
  assert.strictEqual(state.watchdog.requiredAction, "ask_user");
});

test("--isolate 在 Worker 失败时清理临时 worktree", () => {
  const projectDir = makeGitProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate worker failure cleanup",
    "--session",
    "isolate-worker-failure-cleanup",
    "--isolate",
    "--json-progress",
  ], {
    PIPELINE_WORKER_EXIT_CODE: "7",
  });
  assert.strictEqual(result.status, 7, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  const created = events.find((event) => event.event === "worktree_created");
  assert.ok(created);
  assert.ok(events.some((event) => event.event === "error" && event.reason === "worker_failed"));
  assert.ok(events.some((event) => event.event === "worktree_cleaned"));
  assert.ok(!fs.existsSync(path.join(projectDir, created.path)));
});

test("--isolate 在 state schema 失败时清理临时 worktree", async () => {
  const projectDir = makeGitProject();
  const stateDir = path.join(projectDir, ".agent-state", "auto-iterate", "isolate-schema-fail-cleanup");
  fs.mkdirSync(stateDir, { recursive: true });
  const stateJsonPath = path.join(stateDir, "state.json");
  fs.writeFileSync(stateJsonPath, `${JSON.stringify({
    schemaVersion: 1,
    session: { session: "isolate-schema-fail-cleanup" },
    mode: { mode: "quick", runtimeAutopilot: false, loopShape: "default" },
    budgets: {
      totalCycles: 0,
      implementationIterationsUsed: 0,
      optimizationIterationsUsed: 0,
      nonImplementationIterationsUsed: 0,
      remainingImplementationIterations: 1,
    },
    currentState: {},
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    validation: { commands: [] },
    requirements: [{ id: "REQ-BOOTSTRAP", summary: "one", status: "pending" }],
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(stateDir, "state.md"), "# state\n", "utf8");

  const events = [];
  const originalWrite = process.stdout.write;
  process.exitCode = 0;
  process.stdout.write = (chunk, encoding, callback) => {
    events.push(JSON.parse(String(chunk)));
    if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    const result = await runPipeline({
      session: "isolate-schema-fail-cleanup",
      stateJsonPath,
      projectRoot: projectDir,
      mode: "quick",
      once: true,
      isolate: true,
      jsonProgress: true,
      validateStateModel(state) {
        return state.budgets && state.budgets.totalCycles > 0
          ? [{ severity: "error", message: "merged state invalid" }]
          : [];
      },
      adapter: {
        id: "inline",
        async run({ resultPath }) {
          fs.writeFileSync(resultPath, `${JSON.stringify({
            status: "completed",
            summary: "schema fail after merge",
            files_changed: [],
          })}\n`, "utf8");
          return { status: 0, stdout: "", stderr: "", command: "inline" };
        },
      },
    });
    assert.strictEqual(result.reason, "state_schema_failed");
    const created = events.find((event) => event.event === "worktree_created");
    assert.ok(created);
    assert.ok(events.some((event) => event.event === "error" && event.reason === "state_schema_failed"));
    assert.ok(events.some((event) => event.event === "worktree_cleaned"));
    assert.ok(!fs.existsSync(path.join(projectDir, created.path)));
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = 0;
  }
});

test("--isolate 内部调用也会清洗 worktree session 路径片段", async () => {
  const projectDir = makeGitProject();
  const stateDir = path.join(projectDir, ".agent-state", "auto-iterate", "unsafe-session");
  fs.mkdirSync(stateDir, { recursive: true });
  const stateJsonPath = path.join(stateDir, "state.json");
  fs.writeFileSync(stateJsonPath, `${JSON.stringify({
    schemaVersion: 1,
    session: { session: "unsafe-session" },
    mode: { mode: "quick", runtimeAutopilot: false, loopShape: "default" },
    budgets: {
      totalCycles: 0,
      implementationIterationsUsed: 0,
      optimizationIterationsUsed: 0,
      nonImplementationIterationsUsed: 0,
      remainingImplementationIterations: 1,
    },
    currentState: {},
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    validation: { commands: [] },
    requirements: [{ id: "REQ-BOOTSTRAP", summary: "one", status: "pending" }],
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(stateDir, "state.md"), "# state\n", "utf8");

  const events = [];
  const originalWrite = process.stdout.write;
  process.exitCode = 0;
  process.stdout.write = (chunk, encoding, callback) => {
    events.push(JSON.parse(String(chunk)));
    if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    const result = await runPipeline({
      session: "../escape session",
      stateJsonPath,
      projectRoot: projectDir,
      mode: "quick",
      once: true,
      isolate: true,
      jsonProgress: true,
      adapter: {
        id: "inline",
        async run({ resultPath }) {
          fs.writeFileSync(resultPath, `${JSON.stringify({
            status: "completed",
            summary: "unsafe session path sanitized",
            files_changed: [],
          })}\n`, "utf8");
          return { status: 0, stdout: "", stderr: "", command: "inline" };
        },
      },
    });
    assert.strictEqual(result.reason, "once_completed");
    const created = events.find((event) => event.event === "worktree_created");
    assert.ok(created);
    assert.ok(created.path.startsWith("../.auto-iterate-worktrees/escape-session-1-"));
    assert.ok(!created.path.includes("../escape session"));
    assert.ok(events.some((event) => event.event === "worktree_cleaned"));
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = 0;
  }
});

test("--isolate 清理失败时持久化失败状态而不是保留 post-merge passed", async () => {
  const projectDir = makeGitProject();
  const stateDir = path.join(projectDir, ".agent-state", "auto-iterate", "isolate-cleanup-failed-state");
  fs.mkdirSync(stateDir, { recursive: true });
  const stateJsonPath = path.join(stateDir, "state.json");
  fs.writeFileSync(stateJsonPath, `${JSON.stringify({
    schemaVersion: 1,
    session: { session: "isolate-cleanup-failed-state" },
    mode: { mode: "quick", runtimeAutopilot: false, loopShape: "default" },
    budgets: {
      totalCycles: 0,
      implementationIterationsUsed: 0,
      optimizationIterationsUsed: 0,
      nonImplementationIterationsUsed: 0,
      remainingImplementationIterations: 1,
    },
    currentState: {},
    watchdog: { requiredAction: "continue", deliveryVerifiability: "unknown" },
    validation: { commands: [] },
    requirements: [{ id: "REQ-BOOTSTRAP", summary: "one", status: "pending" }],
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(stateDir, "state.md"), "# state\n", "utf8");

  const events = [];
  const originalWrite = process.stdout.write;
  process.exitCode = 0;
  process.stdout.write = (chunk, encoding, callback) => {
    events.push(JSON.parse(String(chunk)));
    if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    const result = await runPipeline({
      session: "isolate-cleanup-failed-state",
      stateJsonPath,
      projectRoot: projectDir,
      mode: "quick",
      once: true,
      isolate: true,
      jsonProgress: true,
      validateCommand: `"${process.execPath}" -e "process.exit(0)"`,
      cleanupIsolatedWorktreeImpl() {
        return { ok: false, error: "fixture cleanup failed" };
      },
      adapter: {
        id: "inline",
        async run({ cwd, resultPath }) {
          const changedPath = path.join(cwd, "src", "cleanup-success-before-fail.txt");
          fs.mkdirSync(path.dirname(changedPath), { recursive: true });
          fs.writeFileSync(changedPath, "content\n", "utf8");
          fs.writeFileSync(resultPath, `${JSON.stringify({
            status: "completed",
            summary: "cleanup failure after successful merge",
            files_changed: ["src/cleanup-success-before-fail.txt"],
            requirements: [{
              id: "REQ-BOOTSTRAP",
              summary: "one",
              status: "implemented",
              evidence: "worker completed",
            }],
          })}\n`, "utf8");
          return { status: 0, stdout: "", stderr: "", command: "inline" };
        },
      },
    });
    assert.strictEqual(result.reason, "worktree_cleanup_failed");
    assert.strictEqual(process.exitCode, 1);
    assert.ok(events.some((event) => event.event === "worktree_merged"));
    assert.ok(events.some((event) => event.event === "post_merge_validation_done" && event.status === "passed"));
    assert.ok(events.some((event) => event.event === "error" && event.reason === "worktree_cleanup_failed"));
    const state = JSON.parse(fs.readFileSync(stateJsonPath, "utf8"));
    assert.strictEqual(state.postChange.status, "failed");
    assert.strictEqual(state.postChange.regressionDetected, true);
    assert.strictEqual(state.postChange.reason, "fixture cleanup failed");
    assert.strictEqual(state.validation.finalVerifiability, "unknown");
    assert.strictEqual(state.watchdog.requiredAction, "stop");
    assert.strictEqual(state.watchdog.deliveryVerifiability, "unknown");
    assert.strictEqual(state.deltaAssessment.postChangeRef, "isolateCleanup");
    assert.strictEqual(state.iterationPolicy.lastDecision, "stop");
    assert.strictEqual(state.isolate.cleanupReason, "fixture cleanup failed");
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = 0;
  }
});

test("--isolate 合并 Worker 新建的 untracked 文件", () => {
  const projectDir = makeGitProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate new file",
    "--session",
    "isolate-new-file",
    "--isolate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "src/new-file.txt",
    PIPELINE_WORKER_SET_FILE: "new file content",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "worktree_merged" && event.skipped === false));
  assert.strictEqual(fs.readFileSync(path.join(projectDir, "src", "new-file.txt"), "utf8"), "new file content");
});

test("--isolate 合并 Worker 新建的带空格 untracked 文件", () => {
  const projectDir = makeGitProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate new spaced file",
    "--session",
    "isolate-new-spaced-file",
    "--isolate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "src/new spaced file.txt",
    PIPELINE_WORKER_SET_FILE: "new spaced file content",
  });
  assert.strictEqual(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "worktree_merged" && event.skipped === false));
  assert.strictEqual(fs.readFileSync(path.join(projectDir, "src", "new spaced file.txt"), "utf8"), "new spaced file content");
});

test("--isolate 合并 Worker 新建的 ignored untracked 文件", () => {
  const projectDir = makeGitProject();
  fs.writeFileSync(path.join(projectDir, ".gitignore"), "logs/\n", "utf8");
  let result = spawnSync("git", ["add", ".gitignore"], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync("git", [
    "-c",
    "user.name=FastCar Test",
    "-c",
    "user.email=fastcar-test@example.invalid",
    "commit",
    "-m",
    "ignore logs",
  ], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);

  const cliResult = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate ignored file",
    "--session",
    "isolate-ignored-file",
    "--isolate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "logs/ignored.log",
    PIPELINE_WORKER_SET_FILE: "ignored from isolate",
  });
  assert.strictEqual(cliResult.status, 0, `STDOUT:\n${cliResult.stdout}\nSTDERR:\n${cliResult.stderr}`);
  assert.strictEqual(fs.readFileSync(path.join(projectDir, "logs", "ignored.log"), "utf8"), "ignored from isolate");
});

test("--isolate ignored untracked 目标冲突时不会覆盖主工作区文件", () => {
  const projectDir = makeGitProject();
  fs.writeFileSync(path.join(projectDir, ".gitignore"), "logs/\n", "utf8");
  let result = spawnSync("git", ["add", ".gitignore"], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync("git", [
    "-c",
    "user.name=FastCar Test",
    "-c",
    "user.email=fastcar-test@example.invalid",
    "commit",
    "-m",
    "ignore logs",
  ], { cwd: projectDir, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  fs.mkdirSync(path.join(projectDir, "logs"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "logs", "ignored.log"), "main ignored\n", "utf8");

  const cliResult = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate ignored conflict",
    "--session",
    "isolate-ignored-conflict",
    "--isolate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "logs/ignored.log",
    PIPELINE_WORKER_SET_FILE: "worker ignored\n",
  });
  assert.strictEqual(cliResult.status, 1, `STDOUT:\n${cliResult.stdout}\nSTDERR:\n${cliResult.stderr}`);
  assert.ok(ndjson(cliResult.stdout).some((event) => event.event === "error" &&
    event.reason === "worktree_merge_failed" &&
    /untracked file already exists in main worktree: logs\/ignored\.log/.test(event.detail)));
  assert.strictEqual(fs.readFileSync(path.join(projectDir, "logs", "ignored.log"), "utf8"), "main ignored\n");
});

test("--isolate 拒绝合并 Worker 新建的 untracked symlink", () => {
  const projectDir = makeGitProject();
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate reject symlink",
    "--session",
    "isolate-reject-symlink",
    "--isolate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "",
    PIPELINE_WORKER_SYMLINK_FILE: "src/link.txt",
    PIPELINE_WORKER_SYMLINK_TARGET: "README.md",
  });
  if (result.status === 77 && result.stdout.includes("fixture_symlink_unavailable")) {
    console.log("↷ --isolate symlink rejection skipped: platform cannot create symlink fixture");
    return;
  }
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "error" &&
    event.reason === "worktree_merge_failed" &&
    /unsupported untracked file type: src\/link\.txt/.test(event.detail)));
  assert.ok(!fs.existsSync(path.join(projectDir, "src", "link.txt")));
});

test("--isolate 合并冲突时保留 worktree 并记录 stop", () => {
  const projectDir = makeGitProject();
  const warmup = runCli(projectDir, [
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
    PIPELINE_WORKER_CHANGED_FILE: "src/warmup.txt",
    PIPELINE_WORKER_SET_FILE: "warmup",
  });
  assert.strictEqual(warmup.status, 0, `STDOUT:\n${warmup.stdout}\nSTDERR:\n${warmup.stderr}`);

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "isolate-conflict", "state.json");
  const beforeConflictState = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(beforeConflictState.validation.finalVerifiability, "partially_verifiable");
  assert.strictEqual(beforeConflictState.watchdog.deliveryVerifiability, "partially_verifiable");
  beforeConflictState.budgets.remainingImplementationIterations = 10;
  beforeConflictState.budgets.totalCycles = 0;
  beforeConflictState.budgets.implementationIterationsUsed = 0;
  beforeConflictState.budgets.nonImplementationIterationsUsed = 0;
  beforeConflictState.budgets.optimizationIterationsUsed = 0;
  beforeConflictState.requirements = beforeConflictState.requirements.map((item) => ({
    ...item,
    status: item.id === "REQ-BOOTSTRAP" ? "pending" : item.status,
  }));
  fs.writeFileSync(statePath, `${JSON.stringify(beforeConflictState, null, 2)}\n`, "utf8");

  fs.writeFileSync(path.join(projectDir, "README.md"), "# fixture main side\n", "utf8");
  const result = runCli(projectDir, [
    "--resume",
    "isolate-conflict",
    "--run",
    "--once",
    "--quick",
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
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.strictEqual(state.watchdog.requiredAction, "stop");
  assert.strictEqual(state.watchdog.deliveryVerifiability, "unknown");
  assert.strictEqual(state.postChange.status, "failed");
  assert.strictEqual(state.postChange.regressionDetected, true);
  assert.strictEqual(state.validation.finalVerifiability, "unknown");
  assert.strictEqual(state.deltaAssessment.decision, "stop");
  assert.ok(state.isolate.conflictWorktree);
  assert.ok(fs.existsSync(state.isolate.conflictWorktree));
  const req = state.requirements.find((item) => item.id === "REQ-BOOTSTRAP");
  assert.ok(req);
  assert.strictEqual(req.status, "blocked");
  assert.ok(/git apply failed|patch does not apply|merge failed/i.test(req.blockedReason));
});

test("--isolate tracked diff 冲突时不会提前复制 untracked 文件", () => {
  const projectDir = makeGitProject();
  fs.writeFileSync(path.join(projectDir, "README.md"), "# fixture main side\n", "utf8");
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate conflict no partial untracked copy",
    "--session",
    "isolate-conflict-untracked",
    "--isolate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_SET_FILE: "# fixture worker side\n",
    PIPELINE_WORKER_EXTRA_FILE: "src/new-file.txt",
    PIPELINE_WORKER_EXTRA_CONTENT: "should stay isolated",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.ok(ndjson(result.stdout).some((event) => event.event === "error" && event.reason === "worktree_merge_failed"));
  assert.ok(!fs.existsSync(path.join(projectDir, "src", "new-file.txt")));
});

test("--isolate untracked 目标冲突时不会提前应用 tracked diff", () => {
  const projectDir = makeGitProject();
  fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "src", "existing.txt"), "main existing\n", "utf8");
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate untracked conflict no partial tracked apply",
    "--session",
    "isolate-untracked-conflict-no-partial-tracked",
    "--isolate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_WRITE_FILE: "\ntracked worker change\n",
    PIPELINE_WORKER_EXTRA_FILE: "src/existing.txt",
    PIPELINE_WORKER_EXTRA_CONTENT: "worker existing\n",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "error" &&
    event.reason === "worktree_merge_failed" &&
    /untracked file already exists/.test(event.detail)));
  assert.ok(!fs.readFileSync(path.join(projectDir, "README.md"), "utf8").includes("tracked worker change"));
  assert.strictEqual(fs.readFileSync(path.join(projectDir, "src", "existing.txt"), "utf8"), "main existing\n");
});

test("--isolate 仅 untracked 合并遇后续冲突时不会部分复制前置文件", () => {
  const projectDir = makeGitProject();
  fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "src", "z-existing.txt"), "main existing\n", "utf8");
  const result = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "isolate untracked only conflict no partial copy",
    "--session",
    "isolate-untracked-only-conflict-no-partial-copy",
    "--isolate",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ], {
    PIPELINE_WORKER_CHANGED_FILE: "src/a-new.txt",
    PIPELINE_WORKER_SET_FILE: "new content\n",
    PIPELINE_WORKER_EXTRA_FILE: "src/z-existing.txt",
    PIPELINE_WORKER_EXTRA_CONTENT: "worker existing\n",
  });
  assert.strictEqual(result.status, 1, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const events = ndjson(result.stdout);
  assert.ok(events.some((event) => event.event === "error" &&
    event.reason === "worktree_merge_failed" &&
    /untracked file already exists in main worktree: src\/z-existing\.txt/.test(event.detail)));
  assert.ok(!fs.existsSync(path.join(projectDir, "src", "a-new.txt")));
  assert.strictEqual(fs.readFileSync(path.join(projectDir, "src", "z-existing.txt"), "utf8"), "main existing\n");
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
  state.budgets.nonImplementationIterationsUsed = 0;
  state.budgets.optimizationIterationsUsed = 0;
  state.budgets.remainingImplementationIterations = 20;
  state.traceability.iterations = [];
  state.postChange.status = "not_run";
  state.currentState.lastValidationResult = "not_run";
  state.requirements = state.requirements.map((item) => ({
    ...item,
    status: item.id === "REQ-BOOTSTRAP" ? "pending" : item.status,
  }));
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const promptPath = path.join(projectDir, ".agent-state", "auto-iterate", "resume-reuse", "iterations", "1", "prompt.md");
  const promptBefore = fs.readFileSync(promptPath, "utf8");
  const promptMtimeBefore = fs.statSync(promptPath).mtimeMs;

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
  assert.ok(events.some((event) => event.event === "iteration_start" && event.reused_result === true && event.prompt_preserved === true));
  assert.ok(!events.some((event) => event.event === "agent_timeout"));
  assert.strictEqual(fs.readFileSync(promptPath, "utf8"), promptBefore);
  assert.strictEqual(fs.statSync(promptPath).mtimeMs, promptMtimeBefore);
});

test("resume 不复用 focus 不匹配的未合并 result.json", () => {
  const projectDir = makeProject();
  const first = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "resume mismatched reusable result",
    "--session",
    "resume-mismatch-reuse",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(1)"`,
  ]);
  assert.strictEqual(first.status, 0, `STDOUT:\n${first.stdout}\nSTDERR:\n${first.stderr}`);

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "resume-mismatch-reuse", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  state.budgets.totalCycles = 0;
  state.budgets.implementationIterationsUsed = 0;
  state.budgets.nonImplementationIterationsUsed = 0;
  state.budgets.optimizationIterationsUsed = 0;
  state.budgets.remainingImplementationIterations = 20;
  state.traceability.iterations = [];
  state.postChange.status = "failed";
  state.currentState.lastValidationResult = "failed";
  state.requirements = state.requirements.map((item) => ({
    ...item,
    status: item.id === "REQ-BOOTSTRAP" ? "implemented" : item.status,
  }));
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  const second = runCli(projectDir, [
    "--resume",
    "resume-mismatch-reuse",
    "--run",
    "--once",
    "--quick",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
    "--step-timeout",
    "1",
    "--inactivity-timeout",
    "0",
  ], {
    PIPELINE_WORKER_SLEEP_MS: "3000",
    PIPELINE_WORKER_SKIP_RESULT: "1",
  });
  assert.strictEqual(second.status, 1, `STDOUT:\n${second.stdout}\nSTDERR:\n${second.stderr}`);
  const events = ndjson(second.stdout);
  assert.ok(!events.some((event) => event.event === "agent_result_reused"));
  assert.ok(events.some((event) => event.event === "agent_timeout"));
});

test("resume 不复用缺少同轮 prompt 证据的 result.json", () => {
  const projectDir = makeProject();
  const first = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "resume orphan reusable result",
    "--session",
    "resume-orphan-result",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ]);
  assert.strictEqual(first.status, 0, `STDOUT:\n${first.stdout}\nSTDERR:\n${first.stderr}`);

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "resume-orphan-result", "state.json");
  const iterationDir = path.join(projectDir, ".agent-state", "auto-iterate", "resume-orphan-result", "iterations", "1");
  fs.rmSync(path.join(iterationDir, "prompt.md"));

  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  state.budgets.totalCycles = 0;
  state.budgets.implementationIterationsUsed = 0;
  state.budgets.nonImplementationIterationsUsed = 0;
  state.budgets.optimizationIterationsUsed = 0;
  state.budgets.remainingImplementationIterations = 20;
  state.traceability.iterations = [];
  state.postChange.status = "failed";
  state.currentState.lastValidationResult = "failed";
  state.requirements = state.requirements.map((item) => ({
    ...item,
    status: item.id === "REQ-BOOTSTRAP" ? "implemented" : item.status,
  }));
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  const second = runCli(projectDir, [
    "--resume",
    "resume-orphan-result",
    "--run",
    "--once",
    "--quick",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
    "--step-timeout",
    "1",
    "--inactivity-timeout",
    "0",
  ], {
    PIPELINE_WORKER_SLEEP_MS: "3000",
    PIPELINE_WORKER_SKIP_RESULT: "1",
  });
  assert.strictEqual(second.status, 1, `STDOUT:\n${second.stdout}\nSTDERR:\n${second.stderr}`);
  const events = ndjson(second.stdout);
  assert.ok(!events.some((event) => event.event === "agent_result_reused"));
  assert.ok(events.some((event) => event.event === "agent_timeout"));
});

test("resume 不复用缺少 focus 元数据的后续轮 result.json", () => {
  const projectDir = makeProject();
  const first = runCli(projectDir, [
    "--run",
    "--once",
    "--quick",
    "--goal",
    "resume focusless reusable result",
    "--session",
    "resume-focusless-reuse",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
  ]);
  assert.strictEqual(first.status, 0, `STDOUT:\n${first.stdout}\nSTDERR:\n${first.stderr}`);

  const statePath = path.join(projectDir, ".agent-state", "auto-iterate", "resume-focusless-reuse", "state.json");
  const iterationDir = path.join(projectDir, ".agent-state", "auto-iterate", "resume-focusless-reuse", "iterations", "1");
  const resultPath = path.join(iterationDir, "result.json");
  const staleResult = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  delete staleResult.focus;
  fs.writeFileSync(resultPath, `${JSON.stringify(staleResult, null, 2)}\n`, "utf8");

  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  state.budgets.totalCycles = 0;
  state.budgets.implementationIterationsUsed = 0;
  state.budgets.nonImplementationIterationsUsed = 0;
  state.budgets.optimizationIterationsUsed = 0;
  state.budgets.remainingImplementationIterations = 20;
  state.traceability.iterations = [];
  state.postChange.status = "failed";
  state.currentState.lastValidationResult = "failed";
  state.requirements = state.requirements.map((item) => ({
    ...item,
    status: item.id === "REQ-BOOTSTRAP" ? "implemented" : item.status,
  }));
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  const second = runCli(projectDir, [
    "--resume",
    "resume-focusless-reuse",
    "--run",
    "--once",
    "--quick",
    "--json-progress",
    "--validate-cmd",
    `"${process.execPath}" -e "process.exit(0)"`,
    "--step-timeout",
    "1",
    "--inactivity-timeout",
    "0",
  ], {
    PIPELINE_WORKER_SLEEP_MS: "3000",
    PIPELINE_WORKER_SKIP_RESULT: "1",
  });
  assert.strictEqual(second.status, 1, `STDOUT:\n${second.stdout}\nSTDERR:\n${second.stderr}`);
  const events = ndjson(second.stdout);
  assert.ok(!events.some((event) => event.event === "agent_result_reused"));
  assert.ok(events.some((event) => event.event === "agent_timeout"));
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
