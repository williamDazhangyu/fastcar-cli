const assert = require("assert");
const { evaluateDeliveryGates } = require("../dist/pipeline/deliveryGates");
const { buildIterationPrompt } = require("../dist/pipeline/iterationPrompt");
const { mergeIterationIntoState } = require("../dist/pipeline/mergeState");
const { pickNextFocus } = require("../dist/pipeline/pickFocus");
const { parseAndValidateIterationResult } = require("../dist/pipeline/resultSchema");
const { shouldStop } = require("../dist/pipeline/shouldStop");
const { evaluateWatchdog } = require("../dist/pipeline/watchdog");
const { buildWorkerCapabilityPolicy } = require("../dist/pipeline/workerCapabilityPolicy");
const { evaluateWriteGuard } = require("../dist/pipeline/writeGuard");
const { emitProgress } = require("../dist/pipeline/progress");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function readyDeliveryState() {
  return {
    mode: { mode: "quick" },
    requirements: [
      { id: "REQ-1", status: "passed", evidence: "verified" },
    ],
    validation: { finalVerifiability: "verifiable" },
    watchdog: { deliveryVerifiability: "verifiable" },
    postChange: { status: "passed", regressionDetected: false },
    deliveryEvidence: { status: "ready" },
  };
}

test("pickNextFocus selects open requirement before delivery", () => {
  const focus = pickNextFocus({
    requirements: [
      { id: "REQ-1", status: "passed", summary: "done" },
      { id: "REQ-2", status: "pending", summary: "implement next" },
    ],
  });

  assert.strictEqual(focus.type, "implement_req");
  assert.strictEqual(focus.req_id, "REQ-2");
  assert.strictEqual(focus.summary, "implement next");
});

test("resultSchema normalizes worker result and rejects unsafe paths", () => {
  const parsed = parseAndValidateIterationResult({
    status: "completed",
    summary: "implemented",
    files_changed: ["src/a.ts", "../secret.txt"],
    requirements: [
      { id: "REQ-1", status: "implemented", evidence: "code changed" },
    ],
    state_patch: {},
    risks: [],
    blocked_reason: "",
    decision_request: null,
    trace: {
      rationaleSummary: "used current contract",
      decisions: [],
      evidence: [],
    },
  });

  assert.strictEqual(parsed.valid, false);
  assert.ok(parsed.errors.some((item) => item.includes("files_changed")));
  assert.deepStrictEqual(parsed.result.files_changed, ["src/a.ts"]);
});

test("mergeState advances implemented requirements only to validation-confirmed passed", () => {
  const base = {
    mode: { mode: "quick" },
    budgets: { remainingImplementationIterations: 2, implementationIterationsUsed: 0, totalCycles: 0 },
    requirements: [
      { id: "REQ-1", status: "pending", summary: "implement" },
    ],
    traceability: { iterations: [] },
  };
  const report = {
    status: "completed",
    summary: "implemented req",
    files_changed: ["src/a.ts"],
    requirements: [
      { id: "REQ-1", status: "implemented", evidence: "code changed" },
    ],
    state_patch: {},
    validation: null,
    risks: "",
    blocked_reason: "",
    decision_request: null,
    trace: { rationaleSummary: "changed scoped file", decisions: [], evidence: [] },
    documentation: { apiChanges: [], architectureNotes: [], implementationNotes: [], changelogEntries: [] },
    raw: {},
  };

  const failed = mergeIterationIntoState(base, report, { status: "failed", command: "npm test", exitCode: 1 }, {
    iteration: 1,
    focus: { type: "implement_req", req_id: "REQ-1", summary: "implement" },
  });
  assert.strictEqual(failed.state.requirements[0].status, "implemented");

  const passed = mergeIterationIntoState(base, report, { status: "passed", command: "npm test", exitCode: 0 }, {
    iteration: 1,
    focus: { type: "implement_req", req_id: "REQ-1", summary: "implement" },
  });
  assert.strictEqual(passed.state.requirements[0].status, "passed");

  const mixed = mergeIterationIntoState({
    ...base,
    requirements: [
      { id: "REQ-1", status: "pending", summary: "implement" },
      { id: "REQ-2", status: "pending", summary: "other" },
    ],
  }, {
    ...report,
    requirements: [
      { id: "REQ-1", status: "implemented", evidence: "code changed" },
      { id: "REQ-2", status: "implemented", evidence: "unfocused change" },
    ],
  }, { status: "passed", command: "npm test", exitCode: 0 }, {
    iteration: 1,
    focus: { type: "implement_req", req_id: "REQ-1", summary: "implement" },
  });
  assert.strictEqual(mixed.state.requirements[0].status, "passed");
  assert.strictEqual(mixed.state.requirements[1].status, "implemented");
});

