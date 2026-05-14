# 子 Agent 并发策略

## 定位

本协议是 auto-iterate-coding 的并发增强，面向 AI Coding Agent 的子 Agent 并发调度。当父 Agent 探测到 `子 Agent/并行：available` 时，可按本协议在探索、需求提取、验证和实现四个阶段使用子 Agent 并发加速。

如果当前平台不支持子 Agent 或某种子 Agent 类型不可用，按本协议的降级规则自动回退为串行执行，不阻塞推进。

本策略吸收自社区最佳实践：claude-swarm 的 Supervisor + Quality Gate 模式、Swarms 的并发拓扑（ConcurrentWorkflow / GraphWorkflow / MixtureOfAgents）、a0-parallel-swarm 的 token 预算共享。

语言规则：输出、状态记录和交付总结必须与用户当前提示语言保持一致。用户使用中文时不要突然切换为英文，除非术语、命令、代码、文件名或用户明确要求保留英文的内容。

## 核心原则

- **父 Agent 是唯一协调者**：子 Agent 只执行委派任务并返回结果，不直接修改 `state.json` 或 `state.md`、不直接做跨任务决策、不创建独立 session。
- **Quality Gate**：父 Agent 在所有子 Agent 完成后统一审查、merge 和验证，再进入下一轮迭代。
- **能力降级优先**：任何子 Agent 类型不可用时，自动降级为父 Agent 串行执行，不阻塞协议推进。

## 并发阶段与适用条件

| 阶段 | 适用模式 | 风险 | 并发上限 | 子 Agent 类型 |
| --- | --- | --- | --- | --- |
| 并行探索 | quick / strict / diagnose / plan / optimize / prototype | 低风险（只读） | 4 | explore |
| 并行需求提取 | strict --from / verify --from | 低风险（只读） | 3 | explore |
| 并行验证 | 所有模式 | 低风险（命令可能写缓存/coverage/dist） | 3 | Shell background |
| 并行实现 | Autopilot / strict；quick 仅在文件 ownership 明确时 | 中高风险（读写） | 2 | coder |

## 逻辑角色与平台适配

本协议使用逻辑角色名作为子 Agent 类型。下表为示例映射，Agent 在调度时必须**以当前平台能力探测结果为准**，不得硬编码不存在的能力参数。

| 逻辑角色 | Kimi Code CLI（示例） | Claude Code（示例） | Codex CLI（示例） | 用途 |
| --- | --- | --- | --- | --- |
| explore | `subagent_type="explore"` | agent type 探索 | explorer | 只读代码探索 |
| coder | `subagent_type="coder"` | agent type 实现 | worker | 读写代码实现 |
| background | `run_in_background=true` | background task | --bg | 后台 Shell 任务 |

如果当前平台不支持某种角色对应的具体类型，按降级规则处理（见"子 Agent 能力降级"）。

## 启用门禁与平台适配

父 Agent 只有在完成能力探测并写回 `## Agent Capability Summary` 后，才允许把 `## Sub-Agent Dispatch / 子 Agent 调度` 的 `enabled` 从 `false` 改为 `true`。启用不是全局开关；必须按阶段分别确认 `explore`、`background`、`coder` 是否 available。

启用判定：

1. `子 Agent/并行：available` 且至少一种子 Agent 类型 available，才允许启用并发调度。
2. `explore=available` 时，只能启用阶段一和阶段二。
3. `background=available` 时，只能启用阶段三；验证命令必须声明可能写入的缓存、coverage、dist、snapshot 或临时目录。
4. `coder=available` 时，还必须满足阶段四的安全前提、隔离策略和文件白名单，才允许启用并行实现。
5. 任一能力为 `unknown` 时按 `unavailable` 处理，除非父 Agent 能在当前回合直接探测并更新为 `available`。

平台适配契约（Platform Adapter）：

| 逻辑动作 | Codex CLI 示例 | Claude / Kimi 等平台 | 降级 |
| --- | --- | --- | --- |
| dispatch explore | `spawn_agent(agent_type="explorer")` | 使用只读探索类子 Agent | 父 Agent 串行 grep/rg |
| dispatch coder | `spawn_agent(agent_type="worker")`，且 prompt 写明文件白名单 | 使用实现类子 Agent | 父 Agent 串行实现 |
| wait | `wait_agent(targets=[...], timeout_ms=...)` | 平台等价 wait/join | 父 Agent 串行等待当前任务 |
| cancel / close | `close_agent(target)` | 平台等价 cancel/stop | 标记 failed，不合并结果 |
| background verify | 后台 shell / task | 平台后台任务能力 | 串行运行验证命令 |

