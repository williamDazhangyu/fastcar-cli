# auto-iterate 编排职责

核心原则：**主 Agent 是裁判**，只做决策。编码委托给 coder subagent；校验由主 Agent 自己用工具事实完成。

```
主 Agent（裁判）
  │
  ├─ pickFocus → 构建 prompt
  ├─ Agent("coder")                  → 读 result.json
  ├─ 亲自校验（Node runner + git diff）→ 写 validation.log
  ├─ mergeState → watchdog → deliveryGate
  └─ 循环或交付
```

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

## 裁判判定 → 反馈闭环

| 判定 | 反馈目标 | 下一轮 coder 做什么 |
|------|----------|-------------------|
| 验证通过，需求未完成 | 下一轮 coder | 选取下一个 focus |
| 验证失败 | 下一轮 coder | focus=fix_bug，携带失败详情 |
| scope violation | 下一轮 coder | 同一 focus，收窄 scope |
| need_decision | 用户 | 展示问题；回答后 → 下一轮 coder |
| blocked | 用户 | 说明阻塞原因 |
| delivery_ready | — | 交付 |

## validation.log 防偷懒

每轮校验必须写入 `validation.log`，格式：

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

- `src/adapters/*`、`src/pipeline/runPipeline.ts`、`src/pipeline/routerUx.ts`、`src/pipeline/envCheck.ts`、`src/pipeline/pipelineWorkerProgress.ts`、`src/pipeline/pipelineIsolateWorktree.ts`、`src/pipeline/pipelineGitAudit.ts`

## 两条路径

| 路径 | 条件 | 编排者 | Coder |
|------|------|--------|-------|
| A（默认） | `Agent` 工具可用 | 主 Agent | `Agent("coder")` |
| B（Protocol-only / LLM-only） | 用户显式 `--no-run` 或无 `Agent` 工具 | 当前 LLM 遵循自动迭代技巧 | 不派发 subagent |
