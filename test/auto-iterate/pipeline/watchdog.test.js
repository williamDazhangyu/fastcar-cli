const assert = require("assert");
const { evaluateWatchdog } = require("../../../dist/pipeline/watchdog");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

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

test("watchdog reports reconcile, fresh-eyes, and hardening gaps", () => {
  assert.deepStrictEqual(
    evaluateWatchdog({}, { reconcileStatus: "suspected" }),
    { triggered: true, requiredAction: "reconcile", reason: "state_drift" },
  );
  assert.deepStrictEqual(
    evaluateWatchdog({ watchdog: { freshEyesRequired: true } }),
    { triggered: true, requiredAction: "context_compress_and_review", reason: "fresh_eyes_required" },
  );
  assert.deepStrictEqual(
    evaluateWatchdog({ watchdog: { validationHardeningStatus: "pending" } }, { allRequirementsPassed: true }),
    { triggered: true, requiredAction: "run_validation", reason: "hardening_gap" },
  );
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
