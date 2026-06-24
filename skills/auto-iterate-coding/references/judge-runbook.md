# 主 Agent 裁判 Runbook

> 本文档是裁判职责的**唯一权威来源**。原 `orchestrator.md` 的内容已合并到此处。

## 定位

本 Runbook 是默认自动迭代路径的可执行裁判清单。核心原则固定为：

```text
主 Agent（裁判） -> coder subagent（运动员） -> 主 Agent（裁判）
```

每轮只允许一个 coder 修改业务代码。主 Agent 不亲自修改业务代码；主 Agent 必须亲自完成校验、审计、状态合并、预算、Watchdog 和交付门禁。

## 主循环

```
1. shouldStop() → 停止判定
2. pickNextFocus(state, 上轮校验结果)
   └─ 验证通过 → 下一个 focus
   └─ 验证失败 → fix_bug（携带失败命令和日志）
   └─ scope violation → 同一 focus，收窄 scope
3. Agent("coder")
   └─ coder 修改代码 → 写 result.json → 停止
4. 主 Agent 校验（工具事实）
   ├─ ReadFile result.json → schema 检查
   ├─ Node 确定性 runner 验证命令 → 记录 exit code/stdout/stderr
   ├─ Shell git diff --name-only → 对比 scope
   └─ 写入 validation.log
5. 主 Agent 判定 → mergeState() → 写 state.json
6. 回到 1
```

CLI 辅助命令形态：

```text
fastcar-cli auto-iterate --next <session>
→ 派发 coder
→ 主 Agent 运行验证并写 iterations/<n>/validation.log
→ fastcar-cli auto-iterate --merge <session> --round <n>
→ fastcar-cli auto-iterate --next <session>
```

`--next` 只做下一轮前检查和 focus 建议；`--merge` 只合并本轮 `result.json` 与 `validation.log` 到 `state.json` 并刷新 `state.md`。二者都不创建 session、不派发 coder、不替代主 Agent 的真实验证。

## 为什么校验不由 subagent 做

校验环节依赖的是工具返回的事实，不是推理：

- `Node 确定性 runner` → exit code、stdout、stderr 是真实的，且不经 shell 字符串解释
- `Shell git diff --name-only` → 文件列表是真实的
- `ReadFile result.json` → JSON 内容是真实的，schema 是否合法是机械判断

这些操作用 3-4 个工具调用秒级完成。派一个独立 validator subagent 增加一次往返延迟，收益为零。

真正要防的不是幻觉，是**偷懒**——主 Agent 跳过校验直接声称通过。解法是 `validation.log`（每轮校验落盘，交付前逐条确认），不是加 subagent。

## 职责分工

| 协议原则 | 主 Agent（裁判） | Coder Subagent（运动员） |
| --- | --- | --- |
| 需求理解 | 提取 Requirement Coverage Matrix | — |
| Focus 选取 | `pickNextFocus()` 每轮只选一个 | — |
| Prompt 构建 | 构建 coder prompt | — |
| 代码修改 | **禁止** | 唯一修改代码的角色 |
| result.json | 读取 + schema 校验 | **写入** |
| validation.log | **写入**（校验后） | — |
| CLI 验证 | Node 确定性 runner 运行 build/test/lint | **禁止运行命令** |
| Write Guard | Shell git diff 审计 vs scope | — |
| State 合并 | **唯一合并者** | 提交 requirements 建议 |
| 需求状态 | 根据 CLI 验证结果标记 passed | 只能推到 implemented |
| 预算递减 | **唯一递减者** | 禁止 |
| Watchdog | 每轮检查 | 返回 blocked/need_decision |
| 停止条件 | `shouldStop()` 判定 | — |
| 交付门禁 | 判定 delivery_ready | — |
| need_decision | 询问用户 | 通过 decision_request 提出 |
| 状态持久化 | 写 state.json + state.md | 禁止 |

## 每轮裁判步骤

1. 读取 `state.json`，执行恢复一致性检查：current 指针、git status/diff、上一轮产物、最近验证是否可信。
2. 用 `pickNextFocus` 或等价判断选择一个最小 focus；同一轮不得混合多个无关目标。
3. 构建 coder prompt：写明 `result.json` 路径、读写范围、禁止运行命令、禁止写 state、禁止声明整体完成、**禁止输出任何对话文本（输出纪律）**。
4. 派发 `Agent(subagent_type="coder")`；coder 只允许修改 scope 内业务代码并写入本轮 `result.json` 后停止。
5. 主 Agent 读取 `result.json`，用 `resultSchema` 或等价 schema 做机械 schema 校验；**同时检查 coder 是否输出了任何对话文本（output_discipline_violation）**；非法则拒绝本轮，不得合并。
6. 主 Agent 用确定性 Node runner 执行验证命令，记录 `command`、`exit_code`、`duration_ms`、stdout/stderr tail。
7. 主 Agent 用 `git diff --name-only` 或等价工具事实审计实际改动；scope violation 必须拒绝本轮。
8. 主 Agent 写入本轮 `iterations/<n>/validation.log`；**若存在 output_discipline_violation，记录到 validation.log**。
9. 主 Agent 合并 state：coder 只能把 requirement 推到 `implemented`；只有主 Agent 验证通过后才能标记 `passed`。
10. 主 Agent 刷新 `state.json` 和 `state.md`，更新预算、Watchdog、RCM、DoD、traceability 和下一步。
11. 主 Agent 检查自身本轮输出是否符合 [contracts/output-discipline-contract.md](contracts/output-discipline-contract.md) 的中间进展报告模板：若不符合，看门狗 `required_action = narrow_scope`。
12. 执行 `shouldStop` / delivery gate；需要用户决策时只问必要问题，否则进入下一轮。

