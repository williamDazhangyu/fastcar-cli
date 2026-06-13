const assert = require("assert");
const {
  validateBaselineModel,
  validateBudgetsModel,
  validateCleanupModel,
  validateContextResetReviewModel,
  validateDecisionRequestModel,
  validateDeltaAssessmentModel,
  validateDeliveryDocsModel,
  validateDeliveryEvidenceModel,
  validateDeliveryGateConsistencyModel,
  validateDiffBudgetModel,
  validateDocumentationModel,
  validateImplementationContractModel,
  validateIterationPolicyModel,
  validateLanguageModel,
  validateModeModel,
  validatePhaseGateModel,
  validatePostChangeModel,
  validatePostAgentValidationGateModel,
  validateRequirementsModel,
  validateSessionModel,
  validateSubAgentDispatchModel,
  validateSkillCaptureModel,
  validateStyleConsolidationModel,
  validateTaskProfileModel,
  validateTaskModel,
  validateTraceabilityModel,
  validateValidationCommandsModel,
  validateValidationModel,
  validateStateJsonModelCore,
  validateWatchdogModel,
} = require("../dist/auto-iterate/stateSchemaCoreValidators");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function makeGate(phase, status = "pending") {
  return {
    phase,
    entryCriteria: [],
    exitCriteria: [],
    blockingRules: [],
    status,
  };
}

function makeSession(overrides = {}) {
  return {
    session: "session-a",
    stateJsonFile: ".agent-state/auto-iterate/session-a/state.json",
    stateFile: ".agent-state/auto-iterate/session-a/state.md",
    promptFile: ".agent-state/auto-iterate/session-a/start-prompt.md",
    currentFile: ".agent-state/auto-iterate-current.json",
    ...overrides,
  };
}

function makeTask(overrides = {}) {
  return {
    goal: "ship feature",
    successCriteria: ["works"],
    nonGoals: [],
    allowedScope: "src/**",
    compatibility: [],
    ...overrides,
  };
}

function makeMode(overrides = {}) {
  return {
    mode: "quick",
    autopilot: true,
    runtimeAutopilot: false,
    allowAgentInference: true,
    allowModify: true,
    loopShape: "default",
    executionMode: "native_subagent",
    ...overrides,
  };
}

function makeBudgets(overrides = {}) {
  return {
    maxIterations: 5,
    autopilotMaxIterations: 3,
    minimumImplementationIterations: null,
    implementationIterationsUsed: 1,
    nonImplementationIterationsUsed: 0,
    validationHardeningIterationsUsed: 0,
    minimumValidationHardeningIterations: 1,
    optimizationIterationsUsed: 0,
    totalCycles: 1,
    remainingImplementationIterations: 2,
    remainingValidationHardeningIterations: 1,
    ...overrides,
  };
}

function makeWatchdog(overrides = {}) {
  return {
    deliveryVerifiability: "unknown",
    requiredAction: "continue",
    enabled: true,
    triggered: false,
    freshEyesRequired: false,
    ...overrides,
  };
}

function makeRequirement(overrides = {}) {
  return {
    id: "REQ-1",
    summary: "do work",
    type: "验证",
    status: "pending",
    relatedFiles: [],
    evidence: "none",
    blockedReason: "none",
    nextStep: "implement",
    ...overrides,
  };
}

function makePhaseGate(overrides = {}) {
  return {
    currentPhase: "requirement",
    canProceed: true,
    blockingReasons: [],
    gates: [
      makeGate("requirement"),
      makeGate("contract"),
      makeGate("baseline"),
      makeGate("coding"),
      makeGate("validation"),
      makeGate("cleanup"),
      makeGate("delivery"),
    ],
    ...overrides,
  };
}

function makeContract(overrides = {}) {
  return {
    status: "approved",
    goal: "goal",
    understanding: "understanding",
    scope: "scope",
    nonGoals: "non-goals",
    successCriteria: "success",
    validationPlan: "validation",
    riskPoints: "risk",
    openQuestions: [],
    userConfirmationRequired: false,
    ...overrides,
  };
}

function makeBaseline(overrides = {}) {
  return {
    status: "passed",
    command: "npm test",
    result: "passed",
    reason: "baseline verified",
    failureCategory: "none",
    allowsCoding: true,
    ...overrides,
  };
}

function makeIterationPolicy(overrides = {}) {
  return {
    currentIterationGoal: "ship one small change",
    maxGoalsPerIteration: 1,
    maxChangedFiles: 5,
    maxDiffLines: 300,
    maxNoProgressIterations: 3,
    consecutiveFailureCount: 0,
    lastDecision: "continue",
    allowedFiles: [],
    stopConditions: [],
    rollbackPlan: [],
    ...overrides,
  };
}

