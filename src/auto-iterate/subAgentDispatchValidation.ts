import {
  addError,
  addWarning,
} from "./stateValidationPrimitives";
import {
  extractSection,
  parseScalar,
  parseSubAgentList,
  splitAssignedFiles,
  type ParsedSubAgentItem,
} from "./stateMarkdownParsers";

type ValidationIssue = {
  severity: "error" | "warning";
  message: string;
};

export interface SubAgentDispatchValidationResult {
  issues: ValidationIssue[];
}

function expectedSubAgentTypesForPhase(currentPhase: string): string[] {
  switch (currentPhase) {
    case "explore":
    case "req_extract":
      return ["explore"];
    case "verify":
      return ["background"];
    case "implement":
      return ["coder"];
    default:
      return [];
  }
}

function missingSubAgentFields(
  agent: ParsedSubAgentItem,
  requiredFields: string[],
): string[] {
  return requiredFields.filter((field) => {
    const value = agent[field];
    return !value || value === "无" || value === "未开始" || value === "未完成";
  });
}

export function validateSubAgentDispatchState(
  content: string,
): SubAgentDispatchValidationResult {
  const issues: ValidationIssue[] = [];
  const dispatch = extractSection(content, "## Sub-Agent Dispatch / 子 Agent 调度");
  const decisions = extractSection(content, "## Decisions / 已确认决策") ||
    extractSection(content, "## Decisions");
  const rcm = extractSection(content, "## Requirement Coverage Matrix / 需求覆盖矩阵") ||
    extractSection(content, "## Requirement Coverage Matrix");

  if (!dispatch) {
    return {
      issues: [
        {
          severity: "error",
          message: "缺少 ## Sub-Agent Dispatch / 子 Agent 调度 章节",
        },
      ],
    };
  }

  const currentPhase = parseScalar(dispatch, "current_phase", "unknown");
  const enabled = parseScalar(dispatch, "enabled", "unknown");
  const lastMergeResult = parseScalar(dispatch, "last_merge_result", "unknown");
  const failedCount = Number.parseInt(parseScalar(dispatch, "failed_count", "0"), 10) || 0;
  const completedCount = Number.parseInt(parseScalar(dispatch, "completed_count", "0"), 10) || 0;
  const dispatchedCount = Number.parseInt(parseScalar(dispatch, "dispatched_count", "0"), 10) || 0;
  const maxFailed = Number.parseInt(parseScalar(dispatch, "max_failed_sub_agents", "2"), 10) || 2;
  const active = parseSubAgentList(dispatch, "active_sub_agents");
  const history = parseSubAgentList(dispatch, "sub_agent_history");
  const parallelWriteAllowed = parseScalar(decisions, "parallel_write_allowed", "false");
  const ownership = parseScalar(decisions, "coder_file_ownership", "");
  const enabledValue = String(enabled).trim();
  const enabledIsTrue = enabledValue.startsWith("true");
  const expectedTypes = expectedSubAgentTypesForPhase(currentPhase);

  if (enabledIsTrue && currentPhase === "idle" && active.length > 0) {
    addError(issues, "current_phase=idle 时 active_sub_agents 必须为空");
  }

  if (!enabledIsTrue && active.length > 0) {
    addError(issues, "enabled 非 true 时不得存在 active_sub_agents");
  }

  if (active.length > 0 && currentPhase === "idle") {
    addError(issues, "active_sub_agents 非空时不得处于 idle，也不得开始新 dispatch");
  }

  const coderFileOwners = new Map<string, string>();
  for (const agent of active) {
    const type = agent.type || "";
    const status = agent.status || "";
    const mergeStatus = agent.merge_status || "";
    const agentId = agent.id || agent.raw;
    const missingFields = missingSubAgentFields(
      agent,
      ["id", "type", "task", "files_assigned", "status", "merge_status"],
    );

    if (missingFields.length > 0) {
      addError(issues, `子 Agent ${agentId} 缺少必要字段: ${missingFields.join(", ")}`);
    }

    if (expectedTypes.length > 0 && type && !expectedTypes.includes(type)) {
      addError(issues, `current_phase=${currentPhase} 与子 Agent ${agentId} type=${type} 不一致`);
    }

    if ((status === "completed" || status === "failed") && mergeStatus === "pending") {
      addWarning(issues, `子 Agent ${agentId} 已结束但 merge_status 仍为 pending，进入下一轮前必须 merged 或 skipped`);
    }

    if (type === "coder") {
      const files = splitAssignedFiles(agent.files_assigned);
      if (files.length === 0) {
        addError(issues, `coder 子 Agent ${agentId} 缺少 files_assigned 白名单`);
      }

      for (const file of files) {
        if (coderFileOwners.has(file)) {
          addError(issues, `coder files_assigned 冲突: ${file} 同时分配给 ${coderFileOwners.get(file)} 和 ${agentId}`);
        } else {
          coderFileOwners.set(file, agentId);
        }
      }
    }
  }

  const hasActiveCoder = active.some((agent) => agent.type === "coder");
  if (hasActiveCoder) {
    if (!String(parallelWriteAllowed).includes("true")) {
      addError(issues, "存在 active coder 子 Agent，但 Decisions.parallel_write_allowed 未确认为 true");
    }
    if (!ownership || ownership === "未分配") {
      addError(issues, "存在 active coder 子 Agent，但 coder_file_ownership 未记录 ownership");
    }
  }

  if (failedCount >= maxFailed && hasActiveCoder) {
    addError(issues, "failed_count 已达到 max_failed_sub_agents，后续不得继续 dispatch coder 子 Agent");
  }

  const allAgents = [...active, ...history];
  const observedCompletedCount = allAgents.filter((agent) => agent.status === "completed" || agent.merge_result === "success").length;
  const observedFailedCount = allAgents.filter((agent) => agent.status === "failed" || agent.merge_result === "skipped").length;
  if (dispatchedCount > 0 && dispatchedCount < allAgents.length) {
    addWarning(issues, "dispatched_count 小于 active_sub_agents + sub_agent_history 条目数，请确认计数已更新");
  }
  if (completedCount < observedCompletedCount) {
    addWarning(issues, "completed_count 小于已完成/成功合并的子 Agent 条目数，请确认计数已更新");
  }
  if (failedCount < observedFailedCount) {
    addWarning(issues, "failed_count 小于失败/跳过的子 Agent 条目数，请确认计数已更新");
  }

  if (/partial|failed/.test(lastMergeResult) && /状态：passed/.test(rcm)) {
    addWarning(issues, "last_merge_result 为 partial/failed 时发现 RCM passed，请确认没有错误推进需求状态");
  }

  if (active.some((agent) => /merged|skipped/.test(agent.merge_status || ""))) {
    addWarning(issues, "active_sub_agents 中存在已 merged/skipped 条目，merge 后应移入 sub_agent_history");
  }

  if (history.some((agent) => !agent.agent_id && !agent.id)) {
    addWarning(issues, "sub_agent_history 中存在缺少 agent_id 的记录，恢复审计可能不完整");
  }

  return { issues };
}
