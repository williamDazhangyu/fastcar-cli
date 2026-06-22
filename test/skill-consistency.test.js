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

test("worker.md 已删除（旧 CLI Worker 路径废弃）", () => {
  const fs = require("fs");
  const path = require("path");
  assert.ok(!fs.existsSync(path.join(__dirname, "..", "skills", "auto-iterate-coding", "worker.md")), "worker.md should be deleted");
});

test("judge-runbook.md 覆盖当前裁判核心模块且旧 runtime 已删除", () => {
  const runbook = read("skills/auto-iterate-coding/references/judge-runbook.md");
  [
    "iterationPrompt.ts",
    "pickFocus.ts",
    "mergeState.ts",
    "shouldStop.ts",
    "resultSchema.ts",
    "watchdog.ts",
    "writeGuard.ts",
    "deliveryGates.ts",
    "pipelineValidationRunner.ts",
    "pipelineStateIO.ts",
  ].forEach((name) => {
    assert.ok(runbook.includes(name), `judge-runbook.md should mention ${name}`);
  });
  [
    "src/adapters",
    "src/pipeline/runPipeline.ts",
    "src/pipeline/pipelineWorkerProgress.ts",
    "src/pipeline/pipelineIsolateWorktree.ts",
    "src/pipeline/pipelineGitAudit.ts",
    "src/pipeline/routerUx.ts",
    "src/pipeline/envCheck.ts",
    "src/auto-iterate/dispatch.ts",
    "src/auto-iterate/subAgentDispatchValidation.ts",
  ].forEach((relativePath) => {
    assert.ok(!fs.existsSync(path.join(repoRoot, relativePath)), `${relativePath} should not exist`);
  });
    assert.ok(runbook.includes("已删除") || runbook.includes("不再维护"));
});

test("SKILL.md 声明主 Agent 原生 subagent 路径和 protocol-only 边界", () => {
  const skill = read("skills/auto-iterate-coding/SKILL.md");
  assert.ok(skill.includes("执行路径识别"));
  assert.ok(skill.includes("主 Agent 直接管理 Subagent"));
  assert.ok(skill.includes("Protocol-only / LLM-only"));
  assert.ok(skill.includes("主 Agent **不亲自修改业务代码**"));
  assert.ok(skill.includes("fastcar-cli auto-iterate --quick --yes --no-run"));
  assert.ok(skill.includes("fastcar-cli auto-iterate --run"));
  assert.ok(skill.includes("External CLI Worker") || skill.includes("旧 CLI 驱动"));
  assert.ok(skill.includes("已废弃") || skill.includes("deprecated"));
  assert.ok(skill.includes("不得在 native_subagent 与 protocol_only 之间静默切换") || skill.includes("不得由主 Agent 静默接手写代码"));
  assert.ok(!skill.includes("应追加 `--yes` 进入非交互生成模式"));
});

test("自然语言路由文档区分自动模式和 protocol-only 命令", () => {
  const routing = read("skills/auto-iterate-coding/references/natural-language-routing.md");
  const mappingStart = routing.indexOf("## 自动 / Protocol-only 模式映射表");
  const fallbackStart = routing.indexOf("## Protocol-only / LLM-only 路径映射");
  assert.ok(mappingStart >= 0, "routing doc should have automatic/manual mapping section");
  assert.ok(fallbackStart > mappingStart, "fallback section should follow mapping section");

  const mapping = routing.slice(mappingStart, fallbackStart);
  assert.ok(mapping.includes("主 Agent 原生 subagent"));
  assert.ok(mapping.includes("Agent(subagent_type=\"coder\")"));
  assert.ok(mapping.includes("不启动旧 `--check` / `--run` Worker pipeline"));
  assert.ok(mapping.includes("--quick --goal \"<目标>\" --session <session> --yes"));
  assert.ok(mapping.includes("--quick --goal \"<目标>\" --session <session> --yes --no-run"));
  assert.ok(mapping.includes("Protocol-only / LLM-only（路径 B：当前 LLM 自律执行）"));
});

