const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "../../..");
const cliPath = path.join(repoRoot, "bin", "cli.js");

const REQUIRED_STATE_SECTIONS = [
  "## At-a-Glance / 人类摘要",
  "## Task / 任务",
  "## Session / 会话",
  "## Mode / 模式",
  "## Agent Capability Summary",
  "## Sub-Agent Dispatch / 子 Agent 调度",
  "## Budgets / 预算",
  "## Recovery / Reconcile / 恢复一致性检查",
  "## Current State / 当前状态",
  "## Phase Gate / 阶段门禁",
  "## Implementation Contract / 实现契约",
  "## Baseline / 修改前基线",
  "## Iteration Policy / 迭代策略",
  "## Task Profile / 任务画像",
  "## Decision Request / 用户确认请求",
  "## Watchdog / 看门狗",
  "## Requirement Coverage Matrix / 需求覆盖矩阵",
  "## Definition of Done / 完成定义",
  "## Decisions / 已确认决策",
  "## Traceability / 可追溯记录",
  "## Delivery Docs / 交付文档",
  "## Hypotheses / 假设",
  "## Validation / 验证",
  "## Post-Change Validation / 修改后验证",
  "## Delta Assessment / 差异评估",
  "## Diff Budget / 变更预算审计",
  "## Temporary Artifacts / Cleanup / 临时产物清理",
  "## Style Consolidation / 技巧风格整理",
  "## Context Reset Review Gate / 上下文清空复核门禁",
  "## Delivery Evidence / 交付证据",
  "## Skill Capture / 技能沉淀",
  "## Post-Agent Validation Gate / Agent 后置校验门禁",
  "## Context Handoff Summary / 上下文交接摘要",
  "## Resume Prompt / 恢复提示",
];

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function makeProject() {
  const projectDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "fastcar-auto-iterate-doc-"),
  );
  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify({ name: "fixture-project", private: true }, null, 2),
    "utf8",
  );
  return projectDir;
}

function makeGitProject() {
  const projectDir = makeProject();
  fs.writeFileSync(path.join(projectDir, "README.md"), "# fixture\n", "utf8");
  let result = spawnSync("git", ["init"], {
    cwd: projectDir,
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 0, `git init failed\n${result.stderr}`);
  result = spawnSync("git", ["add", "."], {
    cwd: projectDir,
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 0, `git add failed\n${result.stderr}`);
  result = spawnSync(
    "git",
    [
      "-c",
      "user.name=FastCar Test",
      "-c",
      "user.email=fastcar-test@example.invalid",
      "commit",
      "-m",
      "fixture",
    ],
    {
      cwd: projectDir,
      encoding: "utf8",
    },
  );
  assert.strictEqual(result.status, 0, `git commit failed\n${result.stderr}`);
  return projectDir;
}

function runAutoIterate(cwd, args, env = {}) {
  const result = spawnSync(process.execPath, [cliPath, "auto-iterate", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      FORCE_COLOR: "0",
      ...env,
    },
  });

  assert.strictEqual(
    result.status,
    0,
    `CLI exited with ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  );

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runAutoIterateRaw(cwd, args, env = {}) {
  return spawnSync(process.execPath, [cliPath, "auto-iterate", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      FORCE_COLOR: "0",
      ...env,
    },
  });
}

function sessionPaths(projectDir, session) {
  const stateRoot = path.join(projectDir, ".agent-state");
  const sessionDir = path.join(stateRoot, "auto-iterate", session);
  return {
    current: path.join(stateRoot, "auto-iterate-current.json"),
    sessionDir,
    stateJson: path.join(sessionDir, "state.json"),
    state: path.join(sessionDir, "state.md"),
    prompt: path.join(sessionDir, "start-prompt.md"),
  };
}

function readSession(projectDir, session) {
  const paths = sessionPaths(projectDir, session);
  return {
    paths,
    stateJson: JSON.parse(fs.readFileSync(paths.stateJson, "utf8")),
    state: fs.readFileSync(paths.state, "utf8"),
    prompt: fs.readFileSync(paths.prompt, "utf8"),
    current: JSON.parse(fs.readFileSync(paths.current, "utf8")),
  };
}

function assertIncludes(content, expected, label) {
  assert.ok(
    content.includes(expected),
    `${label || "content"} should include ${JSON.stringify(expected)}`,
  );
}

function assertNotIncludes(content, unexpected, label) {
  assert.ok(
    !content.includes(unexpected),
    `${label || "content"} should not include ${JSON.stringify(unexpected)}`,
  );
}

function assertNotExists(filePath) {
  assert.ok(!fs.existsSync(filePath), `${filePath} should not exist`);
}

function markSessionReadyForSkillCapture(stateJson) {
  stateJson.requirements = [
    {
      id: "REQ-001",
      summary: "FastCar Koa Controller 必须避免敏感信息沉淀",
      type: "验证",
      status: "passed",
      relatedFiles: ["src/auto-iterate.ts"],
      evidence: "使用最小 fixture 验证 capture-skills 会脱敏 token=password 等敏感字段",
      blockedReason: "无",
      nextStep: "无",
    },
  ];
  stateJson.watchdog.deliveryVerifiability = "verifiable";
  stateJson.validation.finalVerifiability = "verifiable";
  stateJson.validation.commands = [
    {
      command: "npm test",
      result: "passed",
      summary: "capture-skills regression passed",
    },
  ];
  stateJson.postChange.status = "passed";
  stateJson.postChange.command = "npm test";
  stateJson.postChange.result = "0";
  stateJson.postChange.reason = "capture-skills regression passed";
  stateJson.postChange.regressionDetected = false;
  stateJson.postChange.perCommand = [
    {
      command: "npm test",
      status: "passed",
      result: "0",
      exitCode: 0,
      signal: "none",
      error: "none",
      durationMs: 1,
      stdoutTail: "capture-skills regression passed",
      stderrTail: "",
    },
  ];
  stateJson.cleanup.status = "completed";
  stateJson.styleConsolidation.status = "completed";
  stateJson.styleConsolidation.localSkillsReviewed = [".agents/skills/index.md"];
  stateJson.styleConsolidation.globalSkillsReviewed = ["typescript-coding-style"];
  stateJson.styleConsolidation.appliedRules = ["按本地和全局 skills 整理本次修改范围内代码"];
  stateJson.styleConsolidation.changedFiles = ["src/auto-iterate.ts"];
  stateJson.styleConsolidation.summary = "已按技巧风格整理测试 fixture";
  stateJson.styleConsolidation.verificationSummary = "真实验证通过: npm test";
  stateJson.styleConsolidation.lastRunSummary = "已执行技巧风格整理";
  stateJson.contextResetReview.status = "passed";
  stateJson.contextResetReview.reviewCyclesUsed = 1;
  stateJson.contextResetReview.standardsFindings = [];
  stateJson.contextResetReview.specFindings = [];
  stateJson.contextResetReview.decision = "pass";
  stateJson.contextResetReview.reopenedRequirements = [];
  stateJson.contextResetReview.lastRunSummary = "已清空上下文并完成 Standards / Spec 两轴复核，未发现阻塞问题";
  stateJson.deliveryEvidence.status = "ready";
  stateJson.deliveryEvidence.validationSummary = "真实验证通过: npm test";
  stateJson.deliveryEvidence.risks = "有限风险：仅测试 fixture";
  stateJson.deliveryEvidence.userConfirmation = "无需额外确认：测试 fixture";
  stateJson.postAgentValidationGate.lastResult = "passed";
  stateJson.postAgentValidationGate.nextAction = "deliver";
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function extractMarkdownLinks(content) {
  const links = [];
  const pattern = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function extractStateSchemaSections(schemaContent) {
  return schemaContent
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|/);
      return match ? match[1].replace(/^##\s+/, "") : null;
    })
    .filter(Boolean);
}

function headingMatches(content, schemaHeading) {
  const headings = content
    .split(/\r?\n/)
    .filter((line) => line.startsWith("## "))
    .map((line) => line.trim());
  return headings.some((heading) => {
    return heading === `## ${schemaHeading}` || heading.startsWith(`## ${schemaHeading} /`);
  });
}

test("quick 模式生成 session-only 状态、启动提示和 current 指针", () => {
  const projectDir = makeProject();
  const session = "login-bugfix";

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "修复登录失败",
    "--session",
    session,
    "--autopilot-max-iterations",
    "5",
    "--yes",
  ]);

  const { paths, state, prompt, current } = readSession(projectDir, session);

  assert.ok(fs.existsSync(paths.state), "state.md should be generated");
  assert.ok(fs.existsSync(paths.prompt), "start-prompt.md should be generated");
  assertNotExists(path.join(projectDir, ".agent-state", "auto-iterate-coding.md"));
  assertNotExists(
    path.join(projectDir, ".agent-state", "auto-iterate-start-prompt.md"),
  );

  assert.strictEqual(current.session, session);
  assert.strictEqual(current.mode, "quick");
  assert.strictEqual(current.status, "in_progress");
  assert.strictEqual(
    current.stateFile,
    ".agent-state/auto-iterate/login-bugfix/state.md",
  );
  assert.strictEqual(
    current.promptFile,
    ".agent-state/auto-iterate/login-bugfix/start-prompt.md",
  );

  for (const section of REQUIRED_STATE_SECTIONS) {
    assertIncludes(state, section, "state.md");
  }

  assertIncludes(state, "模式：quick /", "state.md");
  assertIncludes(state, "Autopilot：true", "state.md");
  assertIncludes(state, "激活状态：active", "state.md");
  assertIncludes(state, "auto-iterate session 持久化流程", "state.md");
  assertIncludes(state, "autopilot_max_iterations：5", "state.md");
  assertIncludes(state, "remaining_implementation_iterations：5", "state.md");
  assertIncludes(state, "REQ-BOOTSTRAP", "state.md");
  assertIncludes(state, "required_action：continue", "state.md");
  assertIncludes(prompt, "请先读取 auto-iterate-coding/SKILL.md", "prompt");
  assertIncludes(prompt, "Auto-iterate 激活声明", "prompt");
  assertIncludes(prompt, "状态持久化标记为 degraded / not_available", "prompt");
  assertIncludes(
    prompt,
    ".agent-state/auto-iterate/login-bugfix/state.md",
    "prompt",
  );
});

test("quick 模式从 Goal 前缀位置参数推断用户目标", () => {
  const projectDir = makeProject();
  const goal = "按 docs/impl/agent-generation-contract-P0-spec.md 有界自动迭代实现 Agent 生图 P0";

  runAutoIterate(projectDir, [
    "--quick",
    `Goal：${goal}`,
    "--session",
    "goal-prefix",
    "--yes",
  ]);

  const { state, stateJson, prompt } = readSession(projectDir, "goal-prefix");

  assert.strictEqual(stateJson.task.goal, goal);
  assertIncludes(state, `用户目标：\n${goal}`, "state.md");
  assertIncludes(prompt, `用户目标：\n${goal}`, "start-prompt.md");
  assertNotIncludes(state, "用户目标：\n未指定目标", "state.md");
  assertNotIncludes(prompt, "用户目标：\n未指定目标", "start-prompt.md");
});

test("verify 模式保持只读约束并导入 PRD 原文", () => {
  const projectDir = makeProject();
  fs.mkdirSync(path.join(projectDir, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "docs", "prd.md"),
    [
      "# 登录验收 PRD",
      "",
      "- 成功登录后返回 token。",
      "- 密码错误时返回明确错误。",
    ].join("\n"),
    "utf8",
  );

  runAutoIterate(projectDir, [
    "--verify",
    "--from",
    "docs/prd.md",
    "--session",
    "prd-check",
    "--max-iterations",
    "7",
    "--yes",
  ]);

  const { state, prompt, current } = readSession(projectDir, "prd-check");

  assert.strictEqual(current.session, "prd-check");
  assert.strictEqual(current.mode, "verify");
  assertIncludes(state, "模式：verify /", "state.md");
  assertIncludes(state, "Autopilot：false", "state.md");
  assertIncludes(state, "允许修改文件：false", "state.md");
  assertIncludes(state, "max_iterations：7", "state.md");
  assertIncludes(state, "来源文件：docs/prd.md", "state.md");
  assertIncludes(state, "成功登录后返回 token", "state.md");
  assertIncludes(prompt, "来源文件：docs/prd.md", "prompt");
  assertIncludes(prompt, "不修改项目文件", "prompt");
});

test("strict 模式从长清单导入并保持 Autopilot 预算", () => {
  const projectDir = makeProject();
  fs.mkdirSync(path.join(projectDir, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "docs", "ai-checklist.md"),
    [
      "# 订单模块 AI 实现清单",
      "",
      "- 支持创建订单。",
      "- 支持取消订单。",
      "- 保持现有 CLI 行为兼容。",
    ].join("\n"),
    "utf8",
  );

  runAutoIterate(projectDir, [
    "--strict",
    "--from",
    "docs/ai-checklist.md",
    "--session",
    "order-strict",
    "--max-iterations",
    "30",
    "--autopilot-max-iterations",
    "6",
    "--yes",
  ]);

  const { state, prompt, current } = readSession(projectDir, "order-strict");

  assert.strictEqual(current.session, "order-strict");
  assert.strictEqual(current.mode, "strict");
  assertIncludes(state, "模式：strict /", "state.md");
  assertIncludes(state, "Autopilot：true", "state.md");
  assertIncludes(state, "max_iterations：30", "state.md");
  assertIncludes(state, "autopilot_max_iterations：6", "state.md");
  assertIncludes(state, "remaining_implementation_iterations：6", "state.md");
  assertIncludes(state, "来源文件：docs/ai-checklist.md", "state.md");
  assertIncludes(state, "支持创建订单", "state.md");
  assertIncludes(prompt, "来源文件：docs/ai-checklist.md", "prompt");
});

