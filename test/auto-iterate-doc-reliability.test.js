const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
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
  "## Watchdog / 看门狗",
  "## Requirement Coverage Matrix / 需求覆盖矩阵",
  "## Definition of Done / 完成定义",
  "## Decisions / 已确认决策",
  "## Hypotheses / 假设",
  "## Validation / 验证",
  "## Temporary Artifacts / Cleanup / 临时产物清理",
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

function runAutoIterate(cwd, args) {
  const result = spawnSync(process.execPath, [cliPath, "auto-iterate", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      FORCE_COLOR: "0",
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

function runAutoIterateRaw(cwd, args) {
  return spawnSync(process.execPath, [cliPath, "auto-iterate", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      FORCE_COLOR: "0",
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

test("state-schema、state-template 与 CLI 初始 state 的 18 个章节保持一致", () => {
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

  assert.strictEqual(requiredSections.length, 18);
  for (const section of requiredSections) {
    assert.ok(headingMatches(template, section), `state-template missing ${section}`);
    assert.ok(headingMatches(state, section), `generated state missing ${section}`);
  }

  assertIncludes(schema, "delivery_verifiability = not_verifiable / unknown", "schema");
  assertIncludes(template, "partially_verifiable", "state-template");
  assertIncludes(state, "交付可验证性：unknown", "state.md");
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
  assert.strictEqual(
    stateJson.session.stateJsonFile,
    ".agent-state/auto-iterate/state-json-check/state.json",
  );
  assert.strictEqual(
    current.stateJsonFile,
    ".agent-state/auto-iterate/state-json-check/state.json",
  );
  assertIncludes(state, "GENERATED FILE, DO NOT EDIT", "state.md");
  assertIncludes(state, "机器权威状态为 .agent-state/auto-iterate/state-json-check/state.json", "state.md");
  assertIncludes(prompt, "Session 机器状态：.agent-state/auto-iterate/state-json-check/state.json", "start-prompt.md");
  assertIncludes(prompt, "Session 状态视图：.agent-state/auto-iterate/state-json-check/state.md", "start-prompt.md");
  assertIncludes(prompt, "先读取它作为本 session 的机器权威恢复状态", "start-prompt.md");
  assertIncludes(prompt, "再刷新 .agent-state/auto-iterate/state-json-check/state.md 生成视图", "start-prompt.md");
  assertNotIncludes(prompt, "Session 状态文件：.agent-state/auto-iterate/state-json-check/state.md", "start-prompt.md");
  assertNotIncludes(prompt, "优先更新 session 状态文件 .agent-state/auto-iterate/state-json-check/state.md", "start-prompt.md");
});

test("references INDEX 索引的文档真实存在并覆盖关键模式组合", () => {
  const index = readRepoFile("skills/auto-iterate-coding/references/INDEX.md");
  const referencesDir = path.join(
    repoRoot,
    "skills",
    "auto-iterate-coding",
    "references",
  );
  const indexedFiles = Array.from(index.matchAll(/`([^`]+\.md)`/g)).map(
    (match) => match[1],
  );

  assert.ok(indexedFiles.length >= 18, "INDEX should list all reference docs");
  for (const file of indexedFiles) {
    assert.ok(
      fs.existsSync(path.join(referencesDir, file)),
      `INDEX references missing file ${file}`,
    );
  }

  for (const mode of [
    "严格实现 / Autopilot",
    "Diagnose",
    "Verify-only",
    "Prototype-only",
    "Optimization-only",
  ]) {
    assertIncludes(index, mode, "references INDEX");
  }
  assertIncludes(index, "`--validate-state`", "INDEX.md");
  assertIncludes(index, "state 校验", "INDEX.md");
  assertIncludes(index, "State / sub-agent 校验", "INDEX.md");
  assertIncludes(index, "`natural-language-routing.md`、`state-schema.md`、`sub-agent-concurrency.md`", "INDEX.md");
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
    "--dispatch",
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
  assertIncludes(routing, "fastcar-cli auto-iterate --validate-state`", "natural-language-routing.md");
  assertIncludes(routing, "state 校验：validate-state", "natural-language-routing.md");
  assertIncludes(routing, "检查 login-bugfix 的 sub-agent 协议一致性", "natural-language-routing.md");
  assertIncludes(routing, "`--validate-state` 不追加 `--yes`", "natural-language-routing.md");
  assertIncludes(routing, "`--validate-state` 复用已有 session 或 state 文件，不创建新 session", "natural-language-routing.md");
  assertIncludes(routing, "检查当前自动迭代 state 是否一致", "natural-language-routing.md");
  assertIncludes(routing, "校验 login-bugfix 整个自动迭代 session 是否一致", "natural-language-routing.md");
  assertIncludes(routing, "让 auto-iterate goal 处理 <目标>", "natural-language-routing.md");
  assertIncludes(routing, "启动 auto-iterate goal：<目标>", "natural-language-routing.md");
  assertIncludes(routing, "Goal 术语边界", "natural-language-routing.md");
  assertIncludes(routing, "Codex 客户端 Goal 入口", "natural-language-routing.md");
  assertIncludes(routing, "它不会自动启用客户端的 Goal 模式", "natural-language-routing.md");
  assertIncludes(routing, "不能通过提示词或 `fastcar-cli --goal` 强制启用", "natural-language-routing.md");
  assertIncludes(routing, "不是声明已经启用 Codex 客户端 Goal 模式", "natural-language-routing.md");
  assertIncludes(routing, "让 auto-iterate goal 处理：修复登录失败", "natural-language-routing.md");
  assertIncludes(routing, "父任务启动推荐句式：让 auto-iterate goal 处理：<目标>", "natural-language-routing.md");
  assertIncludes(routing, "fastcar-cli auto-iterate --dispatch <session> --agent codex", "natural-language-routing.md");
  assertIncludes(routing, "AUTO_ITERATE_CODEX_CMD", "natural-language-routing.md");
  assertIncludes(routing, "--agent <claude|gemini|kimi|cursor|windsurf|copilot|jules|devin|openhands|replit>", "natural-language-routing.md");
  assertIncludes(routing, "AUTO_ITERATE_<AGENT>_CMD", "natural-language-routing.md");
  assertIncludes(routing, "派发给 Codex worker：session 是 login-bugfix", "natural-language-routing.md");
  assertIncludes(routing, "让 Codex goal 接手当前自动迭代任务的 REQ-002", "natural-language-routing.md");
  assertIncludes(routing, "用 Codex worker 处理 dispatch-codex 这个 session", "natural-language-routing.md");
  assertIncludes(routing, "确认 prompt 后，让本地 Codex 真实执行这个 worker", "natural-language-routing.md");
  assertIncludes(routing, "codex exec --cd . --sandbox workspace-write", "natural-language-routing.md");
  assertIncludes(routing, "确认 prompt 后，让本地 Kimi 真实执行这个 worker", "natural-language-routing.md");
  assertIncludes(routing, "kimi --work-dir . --print --final-message-only", "natural-language-routing.md");
  assertIncludes(routing, "子任务派发推荐句式：让 Codex worker 处理 <session> 的 <REQ 或子任务>", "natural-language-routing.md");
  assertIncludes(routing, "兼容旧口语“让 Codex goal 处理”", "natural-language-routing.md");
  assertIncludes(routing, "不得声称已启用 Codex 客户端 Goal 模式", "natural-language-routing.md");
  assertIncludes(routing, "真实执行句式：确认 prompt 后用本地 Codex/Kimi 执行", "natural-language-routing.md");
});

test("examples 命令输出 auto-iterate goal 父任务启动示例", () => {
  const projectDir = makeProject();
  const output = runAutoIterate(projectDir, ["--examples", "auto-iterate goal"]);

  assertIncludes(output.stdout, "快速启动开发任务", "examples stdout");
  assertIncludes(output.stdout, "让 auto-iterate goal 处理：修复登录失败问题", "examples stdout");
  assertIncludes(output.stdout, "启动 auto-iterate goal：修复支付回调重复处理问题", "examples stdout");
  assertNotIncludes(output.stdout, "未找到匹配的自然语言场景", "examples stdout");
});

test("examples 命令输出 Codex worker / dispatch 派发自然语言示例", () => {
  const projectDir = makeProject();
  const output = runAutoIterate(projectDir, ["--examples", "Codex"]);

  assertIncludes(output.stdout, "Codex worker / dispatch 派发", "examples stdout");
  assertIncludes(output.stdout, "不表示已启用 Codex 客户端 Goal 模式", "examples stdout");
  assertIncludes(output.stdout, "让 Codex goal 处理 login-bugfix 的 REQ-001", "examples stdout");
  assertIncludes(output.stdout, "让 Codex goal 接手当前自动迭代任务的 REQ-002", "examples stdout");
  assertIncludes(output.stdout, "确认 prompt 后，让本地 Codex 真实执行这个 worker", "examples stdout");
  assertIncludes(output.stdout, "AUTO_ITERATE_CODEX_CMD", "examples stdout");
  assertNotIncludes(output.stdout, "未找到匹配的自然语言场景", "examples stdout");
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

  assertIncludes(readme, "Codex 客户端的 Goal 入口、提示词里的 `Goal:` 前缀、以及 `fastcar-cli auto-iterate --goal` 不是同一个东西", "README.md");
  assertIncludes(readme, "最多被 CLI 清洗为目标文本，不会自动启用客户端 Goal 模式", "README.md");
});

test("skills README 同步 auto-iterate goal 边界和 session 示例", () => {
  const skillsReadme = readRepoFile("skills/README.md");

  assertIncludes(skillsReadme, "Codex 客户端的 Goal 入口、提示词里的 `Goal:` 前缀、以及 `fastcar-cli auto-iterate --goal` 不是同一个东西", "skills/README.md");
  assertIncludes(skillsReadme, "最多被 CLI 清洗为目标文本，不会自动启用客户端 Goal 模式", "skills/README.md");
  assertIncludes(skillsReadme, 'fastcar-cli auto-iterate --quick --goal "修复登录失败" --session login-bugfix --autopilot-max-iterations 5 --yes', "skills/README.md");
  assertIncludes(skillsReadme, 'fastcar-cli auto-iterate --plan-only --goal "订单模块重构" --session order-plan --yes', "skills/README.md");
  assertIncludes(skillsReadme, 'fastcar-cli auto-iterate --plan-only --goal "设计支付模块" --session payment-plan', "skills/README.md");
  assertIncludes(skillsReadme, 'fastcar-cli auto-iterate --optimize --goal "优化查询性能" --session query-optimize', "skills/README.md");
  assertIncludes(skillsReadme, 'fastcar-cli auto-iterate --prototype --goal "验证订单状态机" --session order-prototype', "skills/README.md");
  assertNotIncludes(skillsReadme, '--mode plan --goal "设计支付模块"', "skills/README.md");
});

test("skill 文档不再引用 legacy 状态文件并保留无 CLI fallback", () => {
  const skill = readRepoFile("skills/auto-iterate-coding/SKILL.md");

  assertIncludes(skill, "无 CLI fallback", "SKILL.md");
  assertIncludes(skill, ".agent-state/auto-iterate/<session>/state.json", "SKILL.md");
  assertIncludes(skill, ".agent-state/auto-iterate/<session>/state.md", "SKILL.md");
  assertIncludes(skill, "不得伪造完成、验证或外部资源响应", "SKILL.md");
  assertIncludes(skill, "必须先确认或创建 `auto-iterate/<session>/state.json`", "SKILL.md");
  assertIncludes(skill, "只写 legacy mirror 不算完整状态持久化", "SKILL.md");
  assertIncludes(skill, "状态持久化: degraded", "SKILL.md");
  assertIncludes(skill, "## 激活态声明", "SKILL.md");
  assertIncludes(skill, "不得只把它解释为“当前会话内的多轮工作节奏”", "SKILL.md");
  assertIncludes(skill, "auto-iterate 已激活", "SKILL.md");
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
  const concurrency = readRepoFile("skills/auto-iterate-coding/references/sub-agent-concurrency.md");
  const autopilot = readRepoFile("skills/auto-iterate-coding/examples/autopilot-start.md");
  const scenarios = readRepoFile("skills/auto-iterate-coding/examples/end-to-end-scenarios.md");

  for (const content of [skill, routing, concurrency, autopilot, scenarios]) {
    assertIncludes(content, "state.json", "auto-iterate docs");
  }

  for (const unexpected of [
    "更新 state.md",
    "写入 state.md",
    "读取 `.agent-state/auto-iterate/login-bugfix/state.md`",
    "fastcar-cli auto-iterate --validate-state [session|state.md]",
  ]) {
    assertNotIncludes(`${skill}\n${routing}\n${concurrency}\n${autopilot}\n${scenarios}`, unexpected, "auto-iterate docs");
  }

  assertIncludes(concurrency, "state.json、state.md、start-prompt.md、auto-iterate-current.json", "sub-agent-concurrency.md");
  assertIncludes(autopilot, "缺少 `state.json` 的旧 session 可降级读取 `state.md`", "autopilot-start.md");
  assertIncludes(scenarios, "state.json 已更新，state.md 生成视图已刷新", "end-to-end-scenarios.md");
});

test("子 Agent 并发协议使用现行状态模板字段且禁止旧字段回流", () => {
  const concurrency = readRepoFile(
    "skills/auto-iterate-coding/references/sub-agent-concurrency.md",
  );
  const skill = readRepoFile("skills/auto-iterate-coding/SKILL.md");
  const template = readRepoFile(
    "skills/auto-iterate-coding/examples/state-template.md",
  );
  const schema = readRepoFile("skills/auto-iterate-coding/references/state-schema.md");
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
    "## 启用门禁与平台适配",
    "### Codex 一轮并发示例",
    "## 调度流程",
    "### active_sub_agents 生命周期示例",
    "## 不应并发的情况",
    "## 共享文件与生成物规则",
    "## 审计边界",
    "## 并行验证副作用",
    "## 失败恢复决策表",
    "## validate-state 校验",
    "### Quality Gate 操作步骤",
    "### 委派 Prompt 模板",
    "Platform Adapter",
    "Sub-Agent Result Schema",
    "本地 CLI Worker Adapter",
    "fastcar-cli auto-iterate --dispatch <session> --agent <agent>",
    "AUTO_ITERATE_CODEX_CMD",
    "AUTO_ITERATE_CLAUDE_CMD",
    "AUTO_ITERATE_GEMINI_CMD",
    "AUTO_ITERATE_KIMI_CMD",
    "AUTO_ITERATE_OPENHANDS_CMD",
    "codex exec --cd . --sandbox workspace-write",
    "kimi --work-dir . --print --final-message-only",
    "模板缺失时不得留下半成品 worktree",
    "不能把 dry-run 当作真实 worker 完成",
    "`claude` / `claude-code`",
    "`gemini` / `gemini-cli`",
    "contract-only",
    "验证副作用",
    "quick / strict / diagnose / plan / optimize / prototype",
    "Autopilot / strict；quick 仅在文件 ownership 明确时",
    "状态文件只维护 `examples/state-template.md`",
  ]) {
    assertIncludes(concurrency, expected, "sub-agent-concurrency.md");
  }

  for (const expected of [
    "## Sub-Agent Dispatch / 子 Agent 调度",
    "enabled：",
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
    "concurrency_limit：3",
    "并发决策：",
    "parallel_write_allowed：",
    "parallel_write_confirmation：",
    "coder_file_ownership：",
    "fallback_strategy：",
  ]) {
    assertIncludes(template, expected, "state-template.md");
    assertIncludes(state, expected, "generated state.md");
  }

  assertIncludes(schema, "`Sub-Agent Dispatch` 中 `active_sub_agents`", "state-schema.md");
  assertIncludes(schema, "下一轮 dispatch 前 `active_sub_agents` 必须为空", "state-schema.md");
  assertIncludes(schema, "failed_count >= max_failed_sub_agents", "state-schema.md");
  assertIncludes(schema, "`implementation_iterations_used` 只增加 1", "state-schema.md");

  for (const expected of [
    "启用门禁与平台适配",
    "调度流程",
    "Sub-Agent Result Schema",
    "唯一来源",
    "parallel_write_allowed",
    "coder_file_ownership",
    "轻量 baseline",
    "coder 默认最多 2",
    "quick 模式默认只启用 explore/background 并发",
    "小任务、单文件修改、ownership 不清晰或验证副作用不明时默认串行执行",
  ]) {
    assertIncludes(skill, expected, "SKILL.md");
    assertIncludes(prompt, expected, "start-prompt.md");
  }

  for (const expected of [
    "最小合格返回示例",
    "不合格返回示例",
    "failure_reason=incomplete_result",
    "fastcar-cli auto-iterate --validate-state [session|state.md|state.json]",
    "完整 auto-iterate session 基线",
    "session 基线校验覆盖",
    "不负责启动、停止或调度子 Agent",
  ]) {
    assertIncludes(concurrency, expected, "sub-agent-concurrency.md");
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
    assertNotIncludes(concurrency, removed, "sub-agent-concurrency.md");
    assertNotIncludes(template, `${removed}：`, "state-template.md");
    assertNotIncludes(state, `${removed}：`, "generated state.md");
    assertNotIncludes(schema, removed, "state-schema.md");
    assertNotIncludes(skill, removed, "SKILL.md");
    assertNotIncludes(prompt, removed, "start-prompt.md");
  }
});

test("validate-state 只读检查 sub-agent 协议违规", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 sub-agent state 校验",
    "--session",
    "sub-agent-validate",
    "--yes",
  ]);

  const validOutput = runAutoIterate(projectDir, [
    "--validate-state",
    "sub-agent-validate",
  ]);
  assertIncludes(validOutput.stdout, "sub-agent state 校验通过", "validate-state stdout");

  const { paths, state } = readSession(projectDir, "sub-agent-validate");
  const invalidState = state.replace(
    "current_phase：idle\nactive_sub_agents：无",
    [
      "current_phase：idle",
      "active_sub_agents：",
      "  - id：coder-a",
      "    type：coder",
      "    task：修改 A",
      "    files_assigned：src/a.ts, src/shared.ts",
      "    status：running",
      "    failure_reason：无",
      "    started_at：2026-05-11T00:00:00Z",
      "    completed_at：未完成",
      "    result_summary：未完成",
      "    merge_status：pending",
      "  - id：coder-b",
      "    type：coder",
      "    task：修改 B",
      "    files_assigned：src/shared.ts",
      "    status：running",
      "    failure_reason：无",
      "    started_at：2026-05-11T00:00:00Z",
      "    completed_at：未完成",
      "    result_summary：未完成",
      "    merge_status：pending",
    ].join("\n"),
  );
  fs.writeFileSync(paths.state, invalidState, "utf8");

  const invalidOutput = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "sub-agent-validate",
  ]);
  assert.strictEqual(invalidOutput.status, 1, "invalid sub-agent state should exit non-zero");
  assertIncludes(invalidOutput.stdout, "sub-agent state 校验发现错误", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "active_sub_agents 非空", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "enabled 非 true", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "coder files_assigned 冲突", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "parallel_write_allowed 未确认为 true", "validate-state stdout");
  assertIncludes(invalidOutput.stdout, "下一步: 先修正 state", "validate-state stdout");

  const ownershipState = invalidState
    .replace("current_phase：idle", "current_phase：implement")
    .replace("enabled：false（待 Agent 能力探测后决定）", "enabled：true")
    .replace("    files_assigned：src/shared.ts", "    files_assigned：src/b.ts")
    .replace("  parallel_write_allowed：false", "  parallel_write_allowed：true")
    .replace("  coder_file_ownership：未分配", "  coder_file_ownership：coder-a=src/a.ts,src/shared.ts; coder-b=src/b.ts");
  fs.writeFileSync(paths.state, ownershipState, "utf8");

  const ownershipOutput = runAutoIterate(projectDir, [
    "--validate-state",
    "sub-agent-validate",
  ]);
  assert.ok(
    !ownershipOutput.stdout.includes("parallel_write_allowed 未确认为 true"),
    "validate-state should read indented parallel_write_allowed=true",
  );
  assert.ok(
    !ownershipOutput.stdout.includes("coder_file_ownership 未记录 ownership"),
    "validate-state should read indented coder_file_ownership",
  );

  const wrongPhaseState = ownershipState.replace("current_phase：implement", "current_phase：verify");
  fs.writeFileSync(paths.state, wrongPhaseState, "utf8");

  const wrongPhaseOutput = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "sub-agent-validate",
  ]);
  assert.strictEqual(wrongPhaseOutput.status, 1, "wrong phase/type should exit non-zero");
  assertIncludes(wrongPhaseOutput.stdout, "current_phase=verify", "validate-state stdout");
  assertIncludes(wrongPhaseOutput.stdout, "type=coder", "validate-state stdout");

  const countDriftState = state.replace(
    "sub_agent_history：无（待首轮 dispatch 后追加；字段模板：round / agent_id / type / task_summary / merge_result / files_changed / validation_result / failure_reason）",
    [
      "sub_agent_history：",
      "  - round：1",
      "    agent_id：explore-a",
      "    type：explore",
      "    task_summary：已完成探索",
      "    merge_result：success",
      "    files_changed：无",
      "    validation_result：not_run",
      "    failure_reason：无",
      "  - round：1",
      "    agent_id：explore-b",
      "    type：explore",
      "    task_summary：探索失败",
      "    merge_result：skipped",
      "    files_changed：无",
      "    validation_result：not_run",
      "    failure_reason：timeout",
    ].join("\n"),
  );
  fs.writeFileSync(paths.state, countDriftState, "utf8");

  const countDriftOutput = runAutoIterate(projectDir, [
    "--validate-state",
    "sub-agent-validate",
  ]);
  assertIncludes(countDriftOutput.stdout, "completed_count 小于", "validate-state stdout");
  assertIncludes(countDriftOutput.stdout, "failed_count 小于", "validate-state stdout");
  assertIncludes(countDriftOutput.stdout, "下一步: 建议在下一轮 dispatch", "validate-state stdout");

  const incompleteState = state.replace(
    "current_phase：idle\nactive_sub_agents：无",
    [
      "current_phase：explore",
      "active_sub_agents：",
      "  - id：explore-incomplete",
      "    type：explore",
      "    task：",
      "    files_assigned：",
      "    status：running",
      "    failure_reason：无",
      "    started_at：2026-05-11T00:00:00Z",
      "    completed_at：未完成",
      "    result_summary：未完成",
      "    merge_status：pending",
    ].join("\n"),
  ).replace("enabled：false（待 Agent 能力探测后决定）", "enabled：true");
  fs.writeFileSync(paths.state, incompleteState, "utf8");

  const incompleteOutput = runAutoIterateRaw(projectDir, [
    "--validate-state",
    "sub-agent-validate",
  ]);
  assert.strictEqual(incompleteOutput.status, 1, "incomplete active agent should exit non-zero");
  assertIncludes(incompleteOutput.stdout, "缺少必要字段", "validate-state stdout");
  assertIncludes(incompleteOutput.stdout, "task", "validate-state stdout");
  assertIncludes(incompleteOutput.stdout, "files_assigned", "validate-state stdout");

  const missingSessionOutput = runAutoIterate(projectDir, [
    "--validate-state",
    "missing-session",
  ]);
  assertIncludes(missingSessionOutput.stdout, "未找到 session state: missing-session", "validate-state stdout");
  assertIncludes(
    missingSessionOutput.stdout,
    ".agent-state/auto-iterate/missing-session/state.md",
    "validate-state stdout",
  );
});

