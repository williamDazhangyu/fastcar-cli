const assert = require("assert");
const { buildStateContent } = require("../../../dist/auto-iterate/sessionStateContent");

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

test("buildStateContent renders core quick-mode state sections", () => {
  const content = buildStateContent(baseAnswers());

  assert(content.startsWith("# 自动迭代编码状态"));
  assert(content.includes("模式：quick / 快速启动"));
  assert(content.includes("execution_mode：native_subagent"));
  assert(content.includes("enabled：true（native_subagent 默认开启；每轮最多一个 coder）"));
  assert(content.includes("concurrency_limit：1（写代码 coder 固定串行；只读探索辅助不得写业务代码或 state）"));
  assert(content.includes("进度：implementation 0 / 4；optimization 0 / 未开始"));
  assert(content.includes("remaining_implementation_iterations：4"));
  assert(content.includes("minimum_validation_hardening_iterations：1"));
  assert(content.includes("## Requirement Coverage Matrix / 需求覆盖矩阵"));
  assert(content.includes("用户可见行为：用户目标被拆成可独立推进、验证和交付的薄需求条目"));
  assert(content.includes("复现步骤：读取用户目标；读取成功标准或来源文档；只读探索现有行为和领域语言；拆分 REQ-001...REQ-N"));
  assert(content.includes("可立即开始：true"));
  assert(content.includes("## Skill Capture / 技能沉淀"));
  assert(content.includes("## Context Reset Review Gate / 上下文清空复核门禁"));
  assert(content.includes("## Post-Agent Validation Gate / Agent 后置校验门禁"));
});

test("protocol-only state view disables sub-agent dispatch", () => {
  const content = buildStateContent(baseAnswers({ executionMode: "protocol_only" }));

  assert(content.includes("execution_mode：protocol_only"));
  assert(content.includes("enabled：false（protocol_only / LLM-only；用户明确手动模式或不启动 subagent）"));
  assert(content.includes("concurrency_limit：0（protocol-only 不派发 coder subagent）"));
});

test("strict mode keeps stricter budget and approval markers", () => {
  const content = buildStateContent(baseAnswers({
    mode: "strict",
    autopilotMaxIterations: 7,
  }));

  assert(content.includes("模式：strict / 严格启动"));
  assert(content.includes("minimum_validation_hardening_iterations：2"));
  assert(content.includes("remaining_validation_hardening_iterations：2"));
  assert(content.includes("status：approved"));
  assert(content.includes("complexity：large"));
  assert(content.includes("risk：high"));
});

test("source checklist follows inferred English language", () => {
  const content = buildStateContent(baseAnswers({
    goal: "Fix login failure",
    successCriteria: "Login succeeds\nErrors are visible",
    sourceChecklist: "# PRD\n- Login must work",
    sourceChecklistPath: "docs/login.md",
  }));

  assert(content.includes("语言：en"));
  assert(content.includes("## Source Checklist"));
  assert(content.includes("Source file: docs/login.md"));
  assert(content.includes("# PRD\n- Login must work"));
});

test("optimize mode uses optimization budget and skips style consolidation", () => {
  const content = buildStateContent(baseAnswers({
    mode: "optimize",
    maxIterations: 6,
  }));

  assert(content.includes("进度：implementation 0 / 6；optimization 0 / 6"));
  assert(content.includes("remaining_optimization_iterations：6"));
  assert(content.includes("type：optimize"));
  assert(content.includes("status：not_applicable"));
  assert(content.includes("skipped_reasons：当前模式不是实现需求模式"));
});

test("prototype mode marks prototype cleanup and style consolidation as required", () => {
  const content = buildStateContent(baseAnswers({ mode: "prototype" }));

  assert(content.includes("原型状态：proposed"));
  assert(content.includes("原型文件或路由：待创建并明确标记"));
  assert(content.includes("type：prototype"));
  assert(content.includes("status：pending"));
  assert(content.includes("skipped_reasons：无"));
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
