const assert = require("assert");
const {
  NATURAL_LANGUAGE_EXAMPLES,
  getNaturalLanguageExampleSections,
  renderNaturalLanguageExamples,
} = require("../src/auto-iterate/naturalLanguageExamples");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

test("example data keeps expected major scenarios", () => {
  const titles = NATURAL_LANGUAGE_EXAMPLES.map((section) => section.title);

  assert(titles.includes("快速启动开发任务"));
  assert(titles.includes("严格按文档完整实现"));
  assert(titles.includes("Codex /goal 与 worker dispatch"));
  assert(titles.includes("session 管理"));
  assert(NATURAL_LANGUAGE_EXAMPLES.every((section) => section.keywords.length > 0));
  assert(NATURAL_LANGUAGE_EXAMPLES.every((section) => section.examples.length > 0));
});

test("query filtering matches title, keywords, and examples", () => {
  const codex = getNaturalLanguageExampleSections("Codex");
  const autoIterateGoal = getNaturalLanguageExampleSections("auto-iterate goal");
  const payment = getNaturalLanguageExampleSections("支付回调");

  assert.deepStrictEqual(codex.map((section) => section.title), ["Codex /goal 与 worker dispatch"]);
  assert(autoIterateGoal.some((section) => section.title === "快速启动开发任务"));
  assert(payment.some((section) => section.examples.some((example) => example.includes("支付回调"))));
});

test("renderNaturalLanguageExamples renders all sections without query", () => {
  const output = renderNaturalLanguageExamples();

  assert(output.startsWith("# auto-iterate 自然语言触发示例"));
  assert(output.includes("自然语言路由必须每次生成独立 session"));
  assert(output.includes("## 快速启动开发任务"));
  assert(output.includes("## Codex /goal 与 worker dispatch"));
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
