const assert = require("assert");
const { collectDeprecatedFlags, parseArgs } = require("../dist/auto-iterate/args");

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

test("parseArgs handles dashboard and query values without treating them as goals", () => {
  const dashboard = parseArgs(["--dashboard", "login-fix"]);
  assert.strictEqual(dashboard.dashboardSession, "login-fix");
  assert.strictEqual(dashboard.goal, null);

  const query = parseArgs(["--examples", "protocol", "--query", "dashboard"]);
  assert.strictEqual(query.examples, true);
  assert.strictEqual(query.query, "dashboard");
  assert.strictEqual(query.goal, null);
});

test("parseArgs collects deprecated worker and pipeline flags without inferring goals", () => {
  const options = parseArgs([
    "--dispatch",
    "demo",
    "--agent",
    "codex",
    "--task",
    "x",
    "--verify-cmd=npm test",
    "--run",
  ]);

  assert.deepStrictEqual(options.deprecatedFlags, [
    "--agent",
    "--dispatch",
    "--run",
    "--task",
    "--verify-cmd",
  ]);
  assert.strictEqual(options.goal, null);
  assert.deepStrictEqual(collectDeprecatedFlags(["--check", "--json-progress"]), [
    "--check",
    "--json-progress",
  ]);
});

test("parseArgs initializes help and parses mode shortcuts", () => {
  const defaults = parseArgs([]);
  assert.strictEqual(defaults.help, false);

  const help = parseArgs(["--help"]);
  assert.strictEqual(help.help, true);
});

test("parseArgs does not treat unknown flags as inferred goals", () => {
  const missingValue = parseArgs(["--session"]);
  assert.strictEqual(missingValue.session, null);
  assert.strictEqual(missingValue.goal, null);

  const unknownFlag = parseArgs(["--unknown-flag"]);
  assert.strictEqual(unknownFlag.goal, null);
});

let passed = 0;
for (const item of cases) {
  item.fn();
  passed += 1;
  console.log(`✓ ${item.name}`);
}

console.log(`\n${passed} test(s) passed.`);
