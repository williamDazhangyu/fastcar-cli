/**
 * 技能/测试膨胀检查 — Bloat Check
 *
 * 用于 --validate-state --strict-state、--finalize 和 --check-bloat 命令。
 * 检查规则来源于 skills/auto-iterate-coding 文档中定义的 Skill Maintenance 和 Test Hygiene 约束。
 */
import * as fs from "fs";
import * as path from "path";

// ── 类型 ──────────────────────────────────────────────

export interface BloatIssue {
  /** 检查项标识，如 "skill_dir_count"、"test_src_ratio" */
  rule: string;
  /** "error" | "warn" */
  severity: "error" | "warn";
  /** 人类可读描述 */
  message: string;
}

export interface SkillBloatResult {
  /** 技能独立目录数 */
  dirCount: number;
  /** 根下单文件技能数 */
  rootFileCount: number;
  /** 总文件数（递归） */
  totalFiles: number;
  /** 总大小（字节） */
  totalBytes: number;
  /** 违规项 */
  issues: BloatIssue[];
}

export interface TestBloatResult {
  /** test/ 总行数 */
  testLines: number;
  /** src/ 总行数 */
  srcLines: number;
  /** test/src 百分比 */
  ratio: number;
  /** 违规项 */
  issues: BloatIssue[];
}

export interface BloatReport {
  skill: SkillBloatResult;
  test: TestBloatResult;
  /** 合并后的所有 issue */
  issues: BloatIssue[];
  /** 是否有 error 级别 issue */
  hasErrors: boolean;
}

export interface BloatBaseline {
  testLines: number;
  srcLines: number;
  testSrcRatio: number;
  skillDirCount: number;
  skillRootFileCount: number;
  skillTotalFiles: number;
  skillTotalBytes: number;
  capturedAt: string;
}

// ── 常量 ──────────────────────────────────────────────

const SKILL_DIR_MAX = 10;
const SKILL_ROOTFILE_MAX = 5;
const SKILL_TOTALFILES_MAX = 15;
const SKILL_TOTALBYTES_MAX = 200 * 1024;
const TEST_SRC_RATIO_MAX = 0.5;

const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".agent-state", ".git", ".agents"]);

// ── 工具函数 ──────────────────────────────────────────

function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

function walkDir(
  dir: string,
  onFile: (filePath: string) => void,
  onDir?: (dirPath: string) => void,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const baseName = path.basename(full);
      if (EXCLUDED_DIRS.has(baseName)) continue;
      if (baseName.startsWith(".")) continue;
      onDir?.(full);
      walkDir(full, onFile, onDir);
    } else if (entry.isFile()) {
      onFile(full);
    }
  }
}

function countFilesRecursive(dir: string): number {
  let count = 0;
  walkDir(dir, () => { count++; });
  return count;
}

function totalBytesRecursive(dir: string): number {
  let bytes = 0;
  walkDir(dir, (filePath) => {
    try { bytes += fs.statSync(filePath).size; } catch { /* skip */ }
  });
  return bytes;
}

function countLinesRecursive(dir: string): number {
  let lines = 0;
  walkDir(dir, (filePath) => {
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) {
      lines += countLines(filePath);
    }
  });
  return lines;
}

// ── 技能膨胀检查 ──────────────────────────────────────

export function checkSkillBloat(projectDir: string): SkillBloatResult {
  const skillsDir = path.join(projectDir, ".agents", "skills");
  const issues: BloatIssue[] = [];
  let dirCount = 0;
  let rootFileCount = 0;

  // 读 .agents/skills 根目录
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    // skills 目录不存在，无膨胀
    return { dirCount: 0, rootFileCount: 0, totalFiles: 0, totalBytes: 0, issues: [] };
  }

  for (const entry of entries) {
    const full = path.join(skillsDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "archive") continue;
      // 检测是否为独立 skill 目录（有 SKILL.md）
      try {
        const skillMd = path.join(full, "SKILL.md");
        if (fs.statSync(skillMd).isFile()) {
          dirCount++;
        }
      } catch {
        // 无 SKILL.md 不计入
      }
    } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md" && entry.name !== "SKILL.md") {
      rootFileCount++;
    }
  }

  if (dirCount > SKILL_DIR_MAX) {
    issues.push({
      rule: "skill_dir_count",
      severity: "error",
      message: `技能目录超限 (${dirCount} > ${SKILL_DIR_MAX})，请合并或归档多余 skill`,
    });
  }
  if (rootFileCount > SKILL_ROOTFILE_MAX) {
    issues.push({
      rule: "skill_rootfile_count",
      severity: "error",
      message: `根下单文件技能超限 (${rootFileCount} > ${SKILL_ROOTFILE_MAX})，请合并或转为独立 skill 目录`,
    });
  }

  const totalFiles = countFilesRecursive(skillsDir);
  if (totalFiles > SKILL_TOTALFILES_MAX) {
    issues.push({
      rule: "skill_total_files",
      severity: "warn",
      message: `技能总文件数偏大 (${totalFiles} > ${SKILL_TOTALFILES_MAX})，建议手动整理`,
    });
  }

  const totalBytes = totalBytesRecursive(skillsDir);
  if (totalBytes > SKILL_TOTALBYTES_MAX) {
    const kb = Math.round(totalBytes / 1024);
    const maxKb = Math.round(SKILL_TOTALBYTES_MAX / 1024);
    issues.push({
      rule: "skill_total_size",
      severity: "warn",
      message: `技能总大小偏大 (${kb}KB > ${maxKb}KB)，建议手动整理`,
    });
  }

  return { dirCount, rootFileCount, totalFiles, totalBytes, issues };
}

