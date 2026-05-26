const CJK_PATTERN = /[\u3400-\u9fff]/g;
const LATIN_WORD_PATTERN = /\b[A-Za-z][A-Za-z0-9_-]*\b/g;

function countMatches(value, pattern) {
  const matches = String(value || "").match(pattern);
  return matches ? matches.length : 0;
}

function normalizeLanguageCode(value) {
  const code = String(value || "").trim().toLowerCase();
  if (code === "zh" || code === "zh-cn" || code === "chinese") {
    return "zh";
  }
  if (code === "en" || code === "en-us" || code === "english") {
    return "en";
  }
  return null;
}

function inferLanguageFromText(value, fallback = "zh") {
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

function inferLanguageFromAnswers(answers = {}) {
  const primary = inferLanguageFromText([answers.goal, answers.sourceChecklist], "zh");
  if (primary.source === "text") {
    return primary;
  }
  const secondary = inferLanguageFromText([
    answers.successCriteria,
    answers.nonGoals,
    answers.allowedScope,
    answers.compatibility,
    answers.constraints,
    answers.deliveryFormat,
  ], "zh");
  return secondary;
}

function inferLanguageFromState(state = {}) {
  if (state.language && normalizeLanguageCode(state.language.code)) {
    return {
      code: normalizeLanguageCode(state.language.code),
      source: state.language.source || "state",
      confidence: state.language.confidence || "high",
    };
  }
  return inferLanguageFromText([
    state.task && state.task.goal,
    state.sourceChecklist && state.sourceChecklist.content,
  ], "zh");
}

function languageCode(value) {
  if (typeof value === "string") {
    return normalizeLanguageCode(value) || "zh";
  }
  if (value && typeof value === "object") {
    return normalizeLanguageCode(value.code) || "zh";
  }
  return "zh";
}

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
    stateSnapshotNotice: (file) => `> 本节由 fastcar-cli auto-iterate --run 从 ${file} 派生刷新；机器权威仍是 state.json。`,
    noRequirements: "- 无",
    skillSections: {
      scenarios: "触发场景",
      approaches: "可靠做法",
      verifications: "验证方式",
      pitfalls: "常见误区",
      source: "来源",
    },
    skillAutoDescription: (session) => `从自动迭代 session ${session || "unknown"} 自动捕获的实战技能点`,
    generatedByCapture: "> 本文件由 fastcar-cli auto-iterate --capture-skills 自动生成。",
    generatedAt: (time) => `> 生成时间: ${time}`,
    reviewSkill: "> 请根据实际情况审查和完善内容。",
    skillsIndexTitle: "# Skills 索引",
    skillsIndexNotice: (time) => `> 本索引由 fastcar-cli auto-iterate --capture-skills 自动维护。\n> 最后更新: ${time}`,
    capturedSkillsHeading: "## 已捕获技能",
    skillsIndexHeader: "| 技能名称 | 标题 | 关键触发场景 | 来源 Session |",
    skillsIndexUsage: "## 使用说明\n\n每个技能目录包含一个 `SKILL.md` 文件，AI Agent 在相关任务中会自动加载。\n技能点来自自动迭代 session 的实战经验，包括真实失败信号、调试路径、验证策略等。",
    capturedSummary: (time, count, names) => `自动捕获于 ${time}：共沉淀 ${count} 个技能 (${names})`,
    noHighValueReason: "自动分析未发现足够结构化的技能点；session 中的 RCM/Decisions/Validation 数据不足以提取高价值技能。",
    noHighValueSummary: (time) => `自动捕获于 ${time}：未发现高价值技能候选`,
    userSkippedSkillCapture: "用户手动选择跳过技能沉淀。",
    userSkippedSkillCaptureSummary: (time) => `自动捕获于 ${time}：用户选择跳过`,
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
    stateSnapshotNotice: (file) => `> This section is refreshed by fastcar-cli auto-iterate --run from ${file}; state.json remains the machine source of truth.`,
    noRequirements: "- none",
    skillSections: {
      scenarios: "Trigger Scenarios",
      approaches: "Reliable Approach",
      verifications: "Verification",
      pitfalls: "Common Pitfalls",
      source: "Source",
    },
    skillAutoDescription: (session) => `Practical skill notes captured from auto-iterate session ${session || "unknown"}`,
    generatedByCapture: "> Generated by fastcar-cli auto-iterate --capture-skills.",
    generatedAt: (time) => `> Generated at: ${time}`,
    reviewSkill: "> Review and refine this content for real project use.",
    skillsIndexTitle: "# Skills Index",
    skillsIndexNotice: (time) => `> This index is maintained by fastcar-cli auto-iterate --capture-skills.\n> Last updated: ${time}`,
    capturedSkillsHeading: "## Captured Skills",
    skillsIndexHeader: "| Skill | Title | Key Trigger Scenarios | Source Session |",
    skillsIndexUsage: "## Usage\n\nEach skill directory contains a `SKILL.md` file that AI agents can load for related tasks.\nCaptured skills come from auto-iterate session experience, including real failure signals, debugging paths, and validation strategies.",
    capturedSummary: (time, count, names) => `Captured at ${time}: ${count} skill(s) (${names})`,
    noHighValueReason: "Automatic analysis did not find enough structured high-value skill notes; the session RCM/Decisions/Validation data is insufficient.",
    noHighValueSummary: (time) => `Captured at ${time}: no high-value skill candidates found`,
    userSkippedSkillCapture: "The user chose to skip skill capture.",
    userSkippedSkillCaptureSummary: (time) => `Captured at ${time}: user skipped skill capture`,
  },
};

function getLanguageText(value) {
  return TEXT[languageCode(value)] || TEXT.zh;
}

function localizedStatusLabel(status, value) {
  const code = languageCode(value);
  if (code !== "zh") {
    return status || "unknown";
  }
  const labels = {
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
  return labels[status] || status || "unknown";
}

module.exports = {
  inferLanguageFromAnswers,
  inferLanguageFromState,
  inferLanguageFromText,
  languageCode,
  getLanguageText,
  localizedStatusLabel,
  normalizeLanguageCode,
};
