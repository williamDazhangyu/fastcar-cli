const assert = require("assert");
const { parseArgs } = require("../dist/src/auto-iterate/args");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

test("parseArgs infers free-form goal without swallowing option values", () => {
  const options = parseArgs([
    "--quick",
    "--session",
    "login-fix",
    "--max-iterations",
    "5",
    "目标：修复登录失败",
  ]);

  assert.strictEqual(options.mode, "quick");
  assert.strictEqual(options.session, "login-fix");
  assert.strictEqual(options.maxIterations, 5);
  assert.strictEqual(options.goal, "修复登录失败");
});

test("parseArgs handles optional session flags without treating their values as goals", () => {
  const options = parseArgs(["--validate-state", "login-fix"]);

  assert.strictEqual(options.validateState, "login-fix");
  assert.strictEqual(options.goal, null);
});

test("parseArgs preserves pipeline run flags and repeated validate commands", () => {
  const options = parseArgs([
    "--run",
    "--once",
    "--json-progress",
    "--validate-cmd",
    "npm run typecheck",
    "--validate-cmd=node test/router-ux.test.js",
    "--step-timeout=0",
    "--inactivity-timeout",
    "0",
    "--autopilot-max=3",
  ]);

  assert.strictEqual(options.run, true);
  assert.strictEqual(options.once, true);
  assert.strictEqual(options.jsonProgress, true);
  assert.deepStrictEqual(options.validateCommand, [
    "npm run typecheck",
    "node test/router-ux.test.js",
  ]);
  assert.strictEqual(options.stepTimeoutSeconds, 0);
  assert.strictEqual(options.inactivityTimeoutSeconds, 0);
  assert.strictEqual(options.autopilotMaxIterations, 3);
});

test("parseArgs preserves explicit zero run budget flags", () => {
  const options = parseArgs([
    "--run",
    "--max-steps=0",
    "--autopilot-max-iterations",
    "0",
  ]);

  assert.strictEqual(options.maxSteps, 0);
  assert.strictEqual(options.autopilotMaxIterations, 0);
});

let passed = 0;
for (const item of cases) {
  item.fn();
  passed += 1;
  console.log(`✓ ${item.name}`);
}

console.log(`\n${passed} test(s) passed.`);