如果平台不提供可审计的 cancel/close 能力，超时后必须把该子 Agent 标记为 `failed`，并在后续 Quality Gate 中检查其可能写入的文件；不能假设它已经停止。

### Codex 一轮并发示例

以下示例说明 Codex 类平台的一轮并发探索；其他平台按等价能力映射：

```text
1. 父 Agent 将任务拆成 api / tests / docs 三个只读探索范围。
2. 父 Agent 写入 `state.json` 并刷新 `state.md`：`active_sub_agents` 包含 3 个 explore 任务，并记录当前 `current_phase=explore`。
3. 父 Agent 调用 spawn_agent(agent_type="explorer") 启动 3 个子 Agent。
4. 父 Agent 调用 wait_agent(targets=[...], timeout_ms=sub_agent_timeout_seconds * 1000)。
5. 父 Agent 收集每个子 Agent 的 Sub-Agent Result Schema。
6. 父 Agent 执行 Quality Gate；explore 子 Agent 的 files_changed 必须为空。
7. 父 Agent 合并 mental model，更新 Current State / Watchdog，将 active_sub_agents 追加到 sub_agent_history 并清空。
```

Coder 并发示例必须额外满足：文件 ownership 已写入 Decisions、同 worktree 并发写入已由用户确认、baseline 可审计且 Quality Gate 可执行；否则只能串行实现。

## 调度流程

父 Agent 必须按以下顺序执行，避免并发轮次互相覆盖。状态文件只维护 `examples/state-template.md` 中定义的字段，不额外写入内部流程字段：

```text
idle
  -> planned      已完成任务拆分、能力和隔离检查
  -> dispatched   active_sub_agents 已写入 state.json，state.md 视图已刷新
  -> waiting      子 Agent 已启动，等待结果
  -> collecting   收集 completed / failed / timeout 结果
  -> quality_gate 执行白名单、禁止文件、依赖、artifact、验证检查
  -> merged       通过后写入 Current State / RCM / Watchdog / Budgets
  -> idle         active_sub_agents 清空，结果追加到 sub_agent_history
```

状态写入规则：

- `## Sub-Agent Dispatch / 子 Agent 调度` 只记录模板中已有的 `enabled`、`current_phase`、`active_sub_agents`、`sub_agent_history`、计数和预算字段。
- 同 worktree 并发写入许可、用户确认、coder 文件 ownership 和降级策略记录在 `## Decisions` 的并发决策中。
- 共享文件、验证副作用、临时产物、审计边界和 baseline 只作为父 Agent 运行时检查、Quality Gate 证据或子 Agent prompt 合约记录，不扩展为新的 state schema 字段。
- 子 Agent 返回结果是否完整由父 Agent 在 Quality Gate 中判断；不把结果完整性写成独立状态字段。

失败流转：

- `waiting -> collecting` 时发现超时：对应子 Agent `status=failed`、`failure_reason=timeout`、`merge_status=skipped`。
- `quality_gate` 任一检查失败：`last_merge_result=partial`，失败子任务转串行修复。
- `quality_gate` 发现禁止文件或文件冲突：`state_drift=suspected/confirmed`，进入 `reconcile`，不得继续 dispatch 新子 Agent。
- 父 Agent 在 `active_sub_agents` 非空时不得开始下一轮 dispatch。

父 Agent 最小调度伪代码：

```text
1. capability_probe()
2. split_tasks_by_phase()
3. ensure active_sub_agents is empty
4. write planned dispatch to state.json and refresh state.md
5. spawn supported agents or degrade unsupported tasks to serial
6. wait until all complete, fail, or timeout
7. collect each Sub-Agent Result Schema
8. run Quality Gate
9. if passed: merge results, update budgets, move active_sub_agents to sub_agent_history
10. if failed: mark partial, move failed/skipped entries to history, continue serial repair or ask_user
```

## Baseline 与状态写入约束

并发调度前后必须维护轻量 baseline，防止父 Agent 把用户修改、验证副作用或其他子 Agent 的写入误判为当前子 Agent 的结果。

dispatch 前：

