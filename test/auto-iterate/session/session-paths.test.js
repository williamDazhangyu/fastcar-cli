const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildDefaultSessionName,
  getSessionPaths,
  getStatePaths,
  makeUniqueSessionName,
  slugifySessionName,
  toRelative,
} = require("../../../dist/auto-iterate/sessionPaths");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

async function withTempCwd(fn) {
  const previous = process.cwd();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-cli-session-paths-"));
  try {
    process.chdir(tmpDir);
    return await fn(tmpDir);
  } finally {
    process.chdir(previous);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test("slugifySessionName normalizes unsafe names and provides fallback", () => {
  assert.strictEqual(slugifySessionName(" Quick 登录 Fix!! "), "quick-fix");
  assert.strictEqual(slugifySessionName(""), "session");
});

test("buildDefaultSessionName keeps mode and first six goal tokens", () => {
  const session = buildDefaultSessionName({
    mode: "diagnose",
    goal: "one two three four five six seven eight",
  });

  assert.strictEqual(session, "diagnose-one-two-three-four-five-six");
});

test("getSessionPaths uses standard auto-iterate file layout", async () => {
  await withTempCwd(async (tmpDir) => {
    const statePaths = getStatePaths();
    const sessionPaths = getSessionPaths("Login Fix");

    assert.strictEqual(statePaths.stateDir, path.join(tmpDir, ".agent-state"));
    assert.strictEqual(statePaths.sessionRoot, path.join(tmpDir, ".agent-state", "auto-iterate"));
    assert.strictEqual(sessionPaths.session, "login-fix");
    assert.strictEqual(sessionPaths.sessionStateJsonPath, path.join(sessionPaths.sessionDir, "state.json"));
    assert.strictEqual(sessionPaths.sessionStatePath, path.join(sessionPaths.sessionDir, "state.md"));
    assert.strictEqual(sessionPaths.sessionPromptPath, path.join(sessionPaths.sessionDir, "start-prompt.md"));
    assert.strictEqual(toRelative(sessionPaths.sessionStatePath), ".agent-state/auto-iterate/login-fix/state.md");
  });
});

test("getSessionPaths preserves existing case-insensitive session directories", async () => {
  await withTempCwd(async () => {
    const existingDir = path.join(process.cwd(), ".agent-state", "auto-iterate", "Login-Fix");
    fs.mkdirSync(existingDir, { recursive: true });

    const sessionPaths = getSessionPaths("login fix");

    assert.strictEqual(sessionPaths.session, "Login-Fix");
    assert.strictEqual(sessionPaths.sessionDir, existingDir);
  });
});

test("makeUniqueSessionName skips existing session directories", async () => {
  await withTempCwd(async () => {
    fs.mkdirSync(path.join(process.cwd(), ".agent-state", "auto-iterate", "login-fix"), { recursive: true });
    fs.mkdirSync(path.join(process.cwd(), ".agent-state", "auto-iterate", "login-fix-2"), { recursive: true });

    assert.strictEqual(await makeUniqueSessionName("login fix"), "login-fix-3");
  });
});

(async () => {
  let passed = 0;
  for (const item of cases) {
    await item.fn();
    passed += 1;
    console.log(`✓ ${item.name}`);
  }

  console.log(`\n${passed} test(s) passed.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
