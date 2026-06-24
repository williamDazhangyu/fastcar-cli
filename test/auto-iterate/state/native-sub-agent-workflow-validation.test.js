const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  validateNativeSubAgentWorkflowArtifacts,
} = require("../../../dist/auto-iterate/nativeSubAgentWorkflowValidation");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function makeSession() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-subagent-workflow-"));
  const sessionDir = path.join(root, ".agent-state", "auto-iterate", "s");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, "state.json"), JSON.stringify({ session: "s" }), "utf8");
  return {
    root,
    sessionDir,
    stateJsonPath: path.join(sessionDir, "state.json"),
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function iterationDir(sessionDir, iteration) {
  const dir = path.join(sessionDir, "iterations", String(iteration));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function messages(result) {
  return result.issues.map((issue) => issue.message);
}

test("accepts absent native strict workflow artifacts as compatible legacy state", async () => {
  const session = makeSession();
  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert.deepStrictEqual(result.issues, []);
});

test("warns when result exists but orchestrator decision is missing", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    workflow: "llm_native_strict",
    status: "completed",
    files_changed: ["src/a.ts"],
    requirements: [{ id: "REQ-1", status: "implemented" }],
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert(messages(result).some((message) => message.includes("有 result.json 但缺少 decision.json")));
});

test("ignores legacy CLI worker result without strict workflow artifacts", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    status: "completed",
    files_changed: ["src/a.ts"],
    requirements: [{ id: "REQ-1", status: "implemented" }],
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert.deepStrictEqual(result.issues, []);
});

test("rejects delivery_ready without passed validation evidence", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    status: "completed",
    files_changed: ["src/a.ts"],
    requirements: [{ id: "REQ-1", status: "implemented" }],
  });
  writeJson(path.join(dir, "validation.json"), {
    commands: [{ command: "npm test", passed: false, exit_code: 1 }],
  });
  writeJson(path.join(dir, "decision.json"), {
    action: "delivery_ready",
    state_written: true,
    write_audit: { violations: [] },
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert(messages(result).some((message) => message.includes("delivery_ready 必须有通过的 validation.json 证据")));
});

test("rejects need_decision result when decision action continues", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    status: "need_decision",
    files_changed: [],
    requirements: [{ id: "REQ-1", status: "blocked" }],
    decision_request: { question: "Use external API?", options: [{ id: "yes" }] },
  });
  writeJson(path.join(dir, "validation.json"), {
    commands: [{ command: "npm test", passed: true, exit_code: 0 }],
  });
  writeJson(path.join(dir, "decision.json"), {
    action: "continue",
    state_written: true,
    write_audit: { violations: [] },
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert(messages(result).some((message) => message.includes("result.status=need_decision 时 action 必须是 need_decision")));
});

test("accepts need_decision result with matching decision action", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    status: "need_decision",
    files_changed: [],
    requirements: [{ id: "REQ-1", status: "blocked" }],
    decision_request: { question: "Use external API?", options: [{ id: "yes" }] },
  });
  writeJson(path.join(dir, "validation.json"), {
    commands: [{ command: "npm test", passed: true, exit_code: 0 }],
  });
  writeJson(path.join(dir, "decision.json"), {
    action: "need_decision",
    question: "Use external API?",
    options: [{ id: "yes" }],
    state_written: true,
    write_audit: { violations: [] },
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert.deepStrictEqual(result.issues, []);
});

test("accepts schema_invalid reject without validation artifact", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    files_changed: "src/a.ts",
    requirements: [{ id: "REQ-1", status: "implemented" }],
  });
  writeJson(path.join(dir, "decision.json"), {
    action: "reject",
    reason: "schema_invalid",
    state_written: false,
    write_audit: { violations: [] },
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert.deepStrictEqual(result.issues, []);
});

test("rejects invalid result when decision is not schema_invalid reject", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    files_changed: "src/a.ts",
    requirements: [{ id: "REQ-1", status: "implemented" }],
  });
  writeJson(path.join(dir, "validation.json"), {
    commands: [{ command: "npm test", passed: true, exit_code: 0 }],
  });
  writeJson(path.join(dir, "decision.json"), {
    action: "continue",
    state_written: true,
    write_audit: { violations: [] },
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert(messages(result).some((message) => message.includes("status=missing 非法")));
  assert(messages(result).some((message) => message.includes("files_changed 必须是字符串数组")));
});

test("rejects write audit violations unless decision action is reject", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    status: "completed",
    files_changed: ["src/a.ts"],
    requirements: [{ id: "REQ-1", status: "implemented" }],
  });
  writeJson(path.join(dir, "validation.json"), {
    commands: [{ command: "npm test", passed: true, exit_code: 0 }],
  });
  writeJson(path.join(dir, "decision.json"), {
    action: "continue",
    state_written: true,
    write_audit: { violations: ["src/out-of-scope.ts"] },
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert(messages(result).some((message) => message.includes("存在 write_audit.violations 但 action=continue")));
});

test("accepts scope_violation reject with state not written", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    status: "completed",
    files_changed: ["src/a.ts"],
    requirements: [{ id: "REQ-1", status: "implemented" }],
  });
  writeJson(path.join(dir, "validation.json"), {
    commands: [{ command: "npm test", passed: true, exit_code: 0 }],
  });
  writeJson(path.join(dir, "decision.json"), {
    action: "reject",
    reason: "scope_violation",
    state_written: false,
    write_audit: { violations: ["src/out-of-scope.ts"] },
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert.deepStrictEqual(result.issues, []);
});

test("rejects scope violations without scope_violation reason and state_written false", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    status: "completed",
    files_changed: ["src/a.ts"],
    requirements: [{ id: "REQ-1", status: "implemented" }],
  });
  writeJson(path.join(dir, "validation.json"), {
    commands: [{ command: "npm test", passed: true, exit_code: 0 }],
  });
  writeJson(path.join(dir, "decision.json"), {
    action: "reject",
    reason: "validation_failed",
    state_written: true,
    write_audit: { violations: ["src/out-of-scope.ts"] },
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert(messages(result).some((message) => message.includes("存在 write_audit.violations 但 reason=validation_failed")));
});

test("rejects scope_violation when state was written", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    status: "completed",
    files_changed: ["src/a.ts"],
    requirements: [{ id: "REQ-1", status: "implemented" }],
  });
  writeJson(path.join(dir, "validation.json"), {
    commands: [{ command: "npm test", passed: true, exit_code: 0 }],
  });
  writeJson(path.join(dir, "decision.json"), {
    action: "reject",
    reason: "scope_violation",
    state_written: true,
    write_audit: { violations: ["src/out-of-scope.ts"] },
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert(messages(result).some((message) => message.includes("scope_violation 必须 state_written=false")));
});

test("accepts complete strict workflow artifact set", async () => {
  const session = makeSession();
  const dir = iterationDir(session.sessionDir, 1);
  writeJson(path.join(dir, "result.json"), {
    status: "completed",
    files_changed: ["src/a.ts"],
    requirements: [{ id: "REQ-1", status: "implemented" }],
  });
  writeJson(path.join(dir, "validation.json"), {
    commands: [{ command: "npm test", passed: true, exit_code: 0 }],
  });
  writeJson(path.join(dir, "decision.json"), {
    action: "delivery_ready",
    state_written: true,
    write_audit: { violations: [] },
  });

  const result = await validateNativeSubAgentWorkflowArtifacts(session.stateJsonPath);

  assert.deepStrictEqual(result.issues, []);
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