test("dispatch dry-run 生成 Codex worker prompt 并更新 sub-agent state", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 Codex worker dispatch",
    "--session",
    "dispatch-codex",
    "--yes",
  ]);

  const dispatchOutput = runAutoIterate(projectDir, [
    "--dispatch",
    "dispatch-codex",
    "--agent",
    "codex",
    "--task",
    "修复 REQ-001",
    "--files",
    "src/auth.js,test/auth.test.js",
    "--verify-command",
    "npm test",
    "--dry-run",
  ]);
  assertIncludes(dispatchOutput.stdout, "已准备 Codex worker dispatch", "dispatch stdout");
  assertIncludes(dispatchOutput.stdout, "Dry run: 未启动外部 Codex。", "dispatch stdout");

  const { paths, state, stateJson } = readSession(projectDir, "dispatch-codex");
  const dispatchDir = path.join(paths.sessionDir, "dispatch");
  const promptFiles = fs.readdirSync(dispatchDir).filter((item) => item.endsWith(".prompt.md"));
  assert.strictEqual(promptFiles.length, 1, "dispatch should create one worker prompt");
  const prompt = fs.readFileSync(path.join(dispatchDir, promptFiles[0]), "utf8");

  assertIncludes(prompt, "你的角色：父 Agent 委派的 coder 子任务执行者", "worker prompt");
  assertIncludes(prompt, "禁止读取或写入 .agent-state/ 下任何文件", "worker prompt");
  assertIncludes(prompt, "允许修改文件：src/auth.js, test/auth.test.js", "worker prompt");
  assertIncludes(prompt, "验证命令：npm test", "worker prompt");
  assertIncludes(prompt, "Sub-Agent Result Schema", "worker prompt");

  assertIncludes(state, "current_phase：implement", "state.md");
  assertIncludes(state, "type：coder", "state.md");
  assertIncludes(state, "task：修复 REQ-001", "state.md");
  assertIncludes(state, "files_assigned：src/auth.js,test/auth.test.js", "state.md");
  assertIncludes(state, "parallel_write_allowed：true", "state.md");
  assertIncludes(state, "coder_file_ownership：codex-dispatch-codex-", "state.md");
  assert.strictEqual(stateJson.subAgentDispatch.currentPhase, "implement");
  assert.strictEqual(stateJson.subAgentDispatch.activeSubAgents[0].type, "coder");
  assert.deepStrictEqual(stateJson.subAgentDispatch.activeSubAgents[0].filesAssigned, [
    "src/auth.js",
    "test/auth.test.js",
  ]);

  const validateOutput = runAutoIterate(projectDir, [
    "--validate-state",
    "dispatch-codex",
  ]);
  assertIncludes(validateOutput.stdout, "sub-agent state 校验通过", "validate-state stdout");
});

