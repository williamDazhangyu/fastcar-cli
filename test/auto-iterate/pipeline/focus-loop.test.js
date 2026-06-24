const assert = require("assert");
const { isFocusAllowedForMode, pickNextFocus } = require("../../../dist/pipeline/pickFocus");
const { shouldStop } = require("../../../dist/pipeline/shouldStop");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

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
  assert.strictEqual(shouldStop(state, null, { once: true }, "quick").stop, false);
  assert.strictEqual(shouldStop(state, null, { once: true, runCyclesCompleted: 1 }, "quick").reason, "once_completed");
});

test("shouldStop 在 optimize 模式使用独立优化预算", () => {
  const state = {
    mode: { mode: "optimize" },
    budgets: {
      remainingImplementationIterations: 10,
      remainingOptimizationIterations: 0,
    },
    watchdog: { requiredAction: "continue" },
    requirements: [{ id: "REQ-1", summary: "one", status: "pending" }],
  };
  assert.strictEqual(shouldStop(state, null, {}, "optimize").reason, "budget_exhausted");
  assert.strictEqual(shouldStop(state, null, {}, "quick").reason, "continue");
  state.optimization = { status: "implemented" };
  assert.strictEqual(shouldStop(state, null, {}, "optimize").reason, "continue");
});

test("shouldStop 在 runtime autopilot 下用 totalCycles 限制所有迭代类型", () => {
  const state = {
    mode: { mode: "diagnose", runtimeAutopilot: true },
    budgets: {
      autopilotMaxIterations: 3,
      implementationIterationsUsed: 0,
      nonImplementationIterationsUsed: 3,
      totalCycles: 3,
      remainingImplementationIterations: 10,
    },
    watchdog: { requiredAction: "continue" },
    requirements: [{ id: "REQ-1", summary: "open", status: "pending" }],
  };
  assert.strictEqual(shouldStop(state, null, {}, "diagnose").reason, "budget_exhausted");
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
    requirements: [{ id: "REQ-1", summary: "done", status: "passed" }],
    watchdog: { validationHardeningStatus: "passed" },
  }, null, "quick").type, "optimize");

  assert.strictEqual(pickNextFocus({
    requirements: [{ id: "REQ-1", summary: "done", status: "passed" }],
    watchdog: { validationHardeningStatus: "passed" },
    optimization: { status: "implemented" },
  }, null, "prototype").type, "verify_optimization");

  assert.strictEqual(pickNextFocus({
    requirements: [{ id: "REQ-1", summary: "done", status: "passed" }],
    watchdog: { validationHardeningStatus: "passed" },
    optimization: { status: "implemented" },
  }, null, "strict").type, "verify_optimization");

  assert.deepStrictEqual(pickNextFocus({
    baseline: { status: "ready" },
    diagnose: { hypotheses: ["maybe cache"] },
    requirements: [],
  }, null, "diagnose"), {
    type: "hypothesis_test",
    req_id: "H1",
    summary: "验证诊断假设 H1: maybe cache",
  });

  assert.deepStrictEqual(pickNextFocus({
    baseline: { status: "ready" },
    diagnose: { hypotheses: [{ reason: "object hypothesis" }] },
    requirements: [],
  }, null, "diagnose"), {
    type: "hypothesis_test",
    req_id: "H1",
    summary: "验证诊断假设 H1: {\"reason\":\"object hypothesis\"}",
  });

  assert.deepStrictEqual(pickNextFocus({
    baseline: { status: "ready" },
    diagnose: {
      hypothesisQueue: [
        { id: "H1", summary: "already checked", priority: 1, status: "rejected", evidence: "no" },
        { id: "H2", summary: "maybe cache", priority: 2, status: "pending", evidence: "" },
      ],
    },
    requirements: [],
  }, null, "diagnose"), {
    type: "hypothesis_test",
    req_id: "H2",
    summary: "验证诊断假设 H2: maybe cache",
  });

  assert.strictEqual(pickNextFocus({
    baseline: { status: "ready" },
    requirements: [{ id: "REQ-BUG", summary: "bug", status: "implemented" }],
  }, null, "diagnose").type, "fix_bug");

  assert.strictEqual(pickNextFocus({
    baseline: { status: "ready" },
    requirements: [{ id: "REQ-BLOCKED", summary: "needs user", status: "blocked" }],
  }, null, "diagnose"), null);

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
