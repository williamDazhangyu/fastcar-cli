const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("WORKER.md 覆盖 pipeline focus 类型", () => {
  const worker = read("skills/auto-iterate-coding/worker.md");
  const pickFocus = read("src/pipeline/pickFocus.ts");
  const focusTypes = Array.from(pickFocus.matchAll(/type:\s*"([^"]+)"/g)).map((match) => match[1]);
  for (const focus of focusTypes) {
    assert.ok(worker.includes(focus), `WORKER.md should mention focus ${focus}`);
  }
});

test("ORCHESTRATOR.md 覆盖核心 pipeline 模块", () => {
  const orchestrator = read("skills/auto-iterate-coding/orchestrator.md");
  [
    "runPipeline.ts",
    "iterationPrompt.ts",
    "iterationPaths.ts",
    "pickFocus.ts",
    "mergeState.ts",
    "shouldStop.ts",
    "resultSchema.ts",
    "envCheck.ts",
    "progress.ts",
    "watchdog.ts",
    "phaseGate.ts",
    "writeGuard.ts",
    "routerUx.ts",
    "loopPolicy.ts",
    "flags.ts",
    "deliveryDocs.ts",
  ].forEach((name) => {
    assert.ok(orchestrator.includes(name), `ORCHESTRATOR.md should mention ${name}`);
  });
});

test("SKILL.md 声明 CLI 驱动路径和 fallback 边界", () => {
  const skill = read("skills/auto-iterate-coding/skill.md");
  assert.ok(skill.includes("执行路径识别"));
  assert.ok(skill.includes("CLI 驱动路径"));
  assert.ok(skill.includes("无 CLI fallback"));
  assert.ok(skill.includes("自动模式（路径 A，默认）"));
  assert.ok(skill.includes("手动 / fallback 模式（路径 B）"));
  assert.ok(skill.includes("fastcar-cli auto-iterate --run --autopilot --json-progress"));
  assert.ok(skill.includes("必须同时追加 `--yes --no-run`"));
  assert.ok(!skill.includes("应追加 `--yes` 进入非交互生成模式"));
});

test("自然语言路由文档区分自动模式和手动 fallback 命令", () => {
  const routing = read("skills/auto-iterate-coding/references/natural-language-routing.md");
  const mappingStart = routing.indexOf("## 自动 / 手动模式映射表");
  const fallbackStart = routing.indexOf("## 手动模式 / fallback 路径映射");
  assert.ok(mappingStart >= 0, "routing doc should have automatic/manual mapping section");
  assert.ok(fallbackStart > mappingStart, "fallback section should follow mapping section");

  const mapping = routing.slice(mappingStart, fallbackStart);
  assert.ok(mapping.includes("fastcar-cli auto-iterate --check --json-progress"));
  assert.ok(mapping.includes("--run --autopilot --quick"));
  assert.ok(mapping.includes("--run --once --verify"));
  assert.ok(mapping.includes("--run --once --plan-only"));
  assert.ok(mapping.includes("--quick --goal \"<目标>\" --session <session> --yes --no-run"));
  assert.ok(mapping.includes("手动 / fallback（路径 B：Agent 自治）"));
});

test("用户入口文档默认展示自动模式，旧启动命令只作为 fallback", () => {
  const files = [
    ["README.md", read("README.md")],
    ["end-to-end-scenarios.md", read("skills/auto-iterate-coding/examples/end-to-end-scenarios.md")],
  ];

  for (const [name, content] of files) {
    assert.ok(content.includes("fastcar-cli auto-iterate --check --json-progress"), `${name} should mention --check`);
    assert.ok(content.includes("fastcar-cli auto-iterate --run"), `${name} should mention --run`);
  }

  const readme = files[0][1];
  const oldQuickIndex = readme.indexOf('fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix --yes');
  const fallbackIndex = readme.indexOf("手动 / fallback");
  assert.ok(oldQuickIndex > fallbackIndex, "README old quick command should only appear after fallback heading");

  const scenario = files[1][1];
  const oldScenarioIndex = scenario.indexOf('fastcar-cli auto-iterate --quick --goal "修复登录失败" --session login-bugfix --autopilot-max-iterations 5 --yes --no-run');
  const scenarioFallbackIndex = scenario.indexOf("## 手动 / fallback 补充");
  assert.ok(oldScenarioIndex > scenarioFallbackIndex, "scenario old quick command should only appear in fallback section");

  const autopilotStart = read("skills/auto-iterate-coding/examples/autopilot-start.md");
  assert.ok(autopilotStart.startsWith("# 手动 / fallback Autopilot 启动示例"));
  assert.ok(autopilotStart.includes("默认自动模式不使用本模板"));
  assert.ok(autopilotStart.includes("fastcar-cli auto-iterate --check --json-progress"));
  assert.ok(autopilotStart.includes("fastcar-cli auto-iterate --run --autopilot"));
});

test("AGENTS.md 声明 Router 与 Worker 分工", () => {
  for (const file of ["AGENTS.md", "skills/AGENTS.md"]) {
    const agents = read(file);
    assert.ok(agents.includes("CLI 驱动迁移公告"), file);
    assert.ok(agents.includes("Router / Worker 硬边界"), file);
    assert.ok(agents.includes("Router LLM"), file);
    assert.ok(agents.includes("need_decision"), file);
    assert.ok(agents.includes("兼容 fallback"), file);
    assert.ok(agents.includes("--yes --no-run"), file);
    assert.ok(agents.includes("不得要求用户复制 prompt"), file);
    assert.ok(agents.includes("不得要求用户手动运行"), file);
    assert.ok(agents.includes("不得修改 `.agent-state/auto-iterate/**` 中除本轮指定 `result.json` 以外的文件"), file);
    assert.ok(agents.includes("CLI 是 state merge、预算推进、验证命令、write guard、delivery gate 和 `need_decision` resume 的唯一权威执行者"), file);
  }
});

async function main() {
  const failures = [];
  for (const item of tests) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      failures.push({ name: item.name, error });
      console.error(`✗ ${item.name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} test(s) failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${tests.length} test(s) passed.`);
}

main();