## 裁判判定 → 反馈闭环

| 判定 | 反馈目标 | 下一轮 coder 做什么 |
|------|----------|-------------------|
| 验证通过，需求未完成 | 下一轮 coder | 选取下一个 focus |
| 验证失败 | 下一轮 coder | focus=fix_bug，携带失败详情 |
| scope violation | 下一轮 coder | 同一 focus，收窄 scope |
| need_decision | 用户 | 展示问题；回答后 → 下一轮 coder |
| blocked | 用户 | 说明阻塞原因 |
| delivery_ready | — | 交付 |

## validation.log 门禁

每个存在 `iterations/<n>/result.json` 的实现轮次，交付前必须有同目录 `validation.log`。

`validation.log` 至少应证明：

- schema 检查已执行，或本轮因 schema invalid 被拒绝。
- 每条真实验证命令有 `exit_code`。
- 每条真实验证命令有 `duration_ms`，且大于 0。
- scope/write guard 结论已记录，或明确说明 git/scope 审计不可用并标记风险。

没有这些证据时，不得按成功交付输出；应进入验证补强、reconcile 或 need_decision。

### validation.log 格式示例

```
=== Iteration N ===
schema_check: passed
validation_commands:
  [0] npm run build  exit=0  duration_ms=1234
  [1] npm test        exit=0  duration_ms=5678
write_guard:
  reported: ["src/foo.ts"]
  actual:   ["src/foo.ts"]
  scope_violations: []
verdict: passed
```

交付前硬门禁：主 Agent 必须逐条确认 `validation.log` 中每条命令的 exit code 有值、duration > 0。跳过校验直接声称通过 → 门禁拦截。

## Coder 硬边界

Coder 必须遵守：

- 只能做本轮 focus。
- 只能写 scope 内业务文件和本轮指定 `result.json`。
- 不得运行 build/test/lint/install/migration/network/git 等命令。
- 不得写 `state.json`、`state.md`、`auto-iterate-current.json`、`start-prompt.md` 或其它 session 权威文件。
- 不得声明整体完成；不得询问用户；不得把需求标记为 `passed`。

## 代码出口

| 模块 | 说明 |
|------|------|
| `src/pipeline/pickFocus.ts` | Focus 选取 |
| `src/pipeline/iterationPrompt.ts` | Coder prompt 构建 |
| `src/pipeline/resultSchema.ts` | result.json schema |
| `src/pipeline/mergeState.ts` | State 合并 |
| `src/pipeline/workerCapabilityPolicy.ts` | 能力边界 |
| `src/pipeline/shouldStop.ts` | 停止判定 |
| `src/pipeline/deliveryGates.ts` | 交付门禁 |
| `src/pipeline/watchdog.ts` | 看门狗 |
| `src/pipeline/writeGuard.ts` | Write guard 审计逻辑 |
| `src/pipeline/pipelineValidationRunner.ts` | 验证命令运行逻辑 |
| `src/pipeline/pipelineStateIO.ts` | 状态读写 |

### 已删除（旧 CLI Worker 路径不再维护）

- `src/adapters/*`、`src/pipeline/runPipeline.ts`、`src/pipeline/routerUx.ts`、`src/pipeline/envCheck.ts`、`src/pipeline/pipelineWorkerProgress.ts`、`src/pipeline/pipelineIsolateWorktree.ts`、`src/pipeline/pipelineGitAudit.ts`、`src/auto-iterate/dispatch.ts`、`src/auto-iterate/subAgentDispatchValidation.ts`

## 两条执行路径

| 路径 | 条件 | 编排者 | Coder |
|------|------|--------|-------|
| A（默认） | `Agent` 工具可用 | 主 Agent | `Agent("coder")` |
| B（Protocol-only / LLM-only） | 用户显式 `--no-run` 或无 `Agent` 工具 | 当前 LLM 遵循自动迭代技巧 | 不派发 subagent |

## Protocol-only 例外

用户显式要求 `--no-run`、手动模式、不启动 subagent，或当前环境没有可用原生 Agent 工具时，进入 protocol-only / LLM-only。该模式不使用主 Agent / coder 角色边界，由当前 LLM 自律执行同一组 RCM、验证、state、Watchdog 和交付门禁。

自动模式运行中不得因 coder 失败、任务较小或验证失败而静默切换为 protocol-only；需要切换时必须进入 `need_decision` 或 `blocked`。
