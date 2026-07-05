const assert = require("assert");
const { mergeIterationIntoState } = require("../../../dist/pipeline/mergeState");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

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

test("mergeState preserves QA clarification and dependency fields on requirements", () => {
  const base = {
    mode: { mode: "quick" },
    budgets: { remainingImplementationIterations: 2, implementationIterationsUsed: 0, totalCycles: 0 },
    requirements: [
      {
        id: "REQ-1",
        status: "pending",
        summary: "用户看不到错误提示",
        userVisibleBehavior: "登录失败时用户应看到可理解错误",
      },
    ],
    traceability: { iterations: [] },
  };
  const report = {
    status: "completed",
    summary: "clarified req",
    files_changed: ["src/auth.ts"],
    requirements: [
      {
        id: "REQ-1",
        status: "implemented",
        expectedBehavior: "登录失败显示明确错误提示",
        actualBehavior: "登录失败时页面无反馈",
        reproSteps: ["打开登录页", "输入错误密码", "提交表单"],
        acceptanceImpact: "错误提示正确这一验收标准无法通过",
        dependsOn: ["REQ-AUTH-FORM"],
        blockedBy: [],
        canStartImmediately: false,
        evidence: "已补错误提示路径",
      },
    ],
    state_patch: {},
    validation: null,
    risks: "",
    blocked_reason: "",
    decision_request: null,
    trace: { rationaleSummary: "updated requirement evidence", decisions: [], evidence: [] },
    documentation: { apiChanges: [], architectureNotes: [], implementationNotes: [], changelogEntries: [] },
    raw: {},
  };

  const merged = mergeIterationIntoState(base, report, { status: "passed", command: "npm test", exitCode: 0 }, {
    iteration: 1,
    focus: { type: "implement_req", req_id: "REQ-1", summary: "用户看不到错误提示" },
  });

  const req = merged.state.requirements[0];
  assert.strictEqual(req.status, "passed");
  assert.strictEqual(req.expectedBehavior, "登录失败显示明确错误提示");
  assert.strictEqual(req.actualBehavior, "登录失败时页面无反馈");
  assert.deepStrictEqual(req.reproSteps, ["打开登录页", "输入错误密码", "提交表单"]);
  assert.deepStrictEqual(req.dependsOn, ["REQ-AUTH-FORM"]);
  assert.strictEqual(req.canStartImmediately, false);
});

test("mergeState writes failure reason and actionable watchdog state consistently", () => {
  const base = {
    mode: { mode: "quick" },
    budgets: { remainingImplementationIterations: 2, implementationIterationsUsed: 0, totalCycles: 0 },
    requirements: [
      { id: "REQ-1", status: "implemented", summary: "implemented feature" },
    ],
    traceability: { iterations: [] },
    deltaAssessment: { status: "passed", previousStatus: "passed" },
  };
  const report = {
    status: "completed",
    summary: "changed code",
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
    status: "failed",
    command: "npm test",
    exitCode: 1,
    summary: "assertion failed",
  }, {
    iteration: 1,
    focus: { type: "implement_req", req_id: "REQ-1", summary: "implement" },
  });

  assert.strictEqual(merged.state.deltaAssessment.reason, "regression");
  assert.strictEqual(merged.state.deltaAssessment.status, "regression");
  assert.strictEqual(merged.state.watchdog.triggered, true);
  assert.strictEqual(merged.state.watchdog.requiredAction, "narrow_scope");
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
