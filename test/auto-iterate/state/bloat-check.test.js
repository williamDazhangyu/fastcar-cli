const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  checkSkillBloat,
  checkTestBloat,
  buildBloatReport,
  buildIncrementalBloatIssues,
  captureBloatBaseline,
  renderBloatReport,
} = require("../../../dist/auto-iterate/bloatCheck");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bloat-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Skill Bloat ──────────────────────────────────────

test("checkSkillBloat 无 .agents/skills 目录返回空", () => {
  withTempDir((dir) => {
    const result = checkSkillBloat(dir);
    assert.strictEqual(result.dirCount, 0);
    assert.strictEqual(result.rootFileCount, 0);
    assert.strictEqual(result.totalFiles, 0);
    assert.strictEqual(result.totalBytes, 0);
    assert.strictEqual(result.issues.length, 0);
  });
});

test("checkSkillBloat 目录数 ≤10 正常", () => {
  withTempDir((dir) => {
    const skillsDir = path.join(dir, ".agents", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    for (let i = 1; i <= 5; i++) {
      const skillDir = path.join(skillsDir, `skill-${i}`);
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Skill");
    }
    const result = checkSkillBloat(dir);
    assert.strictEqual(result.dirCount, 5);
    assert.strictEqual(result.issues.length, 0);
  });
});

test("checkSkillBloat 目录数 >10 报 error", () => {
  withTempDir((dir) => {
    const skillsDir = path.join(dir, ".agents", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    for (let i = 1; i <= 12; i++) {
      const skillDir = path.join(skillsDir, `skill-${i}`);
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Skill");
    }
    const result = checkSkillBloat(dir);
    assert.strictEqual(result.dirCount, 12);
    assert.ok(result.issues.some((i) => i.rule === "skill_dir_count" && i.severity === "error"));
  });
});

test("checkSkillBloat 根单文件技能 >5 报 error", () => {
  withTempDir((dir) => {
    const skillsDir = path.join(dir, ".agents", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    for (let i = 1; i <= 7; i++) {
      fs.writeFileSync(path.join(skillsDir, `item-${i}.md`), "# Item");
    }
    const result = checkSkillBloat(dir);
    assert.strictEqual(result.rootFileCount, 7);
    assert.ok(result.issues.some((i) => i.rule === "skill_rootfile_count" && i.severity === "error"));
  });
});

test("checkSkillBloat 总文件 >15 报 warn", () => {
  withTempDir((dir) => {
    const skillsDir = path.join(dir, ".agents", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    for (let i = 1; i <= 20; i++) {
      fs.writeFileSync(path.join(skillsDir, `file-${i}.md`), "# file");
    }
    const result = checkSkillBloat(dir);
    assert.ok(result.totalFiles >= 20);
    assert.ok(result.issues.some((i) => i.rule === "skill_total_files" && i.severity === "warn"));
  });
});

test("checkSkillBloat 忽略 archive 目录", () => {
  withTempDir((dir) => {
    const skillsDir = path.join(dir, ".agents", "skills");
    fs.mkdirSync(path.join(skillsDir, "archive"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "archive", "SKILL.md"), "# Old");
    const result = checkSkillBloat(dir);
    assert.strictEqual(result.dirCount, 0);
  });
});

// ── Test Bloat ───────────────────────────────────────

test("checkTestBloat 无 test 目录返回 0", () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "index.ts"), "export const x = 1;\n");
    const result = checkTestBloat(dir);
    assert.strictEqual(result.testLines, 0);
    assert.strictEqual(result.ratio, 0);
    assert.strictEqual(result.issues.length, 0);
  });
});

test("checkTestBloat 占比 >50% 报 error", () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.mkdirSync(path.join(dir, "test"), { recursive: true });
    // 1 line in src, 1 line in test = 100%
    fs.writeFileSync(path.join(dir, "src", "index.ts"), "a\n");
    fs.writeFileSync(path.join(dir, "test", "test.ts"), "b\n");
    const result = checkTestBloat(dir);
    assert.ok(result.ratio > 0.5, `expected ratio > 0.5, got ${result.ratio}`);
    assert.ok(result.issues.some((i) => i.rule === "test_src_ratio"));
  });
});

test("checkTestBloat 占比 ≤50% 正常", () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.mkdirSync(path.join(dir, "test"), { recursive: true });
    // 3 lines src, 1 line test = 33%
    fs.writeFileSync(path.join(dir, "src", "a.ts"), "a\nb\nc\n");
    fs.writeFileSync(path.join(dir, "test", "a.test.ts"), "t\n");
    const result = checkTestBloat(dir);
    assert.ok(result.ratio <= 0.5, `expected ratio <= 0.5, got ${result.ratio}`);
    assert.strictEqual(result.issues.length, 0);
  });
});

