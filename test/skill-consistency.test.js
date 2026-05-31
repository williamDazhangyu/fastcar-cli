const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function walkFiles(dir, predicate, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, files);
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
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

test("重复基础 helper 已集中到共享模块", () => {
  const sourceFiles = walkFiles(path.join(repoRoot, "src"), (filePath) => filePath.endsWith(".ts"));
  const pathExistsDefinitions = [];
  const toCliErrorDefinitions = [];
  const normalizeArrayDefinitions = [];

  for (const filePath of sourceFiles) {
    const relative = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    const content = fs.readFileSync(filePath, "utf8");
    if (/function\s+pathExists\s*\(/.test(content)) {
      pathExistsDefinitions.push(relative);
    }
    if (/function\s+toCliError\s*\(/.test(content)) {
      toCliErrorDefinitions.push(relative);
    }
    if (/function\s+normalizeArray\s*\(/.test(content)) {
      normalizeArrayDefinitions.push(relative);
    }
  }

  assert.deepStrictEqual(pathExistsDefinitions, ["src/fsUtils.ts"]);
  assert.deepStrictEqual(toCliErrorDefinitions, ["src/cliError.ts"]);
  assert.deepStrictEqual(normalizeArrayDefinitions, ["src/valueUtils.ts"]);
});

test("模板下载命令不使用 shell 拼接执行", () => {
  const init = read("src/init.ts");
  const update = read("src/update.ts");
  const commandUtils = read("src/commandUtils.ts");

  assert.ok(!init.includes("execSync("));
  assert.ok(!update.includes("execSync("));
  assert.ok(commandUtils.includes("spawnSync(command, args"));
  assert.ok(commandUtils.includes("shell: false"));
});

test("init 模板下载逻辑已拆分到独立模块", () => {
  const init = read("src/init.ts");
  const downloader = read("src/templateDownloader.ts");

  assert.ok(init.includes('from "./templateDownloader"'));
  assert.ok(!init.includes("async function downloadTemplate"));
  assert.ok(downloader.includes("export async function downloadTemplate"));
});

test("基础 state schema validators 已拆分到独立模块", () => {
  const core = read("src/auto-iterate/stateSchemaCoreValidators.ts");
  const basic = read("src/auto-iterate/stateSchemaBasicValidators.ts");

  assert.ok(core.includes('from "./stateSchemaBasicValidators"'));
  assert.ok(!core.includes("function validateLanguageModel"));
  assert.ok(basic.includes("export function validateLanguageModel"));
  assert.ok(basic.includes("export function validateRequirementsModel"));
});

test("pipeline 测试已按 focus、schema 和 validation 职责拆分", () => {
  const pipeline = read("test/pipeline.test.js");
  const focusLoop = read("test/pipeline-focus-loop.test.js");
  const resultSchema = read("test/pipeline-result-schema.test.js");
  const validation = read("test/pipeline-validation.test.js");
  const packageJson = read("package.json");

  assert.ok(focusLoop.includes("../dist/pipeline/pickFocus"));
  assert.ok(focusLoop.includes("../dist/pipeline/shouldStop"));
  assert.ok(focusLoop.includes("../dist/pipeline/loopPolicy"));
  assert.ok(resultSchema.includes("../dist/pipeline/resultSchema"));
  assert.ok(validation.includes("runValidationCommands"));
  assert.ok(!pipeline.includes("loopPolicy 集中解析 once/plan/autopilot/maxSteps 语义"));
  assert.ok(!pipeline.includes("pickFocus 支持 fix/harden/optimize 和 mode-specific focus"));
  assert.ok(!pipeline.includes("normalizeRelativePath 统一过滤非法路径"));
  assert.ok(!pipeline.includes("runValidationCommands 依次执行全部命令并在失败时停止"));
  assert.ok(packageJson.includes("node test/pipeline-focus-loop.test.js"));
  assert.ok(packageJson.includes("node test/pipeline-result-schema.test.js"));
  assert.ok(packageJson.includes("node test/pipeline-validation.test.js"));
});

test("PipelineStateLike 不使用顶层泛索引签名", () => {
  const types = read("src/pipeline/types.ts");
  const start = types.indexOf("export interface PipelineStateLike {");
  const end = types.indexOf("\nexport interface ShouldStopContext", start);
  assert.ok(start >= 0 && end > start, "PipelineStateLike interface should exist");
  const body = types.slice(start, end);
  assert.ok(!/\n\s{2}\[key: string\]: unknown;/.test(body), "PipelineStateLike should model known state fields explicitly");
});

test("auto-iterate 核心输出路径使用共享 CLI 输出抽象", () => {
  const cliOutput = read("src/cliOutput.ts");
  assert.ok(cliOutput.includes("export function writeLine"));
  assert.ok(cliOutput.includes("export function setExitCode"));

  for (const file of [
    "src/auto-iterate/sessionHelp.ts",
    "src/auto-iterate/stateValidationRunner.ts",
  ]) {
    const source = read(file);
    assert.ok(source.includes("../cliOutput"), `${file} should import shared CLI output helpers`);
    assert.ok(!source.includes("console.log"), `${file} should not write directly to console.log`);
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
