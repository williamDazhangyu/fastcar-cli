const assert = require("assert");
const { pickNextFocus } = require("../dist/pipeline/pickFocus");

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