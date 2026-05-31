const assert = require("assert");
const { normalizeRelativePath, parseAndValidateIterationResult } = require("../dist/pipeline/resultSchema");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("resultSchema 校验 worker result.json", () => {
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "ok",
    files_changed: ["src/a.js"],
  }));
  assert.strictEqual(parsed.valid, true);
  assert.deepStrictEqual(parsed.result.files_changed, ["src/a.js"]);

  const invalid = parseAndValidateIterationResult("{");
  assert.strictEqual(invalid.valid, false);

  const noProgress = parseAndValidateIterationResult(JSON.stringify({
    status: "no_progress",
    summary: "nothing safe to do",
  }));
  assert.strictEqual(noProgress.valid, true);
  assert.strictEqual(noProgress.result.status, "no_progress");

  const withBom = parseAndValidateIterationResult(`\uFEFF${JSON.stringify({
    status: "completed",
    summary: "bom ok",
  })}`);
  assert.strictEqual(withBom.valid, true);
  assert.strictEqual(withBom.result.summary, "bom ok");

  const withTrace = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "trace ok",
    trace: {
      rationaleSummary: "public summary password=secret",
      decisions: [{ topic: "A", reason: "B" }],
      evidence: ["file checked"],
    },
    documentation: {
      apiChanges: ["new endpoint"],
      architectureNotes: ["new boundary"],
      implementationNotes: ["core flow"],
      changelogEntries: ["changed behavior"],
    },
  }));
  assert.strictEqual(withTrace.valid, true);
  assert.ok(withTrace.result.trace.rationaleSummary.includes("[REDACTED]"));
  assert.deepStrictEqual(withTrace.result.documentation.apiChanges, ["new endpoint"]);
});

test("resultSchema 拒绝非法 files_changed 路径", () => {
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "bad files",
    files_changed: [
      "src\\ok.js",
      "../outside.js",
      "C:/tmp/outside.js",
      { file: "src/object.js" },
    ],
  }));
  assert.strictEqual(parsed.valid, false);
  assert.deepStrictEqual(parsed.result.files_changed, ["src/ok.js"]);
  assert.ok(parsed.errors.some((item) => item.includes("files_changed")));
});

test("resultSchema 拒绝非法 requirement status", () => {
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "bad req status",
    requirements: [
      { id: "REQ-1", summary: "bad", status: "finished" },
      { id: "REQ-2", summary: "also bad", status: "failed" },
    ],
  }));
  assert.strictEqual(parsed.valid, false);
  assert.ok(parsed.errors.some((item) => item.includes("requirements[0].status")));
  assert.ok(parsed.errors.some((item) => item.includes("requirements[1].status")));
});

test("normalizeRelativePath 统一过滤非法路径", () => {
  assert.strictEqual(normalizeRelativePath("src\\ok.js"), "src/ok.js");
  assert.strictEqual(normalizeRelativePath("./src/ok.js"), "src/ok.js");
  assert.strictEqual(normalizeRelativePath("../outside.js"), null);
  assert.strictEqual(normalizeRelativePath("C:/tmp/outside.js"), null);
  assert.strictEqual(normalizeRelativePath({ file: "src/object.js" }), null);
});

test("resultSchema 脱敏所有会持久化的 Worker 文本字段", () => {
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "need_decision",
    summary: "summary token=abc123",
    risks: "risk password=secret",
    blocked_reason: "blocked api_key=key123",
    requirements: [{
      id: "REQ-SECRET",
      summary: "user test@example.com needs token=raw",
      evidence: "password=hunter2",
    }],
    state_patch: {
      notes: ["secret=mysecret"],
      currentState: { currentTask: "Authorization: Bearer abc.def.ghi" },
    },
    validation: {
      summary: "password=validation-secret",
    },
    decision_request: {
      question: "Use token=decision-secret?",
      options: [{ id: "A", label: "password=option" }],
    },
  }));
  assert.strictEqual(parsed.valid, true);
  const persisted = JSON.stringify(parsed.result);
  assert.ok(!persisted.includes("abc123"));
  assert.ok(!persisted.includes("key123"));
  assert.ok(!persisted.includes("hunter2"));
  assert.ok(!persisted.includes("mysecret"));
  assert.ok(!persisted.includes("abc.def.ghi"));
  assert.ok(!persisted.includes("validation-secret"));
  assert.ok(!persisted.includes("decision-secret"));
  assert.ok(!persisted.includes("test@example.com"));
  assert.ok(persisted.includes("[REDACTED]"));
  assert.ok(persisted.includes("[REDACTED_EMAIL]"));
});