- 记录当前分支、已存在 diff 摘要、关键文件 mtime 或可用的 git status，作为本轮 baseline。
- 如果存在未归属的用户修改，父 Agent 必须先记录为 baseline；无法建立 baseline 时不得启用 coder 并发。
- 子 Agent prompt 中必须声明不得读写 `.agent-state/`；状态文件只能由父 Agent 更新。

merge 后：

- 记录 Quality Gate 后的 diff 摘要、共享文件变更和允许保留的 artifact，作为下一轮 baseline。
- 由父 Agent 更新 `active_sub_agents`、`sub_agent_history`、Watchdog、Budgets 和 RCM。
- 下一轮 dispatch 必须以前一轮 merge 后的审计结果作为 baseline。

禁止事项：

- 子 Agent 不得读写 `.agent-state/` 或自行更新 session 状态。
- 父 Agent 不得在上一轮 `active_sub_agents` 尚未清空时开始新 dispatch。
- 如果检测到 state.json 或 state.md 在子 Agent 运行期间被外部修改，必须标记 `state_drift=confirmed` 并进入 reconcile。

### active_sub_agents 生命周期示例

dispatch 前：

```text
current_phase：explore
active_sub_agents：
  - id：explore-api-1
    type：explore
    task：梳理 src/api 入口、调用方和测试
    files_assigned：src/api/**, test/api/**
    status：planned
    failure_reason：无
    started_at：未开始
    completed_at：未开始
    result_summary：未开始
    merge_status：pending
```

waiting 中：

```text
current_phase：explore
active_sub_agents：
  - id：explore-api-1
    type：explore
    task：梳理 src/api 入口、调用方和测试
    files_assigned：src/api/**, test/api/**
    status：running
    failure_reason：无
    started_at：2026-05-11T00:00:00Z
    completed_at：未开始
    result_summary：未开始
    merge_status：pending
```

merge 后：

```text
current_phase：idle
active_sub_agents：无
sub_agent_history：
  - round：1
    agent_id：explore-api-1
    type：explore
    task_summary：发现 API 入口在 src/api/auth.ts
    merge_result：success
    files_changed：无
    validation_result：not_run
    failure_reason：无
```

## 不应并发的情况

以下情况即使平台支持子 Agent，也应优先串行：

- 任务只涉及单文件或单一小修改，并发拆分成本高于收益。
- 架构落点、文件 ownership 或成功标准不清晰。
- 当前 worktree 存在用户未提交修改，且父 Agent 无法区分用户修改和子 Agent 修改。
- 需要修改共享生成文件、锁文件、快照、schema 输出或全仓格式化结果。
- 验证命令 flaky，无法区分并发副作用和真实失败。
- 任务需要密钥、数据库、外部服务或产品决策，且资源尚未确认。
- `active_sub_agents` 非空、`Watchdog.triggered=true` 或 state 已经 drift。

## 共享文件与生成物规则

以下文件默认视为共享文件，不能分配给多个 coder 子 Agent，也不能由子 Agent 意外修改：

- 依赖与锁文件：`package.json`、`package-lock.json`、`yarn.lock`、`pnpm-lock.yaml`、`requirements.txt`、`go.mod`、`go.sum`。
- 项目级配置：`tsconfig.json`、lint/format/test/build 配置、CI 配置。
- 生成物：`dist/`、`build/`、`coverage/`、`.cache/`、测试快照、schema 生成输出。
- 状态目录：`.agent-state/` 下所有文件。

如果某个共享文件确实需要修改，父 Agent 必须将该文件作为单独串行任务处理，或只分配给一个 coder 子 Agent，并在 `coder_file_ownership` 中记录唯一 owner。

## 审计边界

并发约束分为可审计和仅合约约束：

| 约束 | 审计级别 | 检查方式 |
| --- | --- | --- |
| 禁止写 `.agent-state/` | verifiable | diff / 文件 mtime / git status |
| 禁止读 `.agent-state/` | contract-only | prompt 合约；平台无读审计时标记不可验证 |
| 文件白名单 | verifiable | `files_changed` 与 diff 对比 |
| 禁止新增依赖 | verifiable | 依赖/锁文件 diff |
| 禁止子 Agent 间通信 | contract-only | prompt 合约；异常迹象由父 Agent 判断 |
| 禁止密钥写入 | partially_verifiable | diff 扫描 + 人工审查 |

最终交付中必须区分 `verifiable` 与 `contract-only` 约束；contract-only 失败无法排除时，交付可验证性不得标记为完全 verifiable。

