const assert = require("assert");
const {
  addError,
  addWarning,
  normalizeRelativePathForCompare,
  requireArray,
  requireBooleanFields,
  requireEnumValue,
  requireNonEmptyStringFields,
  requireNonNegativeIntegerFields,
  requireNormalizedPath,
  requireNullableNonEmptyStringFields,
  requirePlainObject,
} = require("../dist/auto-iterate/stateValidationPrimitives");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

test("addError and addWarning append structured issues", () => {
  const issues = [];

  addError(issues, "bad");
  addWarning(issues, "risky");

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "bad" },
    { severity: "warning", message: "risky" },
  ]);
});

test("requirePlainObject and requireArray preserve existing Chinese diagnostics", () => {
  const issues = [];

  assert.strictEqual(requirePlainObject(issues, [], "state.json"), false);
  assert.strictEqual(requireArray(issues, {}, "state.json.items"), false);

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json 必须是对象" },
    { severity: "error", message: "state.json.items 必须是数组" },
  ]);
});

test("field validators validate batches and nullable strings", () => {
  const issues = [];
  const source = {
    name: "",
    enabled: "yes",
    count: -1,
    optional: null,
    missingOptional: "",
  };

  requireNonEmptyStringFields(issues, source, ["name"], "state");
  requireBooleanFields(issues, source, ["enabled"], "state");
  requireNonNegativeIntegerFields(issues, source, ["count"], "state");
  requireNullableNonEmptyStringFields(issues, source, ["optional", "missingOptional"], "state");

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.name 必须是非空字符串" },
    { severity: "error", message: "state.enabled 必须是 boolean" },
    { severity: "error", message: "state.count 必须是非负整数" },
    { severity: "error", message: "state.missingOptional 必须是非空字符串" },
  ]);
});

test("requireEnumValue reports missing and illegal values", () => {
  const issues = [];

  assert.strictEqual(requireEnumValue(issues, "passed", ["pending", "passed"], "state.status"), true);
  assert.strictEqual(requireEnumValue(issues, "", ["pending", "passed"], "state.status"), false);
  assert.strictEqual(requireEnumValue(issues, "done", ["pending", "passed"], "state.status"), false);

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.status=missing 不是合法值" },
    { severity: "error", message: "state.status=done 不是合法值" },
  ]);
});

test("requireNormalizedPath compares normalized relative paths", () => {
  const issues = [];

  assert.strictEqual(normalizeRelativePathForCompare(".\\agent-state\\state.md"), "agent-state/state.md");
  assert.strictEqual(requireNormalizedPath(issues, "./.agent-state/state.md", ".agent-state/state.md", "state.path"), true);
  assert.strictEqual(requireNormalizedPath(issues, "other/state.md", ".agent-state/state.md", "state.path"), false);

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.path=other/state.md，未指向 .agent-state/state.md" },
  ]);
});

let passed = 0;
for (const item of cases) {
  item.fn();
  passed += 1;
  console.log(`✓ ${item.name}`);
}

console.log(`\n${passed} test(s) passed.`);