function makeTaskProfile(overrides = {}) {
  return {
    type: "feature",
    complexity: "small",
    risk: "low",
    needsUserConfirmation: false,
    reasons: [],
    ...overrides,
  };
}

function makeDecisionRequest(overrides = {}) {
  return {
    status: "not_needed",
    topic: "none",
    background: "not needed",
    recommended: "continue",
    impact: "none",
    options: [],
    triggers: [],
    ...overrides,
  };
}

function makePostChange(overrides = {}) {
  return {
    status: "passed",
    command: "npm test",
    result: "passed",
    reason: "verified",
    regressionDetected: false,
    perCommand: [],
    ...overrides,
  };
}

function makeDelta(overrides = {}) {
  return {
    status: "unchanged",
    decision: "keep",
    summary: "no change",
    baselineRef: "baseline",
    postChangeRef: "post-change",
    ...overrides,
  };
}

function makeDiffBudget(overrides = {}) {
  return {
    status: "within_budget",
    changedFiles: 1,
    diffLines: 10,
    outOfScopeFiles: [],
    highRiskFiles: [],
    reason: "within limits",
    ...overrides,
  };
}

function makeDeliveryEvidence(overrides = {}) {
  return {
    status: "ready",
    goal: "goal",
    changes: "changes",
    validationSummary: "npm test passed",
    baselineComparison: "no regression",
    cleanupSummary: "clean",
    risks: "limited to local verification",
    unfinishedItems: "none",
    userConfirmation: "not required",
    changedFiles: [],
    ...overrides,
  };
}

function makeStyleConsolidation(overrides = {}) {
  return {
    status: "completed",
    trigger: "delivery",
    scope: "changed files",
    summary: "reviewed",
    verificationSummary: "npm test passed",
    lastRunSummary: "completed",
    localSkillsReviewed: ["typescript-coding-style"],
    globalSkillsReviewed: [],
    appliedRules: ["typed helpers"],
    changedFiles: [],
    skippedReasons: [],
    ...overrides,
  };
}

function makeContextResetReview(overrides = {}) {
  return {
    status: "passed",
    decision: "pass",
    trigger: "delivery",
    sourceOfTruth: "state.json",
    lastRunSummary: "passed",
    reviewCyclesUsed: 1,
    maxReviewCycles: 2,
    standardsFindings: [],
    specFindings: [],
    reopenedRequirements: [],
    ...overrides,
  };
}

function makeSkillCapture(overrides = {}) {
  return {
    status: "captured",
    root: ".agents/skills",
    indexFile: ".agents/skills/index.md",
    selectionCriteria: "high value reusable lessons",
    lastRunSummary: "captured",
    capturedFiles: [".agents/skills/example/SKILL.md"],
    pendingCandidates: [],
    skippedReasons: [],
    ...overrides,
  };
}

function makeDeliveryDocs(overrides = {}) {
  return {
    status: "generated",
    path: ".agent-state/auto-iterate/session-a/docs",
    files: [
      ".agent-state/auto-iterate/session-a/docs/api.md",
    ],
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePostAgentGate(overrides = {}) {
  return {
    enabled: true,
    command: "fastcar-cli auto-iterate --finalize session --yes",
    lastResult: "passed",
    repairCyclesUsed: 0,
    maxRepairCycles: 2,
    failureSummary: [],
    nextAction: "deliver",
    ...overrides,
  };
}

function makeSubAgentDispatch(overrides = {}) {
  return {
    enabled: true,
    currentPhase: "idle",
    activeSubAgents: [],
    subAgentHistory: [],
    dispatchedCount: 0,
    completedCount: 0,
    failedCount: 0,
    lastDispatchRound: 0,
    lastMergeResult: "N/A",
    maxSubAgentRounds: 3,
    subAgentTimeoutSeconds: 300,
    maxFailedSubAgents: 2,
    concurrencyLimit: 1,
    ...overrides,
  };
}

test("validateLanguageModel enforces language metadata enums", () => {
  const issues = [];

  validateLanguageModel(issues, {
    code: "fr",
    source: "",
    confidence: "certain",
  });

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.language.code=fr 不是合法值" },
    { severity: "error", message: "state.json.language.confidence=certain 不是合法值" },
  ]);
});

