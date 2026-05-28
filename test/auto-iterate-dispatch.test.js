const assert = require("assert");
const {
  buildDispatchCounters,
  buildWorkerPrompt,
  formatSubAgentHistoryBlock,
  hasUnmergedActiveSubAgents,
  normalizeDispatchAgent,
  normalizeSubAgentHistory,
  selectVerifyCommand,
  updateDecisionsMarkdownForDispatch,
  updateStateJsonForDispatch,
  updateStateMarkdownForDispatch,
} = require("../src/auto-iterate/dispatch");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function buildDispatch(overrides = {}) {
  const activeAgent = {
    id: "codex-demo-20260528010101",
    type: "coder",
    task: "修复 REQ-001",
    filesAssigned: ["src/auth.js", "test/auth.test.js"],
    status: "planned",
    failureReason: "无",
    startedAt: null,
    completedAt: null,
    resultSummary: "prompt=.agent-state/auto-iterate/demo/dispatch/a.prompt.md",
    mergeStatus: "pending",
  };
  return {
    agent: "codex",
    task: "修复 REQ-001",
    phase: "implement",
    activeBlock: [
      "",
      "  - id：codex-demo-20260528010101",
      "    type：coder",
      "    task：修复 REQ-001",
      "    files_assigned：src/auth.js,test/auth.test.js",
      "    status：planned",
      "    failure_reason：无",
      "    started_at：未开始",
      "    completed_at：未开始",
      "    result_summary：prompt=.agent-state/auto-iterate/demo/dispatch/a.prompt.md",
      "    merge_status：pending",
    ].join("\n"),
    historyBlock: "无",
    activeSubAgents: [activeAgent],
    subAgentHistory: [],
    dispatchedCount: 1,
    completedCount: 0,
    failedCount: 0,
    lastDispatchRound: 1,
    lastMergeResult: "pending",
    timeoutSeconds: 300,
    dryRun: true,
    ...overrides,
  };
}

test("normalizeDispatchAgent resolves aliases and rejects unknown agents", () => {
  assert.strictEqual(normalizeDispatchAgent("codex-cli"), "codex");
  assert.strictEqual(normalizeDispatchAgent("CLAUDE_CODE"), "claude");
  assert.strictEqual(normalizeDispatchAgent("open-hands"), "openhands");
  assert.strictEqual(normalizeDispatchAgent("unknown"), null);
});

test("buildWorkerPrompt preserves worker guardrails and explicit files", () => {
  const prompt = buildWorkerPrompt({
    agent: "codex",
    agentId: "codex-demo",
    session: "demo",
    task: "修复 REQ-001",
    files: ["src/auth.js", "test/auth.test.js"],
    verifyCommand: "npm test",
    timeoutSeconds: 30,
  });

  assert(prompt.includes("你的角色：父 Agent 委派的 coder 子任务执行者"));
  assert(prompt.includes("允许修改文件：src/auth.js, test/auth.test.js"));
  assert(prompt.includes("验证命令：npm test"));
  assert(prompt.includes("禁止读取或写入 .agent-state/ 下任何文件"));
  assert(prompt.includes("Sub-Agent Result Schema"));
});

test("normalizeSubAgentHistory keeps only object entries and caps latest 200", () => {
  const history = [
    "bad",
    null,
    ...Array.from({ length: 205 }, (_, index) => ({
      id: `agent-${index + 1}`,
      type: "coder",
      filesAssigned: [`src/${index + 1}.js`],
    })),
  ];

  const normalized = normalizeSubAgentHistory(history);

  assert.strictEqual(normalized.length, 200);
  assert.strictEqual(normalized[0].id, "agent-6");
  assert.strictEqual(normalized[199].id, "agent-205");
});