// ── Build & Render ───────────────────────────────────

test("buildBloatReport 合并 skill 和 test 结果", () => {
  withTempDir((dir) => {
    const report = buildBloatReport(dir);
    assert.ok(report.skill);
    assert.ok(report.test);
    assert.ok(Array.isArray(report.issues));
    assert.strictEqual(typeof report.hasErrors, "boolean");
  });
});

test("captureBloatBaseline 记录当前膨胀基线", () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.mkdirSync(path.join(dir, "test"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "index.ts"), "a\nb\nc\n");
    fs.writeFileSync(path.join(dir, "test", "index.test.ts"), "t\n");

    const baseline = captureBloatBaseline(dir, "2026-01-01T00:00:00.000Z");

    assert.strictEqual(baseline.testLines, 2);
    assert.strictEqual(baseline.srcLines, 4);
    assert.strictEqual(baseline.skillDirCount, 0);
    assert.strictEqual(baseline.capturedAt, "2026-01-01T00:00:00.000Z");
  });
});

test("buildIncrementalBloatIssues 将历史超标且未恶化降级为 warning", () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.mkdirSync(path.join(dir, "test"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "index.ts"), "a\n");
    fs.writeFileSync(path.join(dir, "test", "index.test.ts"), "t\n");
    const report = buildBloatReport(dir);
    const baseline = {
      testLines: report.test.testLines,
      srcLines: report.test.srcLines,
      testSrcRatio: report.test.ratio,
      skillDirCount: report.skill.dirCount,
      skillRootFileCount: report.skill.rootFileCount,
      skillTotalFiles: report.skill.totalFiles,
      skillTotalBytes: report.skill.totalBytes,
      capturedAt: "2026-01-01T00:00:00.000Z",
    };

    const issues = buildIncrementalBloatIssues(report, baseline);

    assert.ok(issues.some((i) => i.rule === "test_src_ratio" && i.severity === "warn"));
    assert.ok(issues[0].message.includes("历史膨胀债务未恶化"));
  });
});

test("buildIncrementalBloatIssues 对本次新增测试膨胀报 error", () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.mkdirSync(path.join(dir, "test"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "index.ts"), "a\n");
    fs.writeFileSync(path.join(dir, "test", "index.test.ts"), "t\nu\n");
    const report = buildBloatReport(dir);
    const baseline = {
      testLines: 1,
      srcLines: report.test.srcLines,
      testSrcRatio: report.test.ratio,
      skillDirCount: report.skill.dirCount,
      skillRootFileCount: report.skill.rootFileCount,
      skillTotalFiles: report.skill.totalFiles,
      skillTotalBytes: report.skill.totalBytes,
      capturedAt: "2026-01-01T00:00:00.000Z",
    };

    const issues = buildIncrementalBloatIssues(report, baseline);

    assert.ok(issues.some((i) => i.rule === "test_src_ratio" && i.severity === "error"));
    assert.ok(issues[0].message.includes("本次新增膨胀阻断"));
  });
});

test("buildIncrementalBloatIssues 缺 baseline 时只 warning", () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.mkdirSync(path.join(dir, "test"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "index.ts"), "a\n");
    fs.writeFileSync(path.join(dir, "test", "index.test.ts"), "t\n");

    const issues = buildIncrementalBloatIssues(buildBloatReport(dir), null);

    assert.deepStrictEqual(issues.map((issue) => issue.rule), ["bloat_baseline_missing"]);
    assert.strictEqual(issues[0].severity, "warn");
  });
});

test("renderBloatReport 包含所有结果", () => {
  withTempDir((dir) => {
    const report = buildBloatReport(dir);
    const text = renderBloatReport(report);
    assert.ok(text.includes("Skills:"));
    assert.ok(text.includes("Tests:"));
  });
});

test("renderBloatReport hasErrors 时包含错误提示", () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.mkdirSync(path.join(dir, "test"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "x.ts"), "a\n");
    fs.writeFileSync(path.join(dir, "test", "x.test.ts"), "b\n");
    const report = buildBloatReport(dir);
    const text = renderBloatReport(report);
    assert.ok(text.includes("个错误阻断交付"));
  });
});

async function main() {
  const failures = [];
  for (const item of cases) {
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
  console.log(`\n${cases.length} test(s) passed.`);
}

main();
