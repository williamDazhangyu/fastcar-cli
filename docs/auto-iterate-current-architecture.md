# auto-iterate 当前架构

本文档描述 `fastcar-cli auto-iterate` 的当前有效架构。

核心原则：**主 Agent 当裁判，Subagent 当运动员**。主 Agent 只做决策，具体编码委托给 coder subagent；
校验环节（Node 确定性 runner 跑验证、git diff 审计、schema 检查）由主 Agent 自己完成——这些靠的是工具返回的事实（exit code、文件列表、JSON 内容），不存在幻觉窗口。

---

## 角色模型

两个角色，各司其职：

```
┌──────────────────────────────────────────────────────────────┐
│                    主 Agent（裁判 / Judge）                    │
│                                                              │
│  管理 session、state.json                                    │
│  pickNextFocus(state) → 选取本轮最小 focus                    │
│  构建 coder prompt → Agent("coder") 派发                      │
│                                                              │
│  ← coder 写入 result.json 后停止                              │
│                                                              │
│  主 Agent 亲自校验（工具事实，非推理）：                         │
│    ReadFile result.json → schema 检查（机械判断）              │
│    Node runner 执行 npm/test/build → exit code 不会撒谎         │
│    Shell git diff --name-only → 文件列表不会撒谎               │
│  校验结果写入 validation.log                                  │
│                                                              │
│  mergeState() → 看门狗 → 预算 → 交付门禁                       │
│  need_decision 时询问用户                                     │
│                                                              │
│  不亲自写业务代码                                              │
└────────────────────┬─────────────────────────────────────────┘
                     │ Agent(subagent_type="coder")
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                Coder Subagent（运动员）                        │
│                                                              │
│  接收单轮 prompt → 读取 focus 相关文件                         │
│  修改 scope 内代码 → 写入 result.json → 立即停止              │
│                                                              │
│  不运行任何命令（由主 Agent 负责）                              │
│  不写 .agent-state/ 下非本轮 result.json 的文件                │
│  不询问用户、不声明整体完成                                    │
└──────────────────────────────────────────────────────────────┘
```

### 角色职责边界

| 角色 | 能做 | 绝不能做 |
|------|------|----------|
| **主 Agent**（裁判） | 理解需求、提取 RCM；选取 focus；构建 coder prompt；派发 coder；读取 result.json 做 schema 检查；Node 确定性 runner 跑验证命令；git diff 审计 scope；mergeState；推进预算；看门狗；交付门禁；need_decision 询问用户；持久化 state.json | 亲自修改业务代码 |
| **Coder**（运动员） | 读取 focus 相关项目文件；修改 scope 内代码；写入 result.json；trace 中记录公开理由 | 运行命令；写 state.json / state.md；声明整体完成；询问用户 |

---

## 主循环

```
1. shouldStop(state, lastValidation, mode)
   ├─ delivery_ready    → 交付
   ├─ budget_exhausted  → 停止
   ├─ watchdog_stop     → 停止
   └─ 否则继续

2. pickNextFocus(state, 上轮校验结果)
   └─ 新需求 → implement_req
   └─ 验证失败 → fix_bug（携带失败详情）
   └─ scope violation → 同一 focus、收窄 scope

3. Agent(subagent_type="coder", prompt=…)
   └─ coder 修改代码 → 写入 result.json → 停止

4. 主 Agent 校验（工具事实）
   ├─ ReadFile result.json → 校验 schema
   ├─ Node 确定性 runner 运行验证命令 → 记录 exit code/stdout_tail/stderr_tail
   ├─ Shell git diff --name-only → 对比 scope
   └─ 写入 validation.log

5. mergeState(state, result, validation)
   └─ 需求状态推进：coder → implemented，主 Agent 验证确认 → passed

6. 更新 state.json + 刷新 state.md → 回到 1
```

---

## 裁判判定 → 反馈闭环

| 判定 | 反馈目标 | 下一轮 coder 做什么 |
|------|----------|-------------------|
| 验证通过，需求未完成 | 下一轮 coder | 选取下一个 focus |
| 验证失败 | 下一轮 coder | focus=fix_bug，携带失败命令和日志 |
| scope violation | 下一轮 coder | 同一 focus，收窄 scope |
| need_decision | 用户 | 展示问题；回答后 → 下一轮 coder |
| blocked | 用户 | 说明阻塞原因 |
| delivery_ready | — | 交付 |

---

## 防偷懒机制：validation.log

校验的最大风险不是幻觉（Node runner exit code / git diff 是事实），而是**主 Agent 跳过校验直接声称通过**。

约束：每轮校验必须写入 `validation.log`，至少包含：

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

交付前主 Agent 必须逐条确认 `validation.log` 中每条命令都真实执行过（exit code 有值、duration > 0），不得跳过。

---

## 执行路径

### 路径 A：主 Agent + Coder Subagent（默认）

```
主 Agent 对话中：
  1. 理解需求 → 提取 RCM
  2. 可选：fastcar-cli auto-iterate --quick --yes --no-run（生成 state 骨架）
  3. 主循环：
     pickFocus → Agent("coder") → 校验 → mergeState → 循环或交付
```

