const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { initAutoIterate } = require("../dist/auto-iterate/sessionRuntime");
const autoIterateEntry = require("../dist/auto-iterate");
const { buildAutoIterateHelp } = require("../dist/auto-iterate/sessionHelp");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function withTempCwd(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-session-runtime-"));
  process.chdir(dir);
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      process.chdir(previous);
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

function captureConsole(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  return Promise.resolve()
    .then(fn)
    .then((result) => ({ result, lines }))
    .finally(() => {
      console.log = original;
    });
}

function captureStdout(fn) {
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
  return Promise.resolve()
    .then(fn)
    .then((result) => ({ result, output: chunks.join("") }))
    .finally(() => {
      process.stdout.write = originalWrite;
    });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("package entry re-exports runtime initAutoIterate", () => {
  assert.strictEqual(autoIterateEntry.initAutoIterate, initAutoIterate);
});

test("initAutoIterate routes --help through extracted help renderer", async () => {
  const { lines } = await captureConsole(() => initAutoIterate(["--help"]));

  assert.strictEqual(lines.length, 1);
  assert.strictEqual(lines[0], buildAutoIterateHelp());
});

test("initAutoIterate routes --examples without creating session files", async () => {
  await withTempCwd(async () => {
    const { lines } = await captureConsole(() => initAutoIterate(["--examples", "Codex"]));

    assert(lines.join("\n").includes("Codex /goal 与 worker dispatch"));
    assert(!fs.existsSync(".agent-state"));
  });
});

test("interactive auto-iterate guidance prefers CLI run and marks fallback explicitly", async () => {
  await withTempCwd(async () => {
    const { lines } = await captureConsole(() => initAutoIterate([
      "--quick",
      "--goal",
      "启动提示验证",
      "--session",
      "guidance-check",
      "--yes",
      "--no-run",
    ]));
    const output = lines.join("\n");

    assert(output.includes("CLI 驱动默认路径: fastcar-cli auto-iterate --check --json-progress 后接 --run --json-progress"));
    assert(output.includes("手动/fallback 路径示例: fastcar-cli auto-iterate --strict --from <清单文档路径> --session <session> --yes --no-run"));
    assert(!output.includes("也可以使用: fastcar-cli auto-iterate --from <清单文档路径>"));
  });
});

test("initAutoIterate creates noninteractive quick session through runtime module", async () => {
  await withTempCwd(async () => {
    const { lines } = await captureConsole(() => initAutoIterate([
      "--quick",
      "--goal",
      "运行时抽取验证",
      "--session",
      "runtime-session",
      "--yes",
    ]));

    assert(lines.join("\n").includes("Session 机器状态"));
    assert(fs.existsSync(".agent-state/auto-iterate/runtime-session/state.json"));
    const state = readJson(".agent-state/auto-iterate/runtime-session/state.json");
    assert.strictEqual(state.task.goal, "运行时抽取验证");
    assert.strictEqual(state.mode.mode, "quick");
    assert.strictEqual(readJson(".agent-state/auto-iterate-current.json").session, "runtime-session");
  });
});

test("initAutoIterate emits json-progress error for invalid --run combinations", async () => {
  await withTempCwd(async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = 0;

    const { output } = await captureStdout(() => initAutoIterate([
      "--run",
      "--validate-state",
      "demo",
      "--json-progress",
    ]));

    assert.strictEqual(process.exitCode, 1);
    const events = output.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert(events.some((event) => event.event === "error" && event.reason === "invalid_run_flag_combination"));
    process.exitCode = previousExitCode;
  });
});

(async () => {
  let passed = 0;
  for (const item of cases) {
    try {
      await item.fn();
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
})();