test("用户入口文档默认展示原生 subagent，旧流水线只作为 deprecated", () => {
  const files = [
    ["README.md", read("README.md")],
    ["end-to-end-scenarios.md", read("skills/auto-iterate-coding/examples/end-to-end-scenarios.md")],
  ];

  for (const [name, content] of files) {
    assert.ok(content.includes("主 Agent") || content.includes("Agent(subagent_type=\"coder\")"), `${name} should mention native subagent flow`);
    assert.ok(!content.includes("fastcar-cli auto-iterate --check --json-progress"), `${name} should not recommend --check`);
    assert.ok(!content.includes("fastcar-cli auto-iterate --run --autopilot"), `${name} should not recommend --run`);
  }

  const readme = files[0][1];
  assert.ok(readme.includes('fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix --yes'));

  const scenario = files[1][1];
  assert.ok(scenario.includes('fastcar-cli auto-iterate --quick --goal "修复登录失败" --session login-bugfix --autopilot-max-iterations 5 --yes'));
  assert.ok(scenario.includes('Agent(subagent_type="coder")'));
  assert.ok(scenario.includes("默认原生 subagent 模式"));

  const autopilotStart = read("skills/auto-iterate-coding/examples/autopilot-start.md");
  assert.ok(autopilotStart.startsWith("# Protocol-only / LLM-only Autopilot 启动示例"));
  assert.ok(autopilotStart.includes("默认自动模式不使用旧 Worker pipeline"));
  assert.ok(!autopilotStart.includes("fastcar-cli auto-iterate --check --json-progress"));
  assert.ok(!autopilotStart.includes("fastcar-cli auto-iterate --run --autopilot"));
});

test("AGENTS.md 声明主 Agent 与 Coder 硬边界", () => {
  for (const file of ["AGENTS.md", "skills/AGENTS.md"]) {
    const agents = read(file);
    assert.ok(agents.includes("Subagent 驱动迁移公告"), file);
    assert.ok(agents.includes("主 Agent / Subagent 硬边界"), file);
    assert.ok(agents.includes("主 Agent（裁判）"), file);
    assert.ok(agents.includes("Coder Subagent（运动员）"), file);
    assert.ok(agents.includes("need_decision"), file);
    assert.ok(agents.includes("--no-run"), file);
    assert.ok(agents.includes("主 Agent 不得亲自修改业务代码"), file);
    assert.ok(agents.includes("protocol-only / LLM-only 模式不使用主 Agent / Coder Subagent 角色边界"), file);
    assert.ok(agents.includes("不得运行任何命令"), file);
    assert.ok(agents.includes("不得写 state.json/state.md") || agents.includes("不得读写 `.agent-state/` 下非本轮 result.json 的文件"), file);
  }
});

test("自动迭代触发前提使用目标 Agent 通用措辞", () => {
  const agents = read("skills/AGENTS.md");
  const skill = read("skills/auto-iterate-coding/SKILL.md");
  const routing = read("skills/auto-iterate-coding/references/natural-language-routing.md");

  for (const [name, content] of [
    ["skills/AGENTS.md", agents],
    ["skills/auto-iterate-coding/SKILL.md", skill],
    ["skills/auto-iterate-coding/references/natural-language-routing.md", routing],
  ]) {
    assert.ok(content.includes("目标 Agent"), `${name} should use generic target Agent wording`);
    assert.ok(content.includes("--target <agent>"), `${name} should document generic skill install target`);
    assert.ok(content.includes("fastcar-cli skill targets"), `${name} should point to target discovery`);
    assert.ok(!content.includes("Codex 触发前提"), `${name} should not use Codex-only trigger wording`);
  }
});

