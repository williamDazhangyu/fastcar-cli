import type {
  LanguageAnswersLike,
  LanguageCode,
  LanguageInfo,
  PipelineStateLike,
} from "./types";
import { asRecord } from "./valueUtils";

const CJK_PATTERN = /[\u3400-\u9fff]/g;
const LATIN_WORD_PATTERN = /\b[A-Za-z][A-Za-z0-9_-]*\b/g;

function countMatches(value: unknown, pattern: RegExp): number {
  const matches = String(value || "").match(pattern);
  return matches ? matches.length : 0;
}

export function normalizeLanguageCode(value: unknown): LanguageCode | null {
  const code = String(value || "").trim().toLowerCase();
  if (code === "zh" || code === "zh-cn" || code === "chinese") {
    return "zh";
  }
  if (code === "en" || code === "en-us" || code === "english") {
    return "en";
  }
  return null;
}

export function inferLanguageFromText(
  value: unknown,
  fallback: unknown = "zh",
): LanguageInfo {
  const text = Array.isArray(value) ? value.filter(Boolean).join("\n") : String(value || "");
  const cjkCount = countMatches(text, CJK_PATTERN);
  const latinCount = countMatches(text, LATIN_WORD_PATTERN);
  if (cjkCount > 0 && cjkCount >= latinCount / 2) {
    return {
      code: "zh",
      source: "text",
      confidence: cjkCount >= 3 ? "high" : "medium",
    };
  }
  if (latinCount >= 3 && cjkCount === 0) {
    return {
      code: "en",
      source: "text",
      confidence: "medium",
    };
  }
  return {
    code: normalizeLanguageCode(fallback) || "zh",
    source: "default",
    confidence: "low",
  };
}

export function inferLanguageFromAnswers(answers: LanguageAnswersLike = {}): LanguageInfo {
  const primary = inferLanguageFromText([answers.goal, answers.sourceChecklist], "zh");
  if (primary.source === "text") {
    return primary;
  }
  return inferLanguageFromText([
    answers.successCriteria,
    answers.nonGoals,
    answers.allowedScope,
    answers.compatibility,
    answers.constraints,
    answers.deliveryFormat,
  ], "zh");
}

export function inferLanguageFromState(state: PipelineStateLike = {}): LanguageInfo {
  const language = asRecord(state.language);
  const normalizedCode = normalizeLanguageCode(language.code);
  if (normalizedCode) {
    return {
      code: normalizedCode,
      source: String(language.source || "state"),
      confidence: String(language.confidence || "high"),
    };
  }
  const task = asRecord(state.task);
  const sourceChecklist = asRecord(state.sourceChecklist);
  return inferLanguageFromText([
    task.goal,
    sourceChecklist.content,
  ], "zh");
}

export function languageCode(value: unknown): LanguageCode {
  if (typeof value === "string") {
    return normalizeLanguageCode(value) || "zh";
  }
  if (value && typeof value === "object") {
    return normalizeLanguageCode((value as { code?: unknown }).code) || "zh";
  }
  return "zh";
}

const stateSnapshotNoticeZh = (file: unknown): string => `> 本节由 fastcar-cli auto-iterate 从 ${file} 派生刷新；机器权威仍是 state.json。`;
const skillAutoDescriptionZh = (session: unknown): string => `从自动迭代 session ${session || "unknown"} 自动捕获的实战技能点`;
const generatedAtZh = (time: unknown): string => `> 生成时间: ${time}`;
const skillsIndexNoticeZh = (time: unknown): string => `> 本索引由 fastcar-cli auto-iterate --capture-skills 自动维护。\n> 最后更新: ${time}`;
const capturedSummaryZh = (time: unknown, count: unknown, names: unknown): string => `自动捕获于 ${time}：共沉淀 ${count} 个技能 (${names})`;
const noHighValueSummaryZh = (time: unknown): string => `自动捕获于 ${time}：未发现高价值技能候选`;
const userSkippedSkillCaptureSummaryZh = (time: unknown): string => `自动捕获于 ${time}：用户选择跳过`;

const stateSnapshotNoticeEn = (file: unknown): string => `> This section is refreshed by fastcar-cli auto-iterate from ${file}; state.json remains the machine source of truth.`;
const skillAutoDescriptionEn = (session: unknown): string => `Practical skill notes captured from auto-iterate session ${session || "unknown"}`;
const generatedAtEn = (time: unknown): string => `> Generated at: ${time}`;
const skillsIndexNoticeEn = (time: unknown): string => `> This index is maintained by fastcar-cli auto-iterate --capture-skills.\n> Last updated: ${time}`;
const capturedSummaryEn = (time: unknown, count: unknown, names: unknown): string => `Captured at ${time}: ${count} skill(s) (${names})`;
const noHighValueSummaryEn = (time: unknown): string => `Captured at ${time}: no high-value skill candidates found`;
const userSkippedSkillCaptureSummaryEn = (time: unknown): string => `Captured at ${time}: user skipped skill capture`;

