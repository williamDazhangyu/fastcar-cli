const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { finalizeAutoIterateSession } = require("../src/auto-iterate/sessionFinalize");
const { createAutoIterateSession } = require("../src/auto-iterate/sessionCreation");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function withTempCwd(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-session-finalize-"));
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function schemaOk() {
  return [];
}

async function createReadySession(session) {
  const created = await createAutoIterateSession({
    yes: true,
    goal: "验证 finalize",
    session,
  }, "quick", null, {
    validateStateJsonModel: schemaOk,
  });
  const statePath = created.sessionPaths.sessionStateJsonPath;
  const state = readJson(statePath);
  state.requirements = [
    {
      id: "REQ-FINALIZE",
      summary: "FastCar finalize 自动生成交付文档",
      type: "验证",
      status: "passed",
      relatedFiles: ["src/auto-iterate.js"],
      evidence: "finalize 先执行 skill capture，再执行 strict state 门禁和交付文档生成",
      blockedReason: "无",
      nextStep: "无",
    },
  ];
  state.contextResetReview.status = "passed";
  state.contextResetReview.decision = "passed";
  state.contextResetReview.lastRunSummary = "复核通过";
  state.styleConsolidation.status = "completed";
  state.styleConsolidation.lastRunSummary = "已整理";
  state.deliveryEvidence.status = "ready";
  state.deliveryEvidence.changes = "完成 finalize 验证";
  state.deliveryEvidence.validationSummary = "node test/auto-iterate-session-finalize.test.js";
  state.deliveryEvidence.unfinishedItems = "无";
  state.deliveryEvidence.risks = "无";
  state.postChange.status = "passed";
  state.postChange.result = "passed";
  state.postChange.command = "node test/auto-iterate-session-finalize.test.js";
  state.postAgentValidationGate.lastResult = "passed";
  state.postAgentValidationGate.failureSummary = [];
  state.watchdog.deliveryVerifiability = "verifiable";
  state.watchdog.requiredAction = "continue";
  state.cleanup.status = "completed";
  state.skillCapture.status = "skipped_no_high_value";
  writeJson(statePath, state);
  return created.sessionPaths;
}

test("finalize runs capture, validates before docs, writes docs, and validates again", async () => {
  await withTempCwd(async () => {
    await createReadySession("finalize-ok");
    const validationCalls = [];

    const { lines } = await captureConsole(() => finalizeAutoIterateSession("finalize-ok", { yes: true }, {
      validateState: async (target, options) => {
        validationCalls.push({ target, options });
        return { ok: true };
      },
    }));

    assert.deepStrictEqual(validationCalls, [
      { target: "finalize-ok", options: { strict: true } },
      { target: "finalize-ok", options: { strict: true } },
    ]);
    assert(lines.some((line) => line.includes("正在执行迭代结束门禁: finalize-ok")));
    assert(lines.some((line) => line.includes("已生成交付文档")));
    assert(lines.some((line) => line.includes("finalize 完成")));
    assert(fs.existsSync(".agent-state/auto-iterate/finalize-ok/docs/api.md"));
    assert(fs.existsSync(".agent-state/auto-iterate/finalize-ok/docs/architecture.md"));
    const state = readJson(".agent-state/auto-iterate/finalize-ok/state.json");
    assert.strictEqual(state.deliveryDocs.status, "generated");
    assert.strictEqual(state.skillCapture.status, "captured");
  });
});

test("finalize stops before docs when pre-doc strict validation fails", async () => {
  await withTempCwd(async () => {
    await createReadySession("finalize-pre-fail");
    const previousExitCode = process.exitCode;
    process.exitCode = 0;

    const { lines } = await captureConsole(() => finalizeAutoIterateSession("finalize-pre-fail", { yes: true }, {
      validateState: async () => ({ ok: false }),
    }));

    assert.strictEqual(process.exitCode, 1);
    assert(lines.some((line) => line.includes("finalize 未通过：strict state 门禁失败")));
    assert(!lines.some((line) => line.includes("已生成交付文档")));
    assert(!fs.existsSync(".agent-state/auto-iterate/finalize-pre-fail/docs/api.md"));
    const state = readJson(".agent-state/auto-iterate/finalize-pre-fail/state.json");
    assert.notStrictEqual(state.deliveryDocs.status, "generated");
    process.exitCode = previousExitCode;
  });
});

test("finalize stops when skill capture cannot read state json", async () => {
  await withTempCwd(async () => {
    const sessionPaths = await createReadySession("finalize-missing-state");
    fs.rmSync(sessionPaths.sessionStateJsonPath);
    const previousExitCode = process.exitCode;
    process.exitCode = 0;
    let validationCalls = 0;

    const { lines } = await captureConsole(() => finalizeAutoIterateSession("finalize-missing-state", { yes: true }, {
      validateState: async () => {
        validationCalls += 1;
        return { ok: true };
      },
    }));

    assert.strictEqual(process.exitCode, 1);
    assert.strictEqual(validationCalls, 0);
    assert(lines.some((line) => line.includes("finalize 已停止：Skill Capture")));
    assert(!fs.existsSync(".agent-state/auto-iterate/finalize-missing-state/docs/api.md"));
    process.exitCode = previousExitCode;
  });
});

test("finalize propagates resolver errors without running validation", async () => {
  await withTempCwd(async () => {
    let validationCalls = 0;
    const previousExitCode = process.exitCode;
    process.exitCode = 0;

    await assert.rejects(
      () => finalizeAutoIterateSession("__current__", { yes: true }, {
        validateState: async () => {
          validationCalls += 1;
          return { ok: true };
        },
      }),
      /未找到 current 指针/,
    );

    assert.strictEqual(validationCalls, 0);
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
