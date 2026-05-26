const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("WORKER.md 覆盖 pipeline focus 类型", () => {
  const worker = read("skills/auto-iterate-coding/worker.md");
  const pickFocus = read("src/pipeline/pickFocus.js");
  const focusTypes = Array.from(pickFocus.matchAll(/type:\s*"([^"]+)"/g)).map((match) => match[1]);
  for (const focus of focusTypes) {
    assert.ok(worker.includes(focus), `WORKER.md should mention focus ${focus}`);
  }
});

test("ORCHESTRATOR.md 覆盖核心 pipeline 模块", () => {
  const orchestrator = read("skills/auto-iterate-coding/orchestrator.md");
  [
    "runPipeline.js",
    "iterationPrompt.js",
    "iterationPaths.js",
    "pickFocus.js",
    "mergeState.js",
    "shouldStop.js",
    "resultSchema.js",
    "envCheck.js",
    "progress.js",
    "watchdog.js",
    "phaseGate.js",
    "writeGuard.js",
    "routerUx.js",
    "loopPolicy.js",
    "flags.js",
    "deliveryDocs.js",
  ].forEach((name) => {
    assert.ok(orchestrator.includes(name), `ORCHESTRATOR.md should mention ${name}`);
  });
});

test("SKILL.md 声明 CLI 驱动路径和 fallback 边界", () => {
  const skill = read("skills/auto-iterate-coding/skill.md");
  assert.ok(skill.includes("执行路径识别"));
  assert.ok(skill.includes("CLI 驱动路径"));
  assert.ok(skill.includes("无 CLI fallback"));
  assert.ok(skill.includes("fastcar-cli auto-iterate --run --autopilot --json-progress"));
});

test("AGENTS.md 声明 Router 与 Worker 分工", () => {
  const agents = read("AGENTS.md");
  assert.ok(agents.includes("CLI 驱动迁移公告"));
  assert.ok(agents.includes("Router / Worker 硬边界"));
  assert.ok(agents.includes("Router LLM"));
  assert.ok(agents.includes("need_decision"));
  assert.ok(agents.includes("不得要求用户复制 prompt"));
  assert.ok(agents.includes("不得要求用户手动运行"));
  assert.ok(agents.includes("不得修改 `.agent-state/auto-iterate/**` 中除本轮指定 `result.json` 以外的文件"));
  assert.ok(agents.includes("CLI 是 state merge、预算推进、验证命令、write guard、delivery gate 和 `need_decision` resume 的唯一权威执行者"));
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
