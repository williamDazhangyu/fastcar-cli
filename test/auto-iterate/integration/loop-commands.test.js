const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { runNextCheck, runMerge } = require("../../../dist/auto-iterate/loopCommands");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function withTempCwd(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-loop-commands-"));
  process.chdir(dir);
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      process.chdir(previous);
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

function captureConsole(fn) {
  const lines = [];
  const original = console.log;
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  return Promise.resolve()
    .then(fn)
    .then(() => ({ lines, exitCode: process.exitCode || 0 }))
    .finally(() => {
      console.log = original;
      process.exitCode = previousExitCode;
    });
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeSession(session, stateOverrides = {}) {
  const statePath = path.join(".agent-state", "auto-iterate", session, "state.json");
  const state = {
    mode: { mode: "quick" },
    budgets: {
      remainingImplementationIterations: 3,
      implementationIterationsUsed: 0,
      totalCycles: 0,
    },
    requirements: [
      { id: "REQ-1", status: "pending", summary: "first behavior" },
      { id: "REQ-2", status: "pending", summary: "second behavior" },
    ],
    currentState: {
      currentPhase: "coding",
      currentTask: "implement_req:REQ-1",
    },
    watchdog: {
      enabled: true,
      triggered: false,
      requiredAction: "continue",
      validationHardeningStatus: "pending",
    },
    validation: { commands: [], finalVerifiability: "unknown" },
    traceability: { iterations: [] },
    postChange: { status: "not_run" },
    ...stateOverrides,
  };
  writeJson(statePath, state);
  fs.writeFileSync(
    path.join(".agent-state", "auto-iterate", session, "state.md"),
    [
      "# state",
      "<!-- pipeline-runtime-snapshot:start -->",
      "old snapshot",
      "<!-- pipeline-runtime-snapshot:end -->",
    ].join("\n"),
    "utf8",
  );
  return statePath;
}

function writeResult(session, round, resultOverrides = {}) {
  writeJson(path.join(".agent-state", "auto-iterate", session, "iterations", String(round), "result.json"), {
    status: "completed",
    summary: "implemented first behavior",
    files_changed: ["src/example.ts"],
    requirements: [
      { id: "REQ-1", status: "implemented", evidence: "node test" },
    ],
    state_patch: {},
    validation: null,
    risks: "",
    blocked_reason: "",
    decision_request: null,
    trace: { rationaleSummary: "scoped change", decisions: [], evidence: [] },
    documentation: { apiChanges: [], architectureNotes: [], implementationNotes: [], changelogEntries: [] },
    raw: {},
    ...resultOverrides,
  });
}

function writeValidation(session, round, exitCode = 0) {
  const logPath = path.join(".agent-state", "auto-iterate", session, "iterations", String(round), "validation.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, `[0] node test.js exit=${exitCode} duration_ms=7\nexit_code: ${exitCode}\nduration_ms: 7\ncommand: node test.js\n`, "utf8");
}

test("runNextCheck outputs next focus for a fresh session", async () => {
  await withTempCwd(async () => {
    writeSession("loop-session");

    const { lines, exitCode } = await captureConsole(() => runNextCheck("loop-session"));
    const output = lines.join("\n");

    assert.strictEqual(exitCode, 0);
    assert(output.includes("Next focus:  implement_req (REQ-1)"));
    assert(output.includes("first behavior"));
  });
});

test("runNextCheck blocks when previous result lacks validation log", async () => {
  await withTempCwd(async () => {
    writeSession("loop-session");
    writeResult("loop-session", 1);

    const { lines, exitCode } = await captureConsole(() => runNextCheck("loop-session"));
    const output = lines.join("\n");

    assert.strictEqual(exitCode, 1);
    assert(output.includes("缺少 validation.log"));
  });
});

test("runMerge updates state, refreshes markdown, and next selects remaining focus", async () => {
  await withTempCwd(async () => {
    const statePath = writeSession("loop-session");
    writeResult("loop-session", 1);
    writeValidation("loop-session", 1, 0);

    const merge = await captureConsole(() => runMerge("loop-session", 1));
    assert.strictEqual(merge.exitCode, 0);
    assert(merge.lines.join("\n").includes("Round 1 合并完成"));

    const merged = readJson(statePath);
    assert.strictEqual(merged.requirements[0].status, "passed");
    assert.strictEqual(merged.requirements[1].status, "pending");
    assert.strictEqual(merged.traceability.iterations[0].focus.reqId, "REQ-1");

    const stateMd = fs.readFileSync(path.join(".agent-state", "auto-iterate", "loop-session", "state.md"), "utf8");
    assert(stateMd.includes("post_change_status：passed"));
    assert(!stateMd.includes("old snapshot"));

    const traceJsonl = fs.readFileSync(path.join(".agent-state", "auto-iterate", "loop-session", "trace.jsonl"), "utf8");
    const traceEntry = JSON.parse(traceJsonl.trim());
    assert.strictEqual(traceEntry.iteration, 1);
    assert.strictEqual(traceEntry.focus.reqId, "REQ-1");
    assert.strictEqual(traceEntry.validation.status, "passed");
    assert.strictEqual(traceEntry.rationaleSummary, "scoped change");

    const decisions = fs.readFileSync(path.join(".agent-state", "auto-iterate", "loop-session", "decisions.md"), "utf8");
    assert(decisions.includes("Round 1"));
    assert(decisions.includes("scoped change"));

    const handoff = fs.readFileSync(path.join(".agent-state", "auto-iterate", "loop-session", "handoff.md"), "utf8");
    assert(handoff.includes("Requirement Status"));
    assert(handoff.includes("pending 1"));
    assert(handoff.includes("passed 1"));

    const next = await captureConsole(() => runNextCheck("loop-session"));
    const output = next.lines.join("\n");
    assert.strictEqual(next.exitCode, 0);
    assert(output.includes("Next focus:  implement_req (REQ-2)"));
  });
});

test("runMerge rejects invalid result schema before writing state or trace artifacts", async () => {
  await withTempCwd(async () => {
    const statePath = writeSession("loop-session");
    writeResult("loop-session", 1, {
      files_changed: ["../outside.ts"],
    });
    writeValidation("loop-session", 1, 0);

    const merge = await captureConsole(() => runMerge("loop-session", 1));
    const output = merge.lines.join("\n");
    assert.strictEqual(merge.exitCode, 1);
    assert(output.includes("result.json 未通过 schema 校验"));
    assert.strictEqual(readJson(statePath).requirements[0].status, "pending");
    assert(!fs.existsSync(path.join(".agent-state", "auto-iterate", "loop-session", "trace.jsonl")));
  });
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