test("主 Agent 裁判 runbook 不引入 native runtime adapter", () => {
  const architecture = read("docs/auto-iterate-current-architecture.md");
  const skill = read("skills/auto-iterate-coding/SKILL.md");
  const judgeRunbook = read("skills/auto-iterate-coding/references/judge-runbook.md");
  const sourceFiles = walkFiles(path.join(repoRoot, "src"), (filePath) => filePath.endsWith(".ts"));
  const source = sourceFiles.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");

  for (const [name, content] of [
    ["SKILL.md", skill],
    ["judge-runbook.md", judgeRunbook],
  ]) {
    assert.ok(content.includes("主 Agent（裁判）") && content.includes("coder"), `${name} should document judge/coder topology`);
  }
  assert.ok(architecture.includes("Agent(subagent_type=\"coder\")"));
  assert.ok(architecture.includes("validation.log"));

  assert.ok(skill.includes("每轮一个 coder"));
  assert.ok(skill.includes("references/judge-runbook.md"));
  assert.ok(judgeRunbook.includes("每轮只允许一个 coder 修改业务代码"));
  assert.ok(judgeRunbook.includes("validation.log"));
  assert.ok(!fs.existsSync(path.join(repoRoot, "docs", "auto-iterate-cli-driven.md")));
  assert.ok(!fs.existsSync(path.join(repoRoot, "skills", "auto-iterate-coding", "references", "sub-agent-concurrency.md")));
  assert.ok(!fs.existsSync(path.join(repoRoot, "skills", "auto-iterate-coding", "references", "native-sub-agent-strict-workflow.md")));

  for (const forbidden of [
    "--subagent",
    "--coder",
    "--orchestrator",
    "runNativeSubAgent",
    "spawnSubAgent",
    "waitSubAgent",
    "cancelSubAgent",
  ]) {
    assert.ok(!source.includes(forbidden), `src should not introduce native sub-agent runtime token: ${forbidden}`);
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

test("pipeline 验证 runner 使用确定性 Node spawn 而不是 shell 字符串解释", () => {
  const runner = read("src/pipeline/pipelineValidationRunner.ts");
  const validationCommands = read("src/pipeline/validationCommands.ts");
  const architecture = read("docs/auto-iterate-current-architecture.md");
  const skill = read("skills/auto-iterate-coding/SKILL.md");

  assert.ok(runner.includes("shell: false"));
  assert.ok(!runner.includes("shell: true"));
  assert.ok(runner.includes("deterministic_node_spawn"));
  assert.ok(validationCommands.includes("normalizeValidationCommand"));
  assert.ok(architecture.includes("Node 确定性 runner"));
  assert.ok(skill.includes("验证命令不得经 shell 字符串解释"));
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
  const mergeState = read("test/pipeline-merge-state.test.js");
  const iterationPrompt = read("test/pipeline-iteration-prompt.test.js");
  const focusLoop = read("test/pipeline-focus-loop.test.js");
  const resultSchema = read("test/pipeline-result-schema.test.js");
  const validation = read("test/pipeline-validation.test.js");
  const packageJson = read("package.json");

  assert.ok(focusLoop.includes("../dist/pipeline/pickFocus"));
  assert.ok(focusLoop.includes("../dist/pipeline/shouldStop"));
  assert.ok(resultSchema.includes("../dist/pipeline/resultSchema"));
  assert.ok(validation.includes("../dist/pipeline/pipelineValidationRunner"));
  assert.ok(mergeState.includes("../dist/pipeline/mergeState"));
  assert.ok(iterationPrompt.includes("../dist/pipeline/workerCapabilityPolicy"));
  assert.ok(!mergeState.includes("../dist/pipeline/runPipeline"));
  assert.ok(!mergeState.includes("../dist/pipeline/pipelineIsolateWorktree"));
  assert.ok(!mergeState.includes("loopPolicy 集中解析 once/plan/autopilot/maxSteps 语义"));
  assert.ok(!mergeState.includes("pickFocus 支持 fix/harden/optimize 和 mode-specific focus"));
  assert.ok(!mergeState.includes("normalizeRelativePath 统一过滤非法路径"));
  assert.ok(!mergeState.includes("runValidationCommands 依次执行全部命令并在失败时停止"));
  assert.ok(packageJson.includes("node test/pipeline-focus-loop.test.js"));
  assert.ok(packageJson.includes("node test/pipeline-result-schema.test.js"));
  assert.ok(packageJson.includes("node test/pipeline-validation.test.js"));
  assert.ok(packageJson.includes("node test/pipeline-pick-focus.test.js"));
  assert.ok(packageJson.includes("node test/pipeline-merge-state.test.js"));
  assert.ok(packageJson.includes("node test/pipeline-delivery-gates.test.js"));
  assert.ok(packageJson.includes("node test/pipeline-watchdog.test.js"));
  assert.ok(packageJson.includes("node test/pipeline-iteration-prompt.test.js"));
  assert.ok(packageJson.includes("node test/pipeline-progress.test.js"));
});

test("PipelineStateLike 不使用顶层泛索引签名", () => {
  const types = read("src/pipeline/types/models.ts");
  const start = types.indexOf("export interface PipelineStateLike {");
  const end = types.indexOf("\nexport interface PickFocusStateLike", start);
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
