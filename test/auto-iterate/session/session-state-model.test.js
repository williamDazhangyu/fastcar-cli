const assert = require("assert");
const {
  STATE_SCHEMA_VERSION,
  buildStateModel,
} = require("../../../dist/auto-iterate/sessionStateModel");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function baseAnswers(overrides = {}) {
  return {
    mode: "quick",
    goal: "修复登录失败",
    successCriteria: "登录成功\n错误提示正确",
    nonGoals: "不改支付",
    allowedScope: "src/auth.js",
    compatibility: "保持 CLI 兼容",
    validationCommands: "npm test\nnpm run typecheck",
    constraints: "不要新增依赖",
    session: "login-fix",
    sessionStateJsonFile: ".agent-state/auto-iterate/login-fix/state.json",
    sessionStateFile: ".agent-state/auto-iterate/login-fix/state.md",
    sessionPromptFile: ".agent-state/auto-iterate/login-fix/start-prompt.md",
    currentFile: ".agent-state/auto-iterate-current.json",
    maxIterations: 9,
    autopilotMaxIterations: 4,
    ...overrides,
  };
}

test("buildStateModel creates the authoritative initial state shape", () => {
  const state = buildStateModel(baseAnswers());

  assert.strictEqual(state.schemaVersion, STATE_SCHEMA_VERSION);
  assert.strictEqual(state.language.code, "zh");
  assert.strictEqual(state.task.goal, "修复登录失败");
  assert.deepStrictEqual(state.task.successCriteria, ["登录成功", "错误提示正确"]);
  assert.strictEqual(state.session.session, "login-fix");
  assert.strictEqual(state.mode.mode, "quick");
  assert.strictEqual(state.mode.executionMode, "native_subagent");
  assert.strictEqual(state.mode.runtimeAutopilot, true);
  assert.strictEqual(state.subAgentDispatch.enabled, true);
  assert.strictEqual(state.subAgentDispatch.concurrencyLimit, 1);
  assert.deepStrictEqual(state.subAgentDispatch.activeSubAgents, []);
  assert.strictEqual(state.budgets.remainingImplementationIterations, 4);
  assert.strictEqual(state.budgets.minimumValidationHardeningIterations, 1);
  assert.strictEqual(state.currentState.overallStatus, "in_progress");
  assert.strictEqual(state.watchdog.deliveryVerifiability, "unknown");
  assert.strictEqual(state.requirements[0].id, "REQ-BOOTSTRAP");
  assert.strictEqual(state.validation.commands.length, 2);
  assert.strictEqual(state.postChange.command, "npm test");
});

test("protocol-only mode disables sub-agent dispatch in state model", () => {
  const state = buildStateModel(baseAnswers({ executionMode: "protocol_only" }));

  assert.strictEqual(state.mode.executionMode, "protocol_only");
  assert.strictEqual(state.subAgentDispatch.enabled, false);
  assert.strictEqual(state.subAgentDispatch.concurrencyLimit, 0);
});

test("strict mode sets high-risk gates and validation hardening minimum", () => {
  const state = buildStateModel(baseAnswers({
    mode: "strict",
    maxIterations: 20,
    autopilotMaxIterations: 7,
  }));

  assert.strictEqual(state.mode.label, "严格启动");
  assert.strictEqual(state.budgets.remainingImplementationIterations, 7);
  assert.strictEqual(state.budgets.minimumValidationHardeningIterations, 2);
  assert.strictEqual(state.taskProfile.complexity, "large");
  assert.strictEqual(state.decisionRequest.status, "approved");
  assert(state.phaseGate.gates.some((gate) => gate.phase === "requirement" && gate.status === "pending"));
});

test("plan and optimize modes preserve mode-specific budget and style defaults", () => {
  const plan = buildStateModel(baseAnswers({ mode: "plan", maxIterations: 6 }));
  const optimize = buildStateModel(baseAnswers({ mode: "optimize", maxIterations: 6 }));

  assert.strictEqual(plan.mode.loopShape, "plan_once");
  assert.strictEqual(plan.styleConsolidation.status, "not_applicable");
  assert.strictEqual(plan.budgets.remainingOptimizationIterations, null);
  assert.strictEqual(optimize.budgets.remainingImplementationIterations, 6);
  assert.strictEqual(optimize.budgets.remainingOptimizationIterations, 6);
  assert.strictEqual(optimize.styleConsolidation.status, "not_applicable");
});

test("prototype mode is treated as implementation style consolidation target", () => {
  const state = buildStateModel(baseAnswers({ mode: "prototype" }));

  assert.strictEqual(state.cleanup.prototypeFiles, "待创建并明确标记");
  assert.strictEqual(state.styleConsolidation.status, "pending");
  assert.deepStrictEqual(state.styleConsolidation.skippedReasons, []);
  assert.strictEqual(state.taskProfile.type, "prototype");
});

test("source checklist is preserved when present", () => {
  const state = buildStateModel(baseAnswers({
    sourceChecklist: "# PRD",
    sourceChecklistPath: "docs/prd.md",
  }));

  assert.deepStrictEqual(state.sourceChecklist, {
    path: "docs/prd.md",
    content: "# PRD",
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
