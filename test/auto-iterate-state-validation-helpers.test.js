const assert = require("assert");
const {
  ENGINE_PHASES,
  countJsonRequirementStates,
  defaultPhaseBlockingRules,
  defaultPhaseEntryCriteria,
  defaultPhaseExitCriteria,
  hasValidatedBaseline,
  isEnginePhase,
  validateBudgetRelationships,
} = require("../dist/src/auto-iterate/stateValidationHelpers");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

test("ENGINE_PHASES preserves auto-iterate phase order", () => {
  assert.deepStrictEqual(ENGINE_PHASES, [
    "requirement",
    "contract",
    "baseline",
    "coding",
    "validation",
    "cleanup",
    "delivery",
  ]);
  assert.strictEqual(isEnginePhase("coding"), true);
  assert.strictEqual(isEnginePhase("unknown"), false);
});

test("default phase criteria return configured rules and empty arrays for unknown phases", () => {
  assert.deepStrictEqual(defaultPhaseEntryCriteria("requirement"), [
    "读取用户目标和原始清单",
    "提取 Requirement Coverage Matrix",
  ]);
  assert.deepStrictEqual(defaultPhaseExitCriteria("delivery"), [
    "deliveryEvidence ready/delivered 且 validate-state --strict-state 通过",
  ]);
  assert.deepStrictEqual(defaultPhaseBlockingRules("contract"), [
    "缺少 Implementation Contract 不得进入 coding",
    "成功标准为空必须 ask_user",
  ]);
  assert.deepStrictEqual(defaultPhaseEntryCriteria("unknown"), []);
  assert.deepStrictEqual(defaultPhaseExitCriteria("unknown"), []);
  assert.deepStrictEqual(defaultPhaseBlockingRules("unknown"), []);
});

test("countJsonRequirementStates counts all known statuses and unknown values", () => {
  const counts = countJsonRequirementStates([
    { status: "passed" },
    { status: "pending" },
    { status: "implemented" },
    { status: "not_verified" },
    { status: "blocked" },
    { status: "unexpected" },
    {},
  ]);

  assert.deepStrictEqual(counts, {
    passed: 1,
    pending: 1,
    implemented: 1,
    notVerified: 1,
    blocked: 1,
    unknown: 2,
  });
});

test("validateBudgetRelationships reports budget consistency errors", () => {
  const issues = [];

  validateBudgetRelationships(issues, {
    minimumImplementationIterations: 5,
    maxIterations: 3,
    totalCycles: 4,
    implementationIterationsUsed: 2,
    optimizationIterationsUsed: 1,
    nonImplementationIterationsUsed: 0,
  }, "state.json.budgets");

  assert.deepStrictEqual(issues, [
    {
      severity: "error",
      message: "state.json.budgets.totalCycles=4，但 implementationIterationsUsed + optimizationIterationsUsed + nonImplementationIterationsUsed=3",
    },
    {
      severity: "error",
      message: "state.json.budgets.minimumImplementationIterations=5 大于 maxIterations=3",
    },
  ]);
});

test("validateBudgetRelationships accepts null or valid minimum implementation iterations", () => {
  const issues = [];

  validateBudgetRelationships(issues, {
    minimumImplementationIterations: null,
    maxIterations: 3,
    totalCycles: 3,
    implementationIterationsUsed: 2,
    optimizationIterationsUsed: 1,
    nonImplementationIterationsUsed: 0,
  }, "state.json.budgets");

  assert.deepStrictEqual(issues, []);
});

test("hasValidatedBaseline requires terminal status and reason", () => {
  assert.strictEqual(hasValidatedBaseline(null), false);
  assert.strictEqual(hasValidatedBaseline({ status: "pending", reason: "waiting" }), false);
  assert.strictEqual(hasValidatedBaseline({ status: "passed", reason: "" }), false);
  assert.strictEqual(hasValidatedBaseline({ status: "failed", reason: "existing failure" }), true);
  assert.strictEqual(hasValidatedBaseline({ status: "skipped_with_reason", reason: "not available locally" }), true);
});

let passed = 0;
for (const item of cases) {
  item.fn();
  passed += 1;
  console.log(`✓ ${item.name}`);
}

console.log(`\n${passed} test(s) passed.`);