test("resultSchema 脱敏时保留结构化字段类型", () => {
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "metrics ok",
    state_patch: {
      optimizationMetrics: [
        { name: "duration", value: 80, unit: "ms", direction: "lower_is_better", source: "bench" },
      ],
      hypotheses: [
        { id: "H1", summary: "token=raw", priority: 2, status: "pending", evidence: "ok" },
      ],
    },
    decision_request: {
      question: "pick",
      options: [{ id: "A", label: "A", recommended: true }],
    },
  }));
  assert.strictEqual(parsed.valid, true);
  assert.strictEqual(typeof parsed.result.state_patch.optimizationMetrics[0].value, "number");
  assert.strictEqual(parsed.result.state_patch.optimizationMetrics[0].value, 80);
  assert.strictEqual(typeof parsed.result.state_patch.hypotheses[0].priority, "number");
  assert.strictEqual(typeof parsed.result.decision_request.options[0].recommended, "boolean");
  assert.ok(!JSON.stringify(parsed.result).includes("token=raw"));
});

test("resultSchema 保留 focus 机器字段用于 resume 复用门禁", () => {
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "focus ok",
    focus: {
      raw: "implement_req:REQ-token=raw-secret",
      type: "implement_req",
      req_id: "REQ-token=raw-secret",
    },
  }));
  assert.strictEqual(parsed.valid, true);
  assert.strictEqual(parsed.result.raw.focus.type, "implement_req");
  assert.strictEqual(parsed.result.raw.focus.req_id, "REQ-token=raw-secret");
  assert.ok(!parsed.result.raw.focus.raw.includes("raw-secret"));
  assert.ok(parsed.result.raw.focus.raw.includes("[REDACTED]"));
});

test("resultSchema 脱敏非对象 focus 原始字段", () => {
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "legacy focus",
    focus: "implement_req:REQ-1 token=legacy-secret",
  }));
  assert.strictEqual(parsed.valid, true);
  assert.ok(!parsed.result.raw.focus.includes("legacy-secret"));
  assert.ok(parsed.result.raw.focus.includes("[REDACTED]"));
});

test("resultSchema 脱敏 key/value secret 时保留后续普通文本", () => {
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "token=abc123 next action remains visible",
  }));
  assert.strictEqual(parsed.valid, true);
  assert.strictEqual(parsed.result.summary, "token=[REDACTED] next action remains visible");
  assert.ok(!parsed.result.summary.includes("abc123"));
});

test("resultSchema 限制递归脱敏的对象宽度和深度", () => {
  const wide = {};
  for (let index = 0; index < 60; index += 1) {
    wide[`k${index}`] = `value-${index}`;
  }
  const deep = { level: 0 };
  let current = deep;
  for (let index = 1; index < 12; index += 1) {
    current.next = { level: index };
    current = current.next;
  }
  const parsed = parseAndValidateIterationResult(JSON.stringify({
    status: "completed",
    summary: "bounded",
    state_patch: {
      wide,
      deep,
      typed: { count: 3, enabled: true },
    },
  }));
  assert.strictEqual(parsed.valid, true);
  assert.strictEqual(Object.keys(parsed.result.state_patch.wide).length, 50);
  assert.strictEqual(parsed.result.state_patch.wide.k49, "value-49");
  assert.strictEqual(parsed.result.state_patch.wide.k50, undefined);
  assert.strictEqual(parsed.result.state_patch.typed.count, 3);
  assert.strictEqual(parsed.result.state_patch.typed.enabled, true);
  assert.ok(JSON.stringify(parsed.result.state_patch.deep).includes("[TRUNCATED_DEPTH]"));
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
