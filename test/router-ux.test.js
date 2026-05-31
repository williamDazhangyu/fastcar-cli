const assert = require("assert");
const {
  buildFallbackArgs,
  buildResumeFromList,
  buildRouterPlan,
  containsForbiddenManualInstruction,
  formatCommand,
  handleNeedDecision,
  parseNdjson,
  summarizeProgress,
} = require("../dist/pipeline/routerUx");
const { FLAG_REGISTRY, isFlagAtLeast, validateRoutableCommand } = require("../dist/pipeline/flags");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("UX 用例 1：自然语言实现文档时 Router 先 check 再 run autopilot", () => {
  const plan = buildRouterPlan("把 docs/demo-prd.md 里的需求都实现了，遇测试失败就一直修", {
    event: "env_check",
    workers_available: [{ id: "codex", usable: true }],
  }, {
    session: "demo-prd-auto",
    validateCmd: "npm test",
  });
  assert.strictEqual(plan.mode, "run");
  assert.strictEqual(plan.requiresUserShell, false);
  assert.deepStrictEqual(plan.commands[0], ["fastcar-cli", "auto-iterate", "--check", "--json-progress"]);
  const run = formatCommand(plan.commands[1]);
  assert.ok(run.includes("--run"));
  assert.ok(run.includes("--autopilot"));
  assert.ok(run.includes("--json-progress"));
  assert.ok(!run.includes("--yes"));
  assert.ok(!run.includes("--no-run"));
  assert.ok(run.includes("--from docs/demo-prd.md"));
  assert.ok(run.includes("--validate-cmd \"npm test\""));
  assert.strictEqual(plan.routeValidation.ok, true);
});

test("UX 用例 1：Router 可把 NDJSON 事件转成中文进度", () => {
  const events = parseNdjson([
    JSON.stringify({ event: "session_started", session: "s", mode: "strict", agent: "codex" }),
    JSON.stringify({ event: "iteration_start", iter: 1, focus: { summary: "实现 REQ-001" } }),
    JSON.stringify({ event: "validation_done", iter: 1, status: "passed", command: "npm test" }),
  ].join("\n"));
  const summary = events.map(summarizeProgress).filter(Boolean).join("\n");
  assert.ok(summary.includes("已启动 strict 模式"));
  assert.ok(summary.includes("第 1 轮开始"));
  assert.ok(summary.includes("验证 passed"));
});

test("UX 用例 2：need_decision exit 42 后 Router 自动构造 resume answer", () => {
  const action = handleNeedDecision(42, [{
    event: "need_decision",
    session: "prd-auto",
    question: "使用 PostgreSQL 还是 MongoDB？",
    options: [{ id: "postgres", label: "PostgreSQL" }],
  }], "postgres");
  assert.strictEqual(action.question, "使用 PostgreSQL 还是 MongoDB？");
  assert.deepStrictEqual(action.command, [
    "fastcar-cli",
    "auto-iterate",
    "--resume",
    "prd-auto",
    "--run",
    "--autopilot",
    "--answer",
    "postgres",
    "--json-progress",
  ]);
});

test("UX 用例 3：中断恢复从 list/current 自动选择 session", () => {
  const command = buildResumeFromList({
    event: "session_list",
    sessions: [
      { session: "old-task", current: false },
      { session: "demo-prd-auto", current: true },
    ],
  });
  assert.deepStrictEqual(command, [
    "fastcar-cli",
    "auto-iterate",
    "--resume",
    "demo-prd-auto",
    "--run",
    "--autopilot",
    "--json-progress",
  ]);
});

test("UX 用例 4：无 Worker 环境时 Router 明示 fallback 且不要求用户运行命令", () => {
  const plan = buildRouterPlan("帮我开一个自动迭代任务", {
    event: "env_check",
    workers_available: [],
    issues: ["no_worker_cli_found"],
  }, {
    session: "fallback-task",
  });
  assert.strictEqual(plan.mode, "fallback");
  assert.strictEqual(plan.requiresUserShell, false);
  assert.ok(plan.userMessage.includes("本机未安装 Worker CLI"));
  assert.deepStrictEqual(plan.commands[0], ["fastcar-cli", "auto-iterate", "--check", "--json-progress"]);
  assert.ok(formatCommand(plan.commands[1]).includes("--yes"));
  assert.ok(formatCommand(plan.commands[1]).includes("--no-run"));
  assert.strictEqual(plan.routeValidation.ok, true);
});

