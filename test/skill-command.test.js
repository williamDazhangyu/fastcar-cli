const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("skill list reads packaged skills from root skills directory", () => {
  const cliPath = path.join(__dirname, "..", "bin", "cli.js");
  const result = spawnSync(process.execPath, [cliPath, "skill", "list"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });

  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes("没有可用的 skills"), result.stdout);
  assert.ok(result.stdout.includes("auto-iterate-coding"), result.stdout);
  assert.ok(result.stdout.includes("fastcar-framework"), result.stdout);
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
