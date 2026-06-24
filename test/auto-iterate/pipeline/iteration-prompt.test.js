const assert = require("assert");
const { buildIterationPrompt } = require("../../../dist/pipeline/iterationPrompt");
const { buildWorkerCapabilityPolicy } = require("../../../dist/pipeline/workerCapabilityPolicy");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

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