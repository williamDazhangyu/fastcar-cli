const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  compareCurrentPointerToExpected,
  resolveStateFileForValidation,
} = require("../../../dist/auto-iterate/sessionStateValidation");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function withTempCwd(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-session-state-"));
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

test("compareCurrentPointerToExpected reports every pointer mismatch", () => {
  const issues = [];

  compareCurrentPointerToExpected(
    issues,
    {
      session: "other",
      stateFile: ".agent-state/auto-iterate/other/state.md",
      promptFile: ".agent-state/auto-iterate/other/start-prompt.md",
    },
    "demo",
    ".agent-state/auto-iterate/demo/state.md",
    ".agent-state/auto-iterate/demo/start-prompt.md",
    ".agent-state/auto-iterate/demo/state.md",
    ".agent-state/auto-iterate/demo/start-prompt.md",
  );

  assert.deepStrictEqual(issues, [
    {
      severity: "error",
      message: "auto-iterate-current.json.stateFile=.agent-state/auto-iterate/other/state.md，未指向 .agent-state/auto-iterate/demo/state.md",
    },
    {
      severity: "error",
      message: "auto-iterate-current.json.promptFile=.agent-state/auto-iterate/other/start-prompt.md，未指向 .agent-state/auto-iterate/demo/start-prompt.md",
    },
    {
      severity: "error",
      message: "auto-iterate-current.json.stateFile=.agent-state/auto-iterate/other/state.md，与 Session.状态文件=.agent-state/auto-iterate/demo/state.md 不一致",
    },
    {
      severity: "error",
      message: "auto-iterate-current.json.promptFile=.agent-state/auto-iterate/other/start-prompt.md，与 Session.启动提示=.agent-state/auto-iterate/demo/start-prompt.md 不一致",
    },
    {
      severity: "error",
      message: "current.session=other 与 state.md session=demo 不一致",
    },
  ]);
});

test("resolveStateFileForValidation resolves current pointer target", async () => {
  await withTempCwd(async () => {
    writeJson(".agent-state/auto-iterate-current.json", {
      session: "demo",
      stateFile: ".agent-state/auto-iterate/demo/state.md",
      promptFile: ".agent-state/auto-iterate/demo/start-prompt.md",
    });

    const result = await resolveStateFileForValidation("__current__");

    assert.strictEqual(result.targetType, "current");
    assert.strictEqual(result.session, "demo");
    assert.strictEqual(result.stateFile, path.resolve(".agent-state/auto-iterate/demo/state.md"));
    assert.strictEqual(result.stateJsonFile, path.resolve(".agent-state/auto-iterate/demo/state.json"));
    assert.strictEqual(result.currentPath, path.resolve(".agent-state/auto-iterate-current.json"));
  });
});

test("resolveStateFileForValidation resolves explicit state path target", async () => {
  await withTempCwd(async () => {
    writeJson(".agent-state/auto-iterate-current.json", {
      session: "current",
      stateFile: ".agent-state/auto-iterate/current/state.md",
    });

    const mdResult = await resolveStateFileForValidation(".agent-state/auto-iterate/demo/state.md");
    assert.strictEqual(mdResult.targetType, "path");
    assert.strictEqual(mdResult.session, null);
    assert.strictEqual(mdResult.stateFile, path.resolve(".agent-state/auto-iterate/demo/state.md"));
    assert.strictEqual(mdResult.stateJsonFile, path.resolve(".agent-state/auto-iterate/demo/state.json"));

    const jsonResult = await resolveStateFileForValidation(".agent-state/auto-iterate/demo/state.json");
    assert.strictEqual(jsonResult.stateFile, path.resolve(".agent-state/auto-iterate/demo/state.md"));
    assert.strictEqual(jsonResult.stateJsonFile, path.resolve(".agent-state/auto-iterate/demo/state.json"));
  });
});

test("resolveStateFileForValidation resolves session target and preserves on-disk case", async () => {
  await withTempCwd(async () => {
    fs.mkdirSync(".agent-state/auto-iterate/Demo-Session", { recursive: true });
    fs.writeFileSync(".agent-state/auto-iterate/Demo-Session/state.md", "state");
    writeJson(".agent-state/auto-iterate-current.json", {
      session: "current",
      stateFile: ".agent-state/auto-iterate/current/state.md",
    });

    const result = await resolveStateFileForValidation("demo-session");

    assert.strictEqual(result.targetType, "session");
    assert.strictEqual(result.session, "Demo-Session");
    assert.strictEqual(result.stateFile, path.resolve(".agent-state/auto-iterate/Demo-Session/state.md"));
    assert.strictEqual(result.stateJsonFile, path.resolve(".agent-state/auto-iterate/Demo-Session/state.json"));
  });
});

test("resolveStateFileForValidation reports missing current and missing session", async () => {
  await withTempCwd(async () => {
    await assert.rejects(
      () => resolveStateFileForValidation("__current__"),
      /未找到 current 指针，请传入 --validate-state <session\|state\.md>/,
    );

    await assert.rejects(
      () => resolveStateFileForValidation("missing-session"),
      /未找到 session state: missing-session \(\.agent-state\/auto-iterate\/missing-session\/state\.md\)/,
    );
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