`fastcar-cli` 只提供辅助：session 管理、state 校验、交付文档生成。

### 路径 B：Protocol-only / LLM-only

当用户显式要求 `--no-run`、要求不启动 subagent，或当前环境没有 `Agent(subagent_type="coder")` 工具时使用。

该路径不是另一套主 Agent / Coder Subagent 拓扑，而是当前 LLM 在同一会话内遵循自动迭代技巧执行：提取 RCM、选择每轮最小 focus、修改代码、运行真实验证、审计 diff、维护 `state.json` / `state.md`、更新 Watchdog / 预算 / 交付门禁。它不派发 `Agent(subagent_type="coder")`，也不使用旧 `--run` Worker pipeline。

自动模式与 protocol-only 是 session 级执行风格。自动模式运行中不得因为 subagent 失败、验证失败或任务较小而静默切换到 protocol-only；需要切换时必须进入 `need_decision` 或 `blocked`。

---

## Coder Subagent Prompt 规范

```markdown
你是自动迭代 Coder，只实现本轮任务，不负责验证、审计、合并或交付。

## 本轮任务
{focus.summary}

## 允许修改范围
{writeScope}

## 禁止事项
- 禁止运行 build、test、lint 或任何命令
- 禁止读取或修改 .agent-state/auto-iterate/**，除本轮指定的 result.json
- 禁止修改未列入 writeScope 的文件
- 禁止写 state.json、state.md
- 禁止声明整体任务完成；禁止询问用户

## 必须写入
{resultPath}

## result.json Schema
{
  "status": "completed | failed | blocked | need_decision | no_progress",
  "summary": "简短说明本轮做了什么",
  "files_changed": ["相对路径"],
  "requirements": [
    { "id": "REQ-1", "status": "implemented | blocked | not_verified", "evidence": "简短证据" }
  ],
  "state_patch": {},
  "risks": [],
  "blocked_reason": "",
  "decision_request": null,
  "trace": {
    "rationaleSummary": "公开可审计的理由",
    "decisions": [],
    "evidence": []
  }
}

无法完成时不要编造完成。
```

---

## Coder 能力边界

| 维度 | 允许 | 禁止 |
|------|------|------|
| **读取** | focus 直接需要的项目文件 | .agent-state/（除本轮 result.json）；AGENTS.md |
| **写入** | result.json；scope 内项目文件 | state.json、state.md |
| **执行** | 无 | 所有命令 |
| **决策** | 写 requirements、state_patch、trace、risks | 递减预算；合并 state；判定整体完成 |

---

## 代码目录边界

```
src/
├── cli.ts
├── auto-iterate.ts
├── auto-iterate/                 # Session 管理
│   ├── sessionRuntime.ts
│   ├── sessionCreation.ts
│   ├── sessionManager.ts
│   ├── sessionFinalize.ts
│   └── ...
└── pipeline/                     # 核心逻辑
    ├── types.ts
    ├── pickFocus.ts
    ├── iterationPrompt.ts
    ├── resultSchema.ts
    ├── mergeState.ts
    ├── workerCapabilityPolicy.ts
    ├── shouldStop.ts
    ├── deliveryGates.ts
    ├── watchdog.ts
    ├── writeGuard.ts
    ├── pipelineValidationRunner.ts
    ├── pipelineStateIO.ts
    └── ...
```

### 已删除（旧 CLI Worker 路径不再维护）

- `src/adapters/*` — Worker CLI 适配器
- `src/pipeline/runPipeline.ts` — CLI 主循环
- `src/pipeline/pipelineWorkerProgress.ts` — 外部进程管理
- `src/pipeline/pipelineIsolateWorktree.ts` — Git worktree 隔离
- `src/pipeline/pipelineGitAudit.ts` — 外部 Worker git 审计
- `src/pipeline/routerUx.ts` — NDJSON 解析
- `src/pipeline/envCheck.ts` — Worker CLI 环境检测
- `src/auto-iterate/dispatch.ts` — 旧 dispatch 模式
- `src/auto-iterate/subAgentDispatchValidation.ts` — dispatch 校验

---

## 设计原则

1. **主 Agent / Coder 硬边界**：主 Agent 只裁判，Coder 只编码，互不越界。
2. **校验靠工具事实**：Node runner exit code、git diff、JSON 内容——都是机械事实，不存在幻觉。
3. **防偷懒靠 validation.log**：每轮校验必须落盘。交付前逐条确认命令真实执行过。
4. **Coder 不能自验**：不运行任何命令。passed 只有主 Agent 的 CLI 验证确认后才能标记。
5. **无外部 Worker**：不再维护多 CLI 适配层。无 `Agent` 工具时降级为路径 B。

---

## 维护规则

- 架构变更先更新本文档。
- 新功能说明写入 `skills/auto-iterate-coding/SKILL.md`。
- 旧 Worker runtime 文件已删除；如需新增能力，只维护主 Agent + coder subagent 架构相关模块。
- 代码精简以 `npm test` 和 CLI smoke 为证据。