test("validateTraceabilityModel requires policy and iterations array", () => {
  const issues = [];

  validateTraceabilityModel(issues, {
    policy: "",
    iterations: "not-array",
  });

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.traceability.iterations 必须是数组" },
  ]);
});

test("validateDocumentationModel requires bounded documentation arrays", () => {
  const issues = [];

  validateDocumentationModel(issues, {
    apiChanges: [],
    architectureNotes: "note",
    implementationNotes: [],
    changelogEntries: null,
  });

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.documentation.architectureNotes 必须是数组" },
    { severity: "error", message: "state.json.documentation.changelogEntries 必须是数组" },
  ]);
});

test("validateSessionModel enforces expected session and standard paths", () => {
  const issues = [];

  validateSessionModel(
    issues,
    makeSession({
      session: "session-a",
      stateJsonFile: ".agent-state/auto-iterate/other/state.json",
      stateFile: ".agent-state/auto-iterate/session-a/state-view.md",
      promptFile: ".agent-state/auto-iterate/session-a/prompt.md",
    }),
    { session: "expected-session" },
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.session.session=session-a，期望 expected-session" },
    { severity: "error", message: "state.json.session.stateJsonFile=.agent-state/auto-iterate/other/state.json，未指向 .agent-state/auto-iterate/session-a/state.json" },
    { severity: "error", message: "state.json.session.stateFile=.agent-state/auto-iterate/session-a/state-view.md，未指向 .agent-state/auto-iterate/session-a/state.md" },
    { severity: "error", message: "state.json.session.promptFile=.agent-state/auto-iterate/session-a/prompt.md，未指向 .agent-state/auto-iterate/session-a/start-prompt.md" },
  ]);
});

test("validateTaskModel requires non-empty success criteria for delivery gate", () => {
  const issues = [];

  validateTaskModel(issues, makeTask({ goal: "", successCriteria: "todo", allowedScope: "" }));
  validateTaskModel(issues, makeTask({ successCriteria: [] }));

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.task.goal 必须是非空字符串" },
    { severity: "error", message: "state.json.task.successCriteria 必须是数组" },
    { severity: "error", message: "state.json.task.allowedScope 必须是非空字符串" },
    { severity: "error", message: "state.json.task.successCriteria 不能为空；缺少成功标准时不得进入自动迭代交付门禁" },
  ]);
});

test("validateModeModel enforces known mode, loop shape, and execution mode", () => {
  const issues = [];

  validateModeModel(issues, makeMode({
    mode: "unknown",
    loopShape: "forever",
    executionMode: "silent_manual",
    allowModify: "yes",
  }), ["quick", "strict"]);

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.mode.mode=unknown 不是有效模式" },
    { severity: "error", message: "state.json.mode.allowModify 必须是 boolean" },
    { severity: "error", message: "state.json.mode.loopShape=forever 不是合法值" },
    { severity: "error", message: "state.json.mode.executionMode=silent_manual 不是合法值" },
  ]);
});

test("validateBudgetsModel checks non-negative fields and relationships", () => {
  const issues = [];

  validateBudgetsModel(issues, makeBudgets({
    implementationIterationsUsed: -1,
    totalCycles: 99,
  }));

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.budgets.implementationIterationsUsed 必须是非负整数" },
    { severity: "error", message: "state.json.budgets.totalCycles=99，但 implementationIterationsUsed + optimizationIterationsUsed + nonImplementationIterationsUsed=-1" },
  ]);
});

test("validateWatchdogModel enforces action and verifiability enums", () => {
  const issues = [];

  validateWatchdogModel(issues, makeWatchdog({
    deliveryVerifiability: "yes",
    requiredAction: "ship",
    triggered: "no",
  }), {
    deliveryVerifiability: ["verifiable", "unknown"],
    requiredAction: ["continue", "stop"],
  });

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.watchdog.deliveryVerifiability=yes 不是合法值" },
    { severity: "error", message: "state.json.watchdog.requiredAction=ship 不是合法值" },
    { severity: "error", message: "state.json.watchdog.triggered 必须是 boolean" },
  ]);
});

test("validateRequirementsModel validates requirement items and delivery verifiability", () => {
  const issues = [];

  const requirements = validateRequirementsModel(
    issues,
    [
      makeRequirement({
        status: "done",
        relatedFiles: "src/a.js",
        evidence: "",
      }),
    ],
    { deliveryVerifiability: "verifiable" },
    { requirementStatus: ["pending", "implemented", "passed", "blocked", "not_verified"] },
  );

  assert.strictEqual(requirements.length, 1);
  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.requirements[0].evidence 必须是非空字符串" },
    { severity: "error", message: "state.json.requirements[0].status=done 不是合法值" },
    { severity: "error", message: "state.json.requirements[0].relatedFiles 必须是数组" },
    { severity: "error", message: "state.json.requirements 仍有开放项，但 watchdog.deliveryVerifiability=verifiable" },
  ]);
});