test("UX few-shot：verify 请求路由为单轮只读验收", () => {
  const plan = buildRouterPlan("帮我验收 docs/prd.md 是否都实现了，不要修改代码，session 叫 prd-check", {
    event: "env_check",
    workers_available: [{ id: "codex", usable: true }],
  });
  const command = formatCommand(plan.commands[1]);

  assert.strictEqual(plan.mode, "run");
  assert.ok(command.includes("--run"));
  assert.ok(command.includes("--once"));
  assert.ok(command.includes("--verify"));
  assert.ok(!command.includes("--autopilot"));
  assert.ok(command.includes("--from docs/prd.md"));
  assert.ok(command.includes("--session prd-check"));
  assert.strictEqual(plan.routeValidation.ok, true);
});

test("UX few-shot：plan-only 请求路由为单轮规划", () => {
  const plan = buildRouterPlan("只帮我规划订单模块重构，不要写代码，session 叫 order-plan", {
    event: "env_check",
    workers_available: [{ id: "codex", usable: true }],
  });
  const command = formatCommand(plan.commands[1]);

  assert.strictEqual(plan.mode, "run");
  assert.ok(command.includes("--run"));
  assert.ok(command.includes("--once"));
  assert.ok(command.includes("--plan-only"));
  assert.ok(!command.includes("--autopilot"));
  assert.ok(command.includes("--session order-plan"));
  assert.strictEqual(plan.routeValidation.ok, true);
});

test("UX few-shot：协议优先请求强制 no-run fallback", () => {
  const plan = buildRouterPlan("按协议执行修复登录失败，但不要走固定 CLI 流水线，session 叫 protocol-only-fix", {
    event: "env_check",
    workers_available: [{ id: "codex", usable: true }],
  });
  const command = formatCommand(plan.commands[1]);

  assert.strictEqual(plan.mode, "fallback");
  assert.ok(plan.userMessage.includes("手动协议模式"));
  assert.ok(command.includes("--quick"));
  assert.ok(command.includes("--no-run"));
  assert.ok(command.includes("--session protocol-only-fix"));
  assert.ok(!command.includes("--run"));
  assert.strictEqual(plan.routeValidation.ok, true);
});

test("UX few-shot：fallback 根据用户意图保留 verify 模式", () => {
  const args = buildFallbackArgs("检查 docs/login.md 是否满足需求，不能改代码，session 叫 login-check");

  assert.deepStrictEqual(args, [
    "auto-iterate",
    "--verify",
    "--from",
    "docs/login.md",
    "--session",
    "login-check",
    "--yes",
    "--no-run",
  ]);
});

test("UX flag 注册表锁定 Router 只能默认生成 routable flag", () => {
  assert.strictEqual(FLAG_REGISTRY["--autopilot"].stage, "routable");
  assert.strictEqual(FLAG_REGISTRY["--autopilot"].stability, "not_stable");
  assert.strictEqual(isFlagAtLeast("--max-steps", "routable"), false);
  assert.strictEqual(isFlagAtLeast("--scope", "routable"), true);

  const blocked = validateRoutableCommand(["fastcar-cli", "auto-iterate", "--run", "--max-steps", "3"]);
  assert.strictEqual(blocked.ok, false);
  assert.ok(blocked.issues.some((issue) => issue.flag === "--max-steps"));
});

test("UX 用例 5：Router 输出不得包含手动复制或手动运行句式", () => {
  assert.strictEqual(containsForbiddenManualInstruction("我会自动运行检查并转述进度。"), false);
  assert.strictEqual(containsForbiddenManualInstruction("请复制下面 prompt 贴到 codex 里"), true);
  assert.strictEqual(containsForbiddenManualInstruction("请手动运行 npm test"), true);
  assert.strictEqual(containsForbiddenManualInstruction("请你然后运行 fastcar-cli auto-iterate --run"), true);
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
