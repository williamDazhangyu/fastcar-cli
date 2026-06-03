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

    assert(lines.join("\n").includes("Agent skill 发现、goal 与 worker dispatch"));
    assert(!fs.existsSync(".agent-state"));
  });
});

test("interactive auto-iterate output is concise while generated prompt keeps execution details", async () => {
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

    assert(output.includes("初始化 auto-iterate session。"));
    assert(output.includes("✓ auto-iterate session 已生成"));
    assert(output.includes("📊 进度: session=guidance-check"));
    assert(output.includes("execution=protocol_only"));
    assert(output.includes("终端只显示关键进展"));
    assert(!output.includes("Requirement Coverage Matrix"));
    assert(!output.includes("Watchdog"));

    const prompt = fs.readFileSync(".agent-state/auto-iterate/guidance-check/start-prompt.md", "utf8");
    assert(prompt.includes("执行模式：protocol_only / LLM-only"));
    assert(prompt.includes("Requirement Coverage Matrix"));
    assert(prompt.includes("Watchdog"));
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

    const output = lines.join("\n");
    assert(output.includes("🧭 执行: 读取 .agent-state/auto-iterate/runtime-session/start-prompt.md 和 .agent-state/auto-iterate/runtime-session/state.json 后开始"));
    assert(!output.includes("Session 机器状态"));
    assert(fs.existsSync(".agent-state/auto-iterate/runtime-session/state.json"));
    const state = readJson(".agent-state/auto-iterate/runtime-session/state.json");
    assert.strictEqual(state.task.goal, "运行时抽取验证");
    assert.strictEqual(state.mode.mode, "quick");
    assert.strictEqual(state.mode.executionMode, "native_subagent");
    assert.strictEqual(readJson(".agent-state/auto-iterate-current.json").session, "runtime-session");
  });
});

test("initAutoIterate rejects deprecated --run pipeline path", async () => {
  await withTempCwd(async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = 0;

    const { output } = await captureStdout(() => initAutoIterate([
      "--run",
      "--json-progress",
    ]));

    assert.strictEqual(process.exitCode, 1);
    const events = output.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert(events.some((event) =>
      event.event === "error" &&
      event.reason === "legacy_auto_iterate_pipeline_deprecated" &&
      event.command === "--run"
    ));
    assert(!fs.existsSync(".agent-state"));
    process.exitCode = previousExitCode;
  });
});

test("initAutoIterate rejects deprecated --check worker environment path", async () => {
  await withTempCwd(async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = 0;

    const { output } = await captureStdout(() => initAutoIterate([
      "--check",
      "--json-progress",
    ]));

    assert.strictEqual(process.exitCode, 1);
    const events = output.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert(events.some((event) =>
      event.event === "error" &&
      event.reason === "legacy_auto_iterate_pipeline_deprecated" &&
      event.command === "--check"
    ));
    assert(!fs.existsSync(".agent-state"));
    process.exitCode = previousExitCode;
  });
});

test("initAutoIterate rejects deprecated --dispatch external worker path", async () => {
  await withTempCwd(async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = 0;

    const { lines } = await captureConsole(() => initAutoIterate([
      "--dispatch",
      "demo",
      "--agent",
      "codex",
      "--task",
      "处理 REQ-1",
      "--files",
      "src/a.ts",
      "--dry-run",
    ]));

    assert.strictEqual(process.exitCode, 1);
    assert(lines.join("\n").includes("--dispatch 属于已废弃的外部 Worker/pipeline 入口"));
    assert(!fs.existsSync(".agent-state"));
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