const TEXT = {
  zh: {
    generatedFileNotice: "state.json 是 auto-iterate 的机器权威状态；state.md 是给人阅读的生成视图。",
    none: "无",
    unknown: "unknown",
    notRun: "未运行",
    notStarted: "尚未开始",
    notExplored: "未探索",
    notSpecified: "未指定",
    noChanges: "无",
    noReport: "未报告",
    pipelineBaseline: "pipeline baseline",
    workerNoSummary: "Worker 未提供摘要",
    chooseNextFocus: "由 CLI 选择下一轮 focus",
    waitUserDecision: "等待用户决策后 resume",
    validationFailed: "CLI 验证失败",
    validationFailureDowngrade: "CLI 验证失败，Worker passed 已降级为 implemented",
    fixAfterValidationFailure: "修复 CLI 验证失败后重新确认 passed",
    pipelineValidation: "pipeline validation",
    optimizationFocusCompleted: "optimization focus completed",
    pipelineDecision: "pipeline decision",
    workerRequestedDecision: "Worker requested user decision",
    waitUserSelection: "等待用户选择后继续 pipeline",
    validationNotConfigured: "未配置可运行的 CLI 验证命令",
    planModeSkipped: "skipped(plan_mode)",
    stateSnapshotTitle: "## Pipeline Runtime Snapshot / CLI 运行投影",
    stateSnapshotNotice: stateSnapshotNoticeZh,
    noRequirements: "- 无",
    skillSections: {
      scenarios: "Trigger / Signal / 触发信号",
      approaches: "Do / 做法",
      verifications: "Verify / 验证",
      pitfalls: "Avoid / 避免",
      boundary: "Boundary / 适用边界",
      source: "Source Evidence / 来源证据",
    },
    skillAutoDescription: skillAutoDescriptionZh,
    generatedByCapture: "> 本文件由 fastcar-cli auto-iterate --capture-skills 自动生成。",
    generatedAt: generatedAtZh,
    reviewSkill: "> 请根据实际情况审查和完善内容。",
    skillsIndexTitle: "# Skills 索引",
    skillsIndexNotice: skillsIndexNoticeZh,
    capturedSkillsHeading: "## 已捕获技能",
    skillsIndexHeader: "| 技能名称 | 标题 | 关键触发信号 | 来源 Session |",
    skillsIndexUsage: "## 使用说明\n\n每个技能目录包含一个 `SKILL.md` 文件，AI Agent 在相关任务中会自动加载。\n技能点来自自动迭代 session 的实战经验，包括真实失败信号、调试路径、验证策略等。",
    capturedSummary: capturedSummaryZh,
    noHighValueReason: "自动分析未发现足够结构化的技能点；session 中的 RCM/Decisions/Validation 数据不足以提取高价值技能。",
    noHighValueSummary: noHighValueSummaryZh,
    userSkippedSkillCapture: "用户手动选择跳过技能沉淀。",
    userSkippedSkillCaptureSummary: userSkippedSkillCaptureSummaryZh,
  },
  en: {
    generatedFileNotice: "state.json is the machine-authoritative auto-iterate state; state.md is generated for human reading.",
    none: "none",
    unknown: "unknown",
    notRun: "not run",
    notStarted: "not started",
    notExplored: "not explored",
    notSpecified: "not specified",
    noChanges: "none",
    noReport: "not reported",
    pipelineBaseline: "pipeline baseline",
    workerNoSummary: "Worker did not provide a summary",
    chooseNextFocus: "CLI will choose the next focus",
    waitUserDecision: "wait for user decision, then resume",
    validationFailed: "CLI validation failed",
    validationFailureDowngrade: "CLI validation failed, so Worker passed was downgraded to implemented",
    fixAfterValidationFailure: "fix CLI validation failure, then confirm passed again",
    pipelineValidation: "pipeline validation",
    optimizationFocusCompleted: "optimization focus completed",
    pipelineDecision: "pipeline decision",
    workerRequestedDecision: "Worker requested a user decision",
    waitUserSelection: "wait for the user selection, then continue the pipeline",
    validationNotConfigured: "No runnable CLI validation command is configured",
    planModeSkipped: "skipped(plan_mode)",
    stateSnapshotTitle: "## Pipeline Runtime Snapshot",
    stateSnapshotNotice: stateSnapshotNoticeEn,
    noRequirements: "- none",
    skillSections: {
      scenarios: "Trigger / Signal",
      approaches: "Do",
      verifications: "Verify",
      pitfalls: "Avoid",
      boundary: "Boundary",
      source: "Source Evidence",
    },
    skillAutoDescription: skillAutoDescriptionEn,
    generatedByCapture: "> Generated by fastcar-cli auto-iterate --capture-skills.",
    generatedAt: generatedAtEn,
    reviewSkill: "> Review and refine this content for real project use.",
    skillsIndexTitle: "# Skills Index",
    skillsIndexNotice: skillsIndexNoticeEn,
    capturedSkillsHeading: "## Captured Skills",
    skillsIndexHeader: "| Skill | Title | Key Trigger Signals | Source Session |",
    skillsIndexUsage: "## Usage\n\nEach skill directory contains a `SKILL.md` file that AI agents can load for related tasks.\nCaptured skills come from auto-iterate session experience, including real failure signals, debugging paths, and validation strategies.",
    capturedSummary: capturedSummaryEn,
    noHighValueReason: "Automatic analysis did not find enough structured high-value skill notes; the session RCM/Decisions/Validation data is insufficient.",
    noHighValueSummary: noHighValueSummaryEn,
    userSkippedSkillCapture: "The user chose to skip skill capture.",
    userSkippedSkillCaptureSummary: userSkippedSkillCaptureSummaryEn,
  },
};

export type LanguageText = typeof TEXT.zh;

export function getLanguageText(value: unknown): LanguageText {
  return TEXT[languageCode(value)] || TEXT.zh;
}

export function localizedStatusLabel(status: unknown, value: unknown): string {
  const code = languageCode(value);
  if (code !== "zh") {
    return String(status || "unknown");
  }
  const labels: Record<string, string> = {
    pending: "待处理",
    implemented: "已实现待验证",
    passed: "已通过",
    blocked: "已阻塞",
    not_verified: "未验证",
    in_progress: "进行中",
    completed: "已完成",
    failed: "失败",
    skipped_with_reason: "已跳过并记录原因",
    not_run: "未运行",
    unknown: "未知",
  };
  const key = String(status || "unknown");
  return labels[key] || key;
}