## 并行验证副作用

并行验证不是严格只读。父 Agent dispatch background 验证前必须声明每个命令允许写入的目录或文件：

```text
命令：npm test
允许 artifact：coverage/、.nyc_output/、测试临时目录
清理策略：保留 / 删除 / 忽略但记录
```

未声明的验证副作用视为 Quality Gate 失败；如果验证命令会写共享快照、更新 golden 文件或格式化源码，不能并行执行，必须串行并由父 Agent 审查 diff。

## 阶段一：并行探索（Explore Fan-out）

触发条件：进入 quick 模式的代码库探索、strict 模式的现状探索、prototype 前探索、或任何需要跨多模块搜索的阶段。

调度规则：

- 父 Agent 先将探索范围拆成 2-4 个互不重叠的区域（按目录、模块或文件类型拆分）。
- 并发启动 explore 子 Agent，每个负责一个区域。
- 每个子 Agent 的 prompt 必须包含：探索范围、检查清单（入口、类型、调用方、测试、项目约定）、输出格式要求。
- 探索结果不写 `state.json` 或 `state.md`，只返回给父 Agent。

合并规则：

- 父 Agent 等待所有子 Agent 完成后统一合并。
- 生成统一 mental model：当前能力 / 缺口 / 可能修改点 / 相关测试或验证方式。
- 将合并结果写入 `state.json` 的 Current State，并刷新 `state.md` 的 `## Current State` 视图。
- 最后更新 Watchdog。

## 阶段二：并行需求提取（REQ Fan-out）

触发条件：strict --from 或 verify --from 导入的 PRD 文档超过 500 行，或包含多个独立章节。

调度规则：

- 父 Agent 按 PRD 章节拆分为多个区段。
- 并发启动 explore 子 Agent，每个负责提取一个区段的需求。
- 输出格式统一为 REQ 条目：ID（临时占位）、原文摘要、类型、相关文件占位、下一步。

合并规则：

- 父 Agent 统一编号 REQ-001...REQ-N。
- 去重处理（不同章节可能描述同一需求，以最完整描述为准）。
- 统一写入 `## Requirement Coverage Matrix`。
- 确认成功后更新 `state.json` 并刷新 `state.md`。

## 阶段三：并行验证（Verify Fan-out）

触发条件：每轮实现迭代后需要同时运行 test、build、typecheck、lint 等独立验证命令。

调度规则：

- 父 Agent 将互不依赖的验证命令作为后台 Shell 任务并发启动。
- test、build、typecheck 互不依赖，可完全并行。

合并规则：

- 父 Agent 收集所有验证结果。
- 全部通过 → 计入成功验证，更新 Watchdog `last_validation_result=passed`。
- 任一失败 → 提取首个关键失败信号，更新 Watchdog `last_validation_result=failed`，标记 `triggered=true`。
- 结果写入 `state.json` Validation，并刷新 `state.md` 的 `## Validation` 视图区。

## 阶段四：并行实现（Coder Fan-out）

触发条件：

- Autopilot / strict 模式下，任务拆解出的垂直切片涉及互不相交的文件集合。
- quick 模式下默认不启用 coder 并发；只有父 Agent 已明确 `coder_file_ownership`、隔离策略和 Quality Gate 时才允许。
- strict 模式下，用户明确允许并发实现。
- 父 Agent 已在 Architecture Confirmation 中完成文件落点确认（记录在 `state.json` Decisions，并刷新到 `state.md` 的 `## Decisions`）。

安全前提（必须全部满足，否则串行执行）：

1. 父 Agent 已完成架构确认和文件拆分，并写入 `state.json` Decisions，刷新 `state.md` 的 `## Decisions`。
2. 每个 coder 子 Agent 分配的文件集合互不相交。
3. 子 Agent 禁止直接写入 `state.json` 或 `state.md` —— 只有父 Agent 有写入权。子 Agent 也不得读取 `.agent-state/` 下任何文件。
4. 所有子 Agent 完成后，父 Agent 执行 reconcile → 统一验证 → 合并状态。
5. 并行写入分两档安全边界：
   - **档一（有隔离）**：项目使用了 git worktree 或等效 patch bundle 隔离机制 → 允许 coder 子 Agent 并发写入。
   - **档二（无隔离）**：项目在同一 worktree 下、无 patch 隔离 → 默认只允许 explore 并发和 verify 并发；coder 并发写入需要用户在 `state.json` Decisions / `state.md` `## Decisions` 的并发决策中显式确认允许同 worktree 并发写入，且父 Agent 必须记录无隔离风险和回退方案。