test("dispatch dry-run 支持主流本地 agent adapter", () => {
  for (const agent of ["claude", "gemini", "kimi", "cursor", "windsurf", "copilot", "jules", "devin", "openhands", "replit"]) {
    const projectDir = makeProject();
    const session = `dispatch-${agent}`;

    runAutoIterate(projectDir, [
      "--quick",
      "--goal",
      `验证 ${agent} worker dispatch`,
      "--session",
      session,
      "--yes",
    ]);

    const output = runAutoIterate(projectDir, [
      "--dispatch",
      session,
      "--agent",
      agent,
      "--task",
      "处理 REQ-001",
      "--files",
      "src/a.js",
      "--verify-command",
      "npm test",
      "--dry-run",
    ]);
    assertIncludes(output.stdout, `Agent: ${agent}`, "dispatch stdout");

    const { stateJson } = readSession(projectDir, session);
    assert.strictEqual(stateJson.subAgentDispatch.activeSubAgents[0].type, "coder");
    assert.ok(
      stateJson.subAgentDispatch.activeSubAgents[0].id.startsWith(`${agent}-`),
      `agent id should include ${agent}`,
    );
  }
});

test("dispatch 非 dry-run 缺少命令模板时不会创建 worktree", () => {
  const projectDir = makeProject();

  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 dispatch 命令模板门禁",
    "--session",
    "dispatch-template-gate",
    "--yes",
  ]);

  const output = runAutoIterateRaw(projectDir, [
    "--dispatch",
    "dispatch-template-gate",
    "--agent",
    "codex",
    "--task",
    "处理 REQ-001",
    "--files",
    "README.md",
    "--verify-command",
    "npm test",
  ]);

  assert.strictEqual(output.status, 1, "missing command template should fail");
  assertIncludes(output.stdout, "未设置 AUTO_ITERATE_CODEX_CMD", "dispatch stdout");
  assert.ok(
    !fs.existsSync(path.join(projectDir, ".agent-state", "auto-iterate", "dispatch-template-gate", "worktrees")),
    "missing template should not create worktrees",
  );
});

