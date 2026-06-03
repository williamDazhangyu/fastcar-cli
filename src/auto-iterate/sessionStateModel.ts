import { isImplementationMode } from "./modeRules";
import {
  DEFAULT_DELIVERY_FORMAT,
  normalizeLines,
  withModeDefaults,
} from "./sessionConfig";
import {
  ENGINE_PHASES,
  defaultPhaseBlockingRules,
  defaultPhaseEntryCriteria,
  defaultPhaseExitCriteria,
} from "./stateValidationHelpers";
import { getLanguageText, languageCode } from "../pipeline/language";

export const STATE_SCHEMA_VERSION = 1;

type StateObject = Record<string, any>;

export function buildStateModel(rawAnswers: StateObject): StateObject {
  const answers = withModeDefaults(rawAnswers);
  const remainingImplementationIterations = answers.autopilot
    ? answers.autopilotMaxIterations
    : answers.maxIterations;
  const remainingOptimizationIterations = answers.mode === "optimize"
    ? answers.maxIterations
    : null;
  const minimumValidationHardeningIterations = answers.mode === "strict" ? 2 : 1;

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    generatedFileNotice: getLanguageText(answers.language).generatedFileNotice,
    language: {
      code: languageCode(answers.language),
      source: answers.language.source || "inferred",
      confidence: answers.language.confidence || "medium",
    },
    task: {
      goal: answers.goal || "未指定",
      successCriteria: normalizeLines(answers.successCriteria),
      nonGoals: normalizeLines(answers.nonGoals),
      allowedScope: answers.allowedScope || "未指定",
      compatibility: normalizeLines(answers.compatibility),
    },
    session: {
      session: answers.session || "default",
      stateJsonFile: answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json",
      stateFile: answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md",
      promptFile: answers.sessionPromptFile || ".agent-state/auto-iterate/default/start-prompt.md",
      currentFile: answers.currentFile || ".agent-state/auto-iterate-current.json",
    },
    mode: {
      mode: answers.mode,
      label: answers.modeLabel,
      description: answers.modeDescription,
      autopilot: answers.autopilot,
      runtimeAutopilot: answers.autopilot,
      loopShape: answers.autopilot ? "autopilot" : answers.mode === "plan" ? "plan_once" : "default",
      executionMode: answers.executionMode,
      allowAgentInference: Boolean(answers.allowAgentInference),
      allowModify: answers.allowModify !== false,
      instructions: answers.modeInstructions,
    },
    budgets: {
      maxIterations: answers.maxIterations,
      autopilotMaxIterations: answers.autopilotMaxIterations,
      minimumImplementationIterations: null,
      implementationIterationsUsed: 0,
      nonImplementationIterationsUsed: 0,
      validationHardeningIterationsUsed: 0,
      minimumValidationHardeningIterations,
      optimizationIterationsUsed: 0,
      totalCycles: 0,
      remainingImplementationIterations,
      remainingValidationHardeningIterations: minimumValidationHardeningIterations,
      remainingOptimizationIterations,
    },
    currentState: {
      currentPhase: answers.currentPhase,
      currentTask: answers.currentTask,
      nextAction: answers.nextAction,
      overallStatus: "in_progress",
      recentChanges: "无",
      keyFiles: "未探索",
      lastValidationCommand: "未运行",
      lastValidationResult: "未运行",
    },
    watchdog: {
      enabled: true,
      stateDrift: "none",
      deliveryVerifiability: "unknown",
      triggered: false,
      requiredAction: "continue",
      freshEyesRequired: false,
      validationHardeningStatus: "pending",
      validationHardeningDimensionsDone: [],
      newTestCount: 0,
    },
    phaseGate: {
      currentPhase: "requirement",
      canProceed: false,
      blockingReasons: ["REQ-BOOTSTRAP pending；尚未生成完整 Requirement Coverage Matrix 和 Implementation Contract"],
      gates: ENGINE_PHASES.map((phase) => ({
        phase,
        entryCriteria: defaultPhaseEntryCriteria(phase),
        exitCriteria: defaultPhaseExitCriteria(phase),
        blockingRules: defaultPhaseBlockingRules(phase),
        status: phase === "requirement" ? "pending" : "blocked",
      })),
    },
    implementationContract: {
      status: "pending",
      goal: answers.goal || "未指定",
      understanding: "待 Agent 从原始清单、当前代码和用户约束中确认",
      scope: answers.allowedScope || "未指定",
      nonGoals: normalizeLines(answers.nonGoals).join("；") || "未指定",
      successCriteria: normalizeLines(answers.successCriteria).join("；") || "未指定",
      validationPlan: normalizeLines(answers.validationCommands).join("；") || "未指定",
      riskPoints: "状态门禁、baseline、cleanup、delivery 证据和 CLI strict 校验必须保持一致",
      openQuestions: [],
      userConfirmationRequired: false,
    },
    baseline: {
      status: "pending",
      command: normalizeLines(answers.validationCommands)[0] || "not_run",
      result: null,
      reason: "尚未由 Agent 建立修改前 baseline",
      failureCategory: "unknown",
      allowsCoding: false,
    },
    iterationPolicy: {
      currentIterationGoal: "提取完整 RCM 并补齐门禁实体",
      maxGoalsPerIteration: 1,
      maxChangedFiles: 8,
      maxDiffLines: 800,
      maxNoProgressIterations: 3,
      consecutiveFailureCount: 0,
      allowedFiles: [],
      stopConditions: [
        "连续失败达到阈值",
        "验证结果恶化",
        "修改范围超出 Implementation Contract",
        "finalVerifiability 无法判定",
      ],
      rollbackPlan: [
        "仅回滚本轮 Agent 自己的修改",
        "无法安全回滚时记录风险并停止或 ask_user",
      ],
      lastDecision: "continue",
    },
    taskProfile: {
      type: answers.mode === "verify" ? "verify" : answers.mode === "optimize" ? "optimize" : answers.mode === "prototype" ? "prototype" : "unknown",
      complexity: answers.mode === "strict" ? "large" : "medium",
      risk: answers.mode === "strict" ? "high" : "medium",
      needsUserConfirmation: answers.mode === "strict",
      reasons: [
        "严格模式默认按复杂/高风险处理",
        "复杂度分级只能调节流程强度，不能绕过 Hard Gate",
      ],
    },
    decisionRequest: {
      status: answers.mode === "strict" ? "approved" : "not_needed",
      topic: answers.mode === "strict" ? "严格模式高风险任务确认" : "无",
      background: answers.mode === "strict" ? "用户已通过 CLI 参数确认 strict/autopilot session 和文档来源" : "当前任务不需要额外用户确认",
      options: answers.mode === "strict" ? ["继续 strict/autopilot", "降级为 plan-only", "停止"] : [],
      recommended: answers.mode === "strict" ? "继续 strict/autopilot" : "not_needed",
      impact: answers.mode === "strict" ? "允许 Agent 在限定范围内继续实现，但仍不得绕过 Hard Gate" : "无",
      triggers: answers.mode === "strict" ? ["complexity=large", "risk=high"] : [],
    },
    requirements: [
      {
        id: "REQ-BOOTSTRAP",
        summary: "启动后必须先从用户目标、成功标准、原始清单文档和当前模式提取完整 Requirement Coverage Matrix",
        type: "验证",
        status: "pending",
        relatedFiles: [answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"],
        evidence: "无",
        blockedReason: "无",
        nextStep: "读取原始清单和当前代码，拆分 REQ-001...REQ-N，并在实现或验证前更新本矩阵",
      },
    ],
    decisions: {
      compatibility: normalizeLines(answers.compatibility),
      constraints: normalizeLines(answers.constraints),
      parallelWriteAllowed: false,
      parallelWriteConfirmation: "禁止并发 coder 写入；每轮只允许一个 coder",
      coderFileOwnership: "由主 Agent 每轮按 focus 分配",
      fallbackStrategy: "无 coder 能力时进入 protocol-only / need_decision，不得静默切换",
    },
    traceability: {
      policy: "只记录公开可审计推理摘要；不得记录私有思考链。",
      iterations: [],
    },
    documentation: {
      apiChanges: [],
      architectureNotes: [],
      implementationNotes: [],
      changelogEntries: [],
    },
    notes: [],
    diagnose: {
      hypotheses: [],
    },
    validation: {
      passed: [],
      failed: [],
      notRunReason: "尚未开始",
      finalVerifiability: "unknown",
      commands: normalizeLines(answers.validationCommands),
    },
    postChange: {
      status: "not_run",
      command: normalizeLines(answers.validationCommands)[0] || "not_run",
      result: null,
      reason: "尚未执行修改后验证",
      regressionDetected: false,
      perCommand: [],
    },
    deltaAssessment: {
      status: "pending",
      summary: "尚未比较 baseline 与 post-change",
      baselineRef: "baseline",
      postChangeRef: "postChange",
      decision: "keep",
    },
    diffBudget: {
      status: "not_checked",
      changedFiles: 0,
      diffLines: 0,
      outOfScopeFiles: [],
      highRiskFiles: [],
      reason: "尚未检查 git diff",
    },
    cleanup: {
      status: "pending",
      artifactsToDelete: "无",
      prototypeFiles: answers.mode === "prototype" ? "待创建并明确标记" : "无",
    },
    styleConsolidation: {
      status: isImplementationMode(answers.mode) ? "pending" : "not_applicable",
      trigger: "功能实现并通过验证后、Delivery Evidence ready 前",
      localSkillsReviewed: [],
      globalSkillsReviewed: [],
      appliedRules: [],
      changedFiles: [],
      scope: answers.mode === "optimize" || answers.mode === "verify" || answers.mode === "plan"
        ? "非实现模式默认不要求整理"
        : "仅整理本次需求相关代码，不扩大行为范围",
      summary: "尚未按本地和全局 skills 的代码风格整理",
      verificationSummary: "未运行",
      skippedReasons: isImplementationMode(answers.mode) ? [] : ["当前模式不是实现需求模式"],
      lastRunSummary: "尚未执行技巧风格整理",
    },
    contextResetReview: {
      status: "pending",
      trigger: "所有关键 REQ passed 后、Delivery Evidence ready 前",
      reviewCyclesUsed: 0,
      maxReviewCycles: 1,
      sourceOfTruth: "state.json、原始需求、当前代码/diff、真实验证结果、项目规范和相关 skills；不得依赖历史对话记忆",
      standardsFindings: [],
      specFindings: [],
      decision: "not_run",
      reopenedRequirements: [],
      lastRunSummary: "尚未执行上下文清空复核",
    },
    deliveryEvidence: {
      status: "pending",
      goal: answers.goal || "未指定",
      changes: "尚未交付",
      changedFiles: [],
      validationSummary: "未运行",
      baselineComparison: "未建立 baseline",
      cleanupSummary: "pending",
      risks: "交付前必须通过 postAgentValidationGate",
      unfinishedItems: "REQ-BOOTSTRAP pending",
      userConfirmation: "无",
    },
    skillCapture: {
      status: "pending",
      root: ".agents/skills",
      indexFile: ".agents/skills/index.md",
      capturedFiles: [],
      pendingCandidates: [],
      skippedReasons: [],
      selectionCriteria: "只沉淀可复用、可验证、跨任务有价值的技能点；不要记录密钥、客户数据、一次性日志或完整源码",
      lastRunSummary: "尚未执行任务后技能沉淀",
    },
    deliveryDocs: {
      status: "pending",
      path: `.agent-state/auto-iterate/${answers.session || "default"}/docs`,
      files: [
        `.agent-state/auto-iterate/${answers.session || "default"}/docs/api.md`,
        `.agent-state/auto-iterate/${answers.session || "default"}/docs/changelog.md`,
        `.agent-state/auto-iterate/${answers.session || "default"}/docs/architecture.md`,
        `.agent-state/auto-iterate/${answers.session || "default"}/docs/implementation.md`,
      ],
      generatedAt: null,
    },
    postAgentValidationGate: {
      enabled: true,
      command: `fastcar-cli auto-iterate --finalize ${answers.session || "default"} --yes`,
      lastResult: "not_run",
      repairCyclesUsed: 0,
      maxRepairCycles: 5,
      failureSummary: [],
      nextAction: "context_reset_and_repair",
    },
    sourceChecklist: answers.sourceChecklist
      ? {
          path: answers.sourceChecklistPath,
          content: answers.sourceChecklist,
        }
      : null,
    deliveryFormat: answers.deliveryFormat || DEFAULT_DELIVERY_FORMAT,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