test("mergeState preserves deterministic validation executable and args evidence", () => {
  const base = {
    mode: { mode: "quick" },
    budgets: { remainingImplementationIterations: 2, implementationIterationsUsed: 0, totalCycles: 0 },
    requirements: [],
    traceability: { iterations: [] },
    validation: { commands: [] },
  };
  const report = {
    status: "completed",
    summary: "implemented req",
    files_changed: ["src/a.ts"],
    requirements: [],
    state_patch: {},
    validation: null,
    risks: "",
    blocked_reason: "",
    decision_request: null,
    trace: { rationaleSummary: "changed scoped file", decisions: [], evidence: [] },
    documentation: { apiChanges: [], architectureNotes: [], implementationNotes: [], changelogEntries: [] },
    raw: {},
  };
  const merged = mergeIterationIntoState(base, report, {
    status: "passed",
    command: "node scripts/validate.js --ci",
    exitCode: 0,
    results: [{
      command: "node scripts/validate.js --ci",
      executable: "node",
      args: ["scripts/validate.js", "--ci"],
      status: "passed",
      exitCode: 0,
      signal: "none",
      error: "none",
      durationMs: 5,
      stdoutTail: "ok",
      stderrTail: "",
    }],
  }, {
    iteration: 1,
    focus: { type: "harden_validation", summary: "verify" },
  });

  assert.strictEqual(merged.state.validation.commands[0].executable, "node");
  assert.deepStrictEqual(merged.state.validation.commands[0].args, ["scripts/validate.js", "--ci"]);
  assert.strictEqual(merged.state.postChange.perCommand[0].executable, "node");
  assert.deepStrictEqual(merged.state.postChange.perCommand[0].args, ["scripts/validate.js", "--ci"]);
});

test("delivery gates and shouldStop require verifiable evidence", () => {
  const ready = readyDeliveryState();
  const gate = evaluateDeliveryGates(ready);
  assert.strictEqual(gate.ready, true);
  assert.deepStrictEqual(gate.blocking_reasons, []);
  assert.deepStrictEqual(shouldStop(ready, null), { stop: true, reason: "delivery_ready" });

  const blocked = {
    ...ready,
    requirements: [{ id: "REQ-1", status: "implemented" }],
  };
  const blockedGate = evaluateDeliveryGates(blocked);
  assert.strictEqual(blockedGate.ready, false);
  assert.ok(blockedGate.blocking_reasons.includes("open_requirements"));
});

test("watchdog reports validation and no-progress stop signals", () => {
  assert.deepStrictEqual(
    evaluateWatchdog({ watchdog: { requiredAction: "ask_user" } }),
    { triggered: true, requiredAction: "ask_user", reason: "need_decision" },
  );
  assert.deepStrictEqual(
    evaluateWatchdog({ watchdog: { noProgressStreak: 3, maxNoProgressIterations: 3 } }),
    { triggered: true, requiredAction: "stop", reason: "no_progress_streak" },
  );
  assert.deepStrictEqual(
    evaluateWatchdog({}, { validation: { status: "failed", command: "npm test" } }),
    { triggered: true, requiredAction: "continue", reason: "validation_failed" },
  );
});