test("validateValidationModel validates final verifiability and command history", () => {
  const issues = [];

  validateValidationModel(
    issues,
    {
      finalVerifiability: "maybe",
      commands: [
        { command: "", result: "ok", iteration: -1 },
        { executable: "", args: [1] },
      ],
    },
    { deliveryVerifiability: ["verifiable", "unknown"] },
    () => true,
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.validation.finalVerifiability=maybe 不是合法值" },
    { severity: "error", message: "state.json.validation.commands[0].command 必须是非空字符串" },
    { severity: "error", message: "state.json.validation.commands[0].result=ok 不是合法值" },
    { severity: "error", message: "state.json.validation.commands[0].iteration 必须是大于 0 的整数" },
    { severity: "error", message: "state.json.validation.commands[1].command 必须是非空字符串" },
    { severity: "error", message: "state.json.validation.commands[1].executable 必须是非空字符串" },
    { severity: "error", message: "state.json.validation.commands[1].args 必须是字符串数组" },
  ]);
});

test("validateCleanupModel validates cleanup status", () => {
  const issues = [];

  validateCleanupModel(issues, { status: "done" }, { cleanupStatus: ["pending", "completed", "blocked"] });

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.cleanup.status=done 不是合法值" },
  ]);
});

test("validateDeliveryGateConsistencyModel blocks inconsistent ready delivery", () => {
  const issues = [];

  validateDeliveryGateConsistencyModel(issues, {
    deliveryEvidence: { status: "ready" },
    postChange: { status: "failed", regressionDetected: true },
    postAgentValidationGate: { enabled: false, lastResult: "failed", nextAction: "stop" },
    watchdog: { deliveryVerifiability: "unknown" },
  });

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "deliveryEvidence ready/delivered 时 postChange.status 必须为 passed" },
    { severity: "error", message: "deliveryEvidence ready/delivered 时 postChange.regressionDetected 必须为 false" },
    { severity: "error", message: "deliveryEvidence ready/delivered 时 postAgentValidationGate.enabled 必须为 true" },
    { severity: "error", message: "deliveryEvidence ready/delivered 时 postAgentValidationGate.lastResult 必须为 passed" },
    { severity: "error", message: "deliveryEvidence ready/delivered 时 postAgentValidationGate.nextAction 必须为 deliver" },
    { severity: "error", message: "deliveryEvidence ready/delivered 时 watchdog.deliveryVerifiability 必须为 verifiable 或 partially_verifiable" },
  ]);
});

test("validateStateJsonModelCore enforces top-level schema and required objects", () => {
  const issues = validateStateJsonModelCore({
    schemaVersion: 0,
    task: {},
    session: {},
    mode: { mode: "quick" },
    budgets: {},
    currentState: "bad",
    watchdog: {},
    phaseGate: {},
    implementationContract: {},
    baseline: {},
    iterationPolicy: {},
    taskProfile: {},
    decisionRequest: {},
    decisions: {},
    subAgentDispatch: {},
    validation: {},
    postChange: {},
    deltaAssessment: {},
    diffBudget: {},
    cleanup: {},
    styleConsolidation: {},
    contextResetReview: {},
    deliveryEvidence: {},
    skillCapture: {},
    postAgentValidationGate: {},
    requirements: [],
  }, {
    expected: { session: "session-a" },
    schemaVersion: 1,
    validModes: ["quick"],
    isValidationHistoryEntry: () => false,
  });

  assert.ok(issues.some((issue) => issue.message === "state.json.schemaVersion=missing，期望 1"));
  assert.ok(issues.some((issue) => issue.message === "state.json.currentState 必须是对象"));
  assert.ok(issues.some((issue) => issue.message === "state.json.task.goal 必须是非空字符串"));
  assert.ok(issues.some((issue) => issue.message === "state.json.session.session=missing，期望 session-a"));
  assert.ok(issues.some((issue) => issue.message === "state.json.subAgentDispatch.enabled 必须是 boolean"));
  assert.ok(issues.some((issue) => issue.message === "state.json.validation.finalVerifiability=missing 不是合法值"));
});

