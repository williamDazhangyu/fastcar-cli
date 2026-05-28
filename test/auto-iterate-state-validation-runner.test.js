const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { validateState } = require("../src/auto-iterate/stateValidationRunner");
const {
  REQUIRED_STATE_SECTIONS,
} = require("../src/auto-iterate/sessionBaselineValidation");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function withTempCwd(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-state-runner-"));
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

function buildStateMd(overrides = {}) {
  const sections = new Map(REQUIRED_STATE_SECTIONS.map((heading) => [heading, ""]));
  sections.set("## Session / 会话", [
    "session：demo",
    "状态文件：.agent-state/auto-iterate/demo/state.md",
    "启动提示：.agent-state/auto-iterate/demo/start-prompt.md",
    "current 指针：.agent-state/auto-iterate-current.json",
  ].join("\n"));
  sections.set("## Sub-Agent Dispatch / 子 Agent 调度", [
    "enabled：true",
    "current_phase：idle",
    "active_sub_agents：无",
    "sub_agent_history：无",
    "failed_count：0",
    "completed_count：0",
    "dispatched_count：0",
    "max_failed_sub_agents：2",
    "last_merge_result：none",
  ].join("\n"));
  sections.set("## Budgets / 预算", [
    "max_iterations：10",
    "minimum_implementation_iterations：未启用",
    "implementation_iterations_used：1",
    "optimization_iterations_used：0",
    "non_implementation_iterations_used：0",
    "validation_hardening_iterations_used：1",
    "minimum_validation_hardening_iterations：1",
    "total_cycles：1",
    "remaining_implementation_iterations：5",
  ].join("\n"));
  sections.set("## Watchdog / 看门狗", [
    "triggered：false",
    "required_action：continue",
    "delivery_verifiability：partially_verifiable",
    "state_drift：none",
    "last_validation_result：passed",
    "fresh_eyes_required：false",
    "validation_hardening_status：blocked",
    "validation_hardening_dimensions_done：boundary,negative,regression",
    "new_test_count：1",
  ].join("\n"));
  sections.set("## Requirement Coverage Matrix / 需求覆盖矩阵", [
    "REQ-1",
    "状态：passed",
  ].join("\n"));
  sections.set("## Definition of Done / 完成定义", [
    "交付可验证性：partially_verifiable",
    "看门狗状态：clear",
  ].join("\n"));
  sections.set("## Decisions / 已确认决策", [
    "parallel_write_allowed：true",
    "coder_file_ownership：none",
  ].join("\n"));
  sections.set("## Validation / 验证", [
    "最终交付可验证性：partially_verifiable",
    "已通过验证：npm test",
  ].join("\n"));
  sections.set("## Temporary Artifacts / Cleanup / 临时产物清理", [
    "清理状态：done",
    "待删除 artifacts：无",
  ].join("\n"));

  for (const [heading, body] of Object.entries(overrides)) {
    sections.set(heading, body);
  }

  return Array.from(sections.entries())
    .map(([heading, body]) => `${heading}\n${body}`.trimEnd())
    .join("\n\n");
}

function writeValidSession(overrides = {}) {
  fs.mkdirSync(".agent-state/auto-iterate/demo", { recursive: true });
  fs.writeFileSync(".agent-state/auto-iterate/demo/state.md", buildStateMd(overrides));
  fs.writeFileSync(".agent-state/auto-iterate/demo/start-prompt.md", "prompt");
  writeJson(".agent-state/auto-iterate-current.json", {
    session: "demo",
    stateFile: ".agent-state/auto-iterate/demo/state.md",
    promptFile: ".agent-state/auto-iterate/demo/start-prompt.md",
  });
}

function schemaOk() {
  return [];
}

test("returns ok for valid state, baseline, and sub-agent checks", async () => {
  await withTempCwd(async () => {
    writeValidSession();
    writeJson(".agent-state/auto-iterate/demo/state.json", { ok: true });

    const result = await validateState("demo", { silent: true }, schemaOk);

    assert.deepStrictEqual(result, {
      ok: true,
      degraded: false,
      issues: [],
    });
  });
});

test("reports missing state file before schema validation", async () => {
  await withTempCwd(async () => {
    fs.mkdirSync(".agent-state/auto-iterate/demo", { recursive: true });

    const result = await validateState("demo", { silent: true }, schemaOk);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.degraded, false);
    assert.strictEqual(result.issues.length, 1);
    assert.match(result.issues[0].message, /未找到 session state: demo/);
  });
});

test("supports old state.md-only degraded validation when allowed", async () => {
  await withTempCwd(async () => {
    writeValidSession();

    const result = await validateState("demo", {
      allowMissingStateJson: true,
      silent: true,
    }, schemaOk);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.degraded, true);
    assert.deepStrictEqual(result.issues, [
      {
        severity: "warning",
        message: "缺少机器权威 state.json: .agent-state/auto-iterate/demo/state.json；按旧 state.md-only session 降级恢复",
      },
    ]);
  });
});

test("strict mode escalates ordinary warnings but preserves allowed degraded warning", async () => {
  await withTempCwd(async () => {
    writeValidSession({
      "## Watchdog / 看门狗": [
        "triggered：false",
        "required_action：continue",
        "delivery_verifiability：unknown",
        "state_drift：none",
        "last_validation_result：passed",
        "fresh_eyes_required：false",
        "validation_hardening_status：blocked",
        "validation_hardening_dimensions_done：boundary,negative,regression",
        "new_test_count：1",
      ].join("\n"),
      "## Definition of Done / 完成定义": [
        "交付可验证性：unknown",
        "看门狗状态：clear",
      ].join("\n"),
    });

    const result = await validateState("demo", {
      allowMissingStateJson: true,
      strict: true,
      silent: true,
    }, schemaOk);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.degraded, true);
    assert(result.issues.some((issue) => issue.severity === "warning" && issue.message.includes("按旧 state.md-only session 降级恢复")));
    assert(result.issues.some((issue) => issue.severity === "warning" && issue.message.includes("delivery_verifiability=unknown")));
    assert(result.issues.some((issue) => issue.severity === "warning" && issue.message.includes("DoD.交付可验证性=unknown")));
  });
});

test("strict mode escalates schema and baseline warnings into errors", async () => {
  await withTempCwd(async () => {
    writeValidSession({
      "## Budgets / 预算": [
        "max_iterations：10",
        "minimum_implementation_iterations：未启用",
        "implementation_iterations_used：1",
        "optimization_iterations_used：0",
        "non_implementation_iterations_used：0",
        "validation_hardening_iterations_used：1",
        "minimum_validation_hardening_iterations：1",
        "total_cycles：1",
        "remaining_implementation_iterations：0",
      ].join("\n"),
    });
    writeJson(".agent-state/auto-iterate/demo/state.json", { ok: true });

    const result = await validateState("demo", { strict: true, silent: true }, () => [
      { severity: "warning", message: "schema warning" },
    ]);

    assert.strictEqual(result.ok, false);
    assert(result.issues.some((issue) => issue.severity === "error" && issue.message === "strict: schema warning"));
    assert(result.issues.some((issue) => issue.severity === "error" && issue.message.includes("strict: remaining_implementation_iterations = 0")));
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