调度规则：

- 父 Agent 启动并行实现前，先检测是否存在 git worktree 或等效隔离机制。
  - 档一：正常按垂直切片 dispatch。
  - 档二：父 Agent 在 prompt 中询问用户是否允许并行写入；用户确认后写入 `## Decisions` 才 dispatch。
- 每个子 Agent 的 prompt 必须包含：允许修改的文件（显式白名单）、禁止修改的文件、允许生成的 artifact、需要保持兼容的接口/命令/行为。
- 子 Agent 完成后只返回结果摘要（修改文件列表、验证结果、关键 diff 摘要）给父 Agent。

合并规则（Quality Gate）：

- 父 Agent 逐一审查每个子 Agent 的 diff，检查是否符合架构约定和兼容约束。
- 执行 reconcile：检查文件冲突、状态一致性、跨子 Agent 副作用。
- 统一运行所有验证命令（并行验证阶段三）。
- 更新 `state.json`：Current State、Requirement Coverage Matrix、Watchdog、Definition of Done，并刷新 `state.md` 对应视图。

## 迭代计数规则

- 并行探索：不计入 `implementation_iterations_used`。
- 并行需求提取：不计入 `implementation_iterations_used`。
- 并行验证（纯验证，无修改）：不计入 `implementation_iterations_used`。
- 并行实现：同一轮内的 N 个 coder 子 Agent 合并计为 1 轮实现迭代（`implementation_iterations_used += 1`）。

## 子 Agent 预算控制

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `max_sub_agent_rounds` | 3 | 单次 session 中最多并行实现轮次；达到后降级为串行 |
| `sub_agent_timeout_seconds` | 300 | 单个子 Agent 最长执行时间；超时标记 failed |
| `max_failed_sub_agents` | 2 | 累计失败子 Agent 数达到上限后，后续实现全部串行 |
| `token_budget_hint` | 未设置 | 可选提示；子 Agent 应在此范围内完成；仅作参考不强制 |
| `concurrency_limit` | 3 | 默认总并发上限；适用于 explore / req_extract / background verify |

触发降级：

- `failed_count >= max_failed_sub_agents` → 停止并行实现，后续轮次全部串行。
- 单个子 Agent 超时 → 标记 failed，该子任务转为父 Agent 串行执行。
- 任务需要写入但没有隔离机制、同 worktree 用户确认或明确文件 ownership → 禁止 coder 并发。
- 同 worktree 下用户未明确允许并发写入 → 禁止 coder 并发。
- `coder` 并发请求数超过默认上限 2 → 拆成多轮或串行执行。

## 失败恢复决策表

| 失败类型 | 状态更新 | 下一步 |
| --- | --- | --- |
| timeout | `status=failed`、`failure_reason=timeout`、`merge_status=skipped` | close/cancel 可用则关闭；不可用则审计可能写入文件，转串行 |
| result schema incomplete | `status=failed`、`merge_status=skipped`、`failure_reason=incomplete_result` | 不合并，父 Agent 串行补查或重新委派 |
| validation failed | `last_merge_result=partial`、`Watchdog.triggered=true` | 提取首个失败信号，识别 owner，下一轮串行修复 |
| file conflict | `state_drift=confirmed`、`last_merge_result=partial` | 进入 reconcile，停止新 dispatch |
| forbidden file touched | `state_drift=confirmed`、`merge_status=skipped` | 回退或请求用户决策，后续串行 |
| user decision required | `status=blocked`、`required_action=ask_user` | 暂停并请求决策 |

## 并发安全门禁

父 Agent 必须在以下时机执行 reconcile check：

- 所有子 Agent 完成后、merge 前。
- 合并修改到 `state.json` 并刷新 `state.md` 前。
- 统一验证前。

并行实现后验证失败的处理：

- 父 Agent 提取首个关键失败信号，识别最相关的子 Agent 任务。
- 下一轮自动切换为串行修复（只派一个 coder 子 Agent 或父 Agent 直接修复）。
- 如果同一个子 Agent 连续 2 轮失败，降级为父 Agent 直接接管该任务。

文件冲突检测：