test("validateSubAgentDispatchModel enforces execution-mode default semantics", () => {
  const nativeIssues = [];
  validateSubAgentDispatchModel(
    nativeIssues,
    makeSubAgentDispatch({ enabled: false, concurrencyLimit: 0 }),
    makeMode({ executionMode: "native_subagent" }),
  );
  assert.deepStrictEqual(nativeIssues, [
    { severity: "error", message: "state.json.mode.executionMode=native_subagent 时 subAgentDispatch.enabled 必须为 true" },
  ]);

  const protocolIssues = [];
  validateSubAgentDispatchModel(
    protocolIssues,
    makeSubAgentDispatch({ enabled: true, concurrencyLimit: 1 }),
    makeMode({ executionMode: "protocol_only" }),
  );
  assert.deepStrictEqual(protocolIssues, [
    { severity: "error", message: "state.json.mode.executionMode=protocol_only 时 subAgentDispatch.enabled 必须为 false" },
  ]);

  const concurrencyIssues = [];
  validateSubAgentDispatchModel(
    concurrencyIssues,
    makeSubAgentDispatch({ enabled: true, concurrencyLimit: 2 }),
    makeMode({ executionMode: "native_subagent" }),
  );
  assert.deepStrictEqual(concurrencyIssues, [
    { severity: "error", message: "subAgentDispatch.enabled=true 时 concurrencyLimit 必须为 1（每轮一个 coder）" },
  ]);
});

test("validatePhaseGateModel reports missing phase and missing blocking reasons", () => {
  const issues = [];
  const phaseGate = makePhaseGate({
    canProceed: false,
    gates: [
      makeGate("requirement"),
      makeGate("contract"),
      makeGate("baseline"),
      makeGate("coding"),
      makeGate("validation"),
      makeGate("cleanup"),
    ],
  });

  validatePhaseGateModel(issues, phaseGate);

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.phaseGate.gates 缺少阶段 delivery" },
    { severity: "error", message: "state.json.phaseGate.canProceed=false 时必须记录 blockingReasons" },
  ]);
});

test("validateImplementationContractModel blocks passed contract gate without approved contract", () => {
  const issues = [];
  const phaseGate = makePhaseGate({
    gates: [
      makeGate("requirement"),
      makeGate("contract", "passed"),
      makeGate("baseline"),
      makeGate("coding"),
      makeGate("validation"),
      makeGate("cleanup"),
      makeGate("delivery"),
    ],
  });

  validateImplementationContractModel(issues, makeContract({ status: "pending" }), phaseGate);

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "contract 阶段已通过，但 state.json.implementationContract.status 不是 approved" },
  ]);
});

test("validateImplementationContractModel rejects approved contract with open questions", () => {
  const issues = [];

  validateImplementationContractModel(issues, makeContract({ openQuestions: ["确认范围"] }), makePhaseGate());

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.implementationContract.status=approved 时 openQuestions 必须为空" },
  ]);
});

test("validateBaselineModel rejects pending baseline that allows coding", () => {
  const issues = [];

  validateBaselineModel(issues, makeBaseline({
    status: "pending",
    result: null,
    reason: null,
    allowsCoding: true,
  }), makePhaseGate());

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.baseline.status=pending 时 allowsCoding 不得为 true" },
  ]);
});

test("validateBaselineModel requires reason for skipped baseline", () => {
  const issues = [];

  validateBaselineModel(issues, makeBaseline({
    status: "skipped_with_reason",
    result: null,
    reason: "",
    failureCategory: "test_unavailable",
    allowsCoding: true,
  }), makePhaseGate());

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.baseline.reason 必须是非空字符串" },
    { severity: "error", message: "state.json.baseline.status=skipped_with_reason 时必须记录 reason" },
  ]);
});

test("validateBaselineModel blocks coding progress without validated baseline", () => {
  const issues = [];
  const phaseGate = makePhaseGate({
    gates: [
      makeGate("requirement"),
      makeGate("contract"),
      makeGate("baseline"),
      makeGate("coding", "passed"),
      makeGate("validation"),
      makeGate("cleanup"),
      makeGate("delivery"),
    ],
  });

  validateBaselineModel(issues, makeBaseline({
    status: "pending",
    result: null,
    reason: null,
    allowsCoding: false,
  }), phaseGate);

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "coding/validation/cleanup/delivery 阶段推进前必须有 baseline passed/failed/skipped_with_reason/not_available 及原因" },
  ]);
});

