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
    const { lines } = await captureConsole(() => initAutoIterate(["--examples", "protocol"]));

    assert(lines.join("\n").includes("Protocol-only / LLM-only"));
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
    const state = readJson(".agent-state/auto-iterate/guidance-check/state.json");
    assert.strictEqual(state.mode.executionMode, "protocol_only");
    assert.strictEqual(state.subAgentDispatch.enabled, false);
    assert.strictEqual(state.subAgentDispatch.concurrencyLimit, 0);
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
    assert.strictEqual(state.subAgentDispatch.enabled, true);
    assert.strictEqual(state.subAgentDispatch.concurrencyLimit, 1);
    assert.strictEqual(readJson(".agent-state/auto-iterate-current.json").session, "runtime-session");
  });
});

test("initAutoIterate creates session without deprecated flags", async () => {
  await withTempCwd(async () => {
    const { lines } = await captureConsole(() => initAutoIterate([
      "--quick",
      "--goal",
      "deprecated-flags-removed",
      "--session",
      "deprecated-test",
      "--yes",
      "--no-run",
    ]));

    const output = lines.join("\n");
    assert(output.includes("✓ auto-iterate session 已生成"));
    assert(fs.existsSync(".agent-state/auto-iterate/deprecated-test/state.json"));
  });
});

test("initAutoIterate rejects deprecated worker and pipeline flags before creating session files", async () => {
  await withTempCwd(async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = 0;
    try {
      const { lines } = await captureConsole(() => initAutoIterate([
        "--dispatch",
        "demo",
        "--agent",
        "codex",
        "--task",
        "处理 REQ-1",
        "--run",
      ]));

      const output = lines.join("\n");
      assert.strictEqual(process.exitCode, 1);
      assert(output.includes("旧 CLI Worker/pipeline 入口已废弃"));
      assert(output.includes("--dispatch"));
      assert(output.includes("--agent"));
      assert(output.includes("--run"));
      assert(!fs.existsSync(".agent-state"));
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});

test("initAutoIterate generates dashboard for current or explicit session", async () => {
  await withTempCwd(async () => {
    await captureConsole(() => initAutoIterate([
      "--quick",
      "--goal",
      "<script>dashboard</script>",
      "--session",
      "dash-session",
      "--yes",
    ]));

    const statePath = ".agent-state/auto-iterate/dash-session/state.json";
    const state = readJson(statePath);
    state.requirements = [
      { id: "REQ-1", status: "passed", summary: "<b>safe</b>", evidence: "npm test" },
    ];
    state.traceability = {
      iterations: [
        {
          status: "passed",
          summary: "<i>iteration</i>",
          files_changed: ["src/a.ts"],
          validationResult: "passed",
          durationMs: 1500,
        },
      ],
    };
    state.validation = {
      entries: [
        { durationMs: 1500 },
      ],
    };
    state.watchdog = {
      deliveryVerifiability: "verifiable",
      noProgressStreak: 2,
      maxNoProgressIterations: 5,
    };
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const { lines } = await captureConsole(() => initAutoIterate(["--dashboard"]));
    const output = lines.join("\n");
    assert(output.includes("已生成仪表盘"));

    const dashboard = fs.readFileSync(".agent-state/auto-iterate/dash-session/dashboard.html", "utf8");
    assert(dashboard.includes("REQ-1"));
    assert(dashboard.includes("&lt;script&gt;dashboard&lt;/script&gt;"));
    assert(dashboard.includes("&lt;b&gt;safe&lt;/b&gt;"));
    assert(dashboard.includes("2 / 5"));
    assert(dashboard.includes("1.5s"));
  });
});

test("initAutoIterate reports dashboard state errors", async () => {
  await withTempCwd(async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = 0;
    try {
      const { lines } = await captureConsole(() => initAutoIterate(["--dashboard", "missing-session"]));

      assert.strictEqual(process.exitCode, 1);
      assert(lines.join("\n").includes("未找到 session state"));
    } finally {
      process.exitCode = previousExitCode;
    }
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
