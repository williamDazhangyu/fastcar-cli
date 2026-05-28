const assert = require("assert");
const inquirer = require("inquirer");
const {
  promptAutoIterateConfig,
  promptAutoIterateConfigFromFile,
  promptMode,
} = require("../src/auto-iterate/sessionPromptConfig");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

async function withPromptStub(handler, fn) {
  const originalPrompt = inquirer.prompt;
  inquirer.prompt = async (questions) => handler(questions);
  try {
    return await fn();
  } finally {
    inquirer.prompt = originalPrompt;
  }
}

test("promptMode delegates to inquirer with all mode choices", async () => {
  await withPromptStub(async (questions) => {
    assert.strictEqual(questions.length, 1);
    assert.strictEqual(questions[0].name, "mode");
    assert.strictEqual(questions[0].default, "quick");
    assert(questions[0].choices.some((choice) => choice.value === "prototype"));
    return { mode: "prototype" };
  }, async () => {
    const mode = await promptMode("quick");
    assert.strictEqual(mode, "prototype");
  });
});

test("promptAutoIterateConfig builds quick defaults from prompted answers", async () => {
  await withPromptStub(async (questions) => {
    assert.deepStrictEqual(questions.map((item) => item.name), [
      "goal",
      "allowAgentInference",
      "constraints",
      "maxIterations",
      "autopilotMaxIterations",
    ]);
    return {
      goal: "修复登录",
      allowAgentInference: true,
      constraints: "不要新增依赖",
      maxIterations: 9,
      autopilotMaxIterations: 4,
    };
  }, async () => {
    const config = await promptAutoIterateConfig("quick", {});
    assert.strictEqual(config.mode, "quick");
    assert.strictEqual(config.modeLabel, "快速启动");
    assert.strictEqual(config.goal, "修复登录");
    assert.strictEqual(config.autopilot, true);
    assert.strictEqual(config.maxIterations, 9);
    assert.strictEqual(config.autopilotMaxIterations, 4);
    assert(config.successCriteria.includes("Requirement Coverage Matrix"));
  });
});

test("promptAutoIterateConfig falls back unknown modes to strict", async () => {
  await withPromptStub(async (questions) => {
    assert(questions.some((item) => item.name === "successCriteria"));
    return {
      goal: "严格任务",
      successCriteria: "必须完成",
      nonGoals: "",
      allowedScope: "src",
      compatibility: "保持兼容",
      validationCommands: "npm test",
      constraints: "不要新增依赖",
      deliveryFormat: "输出总结",
      maxIterations: 10,
      autopilotMaxIterations: 3,
    };
  }, async () => {
    const config = await promptAutoIterateConfig("unknown", {});
    assert.strictEqual(config.mode, "strict");
    assert.strictEqual(config.modeLabel, "严格启动");
    assert.strictEqual(config.autopilot, true);
  });
});

test("promptAutoIterateConfigFromFile adds verify allowModify prompt and source checklist", async () => {
  await withPromptStub(async (questions) => {
    assert(questions.some((item) => item.name === "allowModify"));
    assert(!questions.some((item) => item.name === "prototypeKind"));
    return {
      goal: "验收登录",
      successCriteria: "逐项验收",
      allowedScope: "src/auth.js",
      allowModify: false,
      validationCommands: "npm test",
      constraints: "不要联网",
      deliveryFormat: "输出差距",
      maxIterations: 5,
      autopilotMaxIterations: 2,
    };
  }, async () => {
    const config = await promptAutoIterateConfigFromFile({
      content: "# PRD",
      path: `${process.cwd()}\\docs\\login.md`,
    }, "verify", {});
    assert.strictEqual(config.mode, "verify");
    assert.strictEqual(config.allowModify, false);
    assert.strictEqual(config.sourceChecklist, "# PRD");
    assert.strictEqual(config.sourceChecklistPath, "docs/login.md");
    assert.strictEqual(config.nonGoals, "不修改项目文件；不把差距修复伪装成验收结果");
  });
});

test("promptAutoIterateConfigFromFile adds prototype kind prompt", async () => {
  await withPromptStub(async (questions) => {
    assert(questions.some((item) => item.name === "prototypeKind"));
    return {
      goal: "验证状态机",
      successCriteria: "以文档为准",
      allowedScope: "prototype",
      prototypeKind: "logic",
      validationCommands: "node prototype.js",
      constraints: "不连数据库",
      deliveryFormat: "输出原型结论",
      maxIterations: 4,
      autopilotMaxIterations: 2,
    };
  }, async () => {
    const config = await promptAutoIterateConfigFromFile({
      content: "# Prototype PRD",
      path: `${process.cwd()}\\docs\\prototype.md`,
    }, "prototype", {});
    assert.strictEqual(config.mode, "prototype");
    assert.strictEqual(config.prototypeKind, "logic");
    assert.strictEqual(config.allowModify, true);
    assert.strictEqual(config.nonGoals, "不把原型直接当生产实现交付；不连接生产数据库或生产写操作；不为原型做大范围抽象");
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
