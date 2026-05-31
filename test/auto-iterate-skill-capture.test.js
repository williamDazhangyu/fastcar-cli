const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  captureSkills,
  extractSkillCandidates,
  sanitizeSkillCaptureText,
  updateSkillsIndexFile,
} = require("../dist/auto-iterate/skillCapture");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function withTempCwd(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fastcar-skill-capture-"));
  process.chdir(dir);
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      process.chdir(previous);
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function captureConsole(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  return Promise.resolve()
    .then(fn)
    .then((result) => ({ result, lines }))
    .finally(() => {
      console.log = original;
    });
}

function createSession(session, stateJson) {
  const dir = `.agent-state/auto-iterate/${session}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/state.md`, [
    "## Session / 会话",
    `session：${session}`,
    "",
    "## Skill Capture / 技能沉淀",
    "status：pending",
    "root：.agents/skills",
    "index_file：.agents/skills/index.md",
    "captured_files：无",
    "",
    "## Validation / 验证",
    "已通过验证：未运行",
  ].join("\n"));
  fs.writeFileSync(`${dir}/start-prompt.md`, "prompt");
  writeJson(`${dir}/state.json`, {
    session: { session },
    language: { code: "zh", source: "test", confidence: "high" },
    skillCapture: { status: "pending" },
    ...stateJson,
  });
  return dir;
}

test("sanitizeSkillCaptureText redacts sensitive values and truncates", () => {
  const value = [
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
    "password=super-secret",
    "owner=dev@example.com",
    "x".repeat(260),
  ].join(" ");

  const sanitized = sanitizeSkillCaptureText(value);

  assert(sanitized.includes("Authorization: Bearer [REDACTED]"));
  assert(sanitized.includes("password=[REDACTED]"));
  assert(sanitized.includes("[REDACTED_EMAIL]"));
  assert(sanitized.length <= 220);
});

test("extractSkillCandidates maps requirements, validation history, and TypeScript changes", () => {
  const candidates = extractSkillCandidates({
    session: { session: "demo" },
    language: { code: "zh" },
    requirements: [{
      id: "REQ-1",
      status: "passed",
      summary: "FastCar Controller 使用 TypeScript DTO 重构",
      evidence: "新增 @fastcar/koa Controller 测试并运行 npm run typecheck",
    }],
    validation: {
      commands: [{
        command: "npm run typecheck",
        result: "passed",
        summary: "TS 严格检查通过",
      }],
    },
    deliveryEvidence: {
      changedFiles: ["src/auto-iterate/skillCapture.ts"],
    },
  });

  assert(candidates.some((item) => item.name === "fastcar-framework"));
  const sessionCandidate = candidates.find((item) => item.name === "captured-demo");
  assert(sessionCandidate);
  assert(sessionCandidate.approaches.some((item) => item.includes("TypeScript 文件修改")));
  assert(sessionCandidate.verifications.some((item) => item.includes("npm run typecheck")));
});

test("captureSkills marks session skipped when there are no high-value candidates", async () => {
  await withTempCwd(async () => {
    createSession("empty", {
      requirements: [],
      validation: { commands: [] },
      deliveryEvidence: { changedFiles: [] },
    });

    const { lines } = await captureConsole(() => captureSkills("empty", { yes: true }));
    const state = readJson(".agent-state/auto-iterate/empty/state.json");
    const stateMd = fs.readFileSync(".agent-state/auto-iterate/empty/state.md", "utf8");

    assert.strictEqual(state.skillCapture.status, "skipped_no_high_value");
    assert(state.skillCapture.skippedReasons.length > 0);
    assert(stateMd.includes("status：skipped_no_high_value"));
    assert(lines.some((line) => line.includes("skipped_no_high_value")));
  });
});

test("captureSkills writes skills, index, and state capture status in yes mode", async () => {
  await withTempCwd(async () => {
    createSession("demo", {
      requirements: [{
        id: "REQ-1",
        status: "passed",
        summary: "FastCar Koa Controller 迁移到 TypeScript",
        evidence: "使用 @fastcar/koa/annotation 的 @GET() 写法并新增真实 CLI 验证",
      }],
      validation: {
        commands: [{
          command: "node bin/cli.js --help",
          result: "passed",
          summary: "CLI smoke test passed",
        }],
      },
      deliveryEvidence: {
        changedFiles: ["src/controllers/item.ts"],
      },
    });

    const { lines } = await captureConsole(() => captureSkills("demo", { yes: true }));
    const state = readJson(".agent-state/auto-iterate/demo/state.json");
    const stateMd = fs.readFileSync(".agent-state/auto-iterate/demo/state.md", "utf8");

    assert.strictEqual(state.skillCapture.status, "captured");
    assert(fs.existsSync(".agents/skills/fastcar-framework/SKILL.md"));
    assert(fs.existsSync(".agents/skills/captured-demo/SKILL.md"));
    assert(fs.existsSync(".agents/skills/index.md"));
    assert(state.skillCapture.capturedFiles.includes(".agents/skills/index.md"));
    assert(stateMd.includes("status：captured"));
    assert(lines.some((line) => line.includes("技能沉淀完成")));
  });
});

test("updateSkillsIndexFile appends missing entries to existing Chinese index table", async () => {
  await withTempCwd(async () => {
    fs.mkdirSync(".agents/skills", { recursive: true });
    fs.writeFileSync(".agents/skills/index.md", [
      "# Skills 索引",
      "",
      "| 技能名称 | 标题 | 关键触发场景 | 来源 Session |",
      "|----------|------|-------------|-------------|",
      "| existing | Existing | old | demo |",
      "",
      "tail",
    ].join("\n"));

    const result = await updateSkillsIndexFile(".agents/skills", [{
      name: "captured-demo",
      title: "Demo",
      description: "",
      scenarios: ["FastCar Controller"],
      approaches: [],
      verifications: [],
      pitfalls: [],
      sourceRequirements: [],
      sourceDecisions: [],
      session: "demo",
    }], { code: "zh" });

    assert.strictEqual(result.changed, true);
    assert(result.content.includes("| captured-demo | Demo | FastCar Controller | demo |"));
    assert(result.content.includes("\ntail"));
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