- 如果父 Agent 发现两个子 Agent 意外修改了同一文件，标记 `state_drift = suspected`。
- 进入串行 reconcile 阶段：手动检查冲突文件、回退到安全基线或请求用户决策。

### Quality Gate 检查清单

父 Agent 在 merge 前必须逐项检查，全部通过才允许合并：

1. **白名单符合**：每个子 Agent 的修改文件均在其分配的白名单内，无越界修改。
2. **禁止文件未触碰（写入）**：`.agent-state/` 目录下所有文件未被**修改**（通过 diff 检查）；读取禁止由 prompt 合约约束，若当前平台无法审计子 Agent 的读取行为，标记为不可验证约束。
3. **无新增依赖**：`package.json` / `requirements.txt` / `go.mod` 等依赖文件未被意外修改；如有新增依赖，父 Agent 审查合理性。
4. **RCM 状态一致**：子 Agent 实现的 REQ 条目状态可从 `pending` 推进到 `implemented`，不得跳过。
5. **验证命令全部通过**：阶段三的并行验证结果均为 passed。
6. **无临时 artifact 残留**：子 Agent 未遗留 debug 日志、harness、临时路由或一次性文件。
7. **预算计数已更新**：`implementation_iterations_used` 已 +1，`remaining_implementation_iterations` 已 -1。
8. **结果 schema 完整**：每个子 Agent 均返回 `status`、`files_changed`、`validation`、`risks` 和 `handoff`；缺失关键字段视为不完整结果。

任一检查项失败 → 标记 `last_merge_result=partial`，对失败项进入串行修复。

### Quality Gate 操作步骤

父 Agent 执行 Quality Gate 时按固定顺序操作，避免先更新状态再发现合并失败：

1. 收集每个子 Agent 的 Sub-Agent Result Schema，缺失关键字段则把该子 Agent 标记为 `status=failed`、`merge_status=skipped`、`failure_reason=incomplete_result`。
2. 检查 `files_changed` 是否完全落在该子 Agent 的 `files_assigned` 白名单内。
3. 检查 `.agent-state/`、依赖文件、锁文件、生成物目录和未声明 artifact 是否被修改。
4. 检查不同 coder 子 Agent 的 `files_changed` 是否互斥；发现重叠立即进入 `reconcile`。
5. 运行或收集阶段三验证命令；任一失败时提取首个关键失败信号。
6. 只有全部检查通过时，才把相关 REQ 从 `pending` 推进到 `implemented`；只有真实验证通过后才推进到 `passed`。
7. 更新 `last_merge_result`、`Watchdog`、`Budgets`，并将本轮 `active_sub_agents` 追加到 `sub_agent_history`。

Quality Gate 结果写入规则：

- 全部通过：`last_merge_result=success`。
- 部分通过：`last_merge_result=partial`，失败项 `merge_status=skipped`。
- 无法审计：`last_merge_result=partial`，`delivery_verifiability=partially_verifiable / not_verifiable`，不得成功交付。

## 子 Agent 能力降级

- 平台不支持子 Agent → 全部四个阶段降级为单 Agent 串行（现有 Behavior）。
- 平台不支持 `explore` 子 Agent → 阶段一、二降级为父 Agent 使用 Shell/Grep 串行探索。
- 平台不支持 `background` 任务 → 阶段三降级为父 Agent 串行运行验证命令。
- 平台不支持 `coder` 子 Agent → 阶段四降级为父 Agent 串行实现；阶段一、二、三不受影响。

## 子 Agent Prompt 合约

父 Agent 向子 Agent 委派任务时，prompt 必须包含以下要素：

- **Session 身份**：明确告知子 Agent 本次调度的 session 名称、所属模式，以及它是父 Agent 的子任务，不是独立 session。子 Agent 不得自行创建或切换 session。
- **任务描述和成功标准**：明确子 Agent 需要完成什么、如何判断完成。
- **文件白名单或黑名单**：允许操作的文件列表（explore 为搜索范围，coder 为修改白名单）。
- **禁止访问的文件**：显式列出 `.agent-state/` 目录下的所有文件（state.json、state.md、start-prompt.md、auto-iterate-current.json）为禁止读写。
- **输出格式要求**：规定子 Agent 返回的摘要格式。
- **禁止事项**：不得修改 state.json 或 state.md、不得写入密钥/token、不得执行破坏性 git 命令、不得新增依赖、不得创建或切换 session。
- **超时预期**：避免子 Agent 无限等待。