test("writeGuard enforces mode, scope, and agent-state boundaries", () => {
  const verifyBlocked = evaluateWriteGuard({ files_changed: ["src/a.ts"] }, {
    mode: "verify",
    allowModify: false,
    scope: "src/**",
  });
  assert.strictEqual(verifyBlocked.ok, false);
  assert.ok(verifyBlocked.issues.some((item) => item.reason === "mode_write_forbidden"));

  const scopeBlocked = evaluateWriteGuard({ files_changed: ["README.md"] }, {
    mode: "quick",
    scope: "src/**",
  });
  assert.strictEqual(scopeBlocked.ok, false);
  assert.ok(scopeBlocked.issues.some((item) => item.reason === "scope_violation"));

  const stateBlocked = evaluateWriteGuard({ files_changed: [".agent-state/auto-iterate/demo/state.json"] }, {
    mode: "quick",
    scope: ".agent-state/auto-iterate/demo/state.json",
  });
  assert.strictEqual(stateBlocked.ok, false);
  assert.ok(stateBlocked.issues.some((item) => item.reason === "agent_state_write_forbidden"));
});

test("iterationPrompt includes worker capability boundary without external adapter runtime", () => {
  const prompt = buildIterationPrompt({
    session: "demo",
    iteration: 1,
    mode: "quick",
    focus: { type: "implement_req", req_id: "REQ-1", summary: "implement scoped file" },
    resultPath: ".agent-state/auto-iterate/demo/iterations/1/result.json",
    writeScope: "src/a.ts",
    language: { code: "zh" },
  });

  assert.ok(prompt.includes("Worker capability boundary"));
  assert.ok(prompt.includes("禁止执行"));
  assert.ok(prompt.includes("state.json、state.md"));
  assert.ok(!prompt.includes("Adapter"));
  assert.ok(!prompt.includes("Worker CLI"));
});

test("workerCapabilityPolicy keeps coder prompt boundaries explicit", () => {
  const policy = buildWorkerCapabilityPolicy({
    mode: "verify",
    allowModify: false,
    resultPath: "result.json",
    scope: "src/a.ts",
    language: "en",
  });

  assert.ok(policy.write.allowed.some((item) => item.includes("only the exact result JSON file")));
  assert.ok(policy.execute.forbidden.some((item) => item.includes("validation")));
  assert.ok(policy.decision.forbidden.some((item) => item.includes("finalize delivery")));
});

test("human progress output stays high level while JSON keeps detailed events", () => {
  const chunks = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk, encoding, callback) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    if (typeof encoding === "function") {
      encoding();
    } else if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    emitProgress({ event: "worker_output", iter: 1, stream: "stdout", bytes: 120, last_output: "internal detail" });
    emitProgress({ event: "pipeline_progress", iter: 1, stage: "validation", budget_left: 3, req_counts: { pending: 1 } });
    const humanOutput = chunks.join("");
    assert(!humanOutput.includes("worker_output"));
    assert(!humanOutput.includes("internal detail"));
    assert(humanOutput.includes("📊 进度"));
    assert(humanOutput.includes("阶段=validation"));

    chunks.length = 0;
    emitProgress({ event: "worker_output", iter: 1, stream: "stdout", bytes: 120, last_output: "internal detail" }, { jsonProgress: true });
    const events = chunks.join("").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.strictEqual(events[0].event, "worker_output");
    assert.strictEqual(events[0].last_output, "internal detail");
  } finally {
    process.stdout.write = originalWrite;
  }
});

test("human progress uses visual status markers and colors when forced", () => {
  const chunks = [];
  const originalWrite = process.stdout.write;
  const previousForceColor = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = "1";
  process.stdout.write = (chunk, encoding, callback) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    if (typeof encoding === "function") {
      encoding();
    } else if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    emitProgress({ event: "validation_done", iter: 2, status: "passed", command: "npm test" });
    emitProgress({ event: "validation_done", iter: 3, status: "failed", command: "npm test" });
    const output = chunks.join("");
    assert(output.includes("✅ 验证"));
    assert(output.includes("❌ 验证"));
    assert(output.includes("\u001b[32m"));
    assert(output.includes("\u001b[31m"));
  } finally {
    process.stdout.write = originalWrite;
    if (previousForceColor === undefined) {
      delete process.env.FORCE_COLOR;
    } else {
      process.env.FORCE_COLOR = previousForceColor;
    }
  }
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
