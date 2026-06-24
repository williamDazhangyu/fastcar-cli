const assert = require("assert");
const path = require("path");
const {
  DEFAULT_DELIVERY_FORMAT,
  MODE_CHOICES,
  MODE_CONFIGS,
  buildModeInstructions,
  buildNonInteractiveConfig,
  formatList,
  formatNonNegativeNumber,
  formatNumber,
  getModeConfig,
  normalizeLines,
  validateNonNegativeInteger,
  validatePositiveInteger,
  withModeDefaults,
} = require("../../../dist/auto-iterate/sessionConfig");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

test("mode configs and choices expose all supported modes", () => {
  const modes = ["strict", "quick", "diagnose", "verify", "plan", "optimize", "prototype"];

  assert.deepStrictEqual(Object.keys(MODE_CONFIGS), modes);
  assert.deepStrictEqual(MODE_CHOICES.map((item) => item.value), modes);
  assert.strictEqual(getModeConfig("missing"), MODE_CONFIGS.strict);
});

test("line and number helpers preserve legacy coercion", () => {
  assert.deepStrictEqual(normalizeLines(" a \n\n b \r\n c "), ["a", "b", "c"]);
  assert.strictEqual(formatList("a\nb"), "- a\n- b");
  assert.strictEqual(formatList("", "fallback"), "fallback");
  assert.strictEqual(formatNumber("12", 3), 12);
  assert.strictEqual(formatNumber("0", 3), 3);
  assert.strictEqual(formatNonNegativeNumber("0", 3), 0);
  assert.strictEqual(validatePositiveInteger("5"), true);
  assert.strictEqual(validatePositiveInteger("0"), "请输入大于 0 的整数");
  assert.strictEqual(validateNonNegativeInteger("0"), true);
  assert.strictEqual(validateNonNegativeInteger("-1"), "请输入大于等于 0 的整数");
});

test("withModeDefaults applies mode defaults, language inference, and budgets", () => {
  const answers = withModeDefaults({
    mode: "optimize",
    goal: "优化查询性能",
  });

  assert.strictEqual(answers.modeLabel, "Optimization-only");
  assert.strictEqual(answers.autopilot, false);
  assert.strictEqual(answers.currentPhase, "optimization_only_start");
  assert.strictEqual(answers.maxIterations, 50);
  assert.strictEqual(answers.autopilotMaxIterations, 10);
  assert.strictEqual(answers.deliveryFormat, DEFAULT_DELIVERY_FORMAT);
  assert.strictEqual(answers.language.code, "zh");
  assert(answers.modeInstructions.includes("Optimization-only 模式"));
});

test("withModeDefaults and non-interactive config preserve explicit zero autopilot budget", () => {
  const answers = withModeDefaults({
    mode: "quick",
    goal: "只准备 session",
    autopilotMaxIterations: 0,
  });
  assert.strictEqual(answers.autopilotMaxIterations, 0);

  const config = buildNonInteractiveConfig("strict", {
    goal: "禁用自动轮次",
    autopilotMaxIterations: 0,
  });
  assert.strictEqual(config.autopilotMaxIterations, 0);
});

test("buildModeInstructions covers every mode with mode-specific rules", () => {
  assert(buildModeInstructions({ mode: "strict" }).includes("严格启动模式"));
  assert(buildModeInstructions({ mode: "quick" }).includes("快速启动模式"));
  assert(buildModeInstructions({ mode: "diagnose" }).includes("feedback loop"));
  assert(buildModeInstructions({ mode: "verify" }).includes("Verify-only 模式"));
  assert(buildModeInstructions({ mode: "plan" }).includes("Plan-only 模式"));
  assert(buildModeInstructions({ mode: "prototype" }).includes("Prototype-only 模式"));
});

test("buildNonInteractiveConfig creates strict defaults without source", () => {
  const config = buildNonInteractiveConfig("strict", {
    goal: "修复登录",
    maxIterations: 7,
    autopilotMaxIterations: 3,
  });

  assert.strictEqual(config.mode, "strict");
  assert.strictEqual(config.goal, "修复登录");
  assert.strictEqual(config.maxIterations, 7);
  assert.strictEqual(config.autopilotMaxIterations, 3);
  assert.strictEqual(config.successCriteria, "由用户目标推断并在实现前确认");
  assert.strictEqual(config.validationCommands, "npm test\nnpm run build\nnpm run typecheck");
});

test("buildNonInteractiveConfig preserves source checklist metadata", () => {
  const source = {
    path: path.join(process.cwd(), "docs", "prd.md"),
    content: "# PRD",
  };
  const config = buildNonInteractiveConfig("verify", {}, source);

  assert.strictEqual(config.goal, "见原始清单文档");
  assert.strictEqual(config.allowModify, false);
  assert.strictEqual(config.sourceChecklist, "# PRD");
  assert.strictEqual(config.sourceChecklistPath, "docs/prd.md");
  assert.strictEqual(config.successCriteria, "逐项验证原始清单文档是否已由现有实现满足");
});

test("buildNonInteractiveConfig uses mode-specific defaults", () => {
  assert.strictEqual(buildNonInteractiveConfig("quick").allowAgentInference, true);
  assert.strictEqual(buildNonInteractiveConfig("plan").allowModify, false);
  assert.strictEqual(buildNonInteractiveConfig("prototype").allowModify, true);
  assert.strictEqual(buildNonInteractiveConfig("optimize").validationCommands, "npm test\nnpm run build\nnpm run typecheck");
  assert(buildNonInteractiveConfig("diagnose").successCriteria.includes("feedback loop"));
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