test("validateIterationPolicyModel requires one goal per iteration", () => {
  const issues = [];

  validateIterationPolicyModel(issues, makeIterationPolicy({ maxGoalsPerIteration: 2 }));

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.iterationPolicy.maxGoalsPerIteration=2，必须等于 1" },
  ]);
});

test("validateIterationPolicyModel stops continue after consecutive failures reach threshold", () => {
  const issues = [];

  validateIterationPolicyModel(issues, makeIterationPolicy({
    maxNoProgressIterations: 3,
    consecutiveFailureCount: 3,
    lastDecision: "continue",
  }));

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "连续失败达到阈值时 iterationPolicy.lastDecision 不得为 continue" },
  ]);
});

test("validateTaskProfileModel requires user confirmation for large or high risk tasks", () => {
  const issues = [];

  validateTaskProfileModel(issues, makeTaskProfile({
    complexity: "large",
    risk: "high",
    needsUserConfirmation: false,
  }));

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "large/high risk taskProfile 必须设置 needsUserConfirmation=true 或记录用户已确认的 decisionRequest" },
  ]);
});

test("validateDecisionRequestModel requires approved or blocked decision when confirmation is needed", () => {
  const issues = [];

  validateDecisionRequestModel(
    issues,
    makeDecisionRequest({ status: "pending" }),
    makeTaskProfile({ needsUserConfirmation: true }),
    {},
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "taskProfile.needsUserConfirmation=true 时 decisionRequest.status 必须为 approved 或 blocked" },
  ]);
});

test("validateDecisionRequestModel allows pending pipeline worker runtime decisions", () => {
  const issues = [];

  validateDecisionRequestModel(
    issues,
    makeDecisionRequest({ status: "pending", triggers: ["pipeline_worker"] }),
    makeTaskProfile({ needsUserConfirmation: true }),
    { watchdog: { triggered: true, requiredAction: "ask_user" } },
  );

  assert.deepStrictEqual(issues, []);
});

test("validatePostChangeModel rejects passed status with failed per-command", () => {
  const issues = [];

  validatePostChangeModel(issues, makePostChange({
    perCommand: [
      {
        command: "npm test",
        status: "failed",
        exitCode: 1,
      },
    ],
  }));

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.postChange.status=passed 时 perCommand 不得包含 failed 命令" },
  ]);
});

test("validatePostChangeModel requires failed command signal details", () => {
  const issues = [];

  validatePostChangeModel(issues, makePostChange({
    status: "failed",
    perCommand: [
      {
        command: "npm test",
        status: "failed",
        exitCode: 0,
        signal: "none",
        error: "none",
      },
    ],
  }));

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.postChange.perCommand[0] status=failed 时必须记录非 0 exitCode、signal 或 error" },
  ]);
});

test("validateValidationCommandsModel validates blank string and history entry fields", () => {
  const issues = [];

  validateValidationCommandsModel(
    issues,
    [
      " ",
      {
        command: "npm test",
        result: "bad",
        exitCode: "1",
        iteration: 0,
      },
      {
        executable: "node",
        args: ["scripts/verify.js"],
      },
    ],
    (item) => Boolean(item && typeof item === "object" && "result" in item),
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.validation.commands[0] 字符串命令不能为空" },
    { severity: "error", message: "state.json.validation.commands[1].result=bad 不是合法值" },
    { severity: "error", message: "state.json.validation.commands[1].exitCode 必须是整数或 null" },
    { severity: "error", message: "state.json.validation.commands[1].iteration 必须是大于 0 的整数" },
  ]);
});

test("validateDeltaAssessmentModel rejects keeping regressions", () => {
  const issues = [];

  validateDeltaAssessmentModel(
    issues,
    makeDelta({ status: "regression", decision: "keep" }),
    makePostChange({ regressionDetected: true }),
    makeIterationPolicy({ lastDecision: "continue" }),
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "检测到 regression 时 deltaAssessment.decision 不得为 keep" },
    { severity: "error", message: "deltaAssessment.status=regression 时 iterationPolicy.lastDecision 不得为 continue" },
  ]);
});

test("validateDiffBudgetModel rejects over-budget continue decisions and scoped file risks", () => {
  const issues = [];

  validateDiffBudgetModel(
    issues,
    makeDiffBudget({
      status: "over_budget",
      changedFiles: 6,
      diffLines: 400,
      outOfScopeFiles: ["outside.js"],
      highRiskFiles: ["risk.js"],
    }),
    makeIterationPolicy({
      maxChangedFiles: 5,
      maxDiffLines: 300,
      lastDecision: "continue",
    }),
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.diffBudget.changedFiles=6 超出 maxChangedFiles=5" },
    { severity: "error", message: "state.json.diffBudget.diffLines=400 超出 maxDiffLines=300" },
    { severity: "error", message: "diffBudget.status=over_budget 时 iterationPolicy.lastDecision 不得为 continue" },
    { severity: "error", message: "存在 outOfScopeFiles/highRiskFiles 时 iterationPolicy.lastDecision 不得为 continue" },
  ]);
});

