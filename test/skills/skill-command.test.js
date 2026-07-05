const assert = require("assert");
const fs = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("skill list reads packaged skills from root skills directory", () => {
  const cliPath = path.join(repoRoot, "bin", "cli.js");
  const result = spawnSync(process.execPath, [cliPath, "skill", "list"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes("没有可用的 skills"), result.stdout);
  assert.ok(result.stdout.includes("auto-iterate-coding"), result.stdout);
  assert.ok(result.stdout.includes("面向 AI Coding Agent 的有界自动迭代开发协议"), result.stdout);
  assert.ok(!result.stdout.includes("'面向 AI Coding Agent"), result.stdout);
  assert.ok(result.stdout.includes("fastcar-framework"), result.stdout);
});

test("package metadata exposes shipped skills for npm-based installers", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const skillNames = fs.readdirSync(path.join(repoRoot, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.ok(packageJson.files.includes("skills"), "npm package must publish the skills directory");

  for (const metadataField of ["agents", "agentskills"]) {
    assert.ok(packageJson[metadataField], `package.json must declare ${metadataField}`);
    assert.ok(Array.isArray(packageJson[metadataField].skills), `${metadataField}.skills must be an array`);

    const declaredSkills = packageJson[metadataField].skills
      .map((skill) => skill.name)
      .sort();

    assert.deepStrictEqual(declaredSkills, skillNames, `${metadataField}.skills must match skills/* directories`);

    for (const skill of packageJson[metadataField].skills) {
      const expectedPath = `./skills/${skill.name}`;
      assert.strictEqual(skill.path, expectedPath, `${metadataField} path mismatch for ${skill.name}`);
      assert.ok(
        fs.existsSync(path.join(repoRoot, skill.path, "SKILL.md")),
        `${metadataField} path must contain SKILL.md for ${skill.name}`,
      );
    }
  }
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
