# Output Discipline Contract — 输出纪律契约

> 本文档定义 auto-iterate 执行过程中每个角色在每种场景下的**硬性输出规则**。不使用散文，使用决策表和模板。

## 1. 核心原则

```
Coder 不说话 → 只写 result.json + 代码
主 Agent 不思考 → 不输出私有推理链
进展按模板 → 每轮中间报告使用固定格式
决策结构化 → need_decision 输出问题 + 选项
交付按模板 → 最终输出使用 final-delivery.md 模板
推理只入 trace → 解释"为什么"时写入 trace.rationaleSummary，不输出到对话
```

## 2. 角色输出规则

### 2.1 Coder Subagent

| 规则 | 内容 |
|------|------|
| **唯一输出** | 写入 `result.json` + 修改 scope 内业务代码 |
| **禁止输出** | 任何对话文本、思考过程、推理链、解释、"我认为"、"我觉得"、"应该可以" |
| **禁止声明** | "已完成"、"还需要"、"修改了 X 个文件"、"建议下一轮" |
| **违规检测** | 主 Agent 在读取 result.json 时，如果发现 coder 对话中有任何文本输出，标记为 `output_discipline_violation` |

### 2.2 主 Agent（裁判）

| 场景 | 允许输出 | 格式要求 |
|------|---------|---------|
| **激活声明** | session、mode、state 路径、持久化能力、下一步 | 1-3 行，不含分析 |
| **中间进展（concise_progress_only）** | 轮次、修改摘要、验证结果、RCM 状态、下一步 | 按 §3 模板 |
| **中间进展（caveman）** | 轮次、动作、结果、下一步 | 1 行电报格式 |
| **need_decision** | 问题背景、选项列表（含推荐） | 按 §4 模板 |
| **blocked** | 阻塞原因、需要用户的决策/资源 | 按 §4 模板 |
| **交付总结** | 按 final-delivery.md 模板 | 按 §5 模板 |
| **禁止输出** | 私有思考链、"我认为"、"我觉得"、"让我想想"、冗长推理、代码阅读心得、推测性分析 | — |

### 2.3 Protocol-only LLM

| 规则 | 内容 |
|------|------|
| **允许输出** | 同主 Agent 所有场景，另可输出本轮修改了什么 |
| **禁止输出** | 私有思考链、"我认为"、"我觉得"、冗长推理 |

## 3. 中间进展报告模板

### 3.1 concise_progress_only（默认）

```text
## 第 N 轮
- 修改：<文件列表>（N 文件，N 行）
- 验证：<命令> → <结果>
- RCM：<REQ-ID> <状态>
- 预算：剩余 N/N
- 下一步：<动作>
```

当 `intermediate_reporting = concise_progress_only` 时，每轮输出不得超过上述 5 行。

### 3.2 caveman

```text
[N] <动作摘要> | build=<code> test=<pass/fail> | RCM: <REQ-ID> <状态> | next: <动作>
```

当 `intermediate_reporting = caveman` 时，每轮输出仅 1 行。

### 3.3 full

仅用于调试或用户明确要求详细输出。不做格式限制，但仍禁止输出私有思考链。

## 4. need_decision / blocked 模板

### 4.1 need_decision

```text
## need_decision
<问题背景，1-2 句>

选项：
A. <选项>（推荐）— <理由>
B. <选项> — <理由>
C. <选项> — <理由>

你的选择？
```

禁止：
- 写超过 3 句的背景分析
- 在选项中包含推测性内容
- 在用户回答前自行决定

### 4.2 blocked

```text
## blocked
阻塞原因：<原因>
需要：<用户决策/资源>
当前状态：<已完成内容>
影响：<哪些需求被阻塞>
```

## 5. 交付输出模板

交付输出必须使用 `references/final-delivery.md` 中定义的模板，不得自由发挥：

- 成功交付：§成功交付模板
- 有限成功：§有限成功交付条件（在 `contracts/delivery-gate-contract.md`）
- 提前停止：§提前停止模板

## 6. 禁止输出清单（通用）

以下内容在任何场景下都**禁止出现在 Agent 对话输出中**：

| 禁止内容 | 示例 | 替代方式 |
|---------|------|---------|
| 私有思考链 | "让我想想..."、"首先我需要..." | 不输出，直接执行 |
| 推测性分析 | "我认为"、"我觉得"、"应该可以" | 只输出验证结果（passed/failed） |
| 代码阅读心得 | "我看到第 45 行使用了..." | 写入 `trace.rationaleSummary` |
| 冗长推理 | "因为 A 导致 B，而 B 又影响 C..." | 压缩为 1 句结论 |
| 无关上下文 | "这个项目使用 FastCar 框架..." | 只输出与当前 focus 相关的 |
| 完整日志 | 大段 build/test 输出 | 只输出 exit code + 关键失败信号 |
| 伪完成 | "看起来应该没问题"、"代码已修改完成" | 只输出 passed/failed + 证据 |

## 7. 违规检测规则

### 7.1 Coder 输出违规

主 Agent 在 step 5（读取 result.json）时检查：

- 如果 coder 对话中有任何文本输出 → 标记 `output_discipline_violation`
- 如果 coder 输出了"已完成"、"还需要" → 标记 `output_discipline_violation`
- 违规时，主 Agent 不得合并本轮 state，并在 validation.log 中记录违规

### 7.2 主 Agent 输出违规

看门狗在每轮检查时检查主 Agent 自身输出：

- 如果 intermediate_reporting 不是 full 但输出超过模板行数 → 标记 `output_discipline_violation`
- 如果输出包含"我认为"、"我觉得" → 标记 `output_discipline_violation`
- 违规时，看门狗 `required_action = narrow_scope`，收窄到当前 focus

### 7.3 交付前最终检查

交付前看门狗检查整个 session 的对话输出：

- 逐轮检查是否存在 `output_discipline_violation`
- 存在违规时，不得使用成功交付模板，必须按提前停止输出并说明原因

## 8. 与现有文档的关系

| 本文档 | 关联文档 |
|--------|---------|
| §2 角色输出规则 | `docs/auto-iterate-current-architecture.md` §Coder 能力边界 |
| §3 中间进展报告 | `SKILL.md` §全自动迭代模式 `intermediate_reporting` |
| §4 need_decision | `SKILL.md` §全自动迭代模式 §Autopilot 必须停止并汇报 |
| §5 交付输出 | `references/final-delivery.md` |
| §6 禁止输出清单 | `SKILL.md` §可追溯规则 |
| §7 违规检测 | `references/judge-runbook.md`、`references/caveman-mode.md` |