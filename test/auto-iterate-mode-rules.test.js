const assert = require("assert");
const { IMPLEMENTATION_MODES, isImplementationMode } = require("../src/auto-iterate/modeRules");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

test("isImplementationMode centralizes implementation mode semantics", () => {
  assert.deepStrictEqual(IMPLEMENTATION_MODES, ["strict", "quick", "diagnose", "prototype"]);
  for (const mode of IMPLEMENTATION_MODES) {
    assert.strictEqual(isImplementationMode(mode), true);
  }

  for (const mode of ["verify", "plan", "optimize", "", null, undefined]) {
    assert.strictEqual(isImplementationMode(mode), false);
  }
});

async function main() {
  let failed = 0;
  for (const item of cases) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      failed += 1;
      console.error(`✗ ${item.name}`);
      console.error(error);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${cases.length} test(s) passed.`);
}

main();
