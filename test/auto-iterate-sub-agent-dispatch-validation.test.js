const assert = require("assert");
const {
  validateSubAgentDispatchState,
} = require("../dist/auto-iterate/subAgentDispatchValidation");

const cases = [];

function test(name, fn) {
  cases.push({ name, fn });
}

function messages(result) {
  return result.issues.map((issue) => issue.message);
}

function baseState(dispatchLines, extraLines = []) {
  return [
    "## Sub-Agent Dispatch / 子 Agent 调度",
    ...dispatchLines,
    "## Decisions / 已确认决策",
    "parallel_write_allowed：true",
    "coder_file_ownership：coder-a owns src/a.ts; coder-b owns src/b.ts",
    "## Requirement Coverage Matrix / 需求覆盖矩阵",
    "状态：not_verified",
    ...extraLines,
  ].join("\n");
}

test("reports missing dispatch section", () => {
  const result = validateSubAgentDispatchState("## Task / 任务\n目标：x");

  assert.deepStrictEqual(result.issues, [
    {
      severity: "error",
      message: "缺少 ## Sub-Agent Dispatch / 子 Agent 调度 章节",
    },
  ]);
});

test("accepts idle dispatch with no active agents", () => {
  const result = validateSubAgentDispatchState(baseState([
    "enabled：true",
    "current_phase：idle",
    "active_sub_agents：无",
    "sub_agent_history：无",
    "failed_count：0",
    "completed_count：0",
    "dispatched_count：0",
    "max_failed_sub_agents：2",
    "last_merge_result：none",
  ]));

  assert.deepStrictEqual(result.issues, []);
});

test("rejects active coder when phase and file ownership rules are violated", () => {
  const result = validateSubAgentDispatchState([
    "## Sub-Agent Dispatch / 子 Agent 调度",
    "enabled：true",
    "current_phase：verify",
    "active_sub_agents：",
    "  - id：coder-a",
    "    type：coder",
    "    task：修改 A",
    "    files_assigned：src/shared.ts",
    "    status：running",
    "    merge_status：pending",
    "  - id：coder-b",
    "    type：coder",
    "    task：修改 B",
    "    files_assigned：src/shared.ts",
    "    status：running",
    "    merge_status：pending",
    "sub_agent_history：无",
    "failed_count：0",
    "completed_count：0",
    "dispatched_count：1",
    "max_failed_sub_agents：2",
    "last_merge_result：none",
    "## Decisions / 已确认决策",
    "parallel_write_allowed：false",
    "coder_file_ownership：未分配",
    "## Requirement Coverage Matrix / 需求覆盖矩阵",
    "状态：not_verified",
  ].join("\n"));

  assert(messages(result).includes("current_phase=verify 与子 Agent coder-a type=coder 不一致"));
  assert(messages(result).includes("current_phase=verify 与子 Agent coder-b type=coder 不一致"));
  assert(messages(result).includes("coder files_assigned 冲突: src/shared.ts 同时分配给 coder-a 和 coder-b"));
  assert(messages(result).includes("存在 active coder 子 Agent，但 Decisions.parallel_write_allowed 未确认为 true"));
  assert(messages(result).includes("存在 active coder 子 Agent，但 coder_file_ownership 未记录 ownership"));
  assert(messages(result).includes("dispatched_count 小于 active_sub_agents + sub_agent_history 条目数，请确认计数已更新"));
});

test("warns for completed pending merge, stale counters, and partial passed RCM", () => {
  const result = validateSubAgentDispatchState(baseState([
    "enabled：true",
    "current_phase：implement",
    "active_sub_agents：",
    "  - id：coder-a",
    "    type：coder",
    "    task：修改 A",
    "    files_assigned：src/a.ts",
    "    status：completed",
    "    merge_status：pending",
    "sub_agent_history：",
    "  - agent_id：coder-old",
    "    type：coder",
    "    task：旧任务",
    "    files_assigned：src/old.ts",
    "    status：failed",
    "    merge_status：skipped",
    "    merge_result：skipped",
    "failed_count：0",
    "completed_count：0",
    "dispatched_count：1",
    "max_failed_sub_agents：2",
    "last_merge_result：partial",
  ], ["状态：passed"]));

  assert(messages(result).includes("子 Agent coder-a 已结束但 merge_status 仍为 pending，进入下一轮前必须 merged 或 skipped"));
  assert(messages(result).includes("completed_count 小于已完成/成功合并的子 Agent 条目数，请确认计数已更新"));
  assert(messages(result).includes("failed_count 小于失败/跳过的子 Agent 条目数，请确认计数已更新"));
  assert(messages(result).includes("last_merge_result 为 partial/failed 时发现 RCM passed，请确认没有错误推进需求状态"));
});

test("warns when active agents already have terminal merge status", () => {
  const result = validateSubAgentDispatchState(baseState([
    "enabled：true",
    "current_phase：implement",
    "active_sub_agents：",
    "  - id：coder-a",
    "    type：coder",
    "    task：修改 A",
    "    files_assigned：src/a.ts",
    "    status：completed",
    "    merge_status：merged",
    "sub_agent_history：无",
    "failed_count：0",
    "completed_count：1",
    "dispatched_count：1",
    "max_failed_sub_agents：2",
    "last_merge_result：none",
  ]));

  assert(messages(result).includes("active_sub_agents 中存在已 merged/skipped 条目，merge 后应移入 sub_agent_history"));
});

let passed = 0;
for (const item of cases) {
  try {
    item.fn();
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
