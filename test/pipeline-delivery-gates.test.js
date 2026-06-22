const assert = require("assert");
const { evaluateDeliveryGates } = require("../dist/pipeline/deliveryGates");
const { shouldStop } = require("../dist/pipeline/shouldStop");

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