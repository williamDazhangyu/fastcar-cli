const assert = require("assert");
const { pickNextFocus } = require("../../../dist/pipeline/pickFocus");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
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

test("pickNextFocus routes validation failure classifications", () => {
  const base = {
    postChange: { status: "failed" },
    currentState: { lastValidationResult: "failed" },
    requirements: [
      { id: "REQ-1", status: "implemented", summary: "implemented feature" },
    ],
  };

  assert.strictEqual(
    pickNextFocus({ ...base, deltaAssessment: { reason: "environment" } }),
    null,
  );

  const missingTest = pickNextFocus({ ...base, deltaAssessment: { reason: "missing_test" } });
  assert.strictEqual(missingTest.type, "implement_req");
  assert.strictEqual(missingTest.req_id, "REQ-1");
  assert(missingTest.summary.includes("补充验证测试"));

  const regression = pickNextFocus({ ...base, deltaAssessment: { reason: "regression" } });
  assert.strictEqual(regression.type, "fix_bug");
  assert.strictEqual(regression.req_id, "REQ-1");
  assert(regression.summary.includes("修复回归"));
});

test("pickNextFocus narrows budget-tight work and skips optimize for small complexity", () => {
  const tight = pickNextFocus({
    budgets: { remainingImplementationIterations: 2 },
    requirements: [
      { id: "REQ-1", status: "pending", summary: "one" },
      { id: "REQ-2", status: "pending", summary: "two" },
      { id: "REQ-3", status: "not_verified", summary: "three" },
    ],
  });
  assert.strictEqual(tight.type, "implement_req");
  assert(tight.summary.includes("预算紧张"));

  const smallDone = pickNextFocus({
    taskProfile: { complexity: "small" },
    watchdog: {
      validationHardeningStatus: "passed",
      validationHardeningDimensionsDone: ["boundary", "negative", "regression"],
    },
    requirements: [
      { id: "REQ-1", status: "passed", summary: "done" },
    ],
  });
  assert.strictEqual(smallDone, null);
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
