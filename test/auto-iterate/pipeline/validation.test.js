const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseValidationCommands, runValidationCommands } = require("../../../dist/pipeline/pipelineValidationRunner");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function makeProject() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-pipeline-validation-"));
  fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({ name: "fixture", private: true }, null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "README.md"), "# fixture\n", "utf8");
  return projectDir;
}

test("runValidationCommands 依次执行全部命令并在失败时停止", async () => {
  const projectDir = makeProject();
  const iterationDir = path.join(projectDir, "iteration");
  fs.mkdirSync(iterationDir);
  fs.writeFileSync(path.join(projectDir, "marker.txt"), "", "utf8");
  const result = await runValidationCommands([
    { executable: process.execPath, args: ["-e", "require('fs').appendFileSync('marker.txt','1')"] },
    { executable: process.execPath, args: ["-e", "require('fs').appendFileSync('marker.txt','2'); process.exit(1)"] },
    { executable: process.execPath, args: ["-e", "require('fs').appendFileSync('marker.txt','3')"] },
  ], projectDir, iterationDir);
  assert.strictEqual(result.status, "failed");
  assert.strictEqual(result.results.length, 2);
  assert.strictEqual(fs.readFileSync(path.join(projectDir, "marker.txt"), "utf8"), "12");
});

test("runValidationCommands 无命令时也写入 not_run 证据日志", async () => {
  const projectDir = makeProject();
  const iterationDir = path.join(projectDir, "iteration");
  fs.mkdirSync(iterationDir);
  const result = await runValidationCommands([], projectDir, iterationDir, { code: "zh" });
  assert.strictEqual(result.status, "not_run");
  const log = fs.readFileSync(path.join(iterationDir, "validation.log"), "utf8");
  assert.ok(log.includes("status: not_run"));
  assert.ok(log.includes("command: none"));
  assert.ok(log.includes("未配置可运行的 CLI 验证命令"));

  const postMerge = await runValidationCommands([], projectDir, iterationDir, { code: "en" }, {
    logFileName: "post-merge-validation.log",
  });
  assert.strictEqual(postMerge.status, "not_run");
  const postMergeLog = fs.readFileSync(path.join(iterationDir, "post-merge-validation.log"), "utf8");
  assert.ok(postMergeLog.includes("status: not_run"));
  assert.ok(postMergeLog.includes("No runnable CLI validation command is configured"));
});

test("parseValidationCommands 只过滤完整占位符，不误删合法命令", () => {
  const commands = parseValidationCommands({
    validation: {
      commands: [
        "not_run",
        "未指定",
        "npm test -- --grep not_run",
        { command: "node scripts/由Agent生成的测试.js" },
        { executable: "node", args: ["scripts/structured-validation.js"] },
        "npm test && echo injected",
        { command: "npm test -- historical", result: "passed", iteration: 1 },
        { command: "npm run lint -- historical", status: "failed", phase: "post_merge" },
      ],
    },
  });
  assert.deepStrictEqual(commands, [
    "npm test -- --grep not_run",
    "node scripts/由Agent生成的测试.js",
    "node scripts/structured-validation.js",
  ]);
});

test("runValidationCommands 支持自定义超时", async () => {
  const projectDir = makeProject();
  const result = await runValidationCommands([
    { executable: process.execPath, args: ["-e", "setTimeout(()=>{}, 1000)"] },
  ], projectDir, projectDir, { code: "zh" }, { timeoutMs: 100 });
  assert.strictEqual(result.status, "failed");
  assert.strictEqual(result.exitCode, 1);
});

test("runValidationCommands 异步启动验证命令，不阻塞事件循环", async () => {
  const projectDir = makeProject();
  const startedAt = Date.now();
  const pending = runValidationCommands([
    { executable: process.execPath, args: ["-e", "setTimeout(()=>process.exit(0), 300)"] },
  ], projectDir, projectDir, { code: "zh" }, { timeoutMs: 1000 });
  const returnedAfterMs = Date.now() - startedAt;

  assert.ok(returnedAfterMs < 150, `runValidationCommands returned after ${returnedAfterMs}ms`);
  const result = await pending;
  assert.strictEqual(result.status, "passed");
});

test("runValidationCommands 超时无输出时返回可诊断摘要", async () => {
  const projectDir = makeProject();
  const result = await runValidationCommands([
    { executable: process.execPath, args: ["-e", "setTimeout(()=>{}, 1000)"] },
  ], projectDir, projectDir, { code: "zh" }, { timeoutMs: 100 });
  assert.strictEqual(result.status, "failed");
  assert.ok(/error=|signal=|exit_code=/.test(result.summary), result.summary);
  assert.notStrictEqual(result.summary, "");
});

test("runValidationCommands 支持显式关闭超时", async () => {
  const projectDir = makeProject();
  const result = await runValidationCommands([
    { executable: process.execPath, args: ["-e", "setTimeout(()=>process.exit(0), 120)"] },
  ], projectDir, projectDir, { code: "zh" }, { timeoutMs: 0 });
  assert.strictEqual(result.status, "passed");
  assert.strictEqual(result.exitCode, 0);
});

test("runValidationCommands 不经 shell 解释并拒绝复杂 shell 字符串", async () => {
  const projectDir = makeProject();
  const iterationDir = path.join(projectDir, "iteration");
  fs.mkdirSync(iterationDir);
  const injectedPath = path.join(projectDir, "injected.txt");
  const result = await runValidationCommands([
    `${process.execPath} -e "require('fs').writeFileSync('ok.txt','1')" && ${process.execPath} -e "require('fs').writeFileSync('injected.txt','1')"`,
  ], projectDir, iterationDir, { code: "zh" });
  assert.strictEqual(result.status, "not_run");
  assert.strictEqual(fs.existsSync(injectedPath), false);
  const log = fs.readFileSync(path.join(iterationDir, "validation.log"), "utf8");
  assert.ok(log.includes("runner: deterministic_node_spawn"));
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
