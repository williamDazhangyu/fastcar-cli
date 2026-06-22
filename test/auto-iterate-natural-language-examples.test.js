const assert = require("assert");
const {
  NATURAL_LANGUAGE_EXAMPLES,
  getNaturalLanguageExampleSections,
  renderNaturalLanguageExamples,
} = require("../dist/auto-iterate/naturalLanguageExamples");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

test("example data keeps expected major scenarios", () => {
  const titles = NATURAL_LANGUAGE_EXAMPLES.map((section) => section.title);

  assert(titles.includes("快速启动开发任务"));
  assert(titles.includes("严格按文档完整实现"));
  assert(titles.includes("Protocol-only / LLM-only"));
  assert(titles.includes("session 管理"));
  assert(NATURAL_LANGUAGE_EXAMPLES.every((section) => section.keywords.length > 0));
  assert(NATURAL_LANGUAGE_EXAMPLES.every((section) => section.examples.length > 0));
  assert(NATURAL_LANGUAGE_EXAMPLES.some((section) => Array.isArray(section.fewShots) && section.fewShots.length > 0));
});

test("query filtering matches title, keywords, and examples", () => {
  const codex = getNaturalLanguageExampleSections("Codex");
  const autoIterateGoal = getNaturalLanguageExampleSections("auto-iterate goal");
  const payment = getNaturalLanguageExampleSections("支付回调");

  assert.deepStrictEqual(codex.map((section) => section.title), []);
  assert(autoIterateGoal.some((section) => section.title === "快速启动开发任务"));
  assert(payment.some((section) => section.examples.some((example) => example.includes("支付回调"))));
});

test("few-shot route samples cover commands and constraints", () => {
  const shots = NATURAL_LANGUAGE_EXAMPLES.flatMap((section) => section.fewShots || []);
  const manualShots = shots.filter((shot) =>
    shot.route.includes("--no-run") &&
    !shot.route.includes("主 Agent 原生 subagent 工作流")
  );
  const automaticShots = shots.filter((shot) => shot.route.includes("主 Agent 原生 subagent 工作流"));

  assert(shots.length >= 8);
  assert(shots.every((shot) => shot.user && shot.route && Array.isArray(shot.notes) && shot.notes.length > 0));
  assert(shots.some((shot) => shot.route.includes("--no-run")));
  assert(shots.some((shot) => shot.route.includes("--strict") && shot.route.includes("--from docs/prd.md")));
  assert(automaticShots.length > 0);
  assert(automaticShots.every((shot) => shot.route.includes("--yes")));
  assert(automaticShots.every((shot) => !shot.route.includes("--no-run")));
  assert(automaticShots.every((shot) => !shot.route.includes("--check --json-progress")));
  assert(automaticShots.every((shot) => !shot.route.includes("--run")));
  assert(manualShots.every((shot) => shot.notes.some((note) => note.includes("protocol-only") || note.includes("不走固定流程"))));
});

test("renderNaturalLanguageExamples renders all sections without query", () => {
  const output = renderNaturalLanguageExamples();

  assert(output.startsWith("# auto-iterate 自然语言触发示例"));
  assert(output.includes("自然语言路由必须每次生成独立 session"));
  assert(output.includes("Few-shot 样本中的 Route 是路由目标形态"));
  assert(output.includes("Few-shot 路由样本"));
  assert(output.includes("## 快速启动开发任务"));
  assert(output.includes("主 Agent + coder subagent 原生工作流"));
  assert(output.includes("Route: 主 Agent 原生 subagent 工作流"));
  assert(output.includes("用户明确 protocol-only / 手动模式 / 不启动 subagent 时才追加 --no-run"));
  assert(output.includes("Route: fastcar-cli auto-iterate --quick --goal \"修复登录失败\" --session protocol-only-fix --yes --no-run"));
  assert(!output.includes("Route: fastcar-cli auto-iterate --check --json-progress -> fastcar-cli auto-iterate --run"));
  assert(!output.includes("未找到匹配的自然语言场景"));
});

test("renderNaturalLanguageExamples renders not-found guidance", () => {
  const output = renderNaturalLanguageExamples("missing-keyword");

  assert(output.includes("未找到匹配的自然语言场景: missing-keyword"));
  assert(output.includes("可尝试关键词：快速、文档、验收"));
  assert(!output.includes("## 快速启动开发任务"));
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