test("diagnose 模式要求先建立 feedback loop 并维护假设", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--diagnose",
    "--goal",
    "诊断 npm test 失败",
    "--session",
    "test-diagnose",
    "--autopilot-max-iterations",
    "4",
    "--yes",
  ]);

  const { state, prompt, current } = readSession(projectDir, "test-diagnose");

  assert.strictEqual(current.session, "test-diagnose");
  assert.strictEqual(current.mode, "diagnose");
  assertIncludes(state, "模式：diagnose /", "state.md");
  assertIncludes(state, "Autopilot：true", "state.md");
  assertIncludes(state, "autopilot_max_iterations：4", "state.md");
  assertIncludes(state, "remaining_implementation_iterations：4", "state.md");
  assertIncludes(state, "反馈闭环：未建立", "state.md");
  assertIncludes(state, "排序候选假设：未生成", "state.md");
  assertIncludes(prompt, "先建立能复现目标问题的 feedback loop", "prompt");
});

test("plan 模式生成不可修改项目文件的启动状态", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--plan-only",
    "--goal",
    "规划订单模块重构",
    "--session",
    "order-plan",
    "--yes",
  ]);

  const { state, current } = readSession(projectDir, "order-plan");

  assert.strictEqual(current.session, "order-plan");
  assert.strictEqual(current.mode, "plan");
  assertIncludes(state, "模式：plan /", "state.md");
  assertIncludes(state, "Autopilot：false", "state.md");
  assertIncludes(state, "允许修改文件：false", "state.md");
  assertIncludes(state, "不写代码", "state.md");
  assertIncludes(state, "不修改项目文件", "state.md");
});

test("prototype 模式标记一次性原型状态和清理门禁", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--prototype",
    "--goal",
    "验证订单状态机",
    "--session",
    "order-prototype",
    "--yes",
  ]);

  const { state, current } = readSession(projectDir, "order-prototype");

  assert.strictEqual(current.session, "order-prototype");
  assert.strictEqual(current.mode, "prototype");
  assertIncludes(state, "模式：prototype /", "state.md");
  assertIncludes(state, "原型状态：proposed", "state.md");
  assertIncludes(state, "原型文件或路由：待创建并明确标记", "state.md");
  assertIncludes(state, "清理状态：pending", "state.md");
});

test("optimize 模式初始化独立优化预算", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--optimize",
    "--goal",
    "优化查询性能",
    "--session",
    "query-optimize",
    "--max-iterations",
    "7",
    "--yes",
  ]);

  const { state, stateJson, current } = readSession(projectDir, "query-optimize");

  assert.strictEqual(current.session, "query-optimize");
  assert.strictEqual(current.mode, "optimize");
  assert.strictEqual(stateJson.budgets.remainingImplementationIterations, 7);
  assert.strictEqual(stateJson.budgets.remainingOptimizationIterations, 7);
  assertIncludes(state, "模式：optimize /", "state.md");
  assertIncludes(state, "optimization 0 / 7", "state.md");
  assertIncludes(state, "remaining_optimization_iterations：7", "state.md");
});

test("重复 session 在非交互模式不会覆盖已有状态", () => {
  const projectDir = makeProject();
  const session = "duplicate-guard";

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "第一次目标",
    "--session",
    session,
    "--yes",
  ]);
  const before = readSession(projectDir, session).state;

  const output = runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "第二次目标",
    "--session",
    session,
    "--yes",
  ]);
  const after = readSession(projectDir, session).state;

  assert.strictEqual(after, before);
  assertIncludes(output.stdout, "session 已存在", "stdout");
  assert.ok(!after.includes("第二次目标"), "existing state should not be overwritten");
});

test("switch 与 resume 只更新 current 指针，不重新生成任务内容", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "修复登录失败",
    "--session",
    "login-bugfix",
    "--yes",
  ]);
  runAutoIterate(projectDir, [
    "--plan-only",
    "--goal",
    "规划支付重构",
    "--session",
    "payment-plan",
    "--yes",
  ]);

  const loginBefore = readSession(projectDir, "login-bugfix").state;

  const switchOutput = runAutoIterate(projectDir, ["--switch", "login-bugfix"]);
  let current = JSON.parse(
    fs.readFileSync(
      path.join(projectDir, ".agent-state", "auto-iterate-current.json"),
      "utf8",
    ),
  );
  assert.strictEqual(current.session, "login-bugfix");
  assertIncludes(switchOutput.stdout, "login-bugfix", "switch stdout");
  assert.strictEqual(readSession(projectDir, "login-bugfix").state, loginBefore);

  const resumeOutput = runAutoIterate(projectDir, ["--resume", "payment-plan"]);
  current = JSON.parse(
    fs.readFileSync(
      path.join(projectDir, ".agent-state", "auto-iterate-current.json"),
      "utf8",
    ),
  );
  assert.strictEqual(current.session, "payment-plan");
  assertIncludes(resumeOutput.stdout, "payment-plan", "resume stdout");
  assertIncludes(
    resumeOutput.stdout,
    ".agent-state/auto-iterate/payment-plan/start-prompt.md",
    "resume stdout",
  );
});

test("list 输出已有 session 并标记当前 session", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "修复登录失败",
    "--session",
    "login-bugfix",
    "--yes",
  ]);
  runAutoIterate(projectDir, [
    "--verify",
    "--goal",
    "验收登录 PRD",
    "--session",
    "login-verify",
    "--yes",
  ]);

  const output = runAutoIterate(projectDir, ["--list"]);

  assertIncludes(output.stdout, "login-bugfix", "list stdout");
  assertIncludes(output.stdout, "login-verify", "list stdout");
  assertIncludes(
    output.stdout,
    ".agent-state/auto-iterate/login-verify/state.md",
    "list stdout",
  );
});

test("state-schema、state-template 与 CLI 初始 state 的必需章节保持一致", () => {
  const projectDir = makeProject();
  const schema = readRepoFile(
    "skills/auto-iterate-coding/references/state-schema.md",
  );
  const template = readRepoFile(
    "skills/auto-iterate-coding/examples/state-template.md",
  );

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证状态 schema",
    "--session",
    "schema-check",
    "--yes",
  ]);
  const { state } = readSession(projectDir, "schema-check");
  const requiredSections = extractStateSchemaSections(schema);

  assert.strictEqual(requiredSections.length, 35);
  for (const section of requiredSections) {
    assert.ok(headingMatches(template, section), `state-template missing ${section}`);
    assert.ok(headingMatches(state, section), `generated state missing ${section}`);
  }

  assertIncludes(schema, "delivery_verifiability = not_verifiable / unknown", "schema");
  assertIncludes(schema, "taskProfile", "schema");
  assertIncludes(schema, "decisionRequest", "schema");
  assertIncludes(schema, "postChange", "schema");
  assertIncludes(schema, "deltaAssessment", "schema");
  assertIncludes(schema, "diffBudget", "schema");
  assertIncludes(schema, "styleConsolidation", "schema");
  assertIncludes(schema, "contextResetReview", "schema");
  assertIncludes(schema, "state.json.notes[]", "schema");
  assertIncludes(schema, "mode.loopShape", "schema");
  assertIncludes(template, "partially_verifiable", "state-template");
  assertIncludes(template, "## Notes / 备注", "state-template");
  assertIncludes(template, "Context Reset Review Gate", "state-template");
  assertIncludes(state, "交付可验证性：unknown", "state.md");
});

test("英文 goal 生成英文语言元信息、启动提示和运行投影", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "fix login bug and keep API compatible",
    "--session",
    "english-language",
    "--yes",
  ]);

  const { state, stateJson, prompt } = readSession(projectDir, "english-language");
  assert.strictEqual(stateJson.language.code, "en");
  assertIncludes(state, "language：en", "state.md");
  assertIncludes(state, "status_display_rule：机器枚举保持英文", "state.md");
  assertIncludes(prompt, "Language: en", "start-prompt.md");
  assertIncludes(prompt, "write human-readable output, state notes, summaries, Skill Capture content, and delivery summaries in English", "start-prompt.md");
  assertIncludes(prompt, "User goal:\nfix login bug and keep API compatible", "start-prompt.md");

  const result = runAutoIterateRaw(projectDir, [
    "--resume",
    "english-language",
  ]);
  // Resume with validation warnings should succeed (exit 0) or fail if validation fails.
  assert.ok(result.status === 0 || result.status === undefined, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.ok(
    !fs.existsSync(path.join(projectDir, ".agent-state", "auto-iterate", "english-language", "iterations", "1", "prompt.md")),
    "deprecated --run must not create iteration prompt",
  );
});

test("中文 goal 生成中文语言元信息并保留中文 prompt", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "修复登录失败并保持接口兼容",
    "--session",
    "chinese-language",
    "--yes",
  ]);

  const { state, stateJson, prompt } = readSession(projectDir, "chinese-language");
  assert.strictEqual(stateJson.language.code, "zh");
  assertIncludes(state, "语言：zh", "state.md");
  assertIncludes(prompt, "用户目标：\n修复登录失败并保持接口兼容", "start-prompt.md");
  assertIncludes(prompt, "请始终使用与用户当前提示一致的语言输出", "start-prompt.md");
  assertIncludes(prompt, "最终对话回复、本次任务交付总结、阶段验收摘要", "start-prompt.md");
  assertIncludes(prompt, "必须使用中文", "start-prompt.md");
  assertIncludes(state, "最终回复语言规则", "state.md");
  assertIncludes(state, "中文 session 的最终对话回复", "state.md");
});

test("auto-iterate session 生成机器权威 state.json 和 Markdown 视图", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 state json",
    "--session",
    "state-json-check",
    "--yes",
  ]);

  const { state, stateJson, current, prompt } = readSession(projectDir, "state-json-check");
  assert.strictEqual(stateJson.schemaVersion, 1);
  assert.strictEqual(stateJson.session.session, "state-json-check");
  assert.strictEqual(stateJson.phaseGate.currentPhase, "requirement");
  assert.strictEqual(stateJson.phaseGate.canProceed, false);
  assert.ok(stateJson.phaseGate.gates.some((gate) => gate.phase === "delivery"));
  assert.strictEqual(stateJson.implementationContract.status, "pending");
  assert.strictEqual(stateJson.baseline.status, "pending");
  assert.strictEqual(stateJson.baseline.allowsCoding, false);
  assert.strictEqual(stateJson.iterationPolicy.maxGoalsPerIteration, 1);
  assert.strictEqual(stateJson.taskProfile.complexity, "medium");
  assert.strictEqual(stateJson.decisionRequest.status, "not_needed");
  assert.strictEqual(stateJson.mode.runtimeAutopilot, true);
  assert.strictEqual(stateJson.mode.loopShape, "autopilot");
  assert.deepStrictEqual(stateJson.notes, []);
  assert.deepStrictEqual(stateJson.diagnose.hypotheses, []);
  assert.strictEqual(stateJson.postChange.status, "not_run");
  assert.strictEqual(stateJson.deltaAssessment.status, "pending");
  assert.strictEqual(stateJson.diffBudget.status, "not_checked");
  assert.strictEqual(stateJson.deliveryEvidence.status, "pending");
  assert.strictEqual(stateJson.styleConsolidation.status, "pending");
  assertIncludes(stateJson.styleConsolidation.trigger, "功能实现并通过验证后", "styleConsolidation.trigger");
  assert.strictEqual(stateJson.contextResetReview.status, "pending");
  assertIncludes(stateJson.contextResetReview.trigger, "所有关键 REQ passed 后", "contextResetReview.trigger");
  assert.strictEqual(stateJson.contextResetReview.maxReviewCycles, 1);
  assert.strictEqual(stateJson.skillCapture.status, "pending");
  assert.strictEqual(stateJson.skillCapture.root, ".agents/skills");
  assert.strictEqual(stateJson.skillCapture.indexFile, ".agents/skills/index.md");
  assert.strictEqual(stateJson.postAgentValidationGate.enabled, true);
  assertIncludes(stateJson.postAgentValidationGate.command, "--finalize", "postAgentValidationGate.command");
  assertIncludes(stateJson.postAgentValidationGate.command, "--yes", "postAgentValidationGate.command");
  assert.strictEqual(
    stateJson.session.stateJsonFile,
    ".agent-state/auto-iterate/state-json-check/state.json",
  );
  assert.strictEqual(
    current.stateJsonFile,
    ".agent-state/auto-iterate/state-json-check/state.json",
  );
  assertIncludes(state, "GENERATED FILE, DO NOT EDIT", "state.md");
  assertIncludes(state, "## Phase Gate / 阶段门禁", "state.md");
  assertIncludes(state, "## Implementation Contract / 实现契约", "state.md");
  assertIncludes(state, "## Baseline / 修改前基线", "state.md");
  assertIncludes(state, "## Iteration Policy / 迭代策略", "state.md");
  assertIncludes(state, "## Task Profile / 任务画像", "state.md");
  assertIncludes(state, "## Decision Request / 用户确认请求", "state.md");
  assertIncludes(state, "## Notes / 备注", "state.md");
  assertIncludes(state, "runtime_autopilot：true", "state.md");
  assertIncludes(state, "loop_shape：autopilot", "state.md");
  assertIncludes(state, "## Post-Change Validation / 修改后验证", "state.md");
  assertIncludes(state, "## Delta Assessment / 差异评估", "state.md");
  assertIncludes(state, "## Diff Budget / 变更预算审计", "state.md");
  assertIncludes(state, "## Style Consolidation / 技巧风格整理", "state.md");
  assertIncludes(state, "local_skills_reviewed：无", "state.md");
  assertIncludes(state, "global_skills_reviewed：无", "state.md");
  assertIncludes(state, "## Context Reset Review Gate / 上下文清空复核门禁", "state.md");
  assertIncludes(state, "source_of_truth：state.json、原始需求、当前代码/diff、真实验证结果、项目规范和相关 skills", "state.md");
  assertIncludes(state, "## Delivery Evidence / 交付证据", "state.md");
  assertIncludes(state, "## Skill Capture / 技能沉淀", "state.md");
  assertIncludes(state, "root：.agents/skills", "state.md");
  assertIncludes(state, "index_file：.agents/skills/index.md", "state.md");
  assertIncludes(state, "## Post-Agent Validation Gate / Agent 后置校验门禁", "state.md");
  assertIncludes(state, "phase_order：requirement -> contract -> baseline -> coding -> validation -> cleanup -> delivery", "state.md");
  assertIncludes(state, "command：fastcar-cli auto-iterate --finalize state-json-check --yes", "state.md");
  assertIncludes(state, "机器权威状态为 .agent-state/auto-iterate/state-json-check/state.json", "state.md");
  assertIncludes(prompt, "Session 机器状态：.agent-state/auto-iterate/state-json-check/state.json", "start-prompt.md");
  assertIncludes(prompt, "Session 状态视图：.agent-state/auto-iterate/state-json-check/state.md", "start-prompt.md");
  assertIncludes(prompt, "先读取它作为本 session 的机器权威恢复状态", "start-prompt.md");
  assertIncludes(prompt, "再刷新 .agent-state/auto-iterate/state-json-check/state.md 生成视图", "start-prompt.md");
  assertIncludes(prompt, "Skill Capture / 技能沉淀", "start-prompt.md");
  assertIncludes(prompt, "Context Reset Review Gate", "start-prompt.md");
  assertIncludes(prompt, ".agents/skills/index.md", "start-prompt.md");
  assertNotIncludes(prompt, "Session 状态文件：.agent-state/auto-iterate/state-json-check/state.md", "start-prompt.md");
  assertNotIncludes(prompt, "优先更新 session 状态文件 .agent-state/auto-iterate/state-json-check/state.md", "start-prompt.md");
});

