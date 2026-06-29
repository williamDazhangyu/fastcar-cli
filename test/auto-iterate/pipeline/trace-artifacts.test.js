const assert = require("assert");
const {
  buildDecisionsMarkdown,
  buildHandoffMarkdown,
  buildTraceJsonlContent,
} = require("../../../dist/pipeline/traceArtifacts");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

test("trace artifacts sanitize sensitive text from legacy state", () => {
  const state = {
    task: { goal: "修复 token=abc123 泄漏" },
    currentState: { currentPhase: "coding", currentTask: "implement_req:REQ-1", overallStatus: "in_progress", nextAction: "run password=secret" },
    requirements: [{ id: "REQ-1", status: "passed" }],
    traceability: {
      policy: "public only",
      iterations: [{
        iteration: 1,
        focus: { type: "implement_req", reqId: "REQ-1" },
        summary: "used apiKey=private-key",
        rationaleSummary: "checked authorization: Bearer private-token",
        decisions: ["keep password=hunter2 out"],
        evidence: [{ token: "raw-token" }],
        filesChanged: ["src/demo.ts"],
        validation: { status: "passed", command: "node test.js --secret=value", exitCode: 0, summary: "secret=ok" },
        risks: "email admin@example.com",
      }],
    },
    validation: { finalVerifiability: "verifiable" },
    postChange: { status: "passed", command: "node test.js" },
    watchdog: { triggered: false, requiredAction: "continue", deliveryVerifiability: "verifiable" },
    deliveryEvidence: { status: "ready", unfinishedItems: "无", risks: "password=none" },
    budgets: { remainingImplementationIterations: 1, totalCycles: 1 },
  };

  const combined = [
    buildTraceJsonlContent(state),
    buildDecisionsMarkdown(state),
    buildHandoffMarkdown(state),
  ].join("\n");

  assert(!combined.includes("abc123"));
  assert(!combined.includes("private-key"));
  assert(!combined.includes("private-token"));
  assert(!combined.includes("hunter2"));
  assert(!combined.includes("admin@example.com"));
  assert(combined.includes("[REDACTED]"));
  assert(combined.includes("[REDACTED]"));
});

(async () => {
  let passed = 0;
  for (const item of cases) {
    try {
      await item.fn();
      passed += 1;
      console.log(`✓ ${item.name}`);
    } catch (error) {
      console.error(`✗ ${item.name}`);
      console.error(error);
      process.exitCode = 1;
      break;
    }
  }

  if (process.exitCode !== 1) {
    console.log(`\n${passed} test(s) passed.`);
  }
})();
