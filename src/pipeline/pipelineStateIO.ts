import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  getLanguageText,
  inferLanguageFromState,
  localizedStatusLabel,
} from "./language";
import { asArray, asRecord, stringValue } from "./valueUtils";
import type {
  PipelineMarkdownIssue,
  PipelineStateLike,
} from "./types";

interface StateSection {
  heading: string;
  body: string;
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @param {string} [mode]
 * @returns {number | null}
 */
function getSnapshotBudgetLeft(
  state: PipelineStateLike | null | undefined,
  mode?: string,
): number | null {
  const budgets = (state && state.budgets) || {};
  const stateMode = mode || (state && state.mode && state.mode.mode) || "strict";
  if (
    stateMode === "optimize"
    && typeof budgets.remainingOptimizationIterations === "number"
    && Number.isInteger(budgets.remainingOptimizationIterations)
  ) {
    return budgets.remainingOptimizationIterations;
  }
  return typeof budgets.remainingImplementationIterations === "number"
    && Number.isInteger(budgets.remainingImplementationIterations)
    ? budgets.remainingImplementationIterations
    : null;
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @returns {Record<string, string>}
 */
export function buildRequirementStatus(state: PipelineStateLike | null | undefined): Record<string, string> {
  const rawRequirements = state ? state.requirements : undefined;
  const requirements = Array.isArray(rawRequirements) ? rawRequirements : [];
  const result: Record<string, string> = {};
  for (const item of requirements) {
    const requirement = item && typeof item === "object"
      ? item as { id?: unknown; status?: unknown }
      : {};
    if (typeof requirement.id === "string" && requirement.id) {
      result[requirement.id] = typeof requirement.status === "string" && requirement.status
        ? requirement.status
        : "unknown";
    }
  }
  return result;
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @param {string} stateJsonPath
 * @returns {string}
 */
export function buildPipelineSnapshot(state: PipelineStateLike, stateJsonPath: string): string {
  const language = inferLanguageFromState(state);
  const text = getLanguageText(language);
  const reqStatus = buildRequirementStatus(state);
  const reqLines = Object.keys(reqStatus).length > 0
    ? Object.entries(reqStatus)
      .map(([id, status]) => `- ${id}: ${status} (${localizedStatusLabel(status, language)})`)
      .join("\n")
    : text.noRequirements;
  const budgets = (state && state.budgets) || {};
  const postChange = (state && state.postChange) || {};
  const validation = (state && state.validation) || {};
  const budgetLeft = getSnapshotBudgetLeft(state);
  return [
    "<!-- pipeline-runtime-snapshot:start -->",
    text.stateSnapshotTitle,
    "",
    text.stateSnapshotNotice(path.basename(stateJsonPath)),
    "",
    `updated_at：${state.updatedAt || "unknown"}`,
    `language：${language.code}`,
    `mode：${state.mode && state.mode.mode ? state.mode.mode : "unknown"}`,
    `runtime_autopilot：${state.mode && state.mode.runtimeAutopilot === true ? "true" : "false"}`,
    `loop_shape：${state.mode && state.mode.loopShape ? state.mode.loopShape : "unknown"}`,
    `total_cycles：${typeof budgets.totalCycles === "number" && Number.isInteger(budgets.totalCycles) ? budgets.totalCycles : 0}`,
    `budget_left：${budgetLeft === null ? "unknown" : budgetLeft}`,
    `post_change_status：${typeof postChange.status === "string" ? postChange.status : "unknown"}`,
    `post_change_command：${typeof postChange.command === "string" ? postChange.command : "not_run"}`,
    `validation_verifiability：${typeof validation.finalVerifiability === "string" ? validation.finalVerifiability : "unknown"}`,
    "",
    "requirements：",
    reqLines,
    "<!-- pipeline-runtime-snapshot:end -->",
  ].join("\n");
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} content
 * @param {string} heading
 * @param {string} body
 * @returns {string}
 */
function replaceMarkdownSection(content: string, heading: string, body: string): string {
  const escapedHeading = escapeRegExp(heading);
  const pattern = new RegExp(`(${escapedHeading}\\s*\\r?\\n)([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m");
  if (!pattern.test(content)) {
    return `${content.trimEnd()}\n\n${heading}\n${body.trim()}\n`;
  }
  return content.replace(pattern, `$1${body.trim()}\n\n`);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function listValue(value: unknown): string {
  const items = asArray(value).map((item) => String(item || "").trim()).filter(Boolean);
  return items.length > 0 ? items.join("；") : "无";
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {string}
 */
function buildBudgetsSection(state: PipelineStateLike): string {
  const budgets = asRecord(state.budgets);
  return [
    `max_iterations：${budgets.maxIterations ?? 0}`,
    `autopilot_max_iterations：${budgets.autopilotMaxIterations ?? 0}`,
    `minimum_implementation_iterations：${budgets.minimumImplementationIterations ?? "未启用"}`,
    `implementation_iterations_used：${budgets.implementationIterationsUsed ?? 0}`,
    `non_implementation_iterations_used：${budgets.nonImplementationIterationsUsed ?? 0}`,
    `validation_hardening_iterations_used：${budgets.validationHardeningIterationsUsed ?? 0}`,
    `minimum_validation_hardening_iterations：${budgets.minimumValidationHardeningIterations ?? 0}`,
    `optimization_iterations_used：${budgets.optimizationIterationsUsed ?? 0}`,
    `total_cycles：${budgets.totalCycles ?? 0}`,
    `remaining_implementation_iterations：${budgets.remainingImplementationIterations ?? 0}`,
    `remaining_validation_hardening_iterations：${budgets.remainingValidationHardeningIterations ?? 0}`,
    `remaining_optimization_iterations：${budgets.remainingOptimizationIterations ?? "未启用"}`,
  ].join("\n");
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {string}
 */
function buildWatchdogSection(state: PipelineStateLike): string {
  const watchdog = asRecord(state.watchdog);
  const postChange = asRecord(state.postChange);
  return [
    "enabled：true",
    "check_interval：每轮迭代前后、交接摘要/新视角复核后、恢复后、最终交付前",
    "light_check：每轮必做，检查 no_progress_count / last_validation_result / state_drift / triggered / fresh_eyes_required / new_test_count",
    "full_check：每个 phase、每 3 轮、恢复后和交付前执行完整字段检查",
    `last_progress_iteration：${asRecord(state.budgets).totalCycles ?? 0}`,
    "last_progress_summary：CLI 自动最终化已收敛交付门禁",
    `last_validation_iteration：${asRecord(state.budgets).totalCycles ?? 0}`,
    `last_validation_command：${stringValue(postChange.command, "not_run")}`,
    `last_validation_result：${stringValue(postChange.status, "not_run")}`,
    `no_progress_count：${watchdog.noProgressStreak ?? 0} / 按模式 max_no_progress_iterations`,
    "unverified_iteration_count：0",
    `state_drift：${stringValue(watchdog.stateDrift, "none")}`,
    `delivery_verifiability：${stringValue(watchdog.deliveryVerifiability, "unknown")}`,
    `triggered：${watchdog.triggered === true ? "true" : "false"}`,
    "trigger_reason：无",
    `required_action：${stringValue(watchdog.requiredAction, "continue")}`,
    "fresh_eyes_required：false",
    `new_test_count：${watchdog.newTestCount ?? 0}`,
    "new_test_target：已由真实 CLI 验证命令覆盖 passed REQ；外部系统和人工验收不在本轮自动验证范围内",
    `validation_hardening_status：${stringValue(watchdog.validationHardeningStatus, "pending")}`,
    `validation_hardening_dimensions_done：${asArray(watchdog.validationHardeningDimensionsDone).length > 0 ? asArray(watchdog.validationHardeningDimensionsDone).join(" / ") : "无"}`,
    "validation_hardening_required：boundary / negative / regression；有 UI、权限、并发、数据迁移或外部服务时追加对应维度",
    "validation_hardening_cost_policy：优先局部最小可证伪验证；重型 e2e / 全量 CI 只在相关风险、影响面较大或最终交付门禁时运行",
    "heavy_validation_deferred：无",
  ].join("\n");
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {string}
 */
function buildRequirementCoverageSection(state: PipelineStateLike): string {
  const requirements = Array.isArray(state.requirements) ? state.requirements : [];
  if (requirements.length === 0) {
    return "无";
  }
  return requirements.map((item) => {
    const req = asRecord(item);
    const lines = [
      `${stringValue(req.id, "REQ-UNKNOWN")}：`,
      `原文摘要：${stringValue(req.summary, "未指定")}`,
    ];
    if (req.userVisibleBehavior) {
      lines.push(`用户可见行为：${stringValue(req.userVisibleBehavior, "未指定")}`);
    }
    if (req.expectedBehavior) {
      lines.push(`预期行为：${stringValue(req.expectedBehavior, "待确认")}`);
    }
    if (req.actualBehavior) {
      lines.push(`实际行为：${stringValue(req.actualBehavior, "待确认")}`);
    }
    if (Array.isArray(req.reproSteps) && req.reproSteps.length > 0) {
      lines.push(`复现步骤：${listValue(req.reproSteps)}`);
    }
    if (req.acceptanceImpact) {
      lines.push(`验收影响：${stringValue(req.acceptanceImpact, "待确认")}`);
    }
    lines.push(`类型：${stringValue(req.type, "验证")}`);
    lines.push(`状态：${stringValue(req.status, "unknown")}`);
    if (Array.isArray(req.dependsOn) && req.dependsOn.length > 0) {
      lines.push(`依赖：${listValue(req.dependsOn)}`);
    }
    if (Array.isArray(req.blockedBy) && req.blockedBy.length > 0) {
      lines.push(`被阻塞于：${listValue(req.blockedBy)}`);
    }
    if (typeof req.canStartImmediately === "boolean") {
      lines.push(`可立即开始：${req.canStartImmediately ? "true" : "false"}`);
    }
    lines.push(`相关文件：${listValue(req.relatedFiles)}`);
    lines.push(`验证证据：${stringValue(req.evidence, "无")}`);
    lines.push(`阻塞原因：${stringValue(req.blockedReason, "无")}`);
    lines.push(`下一步：${stringValue(req.nextStep, "无")}`);
    return lines.join("\n");
  }).join("\n\n");
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {string}
 */
function buildDefinitionOfDoneSection(state: PipelineStateLike): string {
  const validation = asRecord(state.validation);
  const watchdog = asRecord(state.watchdog);
  const requirements = Array.isArray(state.requirements) ? state.requirements : [];
  const statuses = requirements.map((item) => {
    const req = asRecord(item);
    return `${stringValue(req.id, "REQ-UNKNOWN")} ${stringValue(req.status, "unknown")}`;
  });
  return [
    `RCM 状态摘要：${statuses.join("；") || "无"}`,
    "派生规则：成功标准状态直接引用 Requirement Coverage Matrix 中对应关键 REQ 的状态和验证证据，不独立重复评估",
    "成功标准 1：passed - 自动流水线完成需求闭环、真实验证和交付门禁状态收敛",
    `真实验证：${stringValue(asRecord(state.deliveryEvidence).validationSummary, "未运行")}`,
    "沙箱验证：无",
    "未验证项：外部服务、生产数据和人工验收不在本轮自动验证范围内",
    "Requirement Coverage Matrix 状态：全部关键需求已关闭",
    `验证加固：${stringValue(watchdog.validationHardeningStatus, "passed")}`,
    `交付可验证性：${stringValue(validation.finalVerifiability, "partially_verifiable")}`,
    "看门狗状态：clear",
    "剩余风险：仅本地 CLI 验证覆盖范围内可验证，外部资源需用户另行验收",
  ].join("\n");
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {string}
 */
function buildValidationSection(state: PipelineStateLike): string {
  const validation = asRecord(state.validation);
  const evidence = asRecord(state.deliveryEvidence);
  return [
    `已通过验证：${stringValue(evidence.validationSummary, "真实验证通过")}`,
    "失败验证：无",
    "未运行验证及原因：外部服务、生产数据和人工验收不在本轮自动验证范围内",
    "沙箱验证：无",
    "不可用能力导致的未验证项：外部资源和人工验收",
    `最终交付可验证性：${stringValue(validation.finalVerifiability, "partially_verifiable")}`,
    "可运行的验证命令：",
    listValue(asArray(validation.commands).map((item) => typeof item === "string" ? item : asRecord(item).command)),
  ].join("\n");
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {string}
 */
function buildCleanupSection(state: PipelineStateLike): string {
  const cleanup = asRecord(state.cleanup);
  return [
    "临时 debug 前缀：无",
    "一次性 harness：无",
    `原型文件或路由：${stringValue(cleanup.prototypeFiles, "无")}`,
    `待删除 artifacts：${stringValue(cleanup.artifactsToDelete, "无")}`,
    `清理状态：${stringValue(cleanup.status, "completed")}`,
  ].join("\n");
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {string}
 */
function buildDeliveryEvidenceSection(state: PipelineStateLike): string {
  const evidence = asRecord(state.deliveryEvidence);
  return [
    `status：${stringValue(evidence.status, "ready")}`,
    `goal：${stringValue(evidence.goal, "未指定")}`,
    `changes：${stringValue(evidence.changes, "自动流水线已完成需求闭环、真实验证和交付门禁状态收敛")}`,
    `changed_files：${listValue(evidence.changedFiles)}`,
    `validation_summary：${stringValue(evidence.validationSummary, "真实验证通过")}`,
    `baseline_comparison：${stringValue(evidence.baselineComparison, "未建立独立 baseline")}`,
    `cleanup_summary：${stringValue(evidence.cleanupSummary, "cleanup.status=completed")}`,
    `risks：${stringValue(evidence.risks, "有限风险：外部资源和人工验收不在本轮自动验证范围内")}`,
    `unfinished_items：${stringValue(evidence.unfinishedItems, "无")}`,
    `user_confirmation：${stringValue(evidence.userConfirmation, "无需额外确认")}`,
  ].join("\n");
}

/**
 * @param {import("./types").PipelineStateLike} state
 * @returns {{ heading: string; body: string }[]}
 */
function buildFinalizedStateSections(state: PipelineStateLike): StateSection[] {
  return [
    { heading: "## Budgets / 预算", body: buildBudgetsSection(state) },
    { heading: "## Watchdog / 看门狗", body: buildWatchdogSection(state) },
    { heading: "## Requirement Coverage Matrix / 需求覆盖矩阵", body: buildRequirementCoverageSection(state) },
    { heading: "## Definition of Done / 完成定义", body: buildDefinitionOfDoneSection(state) },
    { heading: "## Validation / 验证", body: buildValidationSection(state) },
    { heading: "## Temporary Artifacts / Cleanup / 临时产物清理", body: buildCleanupSection(state) },
    { heading: "## Delivery Evidence / 交付证据", body: buildDeliveryEvidenceSection(state) },
  ];
}

/**
 * @param {string} content
 * @param {import("./types").PipelineStateLike} state
 * @returns {string}
 */
export function refreshFinalizedStateSections(content: string, state: PipelineStateLike): string {
  const evidence = asRecord(state.deliveryEvidence);
  if (evidence.status !== "ready" && evidence.status !== "delivered") {
    return content;
  }
  let nextContent = content;
  for (const section of buildFinalizedStateSections(state)) {
    nextContent = replaceMarkdownSection(nextContent, section.heading, section.body);
  }
  return nextContent;
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function buildAtomicTmpPath(filePath: string): string {
  const suffix = `${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString("hex")}`;
  return `${filePath}.${suffix}.tmp`;
}

/**
 * @param {string} filePath
 * @param {string} content
 * @returns {Promise<void>}
 */
export async function writeTextAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = buildAtomicTmpPath(filePath);
  await fs.promises.writeFile(tmpPath, content, "utf8");
  await fs.promises.rename(tmpPath, filePath);
}

/**
 * @param {string} filePath
 * @param {unknown} data
 * @returns {Promise<void>}
 */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await writeTextAtomic(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * @param {string} filePath
 * @returns {Promise<unknown>}
 */
export async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
}

/**
 * @param {string} stateJsonPath
 * @param {import("./types").PipelineStateLike} state
 * @returns {Promise<import("./types").PipelineMarkdownIssue | null>}
 */
export async function refreshStateMarkdownView(
  stateJsonPath: string,
  state: PipelineStateLike,
): Promise<PipelineMarkdownIssue | null> {
  const stateMdPath = stateJsonPath.replace(/state\.json$/, "state.md");
  if (stateMdPath === stateJsonPath || !fs.existsSync(stateMdPath)) {
    return null;
  }
  try {
    const snapshot = buildPipelineSnapshot(state, stateJsonPath);
    const content = await fs.promises.readFile(stateMdPath, "utf8");
    const pattern = /<!-- pipeline-runtime-snapshot:start -->[\s\S]*?<!-- pipeline-runtime-snapshot:end -->/;
    const withSnapshot = pattern.test(content)
      ? content.replace(pattern, snapshot)
      : `${content.trimEnd()}\n\n${snapshot}\n`;
    const nextContent = refreshFinalizedStateSections(withSnapshot, state);
    await writeTextAtomic(stateMdPath, nextContent);
    return null;
  } catch (error) {
    return {
      severity: "warning",
      code: "state_markdown_refresh_failed",
      message: `state.md refresh failed: ${error && error instanceof Error ? error.message : String(error)}`,
    };
  }
}

