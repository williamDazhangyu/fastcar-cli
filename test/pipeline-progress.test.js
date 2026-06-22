const assert = require("assert");
const { emitProgress } = require("../dist/pipeline/progress");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("human progress output stays high level while JSON keeps detailed events", () => {
  const chunks = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk, encoding, callback) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    if (typeof encoding === "function") {
      encoding();
    } else if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    emitProgress({ event: "worker_output", iter: 1, stream: "stdout", bytes: 120, last_output: "internal detail" });
    emitProgress({ event: "pipeline_progress", iter: 1, stage: "validation", budget_left: 3, req_counts: { pending: 1 } });
    const humanOutput = chunks.join("");
    assert(!humanOutput.includes("worker_output"));
    assert(!humanOutput.includes("internal detail"));
    assert(humanOutput.includes("📊 进度"));
    assert(humanOutput.includes("阶段=validation"));

    chunks.length = 0;
    emitProgress({ event: "worker_output", iter: 1, stream: "stdout", bytes: 120, last_output: "internal detail" }, { jsonProgress: true });
    const events = chunks.join("").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.strictEqual(events[0].event, "worker_output");
    assert.strictEqual(events[0].last_output, "internal detail");
  } finally {
    process.stdout.write = originalWrite;
  }
});

test("human progress uses visual status markers and colors when forced", () => {
  const chunks = [];
  const originalWrite = process.stdout.write;
  const previousForceColor = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = "1";
  process.stdout.write = (chunk, encoding, callback) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    if (typeof encoding === "function") {
      encoding();
    } else if (typeof callback === "function") {
      callback();
    }
    return true;
  };
  try {
    emitProgress({ event: "validation_done", iter: 2, status: "passed", command: "npm test" });
    emitProgress({ event: "validation_done", iter: 3, status: "failed", command: "npm test" });
    const output = chunks.join("");
    assert(output.includes("✅ 验证"));
    assert(output.includes("❌ 验证"));
    assert(output.includes("\u001b[32m"));
    assert(output.includes("\u001b[31m"));
  } finally {
    process.stdout.write = originalWrite;
    if (previousForceColor === undefined) {
      delete process.env.FORCE_COLOR;
    } else {
      process.env.FORCE_COLOR = previousForceColor;
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