### 委派 Prompt 模板

父 Agent 可以按以下模板委派 explore、coder 或 background 子任务。模板中的字段必须由父 Agent 填实，不能让子 Agent 自行读取 state.json 或 state.md 补全。

```text
Session：<session-name>
模式：<mode>
你的角色：父 Agent 委派的 <explore|coder|background> 子任务执行者，非独立 session。

任务：
<明确任务描述>

成功标准：
<完成后必须满足的条件>

允许读取范围：
<目录或文件列表>

允许修改文件：
<coder 专用；必须是显式白名单；explore/background 写“无”>

允许生成的 artifact：
<允许的临时文件、coverage、dist、cache 或“无”>

禁止：
- 读取或写入 .agent-state/ 下任何文件。
- 创建、恢复或切换 auto-iterate session。
- 修改未列入白名单的文件。
- 新增依赖、写入密钥/token、执行破坏性 git 命令。
- 与其他子 Agent 通信或依赖其他子 Agent 的隐式状态。

验证：
<可运行命令；没有则写 not_run 和原因>

超时：
<sub_agent_timeout_seconds> 秒；超时前返回已完成部分和阻塞原因。

返回格式：
严格按 Sub-Agent Result Schema 返回，不要输出大段源码或完整日志。
```

## Sub-Agent Result Schema

子 Agent 必须用父 Agent 指定语言返回结构化摘要，不返回大段源码或完整日志。父 Agent 不能只根据自然语言“已完成”合并结果，必须检查以下字段：

```text
agent_id：
type：explore / coder / background
status：completed / failed / blocked
task_summary：
files_read：
files_changed：
artifact_paths：
validation：
  - command：
    result：passed / failed / not_run
    first_failure_signal：
requirements_affected：
diff_summary：
risks：
blocked_reason：
handoff：下一步建议或需要父 Agent 处理的事项
```

字段规则：

- `files_changed` 对 explore/background 通常为空；如果非空，父 Agent 必须按越界修改处理。
- `artifact_paths` 必须只包含允许生成的临时产物；未声明的 artifact 触发 Quality Gate 失败。
- `validation.result=passed` 只能来自真实运行结果；不能用静态推断替代。
- `blocked_reason` 非空时，父 Agent 不得把该子任务对应 REQ 推进到 `implemented` 或 `passed`。
- `handoff` 用于父 Agent 合并，不允许要求其他子 Agent 自行读取 state 或互相通信。

最小合格返回示例：

```text
agent_id：explore-auth-1
type：explore
status：completed
task_summary：梳理登录入口、调用方和相关测试
files_read：src/auth.ts, test/auth.test.js
files_changed：无
artifact_paths：无
validation：
  - command：not_run
    result：not_run
    first_failure_signal：只读探索不运行验证
requirements_affected：REQ-001
diff_summary：无
risks：未验证运行时行为
blocked_reason：无
handoff：父 Agent 可继续检查 src/auth.ts 的 token 过期分支
```

不合格返回示例：

```text
已完成，没问题。
```

不合格原因：缺少 `agent_id`、`type`、`status`、`files_changed`、`validation`、`risks` 和 `handoff` 等关键字段。父 Agent 必须标记 `failure_reason=incomplete_result`，不得合并或推进 RCM。

## Session 隔离与上下文传递

子 Agent 不拥有独立 session，所有子 Agent 的工作都归属父 Agent 的当前 session。本节规定父 Agent 如何将 session 上下文安全地传递给子 Agent，以及如何防止子 Agent 污染 session 状态。

### 子 Agent 的 Session 身份

- 子 Agent 是**无状态临时工人**，不创建、不拥有、不切换 session。
- 父 Agent 在委派 prompt 中注入当前 session 名和模式，子 Agent 只在返回结果中引用该身份，不做任何 session 操作。
- 子 Agent 如果主动读取 state.json 或 state.md 并根据其内容改变行为，属于协议违规；子 Agent 只依据父 Agent 在 prompt 中给出的任务描述和约束执行。

### 父 Agent 的上下文注入清单

父 Agent 向每个子 Agent 委派时，必须注入以下最小上下文：

```text
Session：<session-name>
模式：<mode>
你的角色：父 Agent 委派的子任务执行者，非独立 Agent。
禁止：读取或写入 .agent-state/ 下任何文件。
禁止：创建或切换 session。
完成标准：返回以下格式的结果摘要。
```