test("dispatch 非 dry-run 保留 agent 写入的 result 并追加命令审计", () => {
  const projectDir = makeGitProject();
  runAutoIterate(projectDir, [
    "--quick",
    "--goal",
    "验证 dispatch result 合并",
    "--session",
    "dispatch-result-merge",
    "--yes",
  ]);

  const command = [
    JSON.stringify(process.execPath),
    "-e",
    JSON.stringify([
      "const fs=require('fs');",
      "fs.writeFileSync(process.argv[2], 'agent says completed\\n', 'utf8');",
      "console.log('worker stdout ok');",
    ].join("")),
    "placeholder",
    "{result}",
  ].join(" ");
  const output = spawnSync(
    process.execPath,
    [
      cliPath,
      "auto-iterate",
      "--dispatch",
      "dispatch-result-merge",
      "--agent",
      "codex",
      "--task",
      "处理 REQ-001",
      "--files",
      "README.md",
      "--verify-command",
      "npm test",
      "--timeout",
      "20",
    ],
    {
      cwd: projectDir,
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "1",
        FORCE_COLOR: "0",
        AUTO_ITERATE_CODEX_CMD: command,
      },
    },
  );

  assert.strictEqual(
    output.status,
    0,
    `dispatch should pass\nSTDOUT:\n${output.stdout}\nSTDERR:\n${output.stderr}`,
  );
  assertIncludes(output.stdout, "Worktree:", "dispatch stdout");
  const { paths, stateJson } = readSession(projectDir, "dispatch-result-merge");
  const resultFile = path.join(
    projectDir,
    stateJson.subAgentDispatch.activeSubAgents[0].resultFile,
  );
  const result = fs.readFileSync(resultFile, "utf8");
  assertIncludes(result, "agent_result：", "dispatch result");
  assertIncludes(result, "agent says completed", "dispatch result");
  assertIncludes(result, "command_audit：", "dispatch result");
  assertIncludes(result, "exit_code：0", "dispatch result");
  assertIncludes(result, "signal：none", "dispatch result");
  assertIncludes(result, "error：none", "dispatch result");
  assertIncludes(result, "worker stdout ok", "dispatch result");
  assert.strictEqual(stateJson.subAgentDispatch.activeSubAgents[0].status, "completed");
  assert.strictEqual(stateJson.subAgentDispatch.completedCount, 1);
  assert.ok(
    fs.existsSync(path.join(paths.sessionDir, "worktrees")),
    "non dry-run should create isolated worktree",
  );

  const secondDispatch = runAutoIterateRaw(projectDir, [
    "--dispatch",
    "dispatch-result-merge",
    "--agent",
    "codex",
    "--task",
    "处理 REQ-002",
    "--files",
    "README.md",
    "--verify-command",
    "npm test",
    "--dry-run",
  ]);
  assert.strictEqual(secondDispatch.status, 1, "active sub-agent should block new dispatch");
  assertIncludes(secondDispatch.stdout, "存在未合并的 active_sub_agents", "dispatch stdout");
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
  assertIncludes(warningOutput.stdout, "sub-agent state 校验通过", "validate-state stdout");
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
