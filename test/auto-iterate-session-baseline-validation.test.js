const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  REQUIRED_STATE_SECTIONS,
  validateSessionStateBaseline,
} = require("../dist/auto-iterate/sessionBaselineValidation");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function withTempCwd(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-session-baseline-"));
  process.chdir(dir);
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      process.chdir(previous);
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

function messages(result) {
  return result.issues.map((issue) => issue.message);
}

function buildStateMd(overrides = {}) {
  const sections = new Map(REQUIRED_STATE_SECTIONS.map((heading) => [heading, ""]));
  sections.set("## Session / 会话", [
    "session：demo",
    "状态文件：.agent-state/auto-iterate/demo/state.md",
    "启动提示：.agent-state/auto-iterate/demo/start-prompt.md",
    "current 指针：.agent-state/auto-iterate-current.json",
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
  sections.set("## Validation / 验证", [
    "最终交付可验证性：partially_verifiable",
    "已通过验证：npm test",
  ].join("\n"));
  sections.set("## Temporary Artifacts / Cleanup / 临时产物清理", [
    "清理状态：done",
    "待删除 artifacts：无",
  ].join("\n"));

  for (const [heading, body] of Object.entries(overrides)) {
    if (body === null) {
      sections.delete(heading);
    } else {
      sections.set(heading, body);
    }
  }

  return Array.from(sections.entries())
    .map(([heading, body]) => `${heading}\n${body}`.trimEnd())
    .join("\n\n");
}

function stateInfo(overrides = {}) {
  return {
    stateFile: path.resolve(".agent-state/auto-iterate/demo/state.md"),
    stateJsonFile: path.resolve(".agent-state/auto-iterate/demo/state.json"),
    currentPath: path.resolve(".agent-state/auto-iterate-current.json"),
    session: "demo",
    targetType: "session",
    current: {
      session: "demo",
      stateFile: ".agent-state/auto-iterate/demo/state.md",
      promptFile: ".agent-state/auto-iterate/demo/start-prompt.md",
    },
    ...overrides,
  };
}

test("validates a healthy generated state baseline without issues", async () => {
  await withTempCwd(async () => {
    fs.mkdirSync(".agent-state/auto-iterate/demo", { recursive: true });
    fs.writeFileSync(".agent-state/auto-iterate/demo/start-prompt.md", "prompt");

    const result = await validateSessionStateBaseline(buildStateMd(), stateInfo());

    assert.deepStrictEqual(result.issues, []);
  });
});

test("reports missing sections and missing session fields", async () => {
  await withTempCwd(async () => {
    const result = await validateSessionStateBaseline(buildStateMd({
      "## Session / 会话": [
        "状态文件：.agent-state/auto-iterate/demo/state.md",
        "启动提示：.agent-state/auto-iterate/demo/start-prompt.md",
      ].join("\n"),
      "## Resume Prompt / 恢复提示": null,
    }), stateInfo({ current: null, session: null, targetType: "path" }));

    assert(messages(result).includes("缺少必要章节: ## Resume Prompt / 恢复提示"));
    assert(messages(result).includes("Session 章节缺少 session 字段"));
    assert(messages(result).includes("Session.current 指针未记录为 .agent-state/auto-iterate-current.json"));
    assert(messages(result).includes("缺少 auto-iterate-current.json 或 current.stateFile，无法确认当前活动 session"));
  });
});

test("reports session path, current pointer, and prompt-file inconsistencies", async () => {
  await withTempCwd(async () => {
    fs.mkdirSync(".agent-state/auto-iterate/demo", { recursive: true });
    const result = await validateSessionStateBaseline(buildStateMd({
      "## Session / 会话": [
        "session：demo",
        "状态文件：.agent-state/auto-iterate/other/state.md",
        "启动提示：.agent-state/auto-iterate/demo/missing-prompt.md",
        "current 指针：wrong-current.json",
      ].join("\n"),
    }), stateInfo({
      current: {
        session: "other",
        stateFile: ".agent-state/auto-iterate/other/state.md",
        promptFile: ".agent-state/auto-iterate/other/start-prompt.md",
      },
      targetType: "current",
    }));

    assert(messages(result).includes("Session.状态文件=.agent-state/auto-iterate/other/state.md 与实际文件 .agent-state/auto-iterate/demo/state.md 不一致"));
    assert(messages(result).includes("Session.状态文件 未指向标准 session 路径 .agent-state/auto-iterate/demo/state.md"));
    assert(messages(result).includes("缺少 start-prompt.md: .agent-state/auto-iterate/demo/missing-prompt.md"));
    assert(messages(result).includes("auto-iterate-current.json.promptFile 指向的文件不存在: .agent-state/auto-iterate/other/start-prompt.md"));
    assert(messages(result).includes("Session.current 指针未记录为 .agent-state/auto-iterate-current.json"));
    assert(messages(result).includes("current.session=other 与 state.md session=demo 不一致"));
  });
});

test("reports budget, watchdog, RCM, validation, and cleanup risks", async () => {
  await withTempCwd(async () => {
    fs.mkdirSync(".agent-state/auto-iterate/demo", { recursive: true });
    fs.writeFileSync(".agent-state/auto-iterate/demo/start-prompt.md", "prompt");

    const result = await validateSessionStateBaseline(buildStateMd({
      "## Budgets / 预算": [
        "max_iterations：2",
        "minimum_implementation_iterations：3",
        "implementation_iterations_used：1",
        "optimization_iterations_used：1",
        "non_implementation_iterations_used：1",
        "validation_hardening_iterations_used：0",
        "minimum_validation_hardening_iterations：1",
        "total_cycles：9",
        "remaining_implementation_iterations：0",
      ].join("\n"),
      "## Watchdog / 看门狗": [
        "triggered：true",
        "required_action：run_validation",
        "delivery_verifiability：verifiable",
        "state_drift：confirmed",
        "last_validation_result：failed",
        "fresh_eyes_required：true",
        "validation_hardening_status：pending",
        "validation_hardening_dimensions_done：boundary",
        "new_test_count：0",
      ].join("\n"),
      "## Requirement Coverage Matrix / 需求覆盖矩阵": [
        "REQ-1",
        "状态：pending",
        "REQ-2",
        "状态：blocked",
        "REQ-3",
        "状态：passed",
      ].join("\n"),
      "## Definition of Done / 完成定义": [
        "交付可验证性：verifiable",
        "看门狗状态：triggered",
      ].join("\n"),
      "## Validation / 验证": [
        "最终交付可验证性：not_verifiable",
        "已通过验证：无",
      ].join("\n"),
      "## Temporary Artifacts / Cleanup / 临时产物清理": [
        "清理状态：pending",
        "待删除 artifacts：tmp/a.log",
      ].join("\n"),
    }), stateInfo());

    assert(messages(result).includes("total_cycles=9，但 implementation_iterations_used + optimization_iterations_used + non_implementation_iterations_used=3"));
    assert(messages(result).includes("remaining_implementation_iterations = 0，恢复后必须先请求用户追加预算，不得继续修改"));
    assert(messages(result).includes("minimum_implementation_iterations=3 大于 max_iterations=2"));
    assert(messages(result).includes("implementation_iterations_used=1 尚未达到 minimum_implementation_iterations=3"));
    assert(messages(result).includes("Watchdog.triggered=true，必须先处理 required_action=run_validation"));
    assert(messages(result).includes("Watchdog.state_drift=confirmed，必须先进入 reconcile"));
    assert(messages(result).includes("RCM 仍存在 pending/implemented/not_verified/blocked，但 DoD 标记为 verifiable"));
    assert(messages(result).includes("RCM 仍存在 pending/implemented/not_verified/blocked，但 Watchdog.delivery_verifiability=verifiable"));
    assert(messages(result).includes("DoD.看门狗状态=triggered，必须先处理停止/恢复动作"));
    assert(messages(result).includes("Watchdog.fresh_eyes_required=true，但 required_action=run_validation 不是 context_compress_and_review"));
    assert(messages(result).includes("Watchdog.delivery_verifiability=verifiable 与 Validation.最终交付可验证性=not_verifiable 不一致"));
    assert(messages(result).includes("RCM 已存在 passed 需求，但 Validation.已通过验证 未记录证据"));
    assert(messages(result).includes("Temporary Artifacts / Cleanup 清理状态=pending，交付前需清理或记录保留理由"));
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
