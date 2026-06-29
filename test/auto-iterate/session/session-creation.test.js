const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const inquirer = require("inquirer");
const {
  createAutoIterateSession,
  renderCreatedSessionSummary,
  readChecklistFile,
  withSessionDefaults,
} = require("../../../dist/auto-iterate/sessionCreation");
const { getSessionPaths } = require("../../../dist/auto-iterate/sessionPaths");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function withTempCwd(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-session-creation-"));
  process.chdir(dir);
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      process.chdir(previous);
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

async function withPromptStub(handler, fn) {
  const originalPrompt = inquirer.prompt;
  inquirer.prompt = async (questions) => handler(questions);
  try {
    return await fn();
  } finally {
    inquirer.prompt = originalPrompt;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function schemaOk() {
  return [];
}

const dependencies = {
  validateStateJsonModel: schemaOk,
  validateState: async () => ({ ok: true }),
};

test("readChecklistFile rejects directories and reads file content", async () => {
  await withTempCwd(async (dir) => {
    fs.mkdirSync("docs");
    fs.writeFileSync(path.join("docs", "prd.md"), "# PRD\n- 做完", "utf8");

    const source = await readChecklistFile("docs/prd.md");
    assert.strictEqual(source.path, path.join(dir, "docs", "prd.md"));
    assert.strictEqual(source.content, "# PRD\n- 做完");

    await assert.rejects(
      () => readChecklistFile("docs"),
      /清单路径不是文件/,
    );
  });
});

test("withSessionDefaults attaches stable session-relative paths", async () => {
  await withTempCwd(() => {
    const sessionPaths = getSessionPaths("demo");
    const answers = withSessionDefaults({ mode: "quick" }, sessionPaths);

    assert.strictEqual(answers.session, "demo");
    assert.strictEqual(answers.sessionStateJsonFile, ".agent-state/auto-iterate/demo/state.json");
    assert.strictEqual(answers.sessionStateFile, ".agent-state/auto-iterate/demo/state.md");
    assert.strictEqual(answers.sessionPromptFile, ".agent-state/auto-iterate/demo/start-prompt.md");
    assert.strictEqual(answers.currentFile, ".agent-state/auto-iterate-current.json");
  });
});

test("createAutoIterateSession writes state, prompt, and current files", async () => {
  await withTempCwd(async () => {
    const created = await createAutoIterateSession({
      yes: true,
      goal: "修复登录",
      session: "Login Fix",
    }, "quick", null, dependencies);

    assert(created);
    assert.strictEqual(created.sessionPaths.session, "login-fix");
    assert(fs.existsSync(".agent-state/auto-iterate/login-fix/state.json"));
    assert(fs.existsSync(".agent-state/auto-iterate/login-fix/state.md"));
    assert(fs.existsSync(".agent-state/auto-iterate/login-fix/start-prompt.md"));
    assert(fs.existsSync(".agent-state/auto-iterate/login-fix/trace.jsonl"));
    assert(fs.existsSync(".agent-state/auto-iterate/login-fix/decisions.md"));
    assert(fs.existsSync(".agent-state/auto-iterate/login-fix/handoff.md"));
    assert.strictEqual(readJson(".agent-state/auto-iterate-current.json").session, "login-fix");

    const state = readJson(".agent-state/auto-iterate/login-fix/state.json");
    assert.strictEqual(state.task.goal, "修复登录");
    assert.strictEqual(state.mode.mode, "quick");
    assert.strictEqual(state.mode.executionMode, "native_subagent");
    assert.strictEqual(state.subAgentDispatch.enabled, true);
    assert.strictEqual(state.subAgentDispatch.concurrencyLimit, 1);
    assert.strictEqual(typeof state.bloatBaseline.testLines, "number");
    assert.strictEqual(typeof state.bloatBaseline.srcLines, "number");
    assert.strictEqual(typeof state.bloatBaseline.capturedAt, "string");
    assert.strictEqual(created.answers.sessionStateJsonFile, ".agent-state/auto-iterate/login-fix/state.json");
    assert(created.promptContent.includes("修复登录"));
    assert(created.outputSummary.includes("✓ auto-iterate session 已生成"));
    assert(created.outputSummary.includes("🎯 目标: 修复登录"));
    assert(created.outputSummary.includes("📊 进度: session=login-fix"));
    assert(created.outputSummary.includes("🧭 执行: 读取 .agent-state/auto-iterate/login-fix/start-prompt.md 和 .agent-state/auto-iterate/login-fix/state.json 后开始"));
    assert(created.outputSummary.includes("✅ 结果: state.md=.agent-state/auto-iterate/login-fix/state.md"));
    assert(created.outputSummary.includes("🔎 轨迹: trace=.agent-state/auto-iterate/login-fix/trace.jsonl"));
    assert(!created.outputSummary.includes("Requirement Coverage Matrix"));

    const trace = fs.readFileSync(".agent-state/auto-iterate/login-fix/trace.jsonl", "utf8");
    const decisions = fs.readFileSync(".agent-state/auto-iterate/login-fix/decisions.md", "utf8");
    const handoff = fs.readFileSync(".agent-state/auto-iterate/login-fix/handoff.md", "utf8");
    assert.strictEqual(trace, "");
    assert(decisions.includes("暂无决策记录"));
    assert(handoff.includes("修复登录"));
  });
});

test("renderCreatedSessionSummary keeps terminal output concise", async () => {
  await withTempCwd(() => {
    const sessionPaths = getSessionPaths("summary-check");
    const summary = renderCreatedSessionSummary({
      mode: "quick",
      modeLabel: "快速启动",
      executionMode: "protocol_only",
      goal: "优化输出结构",
      sessionStateJsonFile: ".agent-state/auto-iterate/summary-check/state.json",
      sessionStateFile: ".agent-state/auto-iterate/summary-check/state.md",
      sessionPromptFile: ".agent-state/auto-iterate/summary-check/start-prompt.md",
      currentFile: ".agent-state/auto-iterate-current.json",
    }, sessionPaths);

    assert(summary.includes("🎯 目标: 优化输出结构"));
    assert(summary.includes("📊 进度: session=summary-check"));
    assert(summary.includes("execution=protocol_only"));
    assert(summary.includes("终端只显示关键进展"));
    assert(!summary.includes("Watchdog"));
    assert(!summary.includes("Skill Capture"));
  });
});

test("renderCreatedSessionSummary supports ANSI color when forced", async () => {
  await withTempCwd(() => {
    const previousForceColor = process.env.FORCE_COLOR;
    process.env.FORCE_COLOR = "1";
    try {
      const summary = renderCreatedSessionSummary({
        mode: "quick",
        goal: "颜色输出",
      }, getSessionPaths("color-check"));
      assert(summary.includes("\u001b["));
      assert(summary.includes("🎯 目标"));
    } finally {
      if (previousForceColor === undefined) {
        delete process.env.FORCE_COLOR;
      } else {
        process.env.FORCE_COLOR = previousForceColor;
      }
    }
  });
});

test("createAutoIterateSession blocks duplicate sessions in noninteractive mode", async () => {
  await withTempCwd(async () => {
    await createAutoIterateSession({
      yes: true,
      goal: "第一次",
      session: "duplicate",
    }, "quick", null, dependencies);

    await assert.rejects(
      () => createAutoIterateSession({
        yes: true,
        goal: "第二次",
        session: "duplicate",
      }, "quick", null, dependencies),
      /session 已存在，非交互模式不会覆盖/,
    );

    const state = readJson(".agent-state/auto-iterate/duplicate/state.json");
    assert.strictEqual(state.task.goal, "第一次");
  });
});

test("createAutoIterateSession returns null when interactive duplicate overwrite is declined", async () => {
  await withTempCwd(async () => {
    await createAutoIterateSession({
      yes: true,
      goal: "第一次",
      session: "duplicate",
    }, "quick", null, dependencies);

    await withPromptStub(async (questions) => {
      if (questions[0].name === "overwrite") {
        return { overwrite: false };
      }
      assert.strictEqual(questions[0].name, "goal");
      return {
        goal: "第二次",
        allowAgentInference: true,
        constraints: "不要新增依赖",
        maxIterations: 9,
        autopilotMaxIterations: 4,
      };
    }, async () => {
      const created = await createAutoIterateSession({
        goal: "第二次",
        session: "duplicate",
      }, "quick", null, dependencies);
      assert.strictEqual(created, null);
    });
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