test("validateDeliveryEvidenceModel blocks ready delivery with open requirements and weak evidence", () => {
  const issues = [];

  validateDeliveryEvidenceModel(
    issues,
    makeDeliveryEvidence({
      validationSummary: "未运行",
      risks: "none",
      userConfirmation: "none",
    }),
    { finalVerifiability: "unknown" },
    { status: "pending" },
    [{ status: "pending" }],
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.deliveryEvidence.status 为 ready/delivered 时 requirements 不得存在开放项" },
    { severity: "error", message: "state.json.deliveryEvidence.status 为 ready/delivered 时 validation.finalVerifiability 不得为 unknown" },
    { severity: "error", message: "state.json.deliveryEvidence.status 为 ready/delivered 时 cleanup.status 必须为 completed" },
    { severity: "error", message: "state.json.deliveryEvidence.status 为 ready/delivered 时 validationSummary 必须包含真实验证结论" },
    { severity: "error", message: "state.json.deliveryEvidence.status 为 ready/delivered 时 risks 必须显式说明风险或有限可验证边界" },
    { severity: "error", message: "state.json.deliveryEvidence.status 为 ready/delivered 时 userConfirmation 必须记录确认来源或说明无需确认的原因" },
  ]);
});

test("validateStyleConsolidationModel blocks pending style consolidation before implementation delivery", () => {
  const issues = [];

  validateStyleConsolidationModel(
    issues,
    makeStyleConsolidation({ status: "pending" }),
    { mode: { mode: "quick" }, deliveryEvidence: { status: "ready" } },
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "实现类模式 deliveryEvidence ready/delivered 前 styleConsolidation.status 不得为 pending" },
  ]);
});

test("validateStyleConsolidationModel requires completed evidence and not-applicable reasons", () => {
  const completedIssues = [];
  validateStyleConsolidationModel(
    completedIssues,
    makeStyleConsolidation({
      localSkillsReviewed: [],
      globalSkillsReviewed: [],
      appliedRules: [],
      verificationSummary: "未运行",
    }),
    { mode: { mode: "quick" }, deliveryEvidence: { status: "pending" } },
  );

  assert.deepStrictEqual(completedIssues, [
    { severity: "error", message: "styleConsolidation.status=completed 时必须记录已参考的本地或全局 skill" },
    { severity: "error", message: "styleConsolidation.status=completed 时 appliedRules 不能为空" },
    { severity: "error", message: "styleConsolidation.status=completed 时 verificationSummary 必须记录整理后的验证结论" },
  ]);

  const skippedIssues = [];
  validateStyleConsolidationModel(
    skippedIssues,
    makeStyleConsolidation({ status: "not_applicable", skippedReasons: [] }),
    { mode: { mode: "verify" }, deliveryEvidence: { status: "pending" } },
  );

  assert.deepStrictEqual(skippedIssues, [
    { severity: "error", message: "styleConsolidation.status=not_applicable 时 skippedReasons 必须说明原因" },
  ]);
});

test("validateContextResetReviewModel blocks delivery before completed review", () => {
  const issues = [];

  validateContextResetReviewModel(
    issues,
    makeContextResetReview({
      status: "pending",
      decision: "not_run",
      reviewCyclesUsed: 0,
    }),
    { deliveryEvidence: { status: "ready" } },
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "deliveryEvidence ready/delivered 前 contextResetReview.status 必须为 passed 或 user_accepted_limited" },
    { severity: "error", message: "deliveryEvidence ready/delivered 前 contextResetReview.status 不得为 pending" },
  ]);
});

test("validateContextResetReviewModel enforces passed review invariants", () => {
  const issues = [];

  validateContextResetReviewModel(
    issues,
    makeContextResetReview({
      decision: "limited_acceptance",
      reviewCyclesUsed: 0,
      standardsFindings: ["missed rule"],
    }),
    { deliveryEvidence: { status: "ready" } },
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "contextResetReview.status=passed 时 decision 必须为 pass" },
    { severity: "error", message: "contextResetReview.status=passed 时 reviewCyclesUsed 必须至少为 1" },
    { severity: "error", message: "contextResetReview.status=passed 时 findings 和 reopenedRequirements 必须为空" },
  ]);
});