// ── 测试膨胀检查 ──────────────────────────────────────

export function checkTestBloat(projectDir: string): TestBloatResult {
  const issues: BloatIssue[] = [];
  const testDir = path.join(projectDir, "test");
  const srcDir = path.join(projectDir, "src");

  const testLines = countLinesRecursive(testDir);
  const srcLines = countLinesRecursive(srcDir);
  const ratio = srcLines > 0 ? testLines / srcLines : 0;

  if (ratio > TEST_SRC_RATIO_MAX) {
    const pct = Math.round(ratio * 1000) / 10;
    const maxPct = Math.round(TEST_SRC_RATIO_MAX * 100);
    issues.push({
      rule: "test_src_ratio",
      severity: "error",
      message: `测试占比超限 (${pct}% > ${maxPct}%)，test ${testLines} 行 / src ${srcLines} 行，请删除或合并冗余测试`,
    });
  }

  return { testLines, srcLines, ratio, issues };
}

// ── 汇总报告 ──────────────────────────────────────────

export function buildBloatReport(projectDir: string): BloatReport {
  const skill = checkSkillBloat(projectDir);
  const test = checkTestBloat(projectDir);
  const allIssues = [...skill.issues, ...test.issues];
  const hasErrors = allIssues.some((i) => i.severity === "error");

  return { skill, test, issues: allIssues, hasErrors };
}

export function captureBloatBaseline(projectDir: string, capturedAt: string = new Date().toISOString()): BloatBaseline {
  const report = buildBloatReport(projectDir);
  return {
    testLines: report.test.testLines,
    srcLines: report.test.srcLines,
    testSrcRatio: report.test.ratio,
    skillDirCount: report.skill.dirCount,
    skillRootFileCount: report.skill.rootFileCount,
    skillTotalFiles: report.skill.totalFiles,
    skillTotalBytes: report.skill.totalBytes,
    capturedAt,
  };
}

function isBloatBaseline(value: unknown): value is BloatBaseline {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const baseline = value as Record<string, unknown>;
  return [
    "testLines",
    "srcLines",
    "testSrcRatio",
    "skillDirCount",
    "skillRootFileCount",
    "skillTotalFiles",
    "skillTotalBytes",
  ].every((key) => typeof baseline[key] === "number");
}

function pushIncrementalIssue(
  issues: BloatIssue[],
  issue: BloatIssue,
  worsened: boolean,
): void {
  issues.push({
    rule: issue.rule,
    severity: worsened ? "error" : "warn",
    message: worsened
      ? `本次新增膨胀阻断：${issue.message}`
      : `历史膨胀债务未恶化：${issue.message}`,
  });
}

export function buildIncrementalBloatIssues(
  report: BloatReport,
  baseline: unknown,
): BloatIssue[] {
  if (report.issues.length === 0) {
    return [];
  }
  if (!isBloatBaseline(baseline)) {
    return [{
      rule: "bloat_baseline_missing",
      severity: "warn",
      message: "缺少 bloatBaseline，无法判断本次是否新增膨胀；当前膨胀只作为历史债务 warning",
    }];
  }

  const issues: BloatIssue[] = [];
  for (const issue of report.issues) {
    if (issue.rule === "test_src_ratio") {
      const worsened = report.test.testLines > baseline.testLines ||
        report.test.ratio > baseline.testSrcRatio;
      pushIncrementalIssue(issues, issue, worsened);
      continue;
    }
    if (issue.rule === "skill_dir_count") {
      pushIncrementalIssue(issues, issue, report.skill.dirCount > baseline.skillDirCount);
      continue;
    }
    if (issue.rule === "skill_rootfile_count") {
      pushIncrementalIssue(issues, issue, report.skill.rootFileCount > baseline.skillRootFileCount);
      continue;
    }
    if (issue.rule === "skill_total_files") {
      pushIncrementalIssue(issues, issue, report.skill.totalFiles > baseline.skillTotalFiles);
      continue;
    }
    if (issue.rule === "skill_total_size") {
      pushIncrementalIssue(issues, issue, report.skill.totalBytes > baseline.skillTotalBytes);
      continue;
    }
    issues.push(issue);
  }
  return issues;
}

// ── 人类可读报告渲染 ──────────────────────────────────

export function renderBloatReport(report: BloatReport): string {
  const lines: string[] = [];

  const { skill, test } = report;

  const skillKb = Math.round(skill.totalBytes / 1024);
  lines.push(`Skills: ${skill.dirCount} 目录 / ${skill.rootFileCount} 单文件 / ${skill.totalFiles} 总文件 / ${skillKb}KB`);
  for (const issue of skill.issues) {
    const mark = issue.severity === "error" ? "❌" : "⚠";
    lines.push(`  ${mark} ${issue.message}`);
  }
  if (skill.issues.length === 0) {
    lines.push("  ✅ 正常");
  }

  const pct = Math.round(test.ratio * 1000) / 10;
  lines.push(`Tests:  ${test.testLines} 行 / src ${test.srcLines} 行 = ${pct}%`);
  for (const issue of test.issues) {
    const mark = issue.severity === "error" ? "❌" : "⚠";
    lines.push(`  ${mark} ${issue.message}`);
  }
  if (test.issues.length === 0) {
    lines.push("  ✅ 正常");
  }

  if (report.hasErrors) {
    lines.push(`\n❌ ${report.issues.filter((i) => i.severity === "error").length} 个错误阻断交付`);
  }

  return lines.join("\n");
}