test("references INDEX 索引的文档真实存在并覆盖关键模式组合", () => {
  const index = readRepoFile("skills/auto-iterate-coding/references/index.md");
  const referencesDir = path.join(
    repoRoot,
    "skills",
    "auto-iterate-coding",
    "references",
  );
  const indexedFiles = Array.from(index.matchAll(/`([^`]+\.md)`/g)).map(
    (match) => match[1],
  ).filter((file) => !file.startsWith(".agents/"));

  assert.ok(indexedFiles.length >= 18, "INDEX should list all reference docs");
  for (const file of indexedFiles) {
    assert.ok(
      fs.existsSync(path.join(referencesDir, file)),
      `INDEX references missing file ${file}`,
    );
  }

  for (const mode of [
    "Quick",
    "严格实现 / Autopilot",
    "Strict",
    "Diagnose",
    "Verify-only",
    "Plan-only",
    "Prototype-only",
    "Optimization-only",
    "Native sub-agent",
  ]) {
    assertIncludes(index, mode, "references INDEX");
  }
  for (const scenario of [
    "写作、文档整理、PRD 评审、研究报告、方案设计、测试计划、Runbook、迁移计划、发布说明",
    "非代码任务的验证证据",
    "写作 / 文档生成 + Verify-only",
    "写作 / 文档生成 + Autopilot",
    "研究 / 调研 + Plan-only + Verify-only",
    "不得为了消耗轮次做无意义改写",
  ]) {
    assertIncludes(index, scenario, "references INDEX");
  }
  assertIncludes(index, "`--validate-state`", "INDEX.md");
  assertIncludes(index, "state 校验", "INDEX.md");
  assertIncludes(index, "state.schema.json", "INDEX.md");
  assertIncludes(index, "phase-gates.md", "INDEX.md");
  assertIncludes(index, "iteration-policy.md", "INDEX.md");
  assertIncludes(index, "final-delivery.md", "INDEX.md");
  assertIncludes(index, "State / sub-agent 校验", "INDEX.md");
  assertIncludes(index, "`natural-language-routing.md`、`state-schema.md`、`state.schema.json`", "INDEX.md");
});

test("phase-gates 以决策表表达检查项、强制等级和失败动作", () => {
  const gates = readRepoFile("skills/auto-iterate-coding/references/phase-gates.md");
  for (const phrase of [
    "检查项",
    "强制等级",
    "失败动作",
    "阻断原因格式",
    "delivery.blocked: open_requirements / unknown_verifiability / incomplete_evidence / strict_gate_failed",
    "`Hard / Escalation`",
    "每个阻断必须写入 `phaseGate.blockingReasons`",
  ]) {
    assertIncludes(gates, phrase, "phase-gates.md");
  }
});

test("独立 state.schema.json 覆盖关键门禁实体", () => {
  const schemaPath = path.join(
    repoRoot,
    "skills",
    "auto-iterate-coding",
    "references",
    "state.schema.json",
  );
  assert.ok(fs.existsSync(schemaPath), "state.schema.json should exist");

  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  for (const key of schema.required) {
    assert.ok(
      Object.hasOwn(schema.properties, key),
      `state.schema.json required key must define properties.${key}`,
    );
  }
  for (const key of [
    "currentState",
    "watchdog",
    "phaseGate",
    "implementationContract",
    "baseline",
    "iterationPolicy",
    "taskProfile",
    "decisionRequest",
    "requirements",
    "decisions",
    "notes",
    "diagnose",
    "validation",
    "postChange",
    "deltaAssessment",
    "diffBudget",
    "cleanup",
    "styleConsolidation",
    "contextResetReview",
    "deliveryEvidence",
    "postAgentValidationGate",
  ]) {
    assert.ok(schema.required.includes(key), `state.schema.json required missing ${key}`);
    assert.ok(schema.properties[key], `state.schema.json properties missing ${key}`);
  }
  assert.strictEqual(schema.properties.task.properties.successCriteria.minItems, 1);
  assert.ok(schema.properties.watchdog.properties.requiredAction.enum.includes("context_compress_and_review"));
  assert.ok(schema.properties.validation.properties.finalVerifiability.enum.includes("partially_verifiable"));
  assert.ok(schema.properties.requirements.items.properties.status.enum.includes("not_verified"));
  assert.ok(schema.properties.iterationPolicy.properties.lastDecision.enum.includes("replan"));
  assert.ok(schema.properties.taskProfile.properties.complexity.enum.includes("large"));
  assert.ok(schema.properties.diffBudget.properties.status.enum.includes("over_budget"));
  assert.ok(schema.properties.cleanup.properties.status.enum.includes("completed"));
  assert.ok(schema.properties.deliveryEvidence.properties.status.enum.includes("ready"));
  assert.ok(schema.properties.styleConsolidation.properties.status.enum.includes("completed"));
  assert.ok(schema.properties.contextResetReview.properties.status.enum.includes("passed"));
  assert.ok(schema.properties.contextResetReview.properties.decision.enum.includes("reopen_requirements"));
  assert.ok(schema.properties.mode.properties.loopShape.enum.includes("autopilot"));
  assert.strictEqual(schema.properties.diagnose.required[0], "hypotheses");
  const validationCommandObject = schema.properties.validation.properties.commands.items.anyOf[1];
  assert.ok(validationCommandObject.properties.command);
  assert.ok(validationCommandObject.properties.executable);
  assert.ok(validationCommandObject.properties.args);
  assert.ok(!(validationCommandObject.required || []).includes("result"));
  assert.ok(validationCommandObject.properties.result.enum.includes("failed"));
  assert.ok(validationCommandObject.properties.status.enum.includes("failed"));
  const perCommand = schema.properties.postChange.properties.perCommand.items;
  assert.ok(perCommand.required.includes("command"));
  assert.ok(perCommand.required.includes("status"));
  assert.ok(perCommand.properties.executable);
  assert.ok(perCommand.properties.args);
  assert.ok(perCommand.properties.status.enum.includes("failed"));
});

test("自然语言路由文档覆盖 CLI 支持的模式、预算和 session 规则", () => {
  const routing = readRepoFile(
    "skills/auto-iterate-coding/references/natural-language-routing.md",
  );

  for (const command of [
    "--quick",
    "--strict",
    "--verify",
    "--diagnose",
    "--prototype",
    "--plan-only",
    "--optimize",
    "--list",
    "--switch",
    "--resume",
    "--dashboard",
    "--next",
    "--merge",
    "--check-bloat",
    "--autopilot-max-iterations",
    "--max-iterations",
    "--session <session>",
    "--yes",
  ]) {
    assertIncludes(routing, command, "natural-language-routing.md");
  }

  assertIncludes(routing, "每次自然语言路由启动新任务时都必须显式传入", "natural-language-routing.md");
  assertIncludes(routing, "不要覆盖历史 session", "natural-language-routing.md");
  assertIncludes(routing, "auto-iterate 激活声明", "natural-language-routing.md");
  assertIncludes(routing, "不得把当前会话内的多轮修改称为完整 auto-iterate session", "natural-language-routing.md");
  assertIncludes(routing, "fastcar-cli auto-iterate --validate-state <session|state.md|state.json>", "natural-language-routing.md");
  assertIncludes(routing, "fastcar-cli auto-iterate --dashboard <session>", "natural-language-routing.md");
  assertIncludes(routing, "fastcar-cli auto-iterate --next <session>", "natural-language-routing.md");
  assertIncludes(routing, "fastcar-cli auto-iterate --merge <session> --round <N>", "natural-language-routing.md");
  assertIncludes(routing, "fastcar-cli auto-iterate --check-bloat", "natural-language-routing.md");
  assertIncludes(routing, "fastcar-cli auto-iterate --validate-state`", "natural-language-routing.md");
  assertIncludes(routing, "state 校验：validate-state", "natural-language-routing.md");
  assertIncludes(routing, "明确查看/循环辅助：查看会话 / 查看进度 / dashboard -> `--dashboard`", "natural-language-routing.md");
  assertIncludes(routing, "查看 login-bugfix 会话的进度", "natural-language-routing.md");
  assertIncludes(routing, "打开当前自动迭代任务的 dashboard", "natural-language-routing.md");
  assertIncludes(routing, "检查 login-bugfix 下一轮应该做什么", "natural-language-routing.md");
  assertIncludes(routing, "合并 login-bugfix 第 1 轮 result.json 和 validation.log", "natural-language-routing.md");
  assertIncludes(routing, "检查当前仓库有没有测试膨胀或技能膨胀", "natural-language-routing.md");
  assertIncludes(routing, "检查 login-bugfix 的 sub-agent 协议一致性", "natural-language-routing.md");
  assertIncludes(routing, "`--validate-state` 不追加 `--yes`", "natural-language-routing.md");
  assertIncludes(routing, "`--yes --no-run`", "natural-language-routing.md");
  assertIncludes(routing, "`--validate-state` 复用已有 session 或 state 文件，不创建新 session", "natural-language-routing.md");
  assertIncludes(routing, "检查当前自动迭代 state 是否一致", "natural-language-routing.md");
  assertIncludes(routing, "校验 login-bugfix 整个自动迭代 session 是否一致", "natural-language-routing.md");
  assertIncludes(routing, "让 auto-iterate goal 处理 <目标>", "natural-language-routing.md");
  assertIncludes(routing, "启动 auto-iterate goal：<目标>", "natural-language-routing.md");
  assertIncludes(routing, "Goal 术语边界", "natural-language-routing.md");
  assertIncludes(routing, "Codex goal 模型", "natural-language-routing.md");
  assertIncludes(routing, "Codex `/goal`：交互式 Codex 的会话级目标入口", "natural-language-routing.md");
  assertIncludes(routing, "推荐组合方式", "natural-language-routing.md");
  assertIncludes(routing, "auto-iterate state.json 记录 session、mode、预算、RCM、验证证据、恢复状态和交付门禁", "natural-language-routing.md");
  assertIncludes(routing, "交互式 Codex 中通过输入 `/goal` 使用该入口", "natural-language-routing.md");
  assertIncludes(routing, "codex features list", "natural-language-routing.md");
  assertIncludes(routing, "`goals` 为 `stable true`", "natural-language-routing.md");
  assertIncludes(routing, "`/goal` 是交互式入口，不是独立 CLI 子命令", "natural-language-routing.md");
  assertIncludes(routing, "不会自动创建 Codex goal", "natural-language-routing.md");
  assertIncludes(routing, "不能通过普通提示词、`codex goal` 子命令或 `fastcar-cli --goal` 强制启用", "natural-language-routing.md");
  assertIncludes(routing, "不得把 `fastcar-cli --goal` 伪装成 Codex goal 模型", "natural-language-routing.md");
  assertIncludes(routing, "让 auto-iterate goal 处理：修复登录失败", "natural-language-routing.md");
  assertIncludes(routing, "父任务启动推荐句式：让 auto-iterate goal 处理：<目标>", "natural-language-routing.md");
  assertIncludes(routing, "Codex `/goal` + auto-iterate 推荐句式：先在交互式 Codex 输入 `/goal`", "natural-language-routing.md");
  assertIncludes(routing, "派发给 Codex worker：session 是 login-bugfix", "natural-language-routing.md");
  assertIncludes(routing, "让 Codex goal 接手当前自动迭代任务的 REQ-002", "natural-language-routing.md");
  assertIncludes(routing, "用 Codex worker 处理 dispatch-codex 这个 session", "natural-language-routing.md");
  assertIncludes(routing, "确认 prompt 后，让本地 Codex 真实执行这个 worker", "natural-language-routing.md");
  assertIncludes(routing, "确认 prompt 后，让本地 Kimi 真实执行这个 worker", "natural-language-routing.md");
  assertIncludes(routing, "旧 CLI 驱动路径已废弃", "natural-language-routing.md");
  assertIncludes(routing, "默认必须使用主 Agent + coder subagent 原生工作流", "natural-language-routing.md");
  assertIncludes(routing, "旧 `--dispatch` 模板已经从当前路由中移除", "natural-language-routing.md");
  assertIncludes(routing, "子任务派发推荐句式：旧 `--dispatch` 外部 Worker 路径已废弃", "natural-language-routing.md");
  assertIncludes(routing, "真实执行句式：确认 prompt 后由当前主 Agent 派发 coder subagent", "natural-language-routing.md");
  assertNotIncludes(routing, "fastcar-cli auto-iterate --dispatch <session>", "natural-language-routing.md");
  assertNotIncludes(routing, "codex exec --cd . --sandbox workspace-write", "natural-language-routing.md");
  assertNotIncludes(routing, "AUTO_ITERATE_CODEX_CMD", "natural-language-routing.md");
  assertNotIncludes(routing, "AUTO_ITERATE_<AGENT>_CMD", "natural-language-routing.md");
  assertIncludes(routing, "Few-shot 路由优化", "natural-language-routing.md");
  assertIncludes(routing, "few-shot 样本做贴近表达的类比", "natural-language-routing.md");
  assertIncludes(routing, "只遵从协议规范执行", "natural-language-routing.md");
  assertIncludes(routing, "fastcar-cli auto-iterate --examples protocol-only", "natural-language-routing.md");
  assertIncludes(routing, "样本冲突时按“意图判断顺序”裁决", "natural-language-routing.md");
  assertIncludes(routing, "先读取 `.agent-state/auto-iterate-current.json` 获取当前 session", "natural-language-routing.md");
  assertIncludes(routing, "不要为 `--next`、`--merge`、`--validate-state` 自动创建新 session", "natural-language-routing.md");
  assertIncludes(routing, "用旧 --run 路径跑这个自动迭代任务", "natural-language-routing.md");
  assertIncludes(routing, "用 --dispatch 派给 Codex worker 处理当前 session", "natural-language-routing.md");
});

