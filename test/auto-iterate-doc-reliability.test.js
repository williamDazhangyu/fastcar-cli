const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "cli.js");

const REQUIRED_STATE_SECTIONS = [
  "## At-a-Glance / 人类摘要",
  "## Session / 会话",
  "## Mode / 模式",
  "## Task / 任务",
  "## Agent Capability Summary",
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

function sessionPaths(projectDir, session) {
  const stateRoot = path.join(projectDir, ".agent-state");
  const sessionDir = path.join(stateRoot, "auto-iterate", session);
  return {
    current: path.join(stateRoot, "auto-iterate-current.json"),
    sessionDir,
    state: path.join(sessionDir, "state.md"),
    prompt: path.join(sessionDir, "start-prompt.md"),
  };
}

function readSession(projectDir, session) {
  const paths = sessionPaths(projectDir, session);
  return {
    paths,
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
  assertIncludes(state, "autopilot_max_iterations：5", "state.md");
  assertIncludes(state, "remaining_implementation_iterations：5", "state.md");
  assertIncludes(state, "REQ-BOOTSTRAP", "state.md");
  assertIncludes(state, "required_action：run_validation", "state.md");
  assertIncludes(prompt, "请先读取 auto-iterate-coding/SKILL.md", "prompt");
  assertIncludes(
    prompt,
    ".agent-state/auto-iterate/login-bugfix/state.md",
    "prompt",
  );
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

test("state-schema、state-template 与 CLI 初始 state 的 17 个章节保持一致", () => {
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

  assert.strictEqual(requiredSections.length, 17);
  for (const section of requiredSections) {
    assert.ok(headingMatches(template, section), `state-template missing ${section}`);
    assert.ok(headingMatches(state, section), `generated state missing ${section}`);
  }

  assertIncludes(schema, "delivery_verifiability = not_verifiable / unknown", "schema");
  assertIncludes(template, "partially_verifiable", "state-template");
  assertIncludes(state, "交付可验证性：unknown", "state.md");
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
    "--autopilot-max-iterations",
    "--max-iterations",
    "--session <session>",
    "--yes",
  ]) {
    assertIncludes(routing, command, "natural-language-routing.md");
  }

  assertIncludes(routing, "每次自然语言路由都必须显式传入", "natural-language-routing.md");
  assertIncludes(routing, "不要覆盖历史 session", "natural-language-routing.md");
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
});

test("skill 文档不再引用 legacy 状态文件并保留无 CLI fallback", () => {
  const skill = readRepoFile("skills/auto-iterate-coding/SKILL.md");

  assertIncludes(skill, "无 CLI fallback", "SKILL.md");
  assertIncludes(skill, ".agent-state/auto-iterate/<session>/state.md", "SKILL.md");
  assertIncludes(skill, "不得伪造完成、验证或外部资源响应", "SKILL.md");
  assert.ok(
    !skill.includes(".agent-state/auto-iterate-coding.md"),
    "SKILL.md should not reference legacy state path",
  );
  assert.ok(
    !skill.includes(".agent-state/auto-iterate-start-prompt.md"),
    "SKILL.md should not reference legacy prompt path",
  );
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
