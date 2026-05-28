const assert = require("assert");
const { buildPromptContent } = require("../src/auto-iterate/sessionPromptContent");

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
    deliveryFormat: "输出修改摘要和验证证据",
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

test("buildPromptContent renders Chinese autopilot start prompt guardrails", () => {
  const content = buildPromptContent(baseAnswers());

  assert(content.startsWith("# 自动迭代编码启动提示"));
  assert(content.includes("请使用 auto-iterate-coding skill，进入 Autopilot 全自动迭代模式。"));
  assert(content.includes("当前启动模式：quick / 快速启动"));
  assert(content.includes("Session 机器状态：.agent-state/auto-iterate/login-fix/state.json"));
  assert(content.includes("Auto-iterate 激活声明："));
  assert(content.includes("Requirement Coverage Matrix"));
  assert(content.includes("## Skill Capture / 技能沉淀"));
  assert(content.includes("max_iterations = 9"));
  assert(content.includes("autopilot_max_iterations = 4"));
});

test("English prompt follows inferred language and English checklist labels", () => {
  const content = buildPromptContent(baseAnswers({
    goal: "Fix login failure",
    successCriteria: "Login succeeds\nErrors are visible",
    sourceChecklist: "# PRD\n- Login must work",
    sourceChecklistPath: "docs/login.md",
  }));

  assert(content.startsWith("# Auto-Iterate Coding Start Prompt"));
  assert(content.includes("Use the auto-iterate-coding skill and enter Autopilot mode."));
  assert(content.includes("Language: en"));
  assert(content.includes("Original checklist document:"));
  assert(content.includes("Source file: docs/login.md"));
  assert(content.includes("User goal:\nFix login failure"));
  assert(content.includes("- Login succeeds\n- Errors are visible"));
});

test("plan mode uses bounded workflow wording instead of autopilot wording", () => {
  const content = buildPromptContent(baseAnswers({
    mode: "plan",
    goal: "规划 TS 重构",
    maxIterations: 5,
  }));

  assert(content.includes("请使用 auto-iterate-coding skill，按当前模式执行有边界的 Agent 工作流。"));
  assert(content.includes("当前启动模式：plan / Plan-only"));
  assert(content.includes("max_iterations = 5"));
  assert(!content.includes("进入 Autopilot 全自动迭代模式"));
});

test("English plan mode uses bounded workflow wording", () => {
  const content = buildPromptContent(baseAnswers({
    mode: "plan",
    goal: "Plan the TypeScript refactor",
    successCriteria: "Produce a plan",
  }));

  assert(content.includes("Use the auto-iterate-coding skill and follow the bounded workflow for the current mode."));
  assert(content.includes("Current mode: plan / Plan-only"));
  assert(!content.includes("enter Autopilot mode."));
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
