import path from "path";
import { promises as fsPromises } from "fs";
import { getSessionPaths, toRelative } from "./sessionPaths";
import {
  addError,
  addWarning,
  normalizeRelativePathForCompare,
} from "./stateValidationPrimitives";
import {
  extractFirstSection,
  parseScalar,
  parseStateBoolean,
  parseStateList,
  parseStateNumber,
  stateHeadingExists,
} from "./stateMarkdownParsers";
import {
  compareCurrentPointerToExpected,
  type StateFileValidationTarget,
} from "./sessionStateValidation";

type ValidationIssue = {
  severity: "error" | "warning";
  message: string;
};

interface RequirementStateCounts {
  passed: number;
  pending: number;
  implemented: number;
  notVerified: number;
  blocked: number;
}

export interface SessionBaselineValidationResult {
  issues: ValidationIssue[];
}

export const REQUIRED_STATE_SECTIONS = [
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
  "## Notes / 备注",
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isPendingCleanupValue(value: unknown): boolean {
  return /pending|待|未|需要|todo/i.test(String(value || ""));
}

function countRequirementStates(rcm: string): RequirementStateCounts {
  const counts: RequirementStateCounts = {
    passed: 0,
    pending: 0,
    implemented: 0,
    notVerified: 0,
    blocked: 0,
  };
  for (const match of rcm.matchAll(/^状态：([^\r\n]+)/gm)) {
    const value = match[1].trim();
    if (value.startsWith("passed")) {
      counts.passed += 1;
    } else if (value.startsWith("pending")) {
      counts.pending += 1;
    } else if (value.startsWith("implemented")) {
      counts.implemented += 1;
    } else if (value.startsWith("not_verified")) {
      counts.notVerified += 1;
    } else if (value.startsWith("blocked")) {
      counts.blocked += 1;
    }
  }
  return counts;
}

export async function validateSessionStateBaseline(
  content: string,
  stateInfo: StateFileValidationTarget,
): Promise<SessionBaselineValidationResult> {
  const issues: ValidationIssue[] = [];
  for (const section of REQUIRED_STATE_SECTIONS) {
    if (!stateHeadingExists(content, section)) {
      addError(issues, `缺少必要章节: ${section}`);
    }
  }

  const stateFile = stateInfo.stateFile;
  const sessionSection = extractFirstSection(content, [
    "## Session / 会话",
    "## Session",
  ]);
  const session = parseScalar(sessionSection, "session", "");
  const stateFileInState = parseScalar(sessionSection, "状态文件", "");
  const promptFileInState = parseScalar(sessionSection, "启动提示", "");
  const currentFileInState = parseScalar(sessionSection, "current 指针", "");
  const expectedSession = session || stateInfo.session;
  const expectedStatePath = expectedSession
    ? `.agent-state/auto-iterate/${expectedSession}/state.md`
    : normalizeRelativePathForCompare(toRelative(stateFile));
  const expectedPromptPath = expectedSession
    ? `.agent-state/auto-iterate/${expectedSession}/start-prompt.md`
    : normalizeRelativePathForCompare(promptFileInState);
  const promptPath = promptFileInState
    ? path.resolve(process.cwd(), promptFileInState)
    : expectedSession
      ? getSessionPaths(expectedSession).sessionPromptPath
      : null;
  const currentPromptPath = stateInfo.current && stateInfo.current.promptFile
    ? path.resolve(process.cwd(), stateInfo.current.promptFile)
    : null;

  if (!session) {
    addError(issues, "Session 章节缺少 session 字段");
  }

  if (stateInfo.targetType === "session" && session && stateInfo.session !== session) {
    addError(issues, `命令指定 session=${stateInfo.session}，但 state.md 中 session=${session}`);
  }

  if (stateFileInState && normalizeRelativePathForCompare(stateFileInState) !== normalizeRelativePathForCompare(toRelative(stateFile))) {
    addWarning(issues, `Session.状态文件=${stateFileInState} 与实际文件 ${toRelative(stateFile)} 不一致`);
  }

  if (stateFileInState && expectedSession && normalizeRelativePathForCompare(stateFileInState) !== expectedStatePath) {
    addWarning(issues, `Session.状态文件 未指向标准 session 路径 ${expectedStatePath}`);
  }

  if (!promptPath || !(await pathExists(promptPath))) {
    addError(issues, `缺少 start-prompt.md: ${promptFileInState || expectedPromptPath || "unknown"}`);
  }
  const current = stateInfo.current;
  if (currentPromptPath && current && !(await pathExists(currentPromptPath))) {
    addError(issues, `auto-iterate-current.json.promptFile 指向的文件不存在: ${current.promptFile}`);
  }

  if (!currentFileInState || normalizeRelativePathForCompare(currentFileInState) !== ".agent-state/auto-iterate-current.json") {
    addWarning(issues, "Session.current 指针未记录为 .agent-state/auto-iterate-current.json");
  }

  if (!current || !current.stateFile) {
    addWarning(issues, "缺少 auto-iterate-current.json 或 current.stateFile，无法确认当前活动 session");
  } else if (expectedSession && current.session === expectedSession) {
    compareCurrentPointerToExpected(issues, current, expectedSession, expectedStatePath, expectedPromptPath, stateFileInState, promptFileInState);
  } else if (stateInfo.targetType === "current" && expectedSession && current.session !== expectedSession) {
    addError(issues, `current.session=${current.session || "unknown"} 与 state.md session=${expectedSession} 不一致`);
  } else if (stateInfo.targetType === "session" && expectedSession && current.session !== expectedSession) {
    addWarning(issues, `当前活动 session 是 ${current.session || "unknown"}，本次校验的是 ${expectedSession}`);
  }

  const budgets = extractFirstSection(content, ["## Budgets / 预算", "## Budgets"]);
  const implementationUsed = parseStateNumber(budgets, "implementation_iterations_used", 0);
  const optimizationUsed = parseStateNumber(budgets, "optimization_iterations_used", 0);
  const nonImplementationUsed = parseStateNumber(budgets, "non_implementation_iterations_used", 0);
  const totalCycles = parseStateNumber(budgets, "total_cycles", 0);
  const remainingImplementation = parseStateNumber(budgets, "remaining_implementation_iterations", 0);
  const maxIterations = parseStateNumber(budgets, "max_iterations", 0);
  const validationHardeningUsed = parseStateNumber(budgets, "validation_hardening_iterations_used", 0);
  const minimumValidationHardening = parseStateNumber(budgets, "minimum_validation_hardening_iterations", 0);
  const minimumIterationsValue = parseScalar(budgets, "minimum_implementation_iterations", "未启用");
  const minimumIterations = /^\d+/.test(minimumIterationsValue)
    ? parseStateNumber(budgets, "minimum_implementation_iterations", 0)
    : null;
  const deliveryEvidence = extractFirstSection(content, [
    "## Delivery Evidence / 交付证据",
    "## Delivery Evidence",
  ]);
  const deliveryEvidenceStatus = parseScalar(deliveryEvidence, "status", "");

  if (totalCycles !== implementationUsed + optimizationUsed + nonImplementationUsed) {
    addError(issues, `total_cycles=${totalCycles}，但 implementation_iterations_used + optimization_iterations_used + non_implementation_iterations_used=${implementationUsed + optimizationUsed + nonImplementationUsed}`);
  }

  if (remainingImplementation === 0 && !/^(ready|delivered)$/.test(deliveryEvidenceStatus)) {
    addWarning(issues, "remaining_implementation_iterations = 0，恢复后必须先请求用户追加预算，不得继续修改");
  }

  if (minimumIterations !== null) {
    if (maxIterations > 0 && minimumIterations > maxIterations) {
      addError(issues, `minimum_implementation_iterations=${minimumIterations} 大于 max_iterations=${maxIterations}`);
    }
    if (implementationUsed < minimumIterations) {
      addWarning(issues, `implementation_iterations_used=${implementationUsed} 尚未达到 minimum_implementation_iterations=${minimumIterations}`);
    }
  }

  const watchdog = extractFirstSection(content, ["## Watchdog / 看门狗", "## Watchdog"]);
  const watchdogTriggered = parseStateBoolean(watchdog, "triggered", false);
  const requiredAction = parseScalar(watchdog, "required_action", "");
  const deliveryVerifiability = parseScalar(watchdog, "delivery_verifiability", "");
  const stateDrift = parseScalar(watchdog, "state_drift", "");
  const watchdogLastValidationResult = parseScalar(watchdog, "last_validation_result", "");
  if (watchdogTriggered) {
    addError(issues, `Watchdog.triggered=true，必须先处理 required_action=${requiredAction || "unknown"}`);
  }
  if (/suspected|confirmed/.test(stateDrift)) {
    addError(issues, `Watchdog.state_drift=${stateDrift}，必须先进入 reconcile`);
  }
  if (/not_verifiable|unknown/.test(deliveryVerifiability)) {
    addWarning(issues, `Watchdog.delivery_verifiability=${deliveryVerifiability}，交付前不得声称完整完成`);
  }

  const rcm = extractFirstSection(content, [
    "## Requirement Coverage Matrix / 需求覆盖矩阵",
    "## Requirement Coverage Matrix",
  ]);
  const dod = extractFirstSection(content, [
    "## Definition of Done / 完成定义",
    "## Definition of Done",
  ]);
  const requirementCounts = countRequirementStates(rcm);
  const hasOpenRequirements = requirementCounts.pending > 0 ||
    requirementCounts.implemented > 0 ||
    requirementCounts.notVerified > 0 ||
    requirementCounts.blocked > 0;
  const hasPassedRequirements = requirementCounts.passed > 0;
  const dodVerifiability = parseScalar(dod, "交付可验证性", "");
  const dodWatchdogState = parseScalar(dod, "看门狗状态", "");
  if (hasOpenRequirements && /交付可验证性：verifiable/.test(dod)) {
    addError(issues, "RCM 仍存在 pending/implemented/not_verified/blocked，但 DoD 标记为 verifiable");
  }
  if (hasOpenRequirements && deliveryVerifiability === "verifiable") {
    addError(issues, "RCM 仍存在 pending/implemented/not_verified/blocked，但 Watchdog.delivery_verifiability=verifiable");
  }
  if (hasPassedRequirements && /未运行|failed|失败/.test(watchdogLastValidationResult)) {
    addWarning(issues, "RCM 已存在 passed 需求，但 Watchdog.last_validation_result 未显示最近验证通过");
  }
  if (requirementCounts.blocked > 0 && /看门狗状态：clear/.test(dod)) {
    addWarning(issues, "RCM 存在 blocked 需求，但 DoD 看门狗状态仍为 clear");
  }
  if (/not_verifiable|unknown/.test(dodVerifiability)) {
    addWarning(issues, `DoD.交付可验证性=${dodVerifiability}，交付前不得声称完整完成`);
  }
  if (/triggered/.test(dodWatchdogState)) {
    addError(issues, "DoD.看门狗状态=triggered，必须先处理停止/恢复动作");
  }

  const freshEyesRequired = parseStateBoolean(watchdog, "fresh_eyes_required", false);
  const allPassedNoOpen = !hasOpenRequirements && hasPassedRequirements;
  const validationHardeningStatus = parseScalar(watchdog, "validation_hardening_status", "");
  const validationHardeningDimensions = parseStateList(watchdog, "validation_hardening_dimensions_done");
  const requiredValidationDimensions = ["boundary", "negative", "regression"];
  const validationHardeningFinished = /passed|blocked|not_available|user_accepted_limited/.test(validationHardeningStatus);
  if (allPassedNoOpen && remainingImplementation > 0 && !freshEyesRequired && !validationHardeningFinished) {
    addError(issues, `所有 REQ passed 且 remaining_implementation_iterations=${remainingImplementation} > 0，但 Watchdog.fresh_eyes_required != true；交付前必须设为 true 并执行 context_compress_and_review`);
  }
  if (freshEyesRequired && requiredAction !== "context_compress_and_review") {
    addError(issues, `Watchdog.fresh_eyes_required=true，但 required_action=${requiredAction || "unknown"} 不是 context_compress_and_review`);
  }
  if (freshEyesRequired && !watchdogTriggered) {
    addError(issues, "Watchdog.fresh_eyes_required=true 时，Watchdog.triggered 必须为 true，确保先处理 context_compress_and_review");
  }
  if (allPassedNoOpen && !freshEyesRequired) {
    if (minimumValidationHardening > 0 && validationHardeningUsed < minimumValidationHardening) {
      addError(issues, `所有 REQ passed 后必须完成验证加固：validation_hardening_iterations_used=${validationHardeningUsed} 小于 minimum_validation_hardening_iterations=${minimumValidationHardening}`);
    }
    const missingDimensions = requiredValidationDimensions.filter((dimension) => !validationHardeningDimensions.includes(dimension));
    if (missingDimensions.length > 0 && !/blocked|not_available|user_accepted_limited/.test(validationHardeningStatus)) {
      addError(issues, `验证加固缺少维度 ${missingDimensions.join(", ")}；必须补充边界/反例/回归验证，或把 validation_hardening_status 标记为 blocked/not_available/user_accepted_limited 并说明原因`);
    }
  }

  const newTestCount = parseStateNumber(watchdog, "new_test_count", -1);
  const passedReqs = requirementCounts.passed;
  if (newTestCount >= 0 && passedReqs > newTestCount && remainingImplementation > 0) {
    addWarning(issues, `RCM 有 ${passedReqs} 条 passed 需求，但 Watchdog.new_test_count=${newTestCount}；建议 narrow_scope 补测试或记录不写原因`);
  }

  const validation = extractFirstSection(content, ["## Validation / 验证", "## Validation"]);
  const validationVerifiability = parseScalar(validation, "最终交付可验证性", "");
  const passedValidation = parseScalar(validation, "已通过验证", "");
  if (deliveryVerifiability && validationVerifiability && validationVerifiability !== "unknown" && deliveryVerifiability !== validationVerifiability) {
    addWarning(issues, `Watchdog.delivery_verifiability=${deliveryVerifiability} 与 Validation.最终交付可验证性=${validationVerifiability} 不一致`);
  }
  if (hasPassedRequirements && (!passedValidation || passedValidation === "无")) {
    addWarning(issues, "RCM 已存在 passed 需求，但 Validation.已通过验证 未记录证据");
  }

  const cleanup = extractFirstSection(content, [
    "## Temporary Artifacts / Cleanup / 临时产物清理",
    "## Temporary Artifacts / Cleanup",
  ]);
  const cleanupStatus = parseScalar(cleanup, "清理状态", "");
  const artifactsToDelete = parseScalar(cleanup, "待删除 artifacts", "");
  if (isPendingCleanupValue(cleanupStatus) && !/无|not_needed|已确认保留/.test(artifactsToDelete)) {
    addWarning(issues, `Temporary Artifacts / Cleanup 清理状态=${cleanupStatus}，交付前需清理或记录保留理由`);
  }

  return { issues };
}