test("examples 命令输出 auto-iterate goal 父任务启动示例", () => {
  const projectDir = makeProject();
  const output = runAutoIterate(projectDir, ["--examples", "auto-iterate goal"]);

  assertIncludes(output.stdout, "快速启动开发任务", "examples stdout");
  assertIncludes(output.stdout, "让 auto-iterate goal 处理：修复登录失败问题", "examples stdout");
  assertIncludes(output.stdout, "启动 auto-iterate goal：修复支付回调重复处理问题", "examples stdout");
  assertNotIncludes(output.stdout, "未找到匹配的自然语言场景", "examples stdout");
});

test("examples 命令输出 Protocol-only / LLM-only 自然语言示例", () => {
  const projectDir = makeProject();
  const output = runAutoIterate(projectDir, ["--examples", "protocol-only"]);

  assertIncludes(output.stdout, "Protocol-only / LLM-only", "examples stdout");
  assertIncludes(output.stdout, "--no-run", "examples stdout");
  assertNotIncludes(output.stdout, "未找到匹配的自然语言场景", "examples stdout");
});

test("examples 命令输出 loop 和 bloat 辅助命令示例", () => {
  const projectDir = makeProject();
  const loop = runAutoIterate(projectDir, ["--examples", "loop"]);
  const bloat = runAutoIterate(projectDir, ["--examples", "bloat"]);

  assertIncludes(loop.stdout, "循环辅助命令：next / merge", "examples loop stdout");
  assertIncludes(loop.stdout, "fastcar-cli auto-iterate --next login-bugfix", "examples loop stdout");
  assertIncludes(loop.stdout, "fastcar-cli auto-iterate --merge login-bugfix --round 1", "examples loop stdout");
  assertNotIncludes(loop.stdout, "未找到匹配的自然语言场景", "examples loop stdout");

  assertIncludes(bloat.stdout, "膨胀诊断：check-bloat", "examples bloat stdout");
  assertIncludes(bloat.stdout, "fastcar-cli auto-iterate --check-bloat", "examples bloat stdout");
  assertNotIncludes(bloat.stdout, "未找到匹配的自然语言场景", "examples bloat stdout");
});

test("examples 命令输出旧 Worker 路径废弃反例", () => {
  const projectDir = makeProject();
  const output = runAutoIterate(projectDir, ["--examples", "dispatch"]);

  assertIncludes(output.stdout, "旧 Worker 路径已废弃", "examples dispatch stdout");
  assertIncludes(output.stdout, "不要生成 fastcar-cli auto-iterate --dispatch", "examples dispatch stdout");
  assertIncludes(output.stdout, "旧 --dispatch 外部 Worker 路径已废弃", "examples dispatch stdout");
  assertNotIncludes(output.stdout, "Route: fastcar-cli auto-iterate --dispatch", "examples dispatch stdout");
  assertNotIncludes(output.stdout, "Route: fastcar-cli auto-iterate --run", "examples dispatch stdout");
});

