const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  activateSession,
  applyDecisionAnswer,
  getSessionSummaries,
  listSessions,
  writeCurrentFile,
} = require("../../../dist/auto-iterate/sessionManager");
const { getSessionPaths } = require("../../../dist/auto-iterate/sessionPaths");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function withTempCwd(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-session-manager-"));
  process.chdir(dir);
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      process.chdir(previous);
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function createSession(session = "demo", content = null) {
  const dir = `.agent-state/auto-iterate/${session}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/state.md`, content || [
    "## Mode / 模式",
    "模式：quick / 快速启动",
    "## Current State / 当前状态",
    "当前阶段：coding",
    "整体完成状态：in_progress",
  ].join("\n"));
  fs.writeFileSync(`${dir}/start-prompt.md`, "prompt");
  return getSessionPaths(session);
}

function schemaOk() {
  return [];
}

test("writeCurrentFile writes standard current pointer", async () => {
  await withTempCwd(async () => {
    const sessionPaths = createSession("demo");

    const current = await writeCurrentFile(sessionPaths, {
      mode: "quick",
      modeLabel: "快速启动",
    });

    assert.strictEqual(current.session, "demo");
    assert.strictEqual(current.stateFile, ".agent-state/auto-iterate/demo/state.md");
    assert.strictEqual(current.promptFile, ".agent-state/auto-iterate/demo/start-prompt.md");
    assert.strictEqual(readJson(".agent-state/auto-iterate-current.json").session, "demo");
  });
});

test("getSessionSummaries and listSessions expose sorted session rows", async () => {
  await withTempCwd(async () => {
    createSession("zeta", "模式：strict / 严格启动\n当前阶段：validation\n整体完成状态：blocked");
    createSession("alpha", "模式：quick / 快速启动\n当前阶段：coding\n整体完成状态：in_progress");
    writeJson(".agent-state/auto-iterate-current.json", {
      session: "alpha",
      stateFile: ".agent-state/auto-iterate/alpha/state.md",
      promptFile: ".agent-state/auto-iterate/alpha/start-prompt.md",
    });

    const summaries = await getSessionSummaries();
    assert.deepStrictEqual(summaries.sessions.map((item) => item.session), ["alpha", "zeta"]);
    assert.strictEqual(summaries.sessions[0].current, true);
    assert.strictEqual(summaries.sessions[0].mode, "quick / 快速启动");

    const { lines } = await captureConsole(() => listSessions());
    assert(lines[0].includes("Session"));
    assert(lines.some((line) => line.includes("alpha") && line.includes("*")));
  });
});

test("activateSession switches current pointer and resume validates first", async () => {
  await withTempCwd(async () => {
    createSession("demo");
    let validateCalls = 0;

    await captureConsole(() => activateSession("demo", "resume", async (session, options) => {
      validateCalls += 1;
      assert.strictEqual(session, "demo");
      assert.deepStrictEqual(options, { strict: true, allowMissingStateJson: true });
      return { ok: true, degraded: true };
    }));

    assert.strictEqual(validateCalls, 1);
    assert.strictEqual(readJson(".agent-state/auto-iterate-current.json").session, "demo");
  });
});

test("activateSession blocks resume when validation fails", async () => {
  await withTempCwd(async () => {
    createSession("demo");
    const previousExitCode = process.exitCode;
    process.exitCode = 0;

    const { lines } = await captureConsole(() => activateSession("demo", "resume", async () => ({ ok: false })));

    assert(lines.some((line) => line.includes("resume 已被 strict state 门禁阻止")));
    assert.strictEqual(process.exitCode, 1);
    process.exitCode = previousExitCode;
  });
});

test("applyDecisionAnswer handles no-op, invalid answer, schema failure, and success", async () => {
  await withTempCwd(async () => {
    const sessionPaths = createSession("demo");

    assert.deepStrictEqual(await applyDecisionAnswer(sessionPaths, "", schemaOk), {
      ok: true,
      applied: false,
      reason: "no_answer",
    });
    assert.deepStrictEqual(await applyDecisionAnswer(sessionPaths, "a", schemaOk), {
      ok: true,
      applied: false,
      reason: "missing_state",
    });

    writeJson(sessionPaths.sessionStateJsonPath, {
      decisionRequest: {
        status: "pending",
        options: [{ id: "yes" }, { id: "no" }],
        targetField: "approvedPlan",
      },
      watchdog: {
        triggered: true,
        requiredAction: "ask_user",
      },
    });

    const invalid = await applyDecisionAnswer(sessionPaths, "maybe", schemaOk);
    assert.strictEqual(invalid.ok, false);
    assert.strictEqual(invalid.reason, "invalid_decision_answer");

    const schemaFailed = await applyDecisionAnswer(sessionPaths, "yes", () => [
      { severity: "error", message: "bad state" },
    ]);
    assert.strictEqual(schemaFailed.ok, false);
    assert.strictEqual(schemaFailed.reason, "state_schema_failed");
    assert.strictEqual(readJson(sessionPaths.sessionStateJsonPath).decisionRequest.status, "pending");

    const success = await applyDecisionAnswer(sessionPaths, "yes", schemaOk);
    assert.deepStrictEqual(success, { ok: true, applied: true, reason: "applied" });
    const state = readJson(sessionPaths.sessionStateJsonPath);
    assert.strictEqual(state.decisionRequest.status, "approved");
    assert.strictEqual(state.decisions.lastAnswer, "yes");
    assert.strictEqual(state.decisions.approvedPlan, "yes");
    assert.strictEqual(state.watchdog.triggered, false);
    assert.strictEqual(state.watchdog.requiredAction, "continue");
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