test("formatSubAgentHistoryBlock supports legacy and current field names", () => {
  const block = formatSubAgentHistoryBlock([{
    round: 2,
    agent_id: "legacy-a",
    task_summary: "完成探索",
    merge_result: "success",
    files_changed: "src/a.js",
    validation_result: "passed",
    failure_reason: "无",
  }, {
    id: "current-b",
    task: "修复 B",
    mergeStatus: "merged",
    filesAssigned: ["src/b.js"],
    status: "completed",
  }]);

  assert(block.includes("agent_id：legacy-a"));
  assert(block.includes("files_changed：src/a.js"));
  assert(block.includes("agent_id：current-b"));
  assert(block.includes("files_changed：src/b.js"));
});

test("selectVerifyCommand ignores validation history and uses config command fallback", () => {
  const command = selectVerifyCommand({
    validation: {
      commands: [{
        command: "npm run old-history",
        result: "passed",
        iteration: 1,
      }, {
        command: "npm test",
        note: "configured command",
      }],
    },
  }, null);

  assert.strictEqual(command, "npm test");
  assert.strictEqual(selectVerifyCommand({}, "node test.js"), "node test.js");
});

test("updateStateMarkdownForDispatch and decisions markdown replace generated sections", () => {
  const content = [
    "## Sub-Agent Dispatch / 子 Agent 调度",
    "enabled：false",
    "current_phase：idle",
    "",
    "## Budgets / 预算",
    "max_iterations：10",
    "",
    "## Decisions / 已确认决策",
    "  parallel_write_allowed：false",
    "  parallel_write_confirmation：未确认",
    "  coder_file_ownership：未分配",
    "  fallback_strategy：串行执行",
  ].join("\n");
  const dispatch = buildDispatch();

  const updated = updateDecisionsMarkdownForDispatch(
    updateStateMarkdownForDispatch(content, dispatch),
    dispatch,
  );

  assert(updated.includes("current_phase：implement"));
  assert(updated.includes("active_sub_agents：\n  - id：codex-demo-20260528010101"));
  assert(updated.includes("dispatched_count：1"));
  assert(updated.includes("parallel_write_allowed：true"));
  assert(updated.includes("coder_file_ownership：codex-demo-20260528010101=src/auth.js,test/auth.test.js"));
  assert(updated.includes("## Budgets / 预算"));
});

test("updateStateJsonForDispatch updates runtime state and decisions without losing existing fields", () => {
  const updated = updateStateJsonForDispatch({
    currentState: { recentChanges: "keep" },
    watchdog: { deliveryVerifiability: "unknown" },
    decisions: { compatibility: ["keep"] },
  }, buildDispatch());

  assert.strictEqual(updated.subAgentDispatch.currentPhase, "implement");
  assert.strictEqual(updated.currentState.recentChanges, "keep");
  assert.strictEqual(updated.currentState.currentPhase, "dispatch_ready");
  assert.strictEqual(updated.watchdog.deliveryVerifiability, "unknown");
  assert.strictEqual(updated.watchdog.requiredAction, "continue");
  assert.strictEqual(updated.decisions.parallelWriteAllowed, true);
  assert.deepStrictEqual(updated.decisions.compatibility, ["keep"]);
});

test("hasUnmergedActiveSubAgents blocks pending active agents only", () => {
  assert.strictEqual(hasUnmergedActiveSubAgents({
    subAgentDispatch: {
      activeSubAgents: [{ mergeStatus: "pending" }],
    },
  }), true);
  assert.strictEqual(hasUnmergedActiveSubAgents({
    subAgentDispatch: {
      activeSubAgents: [{ mergeStatus: "merged" }, { mergeStatus: "skipped" }],
    },
  }), false);
  assert.strictEqual(hasUnmergedActiveSubAgents({}), false);
});

test("buildDispatchCounters preserves completed and failed counts while incrementing dispatch", () => {
  assert.deepStrictEqual(buildDispatchCounters({
    dispatchedCount: 5,
    completedCount: 3,
    failedCount: 2,
    lastDispatchRound: 5,
  }), {
    dispatchedCount: 6,
    completedCount: 3,
    failedCount: 2,
    lastDispatchRound: 6,
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