test("README 引用的 auto-iterate-coding 文档均存在", () => {
  const readme = readRepoFile("README.md");
  const links = extractMarkdownLinks(readme)
    .filter((link) => link.startsWith("./skills/auto-iterate-coding/"))
    .map((link) => link.replace(/^\.\//, ""));

  assert.ok(links.length >= 5, "README should reference auto-iterate docs");
  for (const link of links) {
    assert.ok(fs.existsSync(path.join(repoRoot, link)), `README link missing ${link}`);
  }

  assertIncludes(readme, "Codex `/goal` 与 auto-iterate 配合", "README.md");
  assertIncludes(readme, "Codex `/goal` 和 `fastcar-cli auto-iterate --goal` 可以配合使用，但职责不同", "README.md");
  assertIncludes(readme, "`/goal` 是交互式 Codex 的会话级目标入口", "README.md");
  assertIncludes(readme, "`fastcar-cli auto-iterate --goal` 是 CLI 的目标文本参数", "README.md");
  assertIncludes(readme, "`.agent-state/auto-iterate/<session>/state.json` 是自动迭代的可恢复状态源", "README.md");
  assertIncludes(readme, "执行中保持 /goal objective 与 state.json.task.goal 语义一致", "README.md");
  assertIncludes(readme, "只有 auto-iterate 交付门禁通过后", "README.md");
  assertIncludes(readme, "不会创建或更新 Codex goal", "README.md");
  assertIncludes(readme, "`/goal` 是交互式 Codex 的会话级目标入口", "README.md");
  assertIncludes(readme, "`codex features list`", "README.md");
  assertIncludes(readme, "`goals stable true`", "README.md");
  assertIncludes(readme, "不是 `codex goal` 子命令", "README.md");
});

test("skills README 同步 auto-iterate goal 边界和 session 示例", () => {
  const skillsReadme = readRepoFile("skills/README.md");

  assertIncludes(skillsReadme, "Codex `/goal` 与 auto-iterate 配合", "skills/README.md");
  assertIncludes(skillsReadme, "Codex `/goal` 和 `fastcar-cli auto-iterate --goal` 可以配合使用，但职责不同", "skills/README.md");
  assertIncludes(skillsReadme, "`/goal` 是交互式 Codex 的会话级目标入口", "skills/README.md");
  assertIncludes(skillsReadme, "`fastcar-cli auto-iterate --goal` 是 CLI 的目标文本参数", "skills/README.md");
  assertIncludes(skillsReadme, "`.agent-state/auto-iterate/<session>/state.json` 是自动迭代的可恢复状态源", "skills/README.md");
  assertIncludes(skillsReadme, "执行中保持 /goal objective 与 state.json.task.goal 语义一致", "skills/README.md");
  assertIncludes(skillsReadme, "只有 auto-iterate 交付门禁通过后", "skills/README.md");
  assertIncludes(skillsReadme, "不会创建或更新 Codex goal", "skills/README.md");
  assertIncludes(skillsReadme, "`/goal` 是交互式 Codex 的会话级目标入口", "skills/README.md");
  assertIncludes(skillsReadme, "`codex features list`", "skills/README.md");
  assertIncludes(skillsReadme, "`goals stable true`", "skills/README.md");
  assertIncludes(skillsReadme, "不是 `codex goal` 子命令", "skills/README.md");
  assertIncludes(skillsReadme, "主 Agent 原生 subagent 工作流", "skills/README.md");
  assertIncludes(skillsReadme, "旧 `--run`、`--check`、`--dispatch` 外部 Worker 路径已废弃", "skills/README.md");
  assertIncludes(skillsReadme, 'fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix --autopilot-max-iterations 5 --yes', "skills/README.md");
  assertIncludes(skillsReadme, 'fastcar-cli auto-iterate --plan-only --goal "规划订单模块重构" --session order-plan --yes', "skills/README.md");
  assertIncludes(skillsReadme, 'fastcar-cli auto-iterate --optimize --goal "优化查询性能" --session query-optimize --yes', "skills/README.md");
  assertIncludes(skillsReadme, 'fastcar-cli auto-iterate --prototype --goal "验证订单状态机" --session order-prototype --yes', "skills/README.md");
  assertIncludes(skillsReadme, 'fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix --yes --no-run', "skills/README.md");
  assertNotIncludes(skillsReadme, 'fastcar-cli auto-iterate --run --autopilot --quick --goal "修复登录失败"', "skills/README.md");
  assertNotIncludes(skillsReadme, '--mode plan --goal "设计支付模块"', "skills/README.md");
});

test("runtime bug analysis is marked as historical status matrix, not current P0 report", () => {
  const analysis = readRepoFile("docs/archive/runtime-bugs-and-timeout-analysis.md");

  assertIncludes(analysis, "只保留旧 `auto-iterate` 运行时风险的历史上下文", "runtime-bugs-and-timeout-analysis.md");
  assertIncludes(analysis, "不再作为当前 Bug 清单、P0/P1 状态矩阵或实现依据", "runtime-bugs-and-timeout-analysis.md");
  assertIncludes(analysis, "旧 CLI Worker 路径已经移除", "runtime-bugs-and-timeout-analysis.md");
  assertIncludes(analysis, "当前默认架构是主 Agent 直接管理 `coder` subagent", "runtime-bugs-and-timeout-analysis.md");
  assertIncludes(analysis, "## 当前权威入口", "runtime-bugs-and-timeout-analysis.md");
  assertIncludes(analysis, "docs/auto-iterate-current-architecture.md", "runtime-bugs-and-timeout-analysis.md");
  assertIncludes(analysis, "skills/auto-iterate-coding/references/state-schema.md", "runtime-bugs-and-timeout-analysis.md");
  assertIncludes(analysis, "test/auto-iterate/**", "runtime-bugs-and-timeout-analysis.md");
  assertIncludes(analysis, "没有这些证据时", "runtime-bugs-and-timeout-analysis.md");
  assertNotIncludes(analysis, "src/adapters/kimi.js", "runtime-bugs-and-timeout-analysis.md");
  assertNotIncludes(analysis, "pipelineWorkerProgress", "runtime-bugs-and-timeout-analysis.md");
  assertNotIncludes(analysis, "test/pipeline.test.js", "runtime-bugs-and-timeout-analysis.md");
  assertNotIncludes(analysis, "AUTO_ITERATE_CODEX_CMD", "runtime-bugs-and-timeout-analysis.md");
  assertNotIncludes(analysis, "运行时 Bug 汇总（按严重程度排序）", "runtime-bugs-and-timeout-analysis.md");
  assertNotIncludes(analysis, "现有 125 个测试全部通过，以下问题均未被现有测试覆盖", "runtime-bugs-and-timeout-analysis.md");
});

test("skill 文档不再引用 legacy 状态文件并保留无 CLI fallback", () => {
  const skill = readRepoFile("skills/auto-iterate-coding/SKILL.md");

  assertIncludes(skill, "无 CLI fallback", "SKILL.md");
  assertIncludes(skill, ".agent-state/auto-iterate/<session>/state.json", "SKILL.md");
  assertIncludes(skill, ".agent-state/auto-iterate/<session>/state.md", "SKILL.md");
  assertIncludes(skill, "先用 `/goal` 设置 Codex 会话级整体目标，再用 `fastcar-cli auto-iterate --goal` 创建可恢复 session", "SKILL.md");
  assertIncludes(skill, "`/goal` 不替代 `.agent-state/auto-iterate/<session>/state.json`", "SKILL.md");
  assertIncludes(skill, "不得伪造完成、验证或外部资源响应", "SKILL.md");
  assertIncludes(skill, "必须先确认或创建 `auto-iterate/<session>/state.json`", "SKILL.md");
  assertIncludes(skill, "只写 legacy mirror 不算完整状态持久化", "SKILL.md");
  assertIncludes(skill, "状态持久化: degraded", "SKILL.md");
  assertIncludes(skill, "## 激活态声明", "SKILL.md");
  assertIncludes(skill, "不得只把它解释为“当前会话内的多轮工作节奏”", "SKILL.md");
  assertIncludes(skill, "auto-iterate 已激活", "SKILL.md");
  for (const expected of [
    "next focus",
    "validation.log",
    "merge state",
    "check-bloat",
    "测试膨胀",
  ]) {
    assertIncludes(skill, expected, "SKILL.md");
  }
  assert.ok(
    !skill.includes(".agent-state/auto-iterate-coding.md"),
    "SKILL.md should not reference legacy state path",
  );
  assert.ok(
    !skill.includes(".agent-state/auto-iterate-start-prompt.md"),
    "SKILL.md should not reference legacy prompt path",
  );
});

test("state schema 强制 session 指针和交付前状态一致性检查", () => {
  const schema = readRepoFile("skills/auto-iterate-coding/references/state-schema.md");

  assertIncludes(schema, "缺少 `state.json`、`state.md`、`start-prompt.md` 或 current 指针", "state-schema.md");
  assertIncludes(schema, "auto-iterate-current.json.stateJsonFile", "state-schema.md");
  assertIncludes(schema, "auto-iterate-current.json.stateFile", "state-schema.md");
  assertIncludes(schema, "auto-iterate-current.json.session", "state-schema.md");
  assertIncludes(schema, "交付前必须执行状态一致性检查", "state-schema.md");
  assertIncludes(schema, "必须先进入 `reconcile`", "state-schema.md");
  assertIncludes(schema, "Context Reset Review Gate", "state-schema.md");
  assertIncludes(schema, "contextResetReview.status=passed", "state-schema.md");
  assertIncludes(schema, "新增或重开对应 REQ", "state-schema.md");
  assertIncludes(schema, "`fastcar-cli auto-iterate --validate-state` 的校验基线", "state-schema.md");
  assertIncludes(schema, "session 基线一致性", "state-schema.md");
  assertIncludes(schema, "sub-agent 协议一致性", "state-schema.md");
  assertIncludes(schema, "旧 `state.md`-only session 降级恢复", "state-schema.md");
  assertIncludes(schema, "`--validate-state --strict-state` 时仍应把缺失 `state.json` 报为错误", "state-schema.md");
  assertNotIncludes(schema, "未来 `fastcar-cli auto-iterate --validate-state`", "state-schema.md");
});

test("auto-iterate 文档统一 state.json 权威源和 state.md 视图", () => {
  const skill = readRepoFile("skills/auto-iterate-coding/SKILL.md");
  const routing = readRepoFile("skills/auto-iterate-coding/references/natural-language-routing.md");
  const judgeRunbook = readRepoFile("skills/auto-iterate-coding/references/judge-runbook.md");
  const autopilot = readRepoFile("skills/auto-iterate-coding/examples/autopilot-start.md");
  const scenarios = readRepoFile("skills/auto-iterate-coding/examples/end-to-end-scenarios.md");

  for (const content of [skill, routing, judgeRunbook, autopilot, scenarios]) {
    assertIncludes(content, "state.json", "auto-iterate docs");
  }

  for (const unexpected of [
    "更新 state.md",
    "写入 state.md",
    "读取 `.agent-state/auto-iterate/login-bugfix/state.md`",
    "fastcar-cli auto-iterate --validate-state [session|state.md]",
  ]) {
  assertNotIncludes(`${skill}\n${routing}\n${judgeRunbook}\n${autopilot}\n${scenarios}`, unexpected, "auto-iterate docs");
  }

  assertIncludes(autopilot, "缺少 `state.json` 的旧 session 可降级读取 `state.md`", "autopilot-start.md");
  assertIncludes(scenarios, "state.json 已更新，state.md 生成视图已刷新", "end-to-end-scenarios.md");
});

test("主 Agent 裁判 runbook 落在 references 且保持 runtime 边界", () => {
  const index = readRepoFile("skills/auto-iterate-coding/references/index.md");
  const judgeRunbook = readRepoFile(
    "skills/auto-iterate-coding/references/judge-runbook.md",
  );
  const skill = readRepoFile("skills/auto-iterate-coding/SKILL.md");
  const currentArchitecture = readRepoFile("docs/auto-iterate-current-architecture.md");

  assertIncludes(index, "judge-runbook.md", "references/index.md");
  assertIncludes(index, "主 Agent 裁判步骤", "references/index.md");
  assertIncludes(index, "validation.log 门禁", "references/index.md");

  for (const content of [judgeRunbook, skill]) {
    assertIncludes(content, "主 Agent（裁判）", "judge runbook docs");
    assertIncludes(content, "coder subagent", "judge runbook docs");
    assertIncludes(content, "validation.log", "judge runbook docs");
  }
  assertIncludes(currentArchitecture, "Agent(subagent_type=\"coder\")", "auto-iterate-current-architecture.md");
  assertIncludes(currentArchitecture, "validation.log", "auto-iterate-current-architecture.md");
  assertIncludes(currentArchitecture, "无外部 Worker", "auto-iterate-current-architecture.md");
  assertIncludes(judgeRunbook, "每轮只允许一个 coder 修改业务代码", "judge-runbook.md");
  assertIncludes(judgeRunbook, "主 Agent 不亲自修改业务代码", "judge-runbook.md");
  assertIncludes(judgeRunbook, "schema 校验", "judge-runbook.md");
  assertIncludes(judgeRunbook, "git diff", "judge-runbook.md");
  assertIncludes(judgeRunbook, "不得按成功交付输出", "judge-runbook.md");
  assertIncludes(judgeRunbook, "fastcar-cli auto-iterate --next <session>", "judge-runbook.md");
  assertIncludes(judgeRunbook, "fastcar-cli auto-iterate --merge <session> --round <n>", "judge-runbook.md");
  assertIncludes(judgeRunbook, "二者都不创建 session、不派发 coder", "judge-runbook.md");
});

test("子 Agent 协议收敛为主 Agent 裁判和单 coder 串行工作流", () => {
  const skill = readRepoFile("skills/auto-iterate-coding/SKILL.md");
  const template = readRepoFile(
    "skills/auto-iterate-coding/examples/state-template.md",
  );
  const schema = readRepoFile("skills/auto-iterate-coding/references/state-schema.md");
  const referencesIndex = readRepoFile("skills/auto-iterate-coding/references/index.md");
  const judgeRunbook = readRepoFile("skills/auto-iterate-coding/references/judge-runbook.md");
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证子 Agent 并发启用字段",
    "--session",
    "sub-agent-enable",
    "--yes",
  ]);
  const { state, prompt } = readSession(projectDir, "sub-agent-enable");

  for (const expected of [
    "## Sub-Agent Dispatch / 子 Agent 调度",
    "enabled：true",
    "current_phase：",
    "active_sub_agents：",
    "active_sub_agents：无",
    "active_sub_agents_item_template：",
    "sub_agent_history：",
    "sub_agent_history：无",
    "sub_agent_history_item_template：",
    "dispatched_count：",
    "completed_count：",
    "failed_count：",
    "last_dispatch_round：",
    "last_merge_result：",
    "max_sub_agent_rounds：3",
    "sub_agent_timeout_seconds：300",
    "max_failed_sub_agents：2",
    "token_budget_hint：",
    "concurrency_limit：1",
    "单 coder 决策：",
    "parallel_write_allowed：",
    "parallel_write_confirmation：",
    "coder_file_ownership：",
    "fallback_strategy：",
  ]) {
    assertIncludes(template, expected, "state-template.md");
    assertIncludes(state, expected, "generated state.md");
  }
  assertIncludes(state, "execution_mode：native_subagent", "generated state.md");
  assertNotIncludes(state, "enabled：false（protocol_only / LLM-only", "generated state.md");

  assertIncludes(schema, "`Sub-Agent Dispatch` 中 `active_sub_agents`", "state-schema.md");
  assertIncludes(schema, "下一轮派发 coder 前 `active_sub_agents` 必须为空", "state-schema.md");
  assertIncludes(schema, "failed_count >= max_failed_sub_agents", "state-schema.md");
  assertIncludes(schema, "`implementation_iterations_used` 最多增加 1", "state-schema.md");

  for (const expected of [
    "子 Agent 串行策略",
    "主 Agent（裁判） -> coder subagent（运动员） -> 主 Agent（裁判）",
    "不再使用 `--dispatch`、外部 Worker、validator subagent、orchestrator subagent 或 coder 并发写入作为默认路径",
    "references/judge-runbook.md",
  ]) {
    assertIncludes(skill, expected, "SKILL.md");
  }

  for (const expected of [
    "默认每轮只派发一个 coder",
    "judge-runbook.md",
  ]) {
    assertIncludes(referencesIndex, expected, "references/index.md");
  }

  for (const expected of [
    "主 Agent（裁判） -> coder subagent（运动员） -> 主 Agent（裁判）",
    "每轮只允许一个 coder 修改业务代码",
    "validation.log",
  ]) {
    assertIncludes(judgeRunbook, expected, "judge-runbook.md");
  }

  assertIncludes(prompt, "references/judge-runbook.md", "start-prompt.md");

  for (const removedPath of [
    "skills/auto-iterate-coding/references/sub-agent-concurrency.md",
    "skills/auto-iterate-coding/references/architecture-friction.md",
    "skills/auto-iterate-coding/references/architecture-language.md",
  ]) {
    assert.ok(!fs.existsSync(path.join(repoRoot, removedPath)), `${removedPath} should be removed`);
  }

  for (const removed of [
    "dispatch_state",
    "isolation_mode",
    "pre_dispatch_snapshot",
    "post_merge_snapshot",
    "state_write_lock",
    "result_schema_status",
    "allowed_artifacts",
    "last_quality_gate_result",
    "coder_concurrency_limit",
  ]) {
    assertNotIncludes(template, `${removed}：`, "state-template.md");
    assertNotIncludes(state, `${removed}：`, "generated state.md");
    assertNotIncludes(schema, removed, "state-schema.md");
    assertNotIncludes(skill, removed, "SKILL.md");
    assertNotIncludes(prompt, removed, "start-prompt.md");
  }
});

test("validate-state 校验完整 auto-iterate session 基线一致性", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证完整 session state 校验",
    "--session",
    "session-baseline",
    "--yes",
  ]);

  const warningOutput = runAutoIterate(projectDir, [
    "--validate-state",
    "session-baseline",
  ]);
  assertIncludes(warningOutput.stdout, "auto-iterate session state 校验发现警告", "validate-state stdout");
  assertIncludes(warningOutput.stdout, "LLM 原生严格工作流产物校验通过", "validate-state stdout");
  assertIncludes(warningOutput.stdout, "delivery_verifiability=unknown", "validate-state stdout");

  const { paths, state, current } = readSession(projectDir, "session-baseline");
  const invalidState = state
    .replace("total_cycles：0", "total_cycles：3")
    .replace("state_drift：none", "state_drift：confirmed")
    .replace("triggered：false", "triggered：true")
    .replace("required_action：continue", "required_action：reconcile")
    .replace("delivery_verifiability：unknown", "delivery_verifiability：verifiable")
    .replace(
      "Requirement Coverage Matrix 状态：未提取完整矩阵，REQ-BOOTSTRAP pending\n验证加固：pending\n交付可验证性：unknown",
      "Requirement Coverage Matrix 状态：未提取完整矩阵，REQ-BOOTSTRAP pending\n验证加固：pending\n交付可验证性：verifiable",
    );
  fs.writeFileSync(paths.state, invalidState, "utf8");
  fs.writeFileSync(
    paths.current,
    JSON.stringify(
      {
        ...current,
        promptFile: ".agent-state/auto-iterate/session-baseline/missing-prompt.md",
      },
      null,
      2,
    ),
    "utf8",
  );

  const invalidOutput = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "session-baseline",
  ]);
  assert.strictEqual(invalidOutput.status, 1, "invalid session baseline should exit non-zero");
  assertIncludes(invalidOutput.stdout, "auto-iterate session state 校验发现错误", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "auto-iterate-current.json.promptFile", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "指向的文件不存在", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "total_cycles=3", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "Watchdog.triggered=true", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "Watchdog.state_drift=confirmed", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "Watchdog.delivery_verifiability=verifiable", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "DoD 标记为 verifiable", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "下一步: 先修正 state", "validate-state stdout");
});

