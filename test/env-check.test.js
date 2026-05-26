const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { checkEnvironment } = require("../src/pipeline/envCheck");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("envCheck 在环境变量配置 worker 时返回 usable", () => {
  const report = checkEnvironment({
    AUTO_ITERATE_KIMI_CMD: "node worker.js {result}",
  });
  assert.strictEqual(report.usable, true);
  assert.strictEqual(report.recommended, "kimi");
  assert.ok(report.workers_available.some((item) => item.id === "kimi" && item.source === "env"));
  assert.ok(report.workers_unavailable.every((item) => item.available === false));
  assert.ok(report.workers_unavailable.every((item) => item.reason === "not_found"));
});

test("envCheck 返回机器可读 no_worker_cli_found issue 和不可用 worker 明细", () => {
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = "";
    const report = checkEnvironment({});
    assert.strictEqual(report.usable, false);
    assert.deepStrictEqual(report.workers_available, []);
    assert.strictEqual(report.workers_unavailable.length, 5);
    assert.deepStrictEqual(report.workers_unavailable.map((item) => item.id), [
      "kimi",
      "codex",
      "claude",
      "gemini",
      "cursor",
    ]);
    assert.ok(report.workers_unavailable.every((item) => item.source === "missing"));
    assert.ok(report.workers_unavailable.every((item) => item.reason === "not_found"));
    assert.ok(report.issues.includes("no_worker_cli_found"));
  } finally {
    process.env.PATH = originalPath;
  }
});

test("envCheck 识别官方 Cursor Agent 的 agent 二进制", () => {
  const originalPath = process.env.PATH;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-cursor-agent-"));
  const command = process.platform === "win32" ? "agent.cmd" : "agent";
  const executable = path.join(dir, command);
  const content = process.platform === "win32"
    ? "@echo off\r\necho cursor-agent\r\n"
    : "#!/bin/sh\necho cursor-agent\n";
  fs.writeFileSync(executable, content, "utf8");
  if (process.platform !== "win32") {
    fs.chmodSync(executable, 0o755);
  }

  try {
    process.env.PATH = dir;
    const report = checkEnvironment({});
    const cursor = report.workers_available.find((item) => item.id === "cursor");
    assert.ok(cursor);
    assert.strictEqual(cursor.command, "agent");
    assert.strictEqual(cursor.source, "path");
  } finally {
    process.env.PATH = originalPath;
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