### 子 Agent 间隔离

- 子 Agent 之间不直接通信，不共享上下文。
- 如果任务 B 依赖任务 A 的结果，父 Agent 在任务 A 完成后将结果注入任务 B 的 prompt，而不是让 B 去查询 A。
- explore 类型的子 Agent 允许搜索区域重叠（无副作用），coder 类型必须文件集互斥。

### 子 Agent 异常时的 Session 安全

- 子 Agent 超时/崩溃/返回不完整结果 → 父 Agent 在 Sub-Agent Dispatch 中标记 `failed`，不合并该子 Agent 的结果，不更新 state.json / state.md 中的需求状态。
- 子 Agent 连续 2 轮失败 → 父 Agent 降级为串行执行该子任务（见 `## 并发安全门禁`）。
- 子 Agent 意外修改了禁止文件 → 父 Agent 在 reconcile 阶段检测 diff 并回退，标记 `state_drift = confirmed`，进入串行修复。

### 多轮并发的 Session 一致性

- 每轮 dispatch 前，父 Agent 必须确认 `active_sub_agents` 已清空（上一轮完成或失败的子 Agent 已移入 `sub_agent_history`）。
- 每轮 merge 后，父 Agent 更新 state.json 的全局进度（At-a-Glance / Current State / Watchdog / Budgets）并刷新 state.md，当前轮的子 Agent 结果移入 `sub_agent_history`，清空 `active_sub_agents`。
- `sub_agent_history` 为只追加日志，不清空，用于跨轮次追踪和恢复审计。
- 恢复 session 时，按子 Agent 状态分别处理：
  - `status=completed, merge_status=merged` → 正常清空（结果已吸收），移入 `sub_agent_history`。
  - `status=completed, merge_status=pending` → 父 Agent 重新执行 Quality Gate 检查清单，通过后 merge 并移入 `sub_agent_history`；不通过则标记 `merge_status=skipped`，该子任务转为串行。
  - `status=running, merge_status=pending` → 标记为 `failed`（无法恢复运行中子 Agent），该子任务转为串行。
  - `status=failed` → 保持 failed，移入 `sub_agent_history`，不合并结果。
- 不自动 resume 任何未完成的子 Agent；父 Agent 必须显式决定 retry 或 discard。

## validate-state 校验

`fastcar-cli auto-iterate --validate-state [session|state.md|state.json]` 是只读校验入口，用于检查完整 auto-iterate session 基线和 Agent 工具执行并发协议后留下的 session state 是否存在明显违规。它不负责启动、停止或调度子 Agent，也不替代父 Agent 的 Quality Gate。

session 基线校验覆盖：

- 18 个必需章节是否存在。
- `state.json`、`state.md`、`start-prompt.md`、`auto-iterate-current.json` 是否存在且指向同一 session；旧 state.md-only session 恢复时应标记 degraded。
- `auto-iterate-current.json.stateFile`、`promptFile`、`session` 是否与 `## Session / 会话` 一致。
- `auto-iterate-current.json.promptFile` 是否真实存在，避免恢复时拿到失效启动提示。
- `total_cycles` 是否等于 `implementation_iterations_used + optimization_iterations_used`。
- `minimum_implementation_iterations` 是否小于等于 `max_iterations`，以及已用轮次是否达到下限。
- `remaining_implementation_iterations = 0`、`Watchdog.triggered=true`、`state_drift=suspected/confirmed`、`delivery_verifiability=unknown/not_verifiable` 等恢复或交付风险。
- RCM 仍有 `pending / implemented / not_verified / blocked` 时，DoD 是否错误标记为可完整交付。
- RCM 已有 `passed` 时，Watchdog 和 Validation 是否记录最近验证证据。
- `Temporary Artifacts / Cleanup` 是否仍有待清理项。

sub-agent 协议校验覆盖：

- `current_phase` 是否与 active 子任务类型一致，且 `active_sub_agents` 非空时不允许新 dispatch。
- coder 类型 `files_assigned` 是否互斥。
- 无隔离、无用户确认或无文件 ownership 时是否错误启用了 coder 并发。
- 返回结果不完整的子 Agent 是否被错误 merge。
- `last_merge_result=partial/failed` 时是否错误推进 RCM 到 `passed`。
- `active_sub_agents` 完成后是否已移入 `sub_agent_history`。