test("validate-state strict 校验 state.json 强约束", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 strict state json",
    "--session",
    "strict-json",
    "--yes",
  ]);

  const validOutput = runAutoIterate(projectDir, [
    "--validate-state",
    "strict-json",
    "--strict-state",
  ]);
  assertIncludes(validOutput.stdout, "state.json 强约束校验通过", "validate-state stdout");

  const { paths, stateJson } = readSession(projectDir, "strict-json");
  stateJson.budgets.totalCycles = 9;
  stateJson.watchdog.deliveryVerifiability = "done";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const invalidOutput = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "strict-json",
    "--strict-state",
  ]);
  assert.strictEqual(invalidOutput.status, 1, "invalid state.json should fail strict validate");
  assertIncludes(invalidOutput.stdout, "state.json 强约束校验发现错误", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "state.json.budgets.totalCycles=9", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "state.json.watchdog.deliveryVerifiability=done", "validate-state stdout");
});

test("validate-state strict 执行 phase gate 一票否决", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 phase gate 一票否决",
    "--session",
    "phase-gate-hard-stop",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "phase-gate-hard-stop");
  stateJson.phaseGate.canProceed = false;
  stateJson.phaseGate.blockingReasons = [];
  stateJson.phaseGate.gates.find((gate) => gate.phase === "contract").status = "passed";
  stateJson.implementationContract.status = "pending";
  stateJson.baseline.status = "pending";
  stateJson.baseline.allowsCoding = true;
  stateJson.iterationPolicy.maxGoalsPerIteration = 2;
  stateJson.deliveryEvidence.status = "ready";
  stateJson.validation.finalVerifiability = "unknown";
  stateJson.cleanup.status = "pending";
  stateJson.styleConsolidation.status = "pending";
  stateJson.postAgentValidationGate.lastResult = "failed";
  stateJson.postAgentValidationGate.nextAction = "deliver";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "phase-gate-hard-stop",
    "--strict-state",
  ]);
  assert.strictEqual(output.status, 1, "phase gate violations should fail strict validate");
  assertIncludes(output.stdout, "state.json.phaseGate.canProceed=false 时必须记录 blockingReasons", "validate-state stdout");
  assertIncludes(output.stdout, "contract 阶段已通过", "validate-state stdout");
  assertIncludes(output.stdout, "state.json.baseline.status=pending 时 allowsCoding 不得为 true", "validate-state stdout");
  assertIncludes(output.stdout, "state.json.iterationPolicy.maxGoalsPerIteration=2", "validate-state stdout");
  assertIncludes(output.stdout, "state.json.deliveryEvidence.status 为 ready/delivered 时 requirements 不得存在开放项", "validate-state stdout");
  assertIncludes(output.stdout, "validation.finalVerifiability 不得为 unknown", "validate-state stdout");
  assertIncludes(output.stdout, "cleanup.status 必须为 completed", "validate-state stdout");
  assertIncludes(output.stdout, "styleConsolidation.status 不得为 pending", "validate-state stdout");
  assertIncludes(output.stdout, "contextResetReview.status 不得为 pending", "validate-state stdout");
  assertIncludes(output.stdout, "postAgentValidationGate.lastResult=failed", "validate-state stdout");
});

test("validate-state strict 阻断未通过 post-agent gate 的 ready delivery", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 delivery gate 后置校验",
    "--session",
    "delivery-post-gate",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "delivery-post-gate");
  stateJson.requirements = [
    {
      id: "REQ-001",
      summary: "已完成需求",
      type: "验证",
      status: "passed",
      relatedFiles: ["src/auto-iterate.ts"],
      evidence: "测试通过",
      blockedReason: "无",
      nextStep: "无",
    },
  ];
  stateJson.watchdog.deliveryVerifiability = "verifiable";
  stateJson.validation.finalVerifiability = "verifiable";
  stateJson.cleanup.status = "completed";
  stateJson.deliveryEvidence.status = "ready";
  stateJson.postAgentValidationGate.lastResult = "not_run";
  stateJson.postAgentValidationGate.nextAction = "context_reset_and_repair";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "delivery-post-gate",
    "--strict-state",
  ]);
  assert.strictEqual(output.status, 1, "ready delivery must require post-agent gate passed");
  assertIncludes(output.stdout, "postAgentValidationGate.lastResult 必须为 passed", "validate-state stdout");
  assertIncludes(output.stdout, "postAgentValidationGate.nextAction 必须为 deliver", "validate-state stdout");
});

test("validate-state strict 阻断 post-change 未通过的 ready delivery", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 post-change gate",
    "--session",
    "delivery-post-change",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "delivery-post-change");
  markSessionReadyForSkillCapture(stateJson);
  stateJson.postChange.status = "not_run";
  stateJson.postChange.regressionDetected = true;
  stateJson.deltaAssessment.decision = "stop";
  stateJson.iterationPolicy.lastDecision = "stop";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "delivery-post-change",
    "--strict-state",
  ]);
  assert.strictEqual(output.status, 1, "ready delivery must require passed post-change validation");
  assertIncludes(output.stdout, "postChange.status 必须为 passed", "validate-state stdout");
  assertIncludes(output.stdout, "postChange.regressionDetected 必须为 false", "validate-state stdout");
});

test("validate-state strict 阻断不可验证的 ready delivery", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证不可验证交付门禁",
    "--session",
    "delivery-not-verifiable",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "delivery-not-verifiable");
  markSessionReadyForSkillCapture(stateJson);
  stateJson.validation.finalVerifiability = "not_verifiable";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "delivery-not-verifiable",
    "--strict-state",
  ]);
  assert.strictEqual(output.status, 1, "ready delivery must require verifiable validation");
  assertIncludes(output.stdout, "validation.finalVerifiability 不得为 not_verifiable", "validate-state stdout");
});

test("validate-state strict 阻断 unknown requirement 的 ready delivery", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 unknown requirement 不能交付",
    "--session",
    "delivery-unknown-req",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "delivery-unknown-req");
  markSessionReadyForSkillCapture(stateJson);
  stateJson.requirements[0].status = "unknown";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "delivery-unknown-req",
    "--strict-state",
  ]);
  assert.strictEqual(output.status, 1, "unknown requirement status should block ready delivery");
  assertIncludes(output.stdout, "state.json.requirements[0].status=unknown", "validate-state stdout");
  assertIncludes(output.stdout, "state.json.deliveryEvidence.status 为 ready/delivered 时 requirements 不得存在开放项", "validate-state stdout");
});

test("validate-state strict 阻断 blocked requirement 的 ready delivery", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 blocked requirement 不能交付",
    "--session",
    "delivery-blocked-req",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "delivery-blocked-req");
  markSessionReadyForSkillCapture(stateJson);
  stateJson.requirements[0].status = "blocked";
  stateJson.requirements[0].blockedReason = "等待用户确认验收边界";
  stateJson.watchdog.deliveryVerifiability = "verifiable";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "delivery-blocked-req",
    "--strict-state",
  ]);
  assert.strictEqual(output.status, 1, "blocked requirement should block ready delivery");
  assertIncludes(output.stdout, "state.json.deliveryEvidence.status 为 ready/delivered 时 requirements 不得存在开放项", "validate-state stdout");
  assertIncludes(output.stdout, "state.json.requirements 仍有开放项", "validate-state stdout");
});

test("validate-state strict 阻断未做上下文清空复核的 ready delivery", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证上下文清空复核门禁",
    "--session",
    "context-reset-review-gate",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "context-reset-review-gate");
  markSessionReadyForSkillCapture(stateJson);
  stateJson.skillCapture.status = "captured";
  stateJson.skillCapture.capturedFiles = [".agents/skills/index.md"];
  stateJson.skillCapture.lastRunSummary = "测试 fixture 已沉淀";
  stateJson.contextResetReview.status = "pending";
  stateJson.contextResetReview.decision = "not_run";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const blockedOutput = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "context-reset-review-gate",
    "--strict-state",
  ]);
  assert.strictEqual(blockedOutput.status, 1, "ready delivery must require context reset review");
  assertIncludes(blockedOutput.stdout, "contextResetReview.status 不得为 pending", "validate-state stdout");

  stateJson.contextResetReview.status = "passed";
  stateJson.contextResetReview.reviewCyclesUsed = 1;
  stateJson.contextResetReview.decision = "pass";
  stateJson.contextResetReview.standardsFindings = [];
  stateJson.contextResetReview.specFindings = [];
  stateJson.contextResetReview.reopenedRequirements = [];
  stateJson.contextResetReview.lastRunSummary = "已清空上下文并完成 Standards / Spec 两轴复核，未发现阻塞问题";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const passedOutput = runAutoIterate(projectDir, [
    "--validate-state",
    "context-reset-review-gate",
    "--strict-state",
  ]);
  assertIncludes(passedOutput.stdout, "state.json 强约束校验通过", "validate-state stdout");
});

test("validate-state strict 阻断上下文清空复核失败后交付", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证复核失败回环",
    "--session",
    "context-reset-review-failed",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "context-reset-review-failed");
  markSessionReadyForSkillCapture(stateJson);
  stateJson.skillCapture.status = "captured";
  stateJson.skillCapture.capturedFiles = [".agents/skills/index.md"];
  stateJson.skillCapture.lastRunSummary = "测试 fixture 已沉淀";
  stateJson.contextResetReview.status = "failed";
  stateJson.contextResetReview.reviewCyclesUsed = 1;
  stateJson.contextResetReview.decision = "reopen_requirements";
  stateJson.contextResetReview.specFindings = ["REQ-002 边界行为未覆盖"];
  stateJson.contextResetReview.reopenedRequirements = ["REQ-002"];
  stateJson.contextResetReview.lastRunSummary = "复核发现 Spec 缺口，必须重开 REQ-002";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "context-reset-review-failed",
    "--strict-state",
  ]);
  assert.strictEqual(output.status, 1, "failed context reset review must block delivery");
  assertIncludes(output.stdout, "contextResetReview.status=failed 时不得交付", "validate-state stdout");
});

test("validate-state strict 阻断上下文清空复核阻塞状态交付", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证复核阻塞状态不能交付",
    "--session",
    "context-reset-review-blocked",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "context-reset-review-blocked");
  markSessionReadyForSkillCapture(stateJson);
  stateJson.skillCapture.status = "captured";
  stateJson.skillCapture.capturedFiles = [".agents/skills/index.md"];
  stateJson.skillCapture.lastRunSummary = "测试 fixture 已沉淀";
  stateJson.contextResetReview.status = "blocked";
  stateJson.contextResetReview.reviewCyclesUsed = 1;
  stateJson.contextResetReview.decision = "block";
  stateJson.contextResetReview.lastRunSummary = "复核所需事实缺失，不能作为成功交付";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "context-reset-review-blocked",
    "--strict-state",
  ]);
  assert.strictEqual(output.status, 1, "blocked context reset review must block delivery");
  assertIncludes(output.stdout, "contextResetReview.status 必须为 passed 或 user_accepted_limited", "validate-state stdout");
});

test("validate-state strict 阻断实现模式未做技巧风格整理的 ready delivery", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证技巧风格整理门禁",
    "--session",
    "style-consolidation-gate",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "style-consolidation-gate");
  markSessionReadyForSkillCapture(stateJson);
  stateJson.skillCapture.status = "captured";
  stateJson.skillCapture.capturedFiles = [".agents/skills/index.md"];
  stateJson.skillCapture.lastRunSummary = "测试 fixture 已沉淀";
  stateJson.styleConsolidation.status = "pending";
  stateJson.styleConsolidation.localSkillsReviewed = [];
  stateJson.styleConsolidation.globalSkillsReviewed = [];
  stateJson.styleConsolidation.appliedRules = [];
  stateJson.styleConsolidation.verificationSummary = "未运行";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const blockedOutput = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "style-consolidation-gate",
    "--strict-state",
  ]);
  assert.strictEqual(blockedOutput.status, 1, "ready delivery must require style consolidation");
  assertIncludes(blockedOutput.stdout, "styleConsolidation.status 不得为 pending", "validate-state stdout");

  stateJson.styleConsolidation.status = "completed";
  stateJson.styleConsolidation.localSkillsReviewed = [".agents/skills/index.md"];
  stateJson.styleConsolidation.globalSkillsReviewed = ["typescript-coding-style"];
  stateJson.styleConsolidation.appliedRules = ["按本地和全局 skills 整理命名、import 和状态字段"];
  stateJson.styleConsolidation.changedFiles = ["src/auto-iterate.ts"];
  stateJson.styleConsolidation.summary = "已完成技巧风格整理";
  stateJson.styleConsolidation.verificationSummary = "真实验证通过: npm test";
  stateJson.styleConsolidation.lastRunSummary = "整理后验证通过";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const passedOutput = runAutoIterate(projectDir, [
    "--validate-state",
    "style-consolidation-gate",
    "--strict-state",
  ]);
  assertIncludes(passedOutput.stdout, "state.json 强约束校验通过", "validate-state stdout");
});

