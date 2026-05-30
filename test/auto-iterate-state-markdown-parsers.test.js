const assert = require("assert");
const {
  extractSection,
  extractFirstSection,
  parseScalar,
  parseSubAgentList,
  splitAssignedFiles,
  stateHeadingExists,
  parseStateNumber,
  parseStateBoolean,
  parseStateList,
  parseFileList,
} = require("../dist/src/auto-iterate/stateMarkdownParsers");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

test("extractSection and extractFirstSection read markdown sections", () => {
  const content = [
    "## Task / 任务",
    "goal：迁移 parser",
    "## Budgets / 预算",
    "max_iterations：10",
    "## Notes / 备注",
    "done",
  ].join("\n");

  assert.strictEqual(extractSection(content, "## Task / 任务"), "goal：迁移 parser");
  assert.strictEqual(
    extractFirstSection(content, ["## Missing", "## Budgets / 预算"]),
    "max_iterations：10",
  );
  assert.strictEqual(extractSection(content, "## Missing"), "");
});

test("parseScalar preserves Chinese colon field behavior", () => {
  const section = [
    "session：demo",
    "状态文件：.agent-state/auto-iterate/demo/state.md",
  ].join("\n");

  assert.strictEqual(parseScalar(section, "session", "unknown"), "demo");
  assert.strictEqual(
    parseScalar(section, "状态文件", ""),
    ".agent-state/auto-iterate/demo/state.md",
  );
  assert.strictEqual(parseScalar(section, "missing", "fallback"), "fallback");
});

test("parseSubAgentList parses block and inline forms", () => {
  const block = [
    "active_sub_agents：",
    "  - agent_id：coder-1",
    "    type：coder",
    "    files_assigned：src/a.js, test/a.test.js",
    "  - agent_id：verify-1",
    "    type：background",
    "active_sub_agents_item_template：",
  ].join("\n");

  assert.deepStrictEqual(parseSubAgentList(block, "active_sub_agents"), [
    {
      raw: "- agent_id：coder-1\n    type：coder\n    files_assigned：src/a.js, test/a.test.js",
      agent_id: "coder-1",
      type: "coder",
      files_assigned: "src/a.js, test/a.test.js",
    },
    {
      raw: "- agent_id：verify-1\n    type：background",
      agent_id: "verify-1",
      type: "background",
    },
  ]);

  assert.deepStrictEqual(parseSubAgentList("active_sub_agents：worker-1", "active_sub_agents"), [
    { raw: "worker-1" },
  ]);
  assert.deepStrictEqual(parseSubAgentList("active_sub_agents：无", "active_sub_agents"), []);
});

test("state parser helpers preserve legacy coercion rules", () => {
  const section = [
    "count：12 / 20",
    "negative：-3",
    "enabled：true - yes",
    "disabled：false",
    "items：a、b,c，d/e",
  ].join("\n");

  assert.strictEqual(parseStateNumber(section, "count", 0), 12);
  assert.strictEqual(parseStateNumber(section, "negative", 0), -3);
  assert.strictEqual(parseStateNumber(section, "missing", 7), 7);
  assert.strictEqual(parseStateBoolean(section, "enabled", false), true);
  assert.strictEqual(parseStateBoolean(section, "disabled", true), false);
  assert.strictEqual(parseStateBoolean(section, "missing", true), true);
  assert.deepStrictEqual(parseStateList(section, "items"), ["a", "b", "c", "d", "e"]);
});

test("file and heading helpers preserve loose markdown matching", () => {
  const content = [
    "## Validation / 验证",
    "已通过验证：false",
  ].join("\n");

  assert.strictEqual(stateHeadingExists(content, "## Validation / 验证"), true);
  assert.strictEqual(stateHeadingExists(content, "## Validation"), true);
  assert.strictEqual(stateHeadingExists(content, "## Missing / 缺失"), false);
  assert.deepStrictEqual(splitAssignedFiles("a.js, b.js、无 未分配 not_run N/A c.js"), [
    "a.js",
    "b.js",
    "c.js",
  ]);
  assert.deepStrictEqual(parseFileList("a.js,b.js\nc.js"), ["a.js", "b.js", "c.js"]);
});

let passed = 0;
for (const item of cases) {
  try {
    item.fn();
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