test("validateContextResetReviewModel requires reopened requirements and useful limited summaries", () => {
  const failedIssues = [];
  validateContextResetReviewModel(
    failedIssues,
    makeContextResetReview({ status: "failed", decision: "reopen_requirements", reopenedRequirements: [] }),
    { deliveryEvidence: { status: "pending" } },
  );
  assert.deepStrictEqual(failedIssues, [
    { severity: "error", message: "contextResetReview.status=failed 时必须记录 reopenedRequirements" },
  ]);

  const limitedIssues = [];
  validateContextResetReviewModel(
    limitedIssues,
    makeContextResetReview({ status: "user_accepted_limited", decision: "limited_acceptance", lastRunSummary: "未运行" }),
    { deliveryEvidence: { status: "ready" } },
  );
  assert.deepStrictEqual(limitedIssues, [
    { severity: "error", message: "contextResetReview.status=user_accepted_limited 时 lastRunSummary 必须说明阻塞、不可用或有限接受原因" },
  ]);
});

test("validateSkillCaptureModel enforces standard skill paths and delivery readiness", () => {
  const issues = [];

  validateSkillCaptureModel(
    issues,
    makeSkillCapture({
      status: "pending",
      root: "skills",
      indexFile: "skills/index.md",
    }),
    { status: "ready" },
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.skillCapture.root 必须为 .agents/skills" },
    { severity: "error", message: "state.json.skillCapture.indexFile 必须为 .agents/skills/index.md" },
    { severity: "error", message: "deliveryEvidence ready/delivered 时 skillCapture.status 不得为 pending" },
  ]);
});

test("validateSkillCaptureModel requires captured files when captured", () => {
  const issues = [];

  validateSkillCaptureModel(issues, makeSkillCapture({ capturedFiles: [] }), { status: "pending" });

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.skillCapture.status=captured 时 capturedFiles 不能为空" },
  ]);
});

test("validateDeliveryDocsModel rejects generated docs outside current session", () => {
  const issues = [];

  validateDeliveryDocsModel(
    issues,
    makeDeliveryDocs({
      path: ".agent-state/auto-iterate/other-session/docs",
      files: [
        ".agent-state/auto-iterate/other-session/docs/api.md",
      ],
    }),
    { session: { session: "session-a" } },
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "deliveryDocs.status=generated 时 state.json.deliveryDocs.path=.agent-state/auto-iterate/other-session/docs 必须属于当前 session session-a: .agent-state/auto-iterate/session-a/docs" },
    { severity: "error", message: "deliveryDocs.status=generated 时 files 必须属于当前 session session-a: .agent-state/auto-iterate/other-session/docs/api.md" },
  ]);
});

test("validateDeliveryDocsModel requires generated files and timestamp", () => {
  const issues = [];

  validateDeliveryDocsModel(
    issues,
    makeDeliveryDocs({
      files: [],
      generatedAt: null,
    }),
    { session: { session: "session-a" } },
  );

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "deliveryDocs.status=generated 时 files 不能为空，且必须属于当前 session session-a" },
    { severity: "error", message: "deliveryDocs.status=generated 时 generatedAt 不能为空，且必须属于当前 session session-a 的真实生成记录" },
  ]);
});

test("validatePostAgentValidationGateModel enforces finalize or strict validate command", () => {
  const issues = [];

  validatePostAgentValidationGateModel(issues, makePostAgentGate({ command: "npm test" }));

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "state.json.postAgentValidationGate.command 必须包含 --finalize，或兼容旧格式 --validate-state 和 --strict-state" },
  ]);
});

test("validatePostAgentValidationGateModel constrains failed next action and repair budget", () => {
  const issues = [];

  validatePostAgentValidationGateModel(issues, makePostAgentGate({
    lastResult: "failed",
    nextAction: "deliver",
    repairCyclesUsed: 3,
    maxRepairCycles: 2,
  }));

  assert.deepStrictEqual(issues, [
    { severity: "error", message: "postAgentValidationGate.lastResult=failed 时 nextAction 必须为 context_reset_and_repair 或 stop" },
    { severity: "error", message: "postAgentValidationGate.repairCyclesUsed 不得大于 maxRepairCycles" },
  ]);
});

let passed = 0;
for (const item of cases) {
  item.fn();
  passed += 1;
  console.log(`✓ ${item.name}`);
}

console.log(`\n${passed} test(s) passed.`);