test("validate-state strict 阻断证据不完整的 ready delivery", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 delivery evidence 内容门禁",
    "--session",
    "delivery-evidence-gate",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "delivery-evidence-gate");
  stateJson.requirements = [
    {
      id: "REQ-001",
      summary: "已完成需求",
      type: "验证",
      status: "passed",
      relatedFiles: ["src/auto-iterate.ts"],
      evidence: "测试通过",
      blockedReason: "无",
      nextStep: "无",
    },
  ];
  stateJson.watchdog.deliveryVerifiability = "verifiable";
  stateJson.validation.finalVerifiability = "verifiable";
  stateJson.cleanup.status = "completed";
  stateJson.deliveryEvidence.status = "ready";
  stateJson.deliveryEvidence.validationSummary = "未运行";
  stateJson.deliveryEvidence.risks = "无";
  stateJson.deliveryEvidence.userConfirmation = "无";
  stateJson.postAgentValidationGate.lastResult = "passed";
  stateJson.postAgentValidationGate.nextAction = "deliver";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "delivery-evidence-gate",
    "--strict-state",
  ]);
  assert.strictEqual(output.status, 1, "ready delivery must require complete evidence");
  assertIncludes(output.stdout, "validationSummary 必须包含真实验证结论", "validate-state stdout");
  assertIncludes(output.stdout, "risks 必须显式说明风险或有限可验证边界", "validate-state stdout");
  assertIncludes(output.stdout, "userConfirmation 必须记录确认来源或说明无需确认的原因", "validate-state stdout");
});

test("validate-state strict 执行 Engine v1 一票否决门禁", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 Engine v1 一票否决",
    "--session",
    "engine-v1-veto",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "engine-v1-veto");
  const baseState = JSON.parse(JSON.stringify(stateJson));

  function expectStrictFailure(mutator, expectedMessage) {
    const candidate = JSON.parse(JSON.stringify(baseState));
    mutator(candidate);
    fs.writeFileSync(paths.stateJson, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    const output = runAutoIterateRaw(projectDir, [
      "--validate-state",
      "engine-v1-veto",
      "--strict-state",
    ]);
    assert.strictEqual(output.status, 1, `${expectedMessage} should fail strict validate`);
    assertIncludes(output.stdout, expectedMessage, "validate-state stdout");
  }

  expectStrictFailure((candidate) => {
    candidate.task.successCriteria = [];
  }, "state.json.task.successCriteria 不能为空");

  expectStrictFailure((candidate) => {
    candidate.postChange.regressionDetected = true;
    candidate.deltaAssessment.decision = "keep";
  }, "检测到 regression 时 deltaAssessment.decision 不得为 keep");

  expectStrictFailure((candidate) => {
    candidate.deltaAssessment.status = "regression";
    candidate.iterationPolicy.lastDecision = "continue";
  }, "deltaAssessment.status=regression 时 iterationPolicy.lastDecision 不得为 continue");

  expectStrictFailure((candidate) => {
    candidate.diffBudget.changedFiles = candidate.iterationPolicy.maxChangedFiles + 1;
  }, "超出 maxChangedFiles");

  expectStrictFailure((candidate) => {
    candidate.diffBudget.status = "over_budget";
    candidate.iterationPolicy.lastDecision = "continue";
  }, "diffBudget.status=over_budget 时 iterationPolicy.lastDecision 不得为 continue");

  expectStrictFailure((candidate) => {
    candidate.diffBudget.outOfScopeFiles = ["outside.txt"];
    candidate.diffBudget.highRiskFiles = ["src/auto-iterate.ts"];
    candidate.iterationPolicy.lastDecision = "continue";
  }, "存在 outOfScopeFiles/highRiskFiles 时 iterationPolicy.lastDecision 不得为 continue");

  expectStrictFailure((candidate) => {
    candidate.taskProfile.needsUserConfirmation = true;
    candidate.decisionRequest.status = "pending";
  }, "taskProfile.needsUserConfirmation=true 时 decisionRequest.status 必须为 approved 或 blocked");
});

test("resume 前执行 strict state 门禁", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 resume 门禁",
    "--session",
    "resume-gate",
    "--yes",
  ]);

  const { paths, stateJson } = readSession(projectDir, "resume-gate");
  stateJson.requirements[0].status = "finished";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, ["--resume", "resume-gate"]);
  assert.strictEqual(output.status, 1, "resume should fail when strict state gate fails");
  assertIncludes(output.stdout, "resume 已被 strict state 门禁阻止", "resume stdout");
  assertIncludes(output.stdout, "state.json.requirements[0].status=finished", "resume stdout");
});

test("resume 兼容旧 state.md-only session 并提示降级恢复", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证旧 session resume",
    "--session",
    "legacy-md-only",
    "--yes",
  ]);

  const { paths } = readSession(projectDir, "legacy-md-only");
  fs.unlinkSync(paths.stateJson);

  const output = runAutoIterate(projectDir, ["--resume", "legacy-md-only"]);
  assertIncludes(output.stdout, "按旧 state.md-only session 降级恢复", "resume stdout");
  assertIncludes(output.stdout, "已准备恢复 session", "resume stdout");
  assertIncludes(output.stdout, "legacy-md-only", "resume stdout");
});

test("validate-state strict 区分 state.json 缺失和解析失败", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 json parse error",
    "--session",
    "json-parse-error",
    "--yes",
  ]);

  const { paths } = readSession(projectDir, "json-parse-error");
  fs.writeFileSync(paths.stateJson, "{ invalid json", "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "json-parse-error",
    "--strict-state",
  ]);
  assert.strictEqual(output.status, 1, "invalid JSON should fail strict validate");
  assertIncludes(output.stdout, "无法解析机器权威 state.json", "validate-state stdout");
});

test("最少迭代轮次被定义为下限而不是仅执行或最大预算", () => {
  const skill = readRepoFile("skills/auto-iterate-coding/SKILL.md");
  const routing = readRepoFile(
    "skills/auto-iterate-coding/references/natural-language-routing.md",
  );
  const template = readRepoFile(
    "skills/auto-iterate-coding/examples/state-template.md",
  );
  const schema = readRepoFile("skills/auto-iterate-coding/references/state-schema.md");

  assertIncludes(skill, "minimum_implementation_iterations", "SKILL.md");
  assertIncludes(skill, "下限检查点", "SKILL.md");
  assertIncludes(skill, "不是“仅 N 轮”或最大预算", "SKILL.md");
  assertIncludes(skill, "不得为了凑轮数制造无效修改", "SKILL.md");

  assertIncludes(routing, "最少迭代 N 次 / 至少跑 N 轮 / 最少 N 轮", "natural-language-routing.md");
  assertIncludes(routing, "不得映射为 `--autopilot-max-iterations N`", "natural-language-routing.md");
  assertIncludes(routing, "不要追加 `--autopilot-max-iterations 5`", "natural-language-routing.md");
  assertIncludes(routing, "`A > B`", "natural-language-routing.md");

  assertIncludes(template, "minimum_implementation_iterations：", "state-template.md");
  assertIncludes(template, "最少/至少 N 轮是下限检查点", "state-template.md");

  assertIncludes(schema, "minimum_implementation_iterations", "state-schema.md");
  assertIncludes(schema, "不得写入或等同于 `max_iterations`", "state-schema.md");
  assertIncludes(schema, "implementation_iterations_used >= minimum_implementation_iterations", "state-schema.md");
  assertIncludes(schema, "不得把下限当成停止线", "state-schema.md");
});

test("任务后技能沉淀写入 .agents skills 并维护 index 入口", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证技能沉淀",
    "--session",
    "skill-capture",
    "--yes",
  ]);

  const skill = readRepoFile("skills/auto-iterate-coding/SKILL.md");
  const template = readRepoFile(
    "skills/auto-iterate-coding/examples/state-template.md",
  );
  const schema = readRepoFile("skills/auto-iterate-coding/references/state-schema.md");
  const jsonSchema = readRepoFile(
    "skills/auto-iterate-coding/references/state.schema.json",
  );
  const finalDelivery = readRepoFile(
    "skills/auto-iterate-coding/references/final-delivery.md",
  );
  const outputDiscipline = readRepoFile(
    "skills/auto-iterate-coding/contracts/output-discipline-contract.md",
  );
  const index = readRepoFile("skills/auto-iterate-coding/references/index.md");
  const directoryIndex = readRepoFile("skills/auto-iterate-coding/index.md");
  const contractsReadme = readRepoFile("skills/auto-iterate-coding/contracts/readme.md");
  const changelog = readRepoFile("skills/auto-iterate-coding/changelog.md");
  const { paths, state, stateJson, prompt } = readSession(projectDir, "skill-capture");

  for (const expected of [
    "## Skill Capture / 技能沉淀",
    ".agents/skills",
    ".agents/skills/index.md",
    "skipped_no_high_value",
    "只沉淀可复用、可验证、跨任务有价值的技能点",
  ]) {
    assertIncludes(skill, expected, "SKILL.md");
    assertIncludes(template, expected, "state-template.md");
    assertIncludes(schema, expected, "state-schema.md");
    assertIncludes(finalDelivery, expected, "final-delivery.md");
    assertIncludes(state, expected, "generated state.md");
    assertIncludes(prompt, expected, "start-prompt.md");
  }

  assertIncludes(finalDelivery, "skillCapture.status", "final-delivery.md");
  assertIncludes(finalDelivery, "contextResetReview.status=passed", "final-delivery.md");
  assertIncludes(finalDelivery, "成功交付前必须完成 Context Reset Review Gate", "final-delivery.md");
  assertIncludes(finalDelivery, '不得用"我记得已经完成"替代该门禁', "final-delivery.md");
  assertIncludes(skill, "不得在任务完成时用英文收口", "SKILL.md");
  assertIncludes(finalDelivery, "交付语言规则", "final-delivery.md");
  assertIncludes(finalDelivery, "最终对话回复", "final-delivery.md");
  assertIncludes(finalDelivery, "必须使用中文字段标签和中文说明", "final-delivery.md");
  assertIncludes(outputDiscipline, "语言硬约束", "output-discipline-contract.md");
  assertIncludes(outputDiscipline, "最终对话回复、本次任务交付总结", "output-discipline-contract.md");
  assertIncludes(outputDiscipline, "中文 session 不得使用英文开头或英文收尾", "output-discipline-contract.md");
  assertIncludes(index, "任务后 Skill Capture", "INDEX.md");
  assertIncludes(directoryIndex, "目录索引", "index.md");
  assertIncludes(directoryIndex, "[SKILL.md](./SKILL.md)", "index.md");
  assertNotIncludes(directoryIndex, "[skill.md](./skill.md)", "index.md");
  assertIncludes(directoryIndex, "contracts/", "index.md");
  assertIncludes(directoryIndex, "changelog.md", "index.md");
  assertIncludes(directoryIndex, "旧版 feedback / optimization / compatibility / adapters 文档层已移除", "index.md");
  assertNotIncludes(directoryIndex, "[compatibility/", "index.md");
  assertNotIncludes(directoryIndex, "[adapters/", "index.md");
  assertIncludes(contractsReadme, "机器可检查的强约束", "contracts/readme.md");
  assertIncludes(changelog, "2026-06-03", "changelog.md");
  assertIncludes(changelog, "移除 compatibility、skill adapters、agents 镜像和历史迁移长文档", "changelog.md");
  for (const removedPath of [
    "skills/auto-iterate-coding/compatibility",
    "skills/auto-iterate-coding/adapters",
    "skills/auto-iterate-coding/agents",
  ]) {
    assert.ok(!fs.existsSync(path.join(repoRoot, removedPath)), `${removedPath} should be removed`);
  }
  assertIncludes(jsonSchema, "\"skillCapture\"", "state.schema.json");
  assertIncludes(jsonSchema, "\"traceability\"", "state.schema.json");
  assertIncludes(jsonSchema, "\"deliveryDocs\"", "state.schema.json");
  assertIncludes(jsonSchema, "\"root\": { \"const\": \".agents/skills\" }", "state.schema.json");
  assert.deepStrictEqual(stateJson.skillCapture.capturedFiles, []);
  assert.deepStrictEqual(stateJson.skillCapture.pendingCandidates, []);

  markSessionReadyForSkillCapture(stateJson);
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const pendingOutput = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "skill-capture",
    "--strict-state",
  ]);
  assert.strictEqual(pendingOutput.status, 1, "ready delivery must not allow pending skill capture");
  assertIncludes(pendingOutput.stdout, "skillCapture.status 不得为 pending", "validate-state stdout");

  runAutoIterate(projectDir, [
    "--capture-skills",
    "skill-capture",
    "--yes",
  ]);

  const capturedStateJson = JSON.parse(fs.readFileSync(paths.stateJson, "utf8"));
  assert.strictEqual(capturedStateJson.skillCapture.status, "captured");
  assert.ok(
    capturedStateJson.skillCapture.capturedFiles.includes(".agents/skills/index.md"),
    "captured files should include skills index",
  );
  assert.ok(
    fs.existsSync(path.join(projectDir, ".agents", "skills", "index.md")),
    "skills index should be generated",
  );

  const capturedOutput = runAutoIterate(projectDir, [
    "--validate-state",
    "skill-capture",
    "--strict-state",
  ]);
  assertIncludes(capturedOutput.stdout, "state.json 强约束校验通过", "validate-state stdout");
});

test("finalize 自动执行技能沉淀并通过 strict state 门禁", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 finalize 自动归档",
    "--session",
    "skill-finalize",
    "--yes",
  ]);

  const { paths } = readSession(projectDir, "skill-finalize");
  const stateJson = JSON.parse(fs.readFileSync(paths.stateJson, "utf8"));
  markSessionReadyForSkillCapture(stateJson);
  stateJson.requirements = [
    {
      id: "REQ-FINALIZE",
      summary: "FastCar finalize 应在迭代结束后自动沉淀技能",
      type: "验证",
      status: "passed",
      relatedFiles: ["src/auto-iterate.ts"],
      evidence: "finalize 先执行 capture-skills --yes，再执行 validate-state --strict-state",
      blockedReason: "无",
      nextStep: "无",
    },
  ];
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterate(projectDir, [
    "--finalize",
    "skill-finalize",
    "--yes",
  ]);

  assertIncludes(output.stdout, "正在执行迭代结束门禁", "finalize stdout");
  assertIncludes(output.stdout, "技能沉淀完成", "finalize stdout");
  assertIncludes(output.stdout, "已生成交付文档", "finalize stdout");
  assertIncludes(output.stdout, "state.json 强约束校验通过", "finalize stdout");
  assertIncludes(output.stdout, "finalize 完成", "finalize stdout");

  const capturedStateJson = JSON.parse(fs.readFileSync(paths.stateJson, "utf8"));
  assert.strictEqual(capturedStateJson.skillCapture.status, "captured");
  assert.ok(
    capturedStateJson.skillCapture.capturedFiles.includes(".agents/skills/index.md"),
    "captured files should include skills index",
  );
  assert.ok(
    fs.existsSync(path.join(projectDir, ".agents", "skills", "index.md")),
    "skills index should be generated by finalize",
  );
  assert.strictEqual(capturedStateJson.deliveryDocs.status, "generated");
  for (const name of ["api.md", "changelog.md", "architecture.md", "implementation.md"]) {
    const filePath = path.join(projectDir, ".agent-state", "auto-iterate", "skill-finalize", "docs", name);
    assert.ok(fs.existsSync(filePath), `${name} should be generated by finalize`);
  }
  const architecture = fs.readFileSync(path.join(projectDir, ".agent-state", "auto-iterate", "skill-finalize", "docs", "architecture.md"), "utf8");
  assertIncludes(architecture, "不记录私有思考链", "architecture.md");
});

test("finalize strict 门禁失败时不生成交付文档", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 finalize 失败不生成文档",
    "--session",
    "finalize-block-docs",
    "--yes",
  ]);

  const { paths } = readSession(projectDir, "finalize-block-docs");
  const stateJson = JSON.parse(fs.readFileSync(paths.stateJson, "utf8"));
  markSessionReadyForSkillCapture(stateJson);
  stateJson.contextResetReview.status = "failed";
  stateJson.contextResetReview.decision = "reopen_requirements";
  stateJson.contextResetReview.reopenedRequirements = ["REQ-001"];
  stateJson.contextResetReview.specFindings = ["测试 fixture 显式模拟 context reset review 失败"];
  stateJson.contextResetReview.lastRunSummary = "复核失败，必须阻断 finalize 文档生成";
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--finalize",
    "finalize-block-docs",
    "--yes",
  ]);

  assert.strictEqual(output.status, 1, "finalize should fail before generating docs when strict gate fails");
  assertIncludes(output.stdout, "finalize 未通过：strict state 门禁失败", "finalize stdout");
  assert.ok(!output.stdout.includes("已生成交付文档"), "finalize must not claim docs were generated");

  const afterStateJson = JSON.parse(fs.readFileSync(paths.stateJson, "utf8"));
  assert.notStrictEqual(afterStateJson.deliveryDocs.status, "generated");
  assert.ok(!fs.existsSync(path.join(projectDir, ".agent-state", "auto-iterate", "finalize-block-docs", "docs", "api.md")));
});

test("validate-state strict 阻断缺失或串 session 的 generated 交付文档", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 deliveryDocs generated 真实文件门禁",
    "--session",
    "delivery-docs-strict",
    "--yes",
  ]);

  const { paths } = readSession(projectDir, "delivery-docs-strict");
  const stateJson = JSON.parse(fs.readFileSync(paths.stateJson, "utf8"));
  markSessionReadyForSkillCapture(stateJson);
  stateJson.skillCapture.status = "skipped_no_high_value";
  stateJson.skillCapture.skippedReasons = ["测试 fixture 不需要沉淀技能"];
  stateJson.skillCapture.lastRunSummary = "已跳过技能沉淀";
  stateJson.deliveryDocs = {
    status: "generated",
    path: ".agent-state/auto-iterate/other-session/docs",
    files: [
      ".agent-state/auto-iterate/other-session/docs/api.md",
    ],
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  const output = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "delivery-docs-strict",
    "--strict-state",
  ]);

  assert.strictEqual(output.status, 1, "strict validate-state should reject invalid generated docs metadata");
  assertIncludes(output.stdout, "deliveryDocs.status=generated", "validate-state stdout");
  assertIncludes(output.stdout, "delivery-docs-strict", "validate-state stdout");
});

test("capture-skills 脱敏敏感信息并过滤低价值日志", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证敏感信息过滤",
    "--session",
    "skill-capture-sanitize",
    "--yes",
  ]);

  const { paths } = readSession(projectDir, "skill-capture-sanitize");
  const stateJson = JSON.parse(fs.readFileSync(paths.stateJson, "utf8"));
  markSessionReadyForSkillCapture(stateJson);
  stateJson.validation.commands = [
    { command: "npm run configured-only", note: "not executed yet" },
    { command: "npm test", result: "passed", iteration: 1, summary: "capture-skills regression passed" },
  ];
  stateJson.requirements = [
    {
      id: "REQ-SECRET",
      summary: "FastCar Controller capture 不得泄露凭据",
      type: "验证",
      status: "passed",
      relatedFiles: ["src/auto-iterate.ts"],
      evidence: "authorization: Bearer abcdefghijklmnopqrstuvwxyz123456 password=plain-token-value token=abcdefghijklmnopqrstuvwxyz1234567890 customer@example.com",
      blockedReason: "无",
      nextStep: "无",
    },
    {
      id: "REQ-LOG",
      summary: "一次性日志不应成为技能",
      type: "验证",
      status: "passed",
      relatedFiles: ["debug.log"],
      evidence: "测试通过",
      blockedReason: "无",
      nextStep: "无",
    },
  ];
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  runAutoIterate(projectDir, [
    "--capture-skills",
    "skill-capture-sanitize",
    "--yes",
  ]);

  const skillsRoot = path.join(projectDir, ".agents", "skills");
  const generatedFiles = fs.readdirSync(skillsRoot, { recursive: true })
    .filter((file) => String(file).endsWith("SKILL.md"));
  assert.ok(generatedFiles.length > 0, "at least one skill should be generated");
  const generatedContent = generatedFiles
    .map((file) => fs.readFileSync(path.join(skillsRoot, file), "utf8"))
    .join("\n");

  assertNotIncludes(generatedContent, "plain-token-value", "generated skill");
  assertNotIncludes(generatedContent, "abcdefghijklmnopqrstuvwxyz1234567890", "generated skill");
  assertNotIncludes(generatedContent, "npm run configured-only", "generated skill");
  assertIncludes(generatedContent, "npm test", "generated skill");
  assertNotIncludes(generatedContent, "customer@example.com", "generated skill");
  assertIncludes(generatedContent, "[REDACTED", "generated skill");
  assertNotIncludes(generatedContent, "- 测试通过", "generated skill");
});

test("capture-skills 向无尾空行的现有 index 表追加入口", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证索引追加",
    "--session",
    "skill-capture-index",
    "--yes",
  ]);

  const skillsRoot = path.join(projectDir, ".agents", "skills");
  fs.mkdirSync(skillsRoot, { recursive: true });
  fs.writeFileSync(
    path.join(skillsRoot, "index.md"),
    [
      "# Skills 索引",
      "",
      "| 技能名称 | 标题 | 关键触发场景 | 来源 Session |",
      "|----------|------|-------------|-------------|",
      "| existing-skill | Existing | Existing scenario | old-session |",
    ].join("\n"),
    "utf8",
  );

  const { paths } = readSession(projectDir, "skill-capture-index");
  const stateJson = JSON.parse(fs.readFileSync(paths.stateJson, "utf8"));
  markSessionReadyForSkillCapture(stateJson);
  stateJson.requirements = [
    {
      id: "REQ-INDEX",
      summary: "TypeScript capture-skills 需要维护索引入口",
      type: "验证",
      status: "passed",
      relatedFiles: ["src/auto-iterate.ts"],
      evidence: "无尾空行 index 表格应追加新捕获技能入口",
      blockedReason: "无",
      nextStep: "无",
    },
  ];
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  runAutoIterate(projectDir, [
    "--capture-skills",
    "skill-capture-index",
    "--yes",
  ]);

  const indexContent = fs.readFileSync(path.join(skillsRoot, "index.md"), "utf8");
  assertIncludes(indexContent, "| existing-skill | Existing | Existing scenario | old-session |", "skills index");
  assertIncludes(indexContent, "| captured-skill-capture-index |", "skills index");

  const capturedStateJson = JSON.parse(fs.readFileSync(paths.stateJson, "utf8"));
  assert.ok(
    capturedStateJson.skillCapture.capturedFiles.includes(".agents/skills/index.md"),
    "captured files should include existing index even when only appended",
  );

  const capturedOutput = runAutoIterate(projectDir, [
    "--validate-state",
    "skill-capture-index",
    "--strict-state",
  ]);
  assertIncludes(capturedOutput.stdout, "state.json 强约束校验通过", "validate-state stdout");
});

test("英文 session 的 capture-skills 生成英文技能文档和索引", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "capture reusable TypeScript validation practice",
    "--session",
    "english-skill-capture",
    "--yes",
  ]);

  const { paths } = readSession(projectDir, "english-skill-capture");
  const stateJson = JSON.parse(fs.readFileSync(paths.stateJson, "utf8"));
  markSessionReadyForSkillCapture(stateJson);
  stateJson.requirements = [
    {
      id: "REQ-EN",
      summary: "TypeScript validation should keep enum status values stable",
      type: "validation",
      status: "passed",
      relatedFiles: ["src/pipeline/language.ts"],
      evidence: "Added tests proving human-readable text follows English while enum status stays unchanged",
      blockedReason: "none",
      nextStep: "none",
    },
  ];
  fs.writeFileSync(paths.stateJson, `${JSON.stringify(stateJson, null, 2)}\n`, "utf8");

  runAutoIterate(projectDir, [
    "--capture-skills",
    "english-skill-capture",
    "--yes",
  ]);

  const indexContent = fs.readFileSync(path.join(projectDir, ".agents", "skills", "index.md"), "utf8");
  assertIncludes(indexContent, "# Skills Index", "skills index");
  assertIncludes(indexContent, "| Skill | Title | Key Trigger Scenarios | Source Session |", "skills index");

  const generatedFiles = fs.readdirSync(path.join(projectDir, ".agents", "skills"), { recursive: true })
    .filter((file) => String(file).endsWith("SKILL.md"));
  const generatedContent = generatedFiles
    .map((file) => fs.readFileSync(path.join(projectDir, ".agents", "skills", file), "utf8"))
    .join("\n");
  assertIncludes(generatedContent, "## Trigger Scenarios", "generated skill");
  assertIncludes(generatedContent, "## Reliable Approach", "generated skill");
  assertIncludes(generatedContent, "Generated by fastcar-cli auto-iterate --capture-skills", "generated skill");
  assertNotIncludes(generatedContent, "## 触发场景", "generated skill");
});

test("当前架构文档与 pipeline 硬边界保持一致", () => {
  const design = readRepoFile("docs/auto-iterate-current-architecture.md");
  const sessionRuntime = readRepoFile("src/auto-iterate/sessionRuntime.ts");
  const iterationPaths = readRepoFile("src/pipeline/iterationPaths.ts");

  assertIncludes(design, "主 Agent 当裁判，Subagent 当运动员", "auto-iterate-current-architecture.md");
  assertIncludes(design, "Agent(subagent_type=\"coder\")", "auto-iterate-current-architecture.md");
  assertIncludes(design, "validation.log", "auto-iterate-current-architecture.md");
  assertIncludes(design, "fastcar-cli` 只提供辅助：session 管理、state 校验、交付文档生成", "auto-iterate-current-architecture.md");
  assertIncludes(design, "已删除（旧 CLI Worker 路径不再维护）", "auto-iterate-current-architecture.md");
  assertIncludes(design, "src/adapters/*", "auto-iterate-current-architecture.md");
  assertIncludes(design, "无外部 Worker", "auto-iterate-current-architecture.md");
  assert.ok(!fs.existsSync(path.join(repoRoot, "docs", "auto-iterate-cli-driven.md")));
  assert.ok(!fs.existsSync(path.join(repoRoot, "docs", "auto-iterate-pipeline-evaluation.md")));
  assert.ok(!fs.existsSync(path.join(repoRoot, "docs", "auto-iterate-llm-native-subagent-proposal.md")));

  // sessionRuntime no longer contains legacy deprecation code
  assertNotIncludes(sessionRuntime, "await runPipeline", "sessionRuntime.js");
  assertNotIncludes(sessionRuntime, "checkEnvironment()", "sessionRuntime.js");
  assertNotIncludes(sessionRuntime, "emitDeprecatedAutomationPath", "sessionRuntime.js");
  assertIncludes(iterationPaths, "function buildIterationPaths", "iterationPaths.js");
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
