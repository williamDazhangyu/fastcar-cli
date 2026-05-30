---
name: auto-iterate-coding
description: 面向 AI Coding Agent 的有界自动迭代开发协议。Use when user says 自动迭代、全自动开发、快速启动、一直修到通过、验收 PRD、检查是否完成、只规划不要写代码、优化模块、恢复 session、切换 session、列出自动迭代任务, or when Codex, Kimi Code CLI, Claude Code, Copilot, Cursor, Gemini CLI or another AI coding agent needs to route natural language into fastcar-cli auto-iterate commands, or implement, debug, repair, verify, plan, or recursively optimize code through bounded edit-test-fix loops with progress tracking, real validation, state handoff, and graceful degradation when tool capabilities are unavailable. When fastcar-cli auto-iterate supports --run mode and a Worker CLI is available, Router MUST invoke `fastcar-cli auto-iterate --run --autopilot --json-progress ...` and act only as translator/reporter; do NOT inline-implement the protocol in the chat session.
---

# 自动迭代编码

## 定位

本 skill 是面向 AI Coding Agent 的有界自动迭代开发协议，不是独立 CLI 工具，也不依赖特定 Agent 平台。

Agent 应在当前运行环境允许的工具能力范围内，尽可能执行本协议中的需求理解、代码探索、实现、真实验证、失败修复、状态记录、递归优化和最终交付流程。

本协议可以被移植或嵌入到不同 Agent 生态中，例如项目级 `AGENTS.md`、`CLAUDE.md`、`.claude/skills/`、`.agents/skills/`、`.github/skills/`、`.cursor/rules/`、`.gemini/skills/` 或其他等价机制。平台私有能力只能作为可选增强，不得成为执行本协议的前提。

## 执行路径识别

当前环境必须走下面两条路径之一，不可混用：

**A. CLI 驱动路径（默认、推荐）**：先运行 `fastcar-cli auto-iterate --check --json-progress`。当 `workers_available` 非空且目标 flag 已实现时，调用 `fastcar-cli auto-iterate --run --json-progress ...`。进入后你是 Router LLM：只读 NDJSON 转述进度、遇 `need_decision` 询问用户、用 `--resume ... --answer <id>` 续跑，不直接改代码、不自己跑验证、不自己写 `state.json`。

**B. 无 CLI fallback 路径**：仅当 `--check` 返回 `workers_available: []`、当前 CLI 不支持目标 flag、用户显式 `--no-run`，或运行环境完全不能 spawn Worker CLI 时使用。此时才按本文后续完整协议手动执行：你同时扮演 Router、Worker 和 Orchestrator，亲手维护状态、运行验证、递减预算和交付门禁。

在路径 A 下，Requirement Coverage Matrix、Definition of Done、Watchdog、预算递减、状态合并、CLI 验证、`pickNextFocus` 和 `shouldStop` 由 CLI 代码执行；本文后续相关章节仅供理解协议背景和无 CLI fallback 使用。Worker 单步约束见 `worker.md`，CLI 编排职责见 `orchestrator.md`。

## 目录约定

第三方项目接入时，优先按以下层级理解本 skill：

1. `index.md` 只做目录导航和入口说明。
2. `contracts/` 放机器可检查的强约束。
3. `examples/` 放可直接参考的样例。
4. `references/` 放详细解释、流程和长文档。
5. `compatibility/` 放迁移、版本和旧项目接入说明。
6. `adapters/` 放平台差异和 Agent 适配。
7. `changelog.md` 记录目录和约定的变化。

`agents/` 目录仅保留历史兼容镜像，不应再作为新内容的首选落点。

Codex goal 模型、普通提示词中的 `Goal:` 前缀、以及 `fastcar-cli auto-iterate --goal` 是三种不同概念。Codex goal 模型是 Codex 运行时提供的任务目标状态能力，用于记录当前 objective、status、可选 token_budget 和完成/阻塞状态；交互式 Codex 中通过输入 `/goal` 使用该入口。本地 Codex 可通过 `codex features list` 中的 `goals stable true` 辅助确认 goal feature 是否启用，但不应期待 `codex goal` 子命令。CLI 或普通聊天环境中，`Goal:` 只是普通文本前缀，fastcar-cli 最多把它清洗为目标文本；`--goal` 只是 fastcar-cli 的目标参数，不会创建或更新 Codex goal。推荐配合方式是先用 `/goal` 设置 Codex 会话级整体目标，再用 `fastcar-cli auto-iterate --goal` 创建可恢复 session；`/goal` 不替代 `.agent-state/auto-iterate/<session>/state.json` 中的预算、RCM、验证证据、恢复状态和交付门禁。具体路由边界见 [references/natural-language-routing.md](references/natural-language-routing.md) 的 “Goal 术语边界”。

如果当前 Agent 环境缺少某项能力，例如无法写文件、无法运行 shell、无法访问网络、无法执行测试、无法使用子 Agent 或无法持久化状态，必须明确降级为 `not_verified` 或 `blocked`，不得伪造完成、验证或外部资源响应。

语言规则：Agent 的输出、状态记录、交付总结和生成文档必须与用户当前提示语言保持一致。用户使用中文时，不要突然切换为英文；英文仅用于固定术语、命令、代码、文件名、API 名称或用户明确要求保留英文的内容。

可追溯规则：自动迭代可以记录公开、可审计的推理摘要、决策、证据、验证命令和相关路径，但不得记录或要求输出模型私有 chain-of-thought。Worker 如需说明“为什么这样做”，只能写入 `trace.rationaleSummary`、`trace.decisions` 和 `trace.evidence`；CLI 在 merge 时清洗后写入 `state.traceability.iterations[]`。

交付文档规则：`fastcar-cli auto-iterate --finalize <session>` 在 Skill Capture 后生成 `.agent-state/auto-iterate/<session>/docs/`，包括 `api.md`、`changelog.md`、`architecture.md` 和 `implementation.md`。这些文档汇总 `state.documentation`、Requirement Coverage Matrix、验证证据和 traceability 公开摘要，文档语言跟随用户语言，文件名和机器字段保持英文。

## 自动迭代 Skill 强触发词

如果用户消息包含以下意图或词语，Agent 必须优先读取本 skill，而不是直接凭记忆解释或手写命令：

- 自动迭代、auto-iterate、全自动开发、Autopilot。
- 完整实现、完整做完、全部实现、端到端实现、把需求都做完。
- 根据文档实现、按文档实现、实现这个文档、实现 docs、实现 docs 文档。
- 实现 PRD、根据 PRD 实现、按 PRD 实现、按 issue 实现、把文档里的需求都做完。
- 快速启动、开一个自动迭代任务、帮我自动推进。
- 一直修到通过、一直修到测试通过、不要停直到完成。
- 检查是否完成、帮我验收、验收 PRD、验证这个 PRD 是否都实现了。
- 诊断问题、debug、复现 bug、性能回归、flaky 测试、先建立反馈闭环。
- 原型、prototype、先试一下、验证状态机、验证数据模型、试几个 UI 方案。
- 只规划、先规划不要写代码、Plan-only。
- 优化模块、优化性能、提升可维护性但别改行为。
- 恢复任务、切换 session、列出自动迭代任务、resume session、switch session、list session。

触发后执行顺序：

```text
1. 先读取 auto-iterate-coding/skill.md
2. 按“自然语言命令路由”判断用户意图
3. 必要时调用 fastcar-cli auto-iterate ...
4. 将 CLI 输出的启动提示词作为后续执行依据
5. 在对话中先输出 auto-iterate 激活声明，再进入执行
```

## 激活态声明

当用户触发自动迭代、Autopilot、多轮实现、一直修到通过、最少/至少 N 轮、恢复 session、切换 session 或任何需要状态持久化的任务时，Agent 不得只把它解释为“当前会话内的多轮工作节奏”。必须先确认或创建独立 session，并在开始执行前用 1-3 行输出激活声明。

激活声明必须包含：

- `auto-iterate 已激活` 或等价表述。
- 当前 `mode`、`session`、`state.json`、`state.md`、`auto-iterate-current.json`。
- 状态持久化能力：`available` / `degraded` / `not_available`。
- 下一步最小动作，例如读取 state、reconcile、能力探测、提取 RCM 或建立 feedback loop。

如果当前环境不能运行 CLI，但能写文件，使用无 CLI fallback 创建 `.agent-state/auto-iterate/<session>/state.json`、`state.md`、`start-prompt.md` 和 `auto-iterate-current.json` 后再声明激活；`state.json` 是机器权威状态源，`state.md` 只是生成视图。如果不能写这些文件，必须声明 `状态持久化：not_available`，并在对话内维护同等结构；不得把这种降级状态描述为完整持久化 session。

示例：

```text
auto-iterate 已激活：mode=quick，session=login-bugfix。
stateJson=.agent-state/auto-iterate/login-bugfix/state.json，state=.agent-state/auto-iterate/login-bugfix/state.md，current=.agent-state/auto-iterate-current.json，状态持久化=available。
下一步：读取 state，执行 reconcile 和能力探测，然后建立 Requirement Coverage Matrix。
```

如果当前环境没有 `fastcar-cli` 或不允许运行 CLI，不要停止协议执行。改用“无 CLI fallback”：

```text
1. 手动选择模式：strict / quick / diagnose / verify / plan / optimize / prototype
2. 生成或确认独立 session 名；用户未指定时按模式和目标生成默认 session
3. 按 examples/state-template.md 手动创建或在对话内维护同等状态
4. 从用户目标或文档提取 Requirement Coverage Matrix
5. 按当前模式执行探索、反馈闭环、实现/验证/规划/原型或优化
6. 每轮后更新状态；无法写文件时在对话内输出状态摘要
7. 最终按 references/final-delivery.md 交付或提前停止
```

## 快速使用

使用本 skill 将一次编码任务从需求理解推进到实现、真实验证、递归优化和最终交付。

核心规则：默认情况下，未带“最少/至少”修饰的迭代次数都是上限预算，不是必须执行次数；用户明确说“最少/至少 N 轮”时，N 是下限检查点，不是“仅 N 轮”或最大预算。停止边界必须以用户提供的完整目标、流程清单、Runbook、成功标准和显式非目标为准；单个 Phase、子任务、最小纵切或局部验证通过，只能作为继续推进下一项的阶段信号，不能作为整体成功交付条件。当完整任务已验证、达到用户明确下限、没有继续提升、风险高于收益、缺少用户决策或真实资源不可用时，才提前停止或最终交付。

## 迭代轮次定义

“迭代到 N 轮”表示最多允许执行 N 次实现闭环，不表示必须改 N 次，也不表示对话往返 N 次。

“最少/至少 N 轮”表示必须把 `minimum_implementation_iterations` 记录为 N，并把第 N 轮视为下限检查点：在达到 N 轮前，不得把 N 当作 `max_iterations`、`autopilot_max_iterations` 或“仅执行 N 轮”。达到 N 轮后，如果 Requirement Coverage Matrix、Watchdog、验证失败、清理项或用户目标仍有有效推进空间，必须继续按正常预算和停止条件迭代；只有满足完整交付门禁或触发阻塞/风险/预算耗尽时才停止。

如果完整任务在达到 `minimum_implementation_iterations` 前已经通过真实验证，剩余轮次必须转为有意义的边界验证、回归补强、状态一致性检查、清理、文档/测试缺口修复或风险复核；不得为了凑轮数制造无效修改，也不得把纯验证伪记为实现迭代。若没有任何可安全推进的工作，必须记录提前停止理由和证据，而不是静默把“最少 N 轮”改写为“仅 N 轮”。

一轮实现迭代必须包含以下最小闭环，才计入 `implementation_iterations_used`：

```text
1. 选择一个当前最小目标、失败信号或待覆盖需求
2. 做一组与该目标直接相关的最小代码/配置/测试/文档修改
3. 运行可用的真实验证，或明确记录无法验证的原因
4. 更新 Iteration State、Requirement Coverage Matrix、Definition of Done 和 Watchdog
5. 决定继续、收窄、回退、请求用户决策、提前停止或交付
```

计数规则：

- 只读探索、需求拆解、架构理解、能力探测、状态恢复、reconcile、上下文压缩、向用户提问、生成计划和读取日志，不计入实现迭代轮次。
- 只运行验证命令且没有产生新的修改时，不计入实现迭代轮次；但必须更新最近验证结果和 Watchdog。
- 一组相关修改后，无论验证通过、失败、无法运行或触发停止，只要已经进入验证/记录阶段，都计为 1 轮实现迭代。
- 如果同一轮内连续追加多个不相关 patch，应拆分为多轮；每轮只能服务一个最小目标或失败信号。
- 如果一轮修改发现方向错误并安全回退，仍计为 1 轮；回退原因和下一步必须写入状态。
- 递归优化不计入 `implementation_iterations_used`，单独计入 `optimization_iterations_used`。
- `total_cycles = implementation_iterations_used + optimization_iterations_used + non_implementation_iterations_used`，只用于汇报总循环量，不替代任一预算。

预算含义：

- `max_iterations` 是普通模式下的最大实现迭代轮次。
- `autopilot_max_iterations` 是 Autopilot 模式下的最大实现迭代轮次；启用 Autopilot 时，本次 `max_iterations = autopilot_max_iterations`。
- `minimum_implementation_iterations` 是用户明确说“最少/至少 N 轮”时的最小实现迭代下限；它不是 CLI 最大预算参数，也不减少 `max_iterations` 或 `autopilot_max_iterations`。
- `optimization_iterations` 是初版实现验证通过后的最大递归优化轮次，不应消耗实现迭代预算。
- 同时存在最小下限和最大预算时，必须满足 `minimum_implementation_iterations <= max_iterations`；若用户给出的下限大于上限，必须先请求用户澄清或追加预算，不得自行截断为仅 N 轮。
- 达到预算时必须停止并汇报，即使还有剩余需求；不得为了声称完成而继续越界修改。

## 启动握手

在进入自动化开发前，先完成一次启动握手。除非用户已经在同一条消息中明确提供这些信息，否则不要直接开始实现。

第一步：要求用户输入 AI 实现流程清单。清单应尽量包含：

- 用户目标。
- 成功标准。
- 非目标。
- 允许修改范围。
- 需要保持兼容的接口、命令或行为。
- 可运行的验证命令。
- 外部资源、密钥、数据库、网络或沙箱限制。
- 用户希望的交付格式。

第二步：询问并确认两个迭代预算：

```text
max_iterations：默认 100，用于普通有边界迭代的最大实现轮次。
autopilot_max_iterations：默认 20，用于 Autopilot 的最大实现轮次。
```

询问格式：

```text
请提供 AI 实现流程清单，并确认两个迭代预算：
1. max_iterations 是否使用默认 100？
2. autopilot_max_iterations 是否使用默认 20？
确认后我会按清单进入自动化开发。
```

用户确认后，记录最终采用的 `max_iterations` 和 `autopilot_max_iterations`。如果启用 Autopilot，使用 `autopilot_max_iterations` 作为本次 `max_iterations`；否则使用普通 `max_iterations`。用户显式指定的数值总是最高优先级。

启动示例见 [examples/autopilot-start.md](examples/autopilot-start.md)。
端到端执行样例见 [examples/end-to-end-scenarios.md](examples/end-to-end-scenarios.md)。

## Agent 能力探测与降级

进入自动迭代前，Agent 必须确认当前运行环境支持哪些能力，并把能力限制纳入 Iteration State、Requirement Coverage Matrix 和最终交付。

需要探测的能力：

- 读取文件和搜索代码。
- 修改、创建或删除项目文件。
- 运行 shell、脚本、测试、构建、lint 或 typecheck。
- 写入和读取 `.agent-state/auto-iterate/<session>/state.json`，并刷新 `.agent-state/auto-iterate/<session>/state.md` 生成视图。
- 使用子 Agent、并行探索或后台任务。
- 访问网络、数据库、密钥、外部服务、容器或沙箱。
- 查看 git 状态和当前 diff。
- 生成、读取或验证图片、视频、文档、报表等非代码产物。

执行规则：

- 可用能力应优先用于真实验证和证据收集。
- 不可用能力不得被假装执行，也不得用推测、静态阅读或代码演练冒充真实结果。
- 如果缺少的能力只影响验证，把相关需求标记为 `not_verified`，并说明未验证原因和需要的最小能力。
- 如果缺少的能力阻止实现、资源访问、产品决策或安全验证，把相关需求标记为 `blocked`，并停止或请求用户提供资源/决策。
- 如果平台不支持状态文件，必须在对话内维护同等结构的 Iteration State，并在最终交付中说明无法持久化。
- 如果平台不支持子 Agent 或并行任务，使用单 Agent 串行执行，不得把并行探索作为成功前提。
- 如果平台不支持 shell 或真实测试，必须明确列出可替代的最小验证和仍未验证的风险。
- 平台私有命令、hook、插件、MCP 或多 Agent runtime 只能作为增强；缺失时应降级执行本协议的核心流程。

能力探测摘要格式：

```text
Agent Capability Summary
读文件/搜索代码：available / unavailable / unknown
修改文件：available / unavailable / unknown
运行命令：available / unavailable / unknown
真实测试：available / unavailable / unknown
状态持久化：available / unavailable / unknown
子 Agent/并行：available / unavailable / unknown
  并行探索（explore）：available / unavailable
  后台任务（background）：available / unavailable
  并行实现（coder）：available / unavailable
网络/外部服务：available / unavailable / user-confirmed-required
数据库/密钥：available / unavailable / user-confirmed-required
git 状态/diff：available / unavailable / unknown
媒体/文档处理：available / unavailable / not_needed
降级策略：
阻塞能力：
```

## 子 Agent 并发策略

当 Agent Capability Summary 中 `子 Agent/并行：available` 时，按 `references/sub-agent-concurrency.md` 执行并发调度。

核心调度规则：探索、需求提取、验证和实现四阶段可独立并行；父 Agent 是唯一协调者，子 Agent 完成后由父 Agent 统一 merge 和 Quality Gate 审查；任何子 Agent 类型不可用时自动降级为串行。

启用规则：`子 Agent/并行：available` 只表示平台能力存在，不等于立即允许并发写入。父 Agent 必须先读取 `references/sub-agent-concurrency.md` 的“启用门禁与平台适配”“调度流程”和 `Sub-Agent Result Schema`；session state 的字段结构以 `examples/state-template.md` 的 `## Sub-Agent Dispatch / 子 Agent 调度` 和 `## Decisions` 为唯一来源，不得在协议正文中维护第二套字段清单。`coder` 并发只有在文件 ownership 明确、同 worktree 并发写入已由用户确认，且 Quality Gate 可审计时才允许；否则只启用 explore / background verify 并发或降级为串行。

启用 coder 或 background 并发前，还必须在 `## Decisions` 的并发决策中记录必要约束：`parallel_write_allowed`、`parallel_write_confirmation`、`coder_file_ownership` 和 `fallback_strategy`。共享文件、验证副作用、临时产物和审计边界作为决策说明或子 Agent prompt 合约记录；未声明共享文件 owner 或验证副作用时不得并发执行。

每轮并发 dispatch 前必须由父 Agent 建立轻量 baseline（例如 git status、已有 diff 摘要、关键文件 mtime 或等价审计信息），并在子 Agent prompt 中声明不得读写 `.agent-state/`。merge 后必须由父 Agent 执行 Quality Gate，先更新 `state.json` 中的 `active_sub_agents` / `sub_agent_history` 和全局状态，再刷新 `state.md` 视图。如果 state.json 或 state.md 在子 Agent 运行期间被外部修改，必须先进入 `reconcile`，不得继续 dispatch。

默认并发上限：explore 最多 4，需求提取和 background verify 最多 3，coder 默认最多 2。quick 模式默认只启用 explore/background 并发；只有文件 ownership、用户确认、baseline 和 Quality Gate 均明确时才允许 coder 并发。

sub-agent 是 Agent 工具执行自动迭代时的协议增强，不是 fastcar-cli 内置运行时；小任务、单文件修改、ownership 不清晰或验证副作用不明时默认串行执行。

## 模式选择

`auto-iterate-coding` 可以按用户目标选择不同执行强度。Agent 或配套 CLI 应优先根据用户说法和任务风险选择模式；不确定时使用 `strict` 或先询问用户。

| 用户说法 / 任务类型 | 推荐模式 | 执行重点 |
| --- | --- | --- |
| “修这个 bug” | `small` / `medium`，必要时 `quick` | 建立最小复现和反馈闭环，最小修改后验证。 |
| “诊断这个 bug / 性能回归 / flaky 测试” | `Diagnose` | 先建立可信 feedback loop，复现对齐，假设驱动定位，再最小修复。 |
| “一直修到测试通过” | `Autopilot` | 有界循环修复失败信号，直到完整目标通过或触发停止条件。 |
| “实现这个完整需求” | `medium` / `large` + `Autopilot` | 需求覆盖矩阵、垂直切片、真实验证和递归优化。 |
| “先规划，不要写代码” | `Plan-only` | 只读探索、架构理解、任务拆解和验证策略，不修改文件。 |
| “帮我检查是否完成” | `Verify-only` | 提取需求矩阵、验证现有实现、输出差距和证据，不主动修复。 |
| “先做原型 / 验证状态机 / 试几个 UI 方案” | `Prototype-only` | 创建一次性原型回答设计问题，结论未吸收前不声称生产完成。 |
| “优化这段代码” | `Optimization-only` | 先建立 baseline，只有验证通过且收益明确时保留优化。 |
| “根据 PRD 全部实现” | `Autopilot` + Requirement Coverage Matrix | 从原文逐条提取需求，直到关键需求全部 passed 或提前停止。 |

配套 CLI 有两种启动形态：

- 自动模式（路径 A，默认）：Router 先执行 `fastcar-cli auto-iterate --check --json-progress`，Worker 可用后再执行 `--run --json-progress`。Router 只转述 NDJSON 进度和处理 `need_decision`，不直接改代码、不写 state、不跑验证。
- 手动 / fallback 模式（路径 B）：仅在 Worker 不可用、CLI flag 不支持、环境不能 spawn Worker，或用户显式要求 `--no-run` / 手动模式时使用。此时不带 `--run`，由当前 Agent 按后续协议维护 state、RCM、DoD、验证和停止条件。

自动模式示例：

```bash
fastcar-cli auto-iterate --check --json-progress
fastcar-cli auto-iterate --run --autopilot --strict --from docs/prd.md --session prd-impl --json-progress
fastcar-cli auto-iterate --run --autopilot --quick --goal "修复登录失败问题" --session login-bugfix --json-progress
fastcar-cli auto-iterate --run --autopilot --diagnose --goal "诊断登录偶发失败" --session login-diagnose --json-progress
fastcar-cli auto-iterate --run --once --verify --from docs/prd.md --session login-verify --json-progress
fastcar-cli auto-iterate --run --once --plan-only --goal "规划订单模块重构" --session order-refactor-plan --json-progress
fastcar-cli auto-iterate --run --autopilot --optimize --goal "优化查询性能" --session query-optimize --json-progress
fastcar-cli auto-iterate --run --autopilot --prototype --goal "验证订单状态机" --session order-prototype --json-progress
fastcar-cli auto-iterate --resume login-bugfix --run --autopilot --json-progress
```

手动 / fallback 模式示例：

```bash
fastcar-cli auto-iterate --strict --from docs/prd.md --session prd-impl --yes --no-run
fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix --yes --no-run
fastcar-cli auto-iterate --diagnose --goal "诊断登录偶发失败" --session login-diagnose --yes --no-run
fastcar-cli auto-iterate --verify --from docs/prd.md --session login-verify --yes --no-run
fastcar-cli auto-iterate --plan-only --goal "规划订单模块重构" --session order-refactor-plan --yes --no-run
fastcar-cli auto-iterate --optimize --goal "优化查询性能" --session query-optimize --yes --no-run
fastcar-cli auto-iterate --prototype --goal "验证订单状态机" --session order-prototype --yes --no-run
fastcar-cli auto-iterate --list
fastcar-cli auto-iterate --switch login-verify
fastcar-cli auto-iterate --resume login-bugfix
```

## 自然语言命令路由

用户不需要记住 `fastcar-cli auto-iterate` 的所有参数。当用户用大白话要求启动、切换、恢复、检查、规划、诊断、原型或优化自动迭代任务时，Agent 应先识别用户意图，再自动调用对应命令。

完整映射表、意图顺序、预算推断、session 推断和示例见 [references/natural-language-routing.md](references/natural-language-routing.md)。本节只保留硬性路由原则：

- 优先用用户原话推断 `mode`、`goal`、`from`、`session`、迭代预算和是否允许修改。
- 用户已明确目标、文件路径或 session 名时，不要再重复询问。
- 只有缺少会影响安全、兼容性或外部资源的关键信息时，才向用户提问。
- 自动模式下，`--run --json-progress` 的 NDJSON 事件流是后续执行依据；不得要求用户复制 `start-prompt.md`，也不得在当前聊天中内联执行完整协议。
- 手动 / fallback 模式下，调用不带 `--run` 的启动命令后，直接把 CLI 输出的启动提示词作为后续执行依据。
- Agent 根据自然语言路由自动调用 fallback 启动命令时，必须同时追加 `--yes --no-run`：`--yes` 避免卡在交互提示，`--no-run` 明确禁止进入 Worker pipeline；自动模式的 `--run` 命令不需要 `--yes`。
- Agent 根据自然语言路由自动调用命令时，每次都必须生成或指定一个独立 session；用户未指定 session 时，Agent 必须根据目标用英文小写、数字和连字符生成默认 session 名，并在命令中追加 `--session <generated-session>`。
- 如果用户只是询问命令含义，不要执行命令；只有用户表达“帮我启动/生成/恢复/切换/检查/规划/优化”时才执行。

## Session 与模式切换

同一个项目中可能同时存在多个任务、多个模式。为了避免覆盖状态，Autopilot、medium/large、用户指定 session、需要多轮自动迭代或需要跨会话恢复的任务必须使用独立 session。

必需状态结构：

```text
.agent-state/
├── auto-iterate-current.json              # 当前活动 session 指针
└── auto-iterate/
    └── <session>/
        ├── state.json                 # 机器权威状态源
        ├── state.md                   # 由 state.json 渲染的人类视图
        └── start-prompt.md
```

Agent 判断当前模式和任务的优先级：

```text
1. 用户当前消息中显式指定的模式或 session
2. start-prompt.md 中的当前启动模式和 session
3. session state.json 中的 session 和 mode，或 state.md 中的 ## Session 和 ## Mode
4. .agent-state/auto-iterate-current.json 中的当前 session 指针
5. 如果都没有，则进入模式选择或 strict
```

执行规则：

- 启动 Autopilot、medium/large 或多轮自动迭代前，必须先确认或创建 `auto-iterate/<session>/state.json`、`auto-iterate/<session>/state.md`、`auto-iterate/<session>/start-prompt.md` 和 `auto-iterate-current.json`。
- 如果用户未显式指定 session，Agent 必须按目标生成一个小写字母、数字和连字符组成的 session 名，并写入 current 指针。
- 只写 legacy mirror 不算完整状态持久化；若环境只能维护 legacy mirror 或对话内状态，必须标记 `状态持久化: degraded` 并说明无法创建独立 session 的原因。
- 每轮结束必须检查 current 指针是否指向本 session、session state 是否存在、session 名是否一致、最近验证和迭代计数是否已写入 state；不一致时先进入 `reconcile`，不得继续交付。
- `--switch <session>` 只切换当前活动 session，不重新生成任务内容。
- `--resume <session>` 用于恢复历史 session，并输出应发送给 Agent 的启动提示路径。
- Agent 恢复时必须先执行 reconcile 检查，确认 state、current 指针、代码 diff 和最近验证是否一致。

## 快速启动模式

当用户只提供简短需求，但任务可从代码库合理推断时，可以使用 `quick` 快速启动模式。Agent 先自动探索项目，并生成一份“推断版 AI 实现流程清单”，再进入实现、验证和修复循环。

快速启动默认行为：

- 成功标准、修改范围和验证命令可先由 Agent 从代码、测试、脚本、文档和项目约定中推断。
- 修改范围默认限制在与目标直接相关的最小文件集合。
- 不做无关重构、架构迁移或新依赖引入。
- 缺少真实验证命令时标记 `not_verified`，不得声称已验证。

如果以下任一项不明确，Agent 必须停止询问用户，而不是继续猜测：

- 成功标准会影响产品行为。
- 修改范围可能跨模块或跨服务。
- 验证命令缺失且无法从项目中可靠推断。
- 需要数据库、密钥、外部服务、网络、沙箱或新依赖。
- 可能破坏兼容的 API、CLI、配置、数据格式或测试行为。

完善契约时的提问方式：

- 不要一次性丢给用户一大堆开放问题；优先采用交互式逐个确认。
- 每次只确认一个关键决策，最多两个强相关决策；除非用户明确要求一次性列全。
- 每个问题必须先完整描述背景、影响和默认推荐选项，再给 2-4 个互斥选择。
- 选择题应包含推荐项并说明取舍，例如“保守兼容（推荐）/ 直接替换 / 先做只读验证”。
- 能从代码、测试、文档或项目约定推断的事实不要问用户；只询问会改变契约、范围、安全或外部资源使用的决策。
- 用户回答后立即记录到 `state.json` 的 Decisions 并刷新 `state.md` 视图；无法持久化时记录到对话内状态，再进入下一个问题或继续实现。

## Verify-only 模式

当用户要求“检查是否完成”“评估实现是否满足需求”“验证这个 PRD 是否都实现了”时，使用 `Verify-only` 模式。该模式默认不进入修改循环，除非用户明确要求并允许修复。

流程：

```text
1. 从用户目标、PRD、issue 或清单中提取 Requirement Coverage Matrix
2. 只读探索现有代码、测试、文档和配置
3. 运行可用验证命令；无法运行时说明原因
4. 将每条需求标记为 passed / implemented / not_verified / blocked
5. 输出差距清单、验证证据、阻塞项和建议修复顺序
```

规则：

- 不要把“代码看起来实现了”标记为 `passed`，只有真实验证证据才能 `passed`。
- 如果验证命令不可用，标记 `not_verified` 或 `blocked`。
- 如果用户未允许修复，不得修改项目文件。
- 如果发现缺口，只输出差距和建议修复顺序；不要把提前停止包装成完成。

## 核心流程

`medium` / `large` 任务默认流程：

```text
1. 理解需求并明确成功标准
2. 探索现有实现和项目约定
3. 必要时让用户确认架构理解和代码落点
4. 优先寻找脚手架、模板或生成器，找不到再手动创建
5. 制定垂直切片实现策略
6. 构造或选择快速 feedback loop
7. 识别可运行的验证命令
8. 做一轮最小相关修改
9. 尽可能运行当前 Agent 环境可执行的真实 `test` / `build` / `lint` / `typecheck` 或最小可重复验证命令；能力不足时标记 `not_verified` 或 `blocked`。
10. 更新 `state.json`：At-a-Glance、Iteration State、Watchdog、Requirement Coverage Matrix 和 Definition of Done，并刷新 `state.md` 生成视图。
11. 提取关键失败信号
12. 基于失败信号继续迭代
13. 验证通过或触发停止条件
14. 实现需求的模式中，功能实现并通过验证后，按本地 `.agents/skills` 和全局 skills 的代码风格、框架约束和反模式做有边界整理，并重新验证。
15. 验证通过后，执行有边界的递归优化
16. 输出交付总结、验证证据、风险和可选 Mermaid / 纯文本进度图
```

执行纪律：

- 反馈闭环优先于读代码猜测。修 bug、性能回归或验证失败时，必须先建立能复现目标问题的 pass/fail 信号；没有可信反馈闭环时，停止并说明已尝试方式和缺少的 artifact / 环境。
- 使用假设驱动调试。连续失败或修改无改善时，先列出 3-5 个排序假设，每个假设必须有可证伪预测；每轮只测试一个主要假设。
- 新功能和缺陷修复必须使用垂直切片 TDD。每条 REQ 标为 passed 前，其验证证据中必须包含至少一个本轮新增的行为测试（或等价验证命令），或在该 REQ 的"已知限制"中记录不写测试的具体原因。不得仅靠已有测试套件通过来标 passed。
- 如果需求核心是业务状态、数据模型、状态机或 UI 设计是否合理，先考虑一次性原型来回答问题；原型必须明确标记、一个命令可运行、默认不持久化，并在结论吸收后删除或转正。
- 如果没有正确 test seam、只能测私有实现、局部修复反复触发远处失败或需要跨调用方重复 patch，进入架构摩擦判断；用户确认前不要把自动修补升级为大范围重构。
- 实现需求的模式中，功能实现并通过验证后、交付前必须执行 Style Consolidation / 技巧风格整理：读取本项目 `.agents/skills` 和全局 skills 中相关代码风格、FastCar API 约束、TypeScript 规范、反模式和验证建议，只整理本次修改范围内代码，并重新运行相关验证；不得扩大行为范围、引入无关重构或削弱测试。
- 交付前清理所有临时 instrumentation、`[DEBUG-...]` 日志、一次性 harness 和未吸收的原型外壳；无法清理时必须在风险中说明。

默认参数：

```text
task_size = auto
max_iterations = 100
max_no_progress_iterations = 5
max_changed_files_per_iteration = 8
max_diff_lines_per_iteration = 800
optimization_iterations = 12
max_no_improvement_iterations = 3
minimum_validation_hardening_iterations = 1
require_validation_pass = true
require_real_test = true
require_architecture_confirmation = auto
require_mermaid = auto
allow_scaffold = true
allow_sandbox = user-confirmed
allow_new_dependencies = false
allow_destructive_git_commands = false
```

如果用户、任务说明或后续小节提供了更具体的参数，以更具体者为准。启用 Autopilot 时，Autopilot 推荐参数覆盖默认参数；用户显式指定的预算和限制再覆盖 Autopilot 推荐参数。

## 全自动迭代模式

当用户明确要求“全自动”“多轮迭代”“一直修到通过”“复杂需求实现后再输出”或类似目标时，启用 Autopilot。

Autopilot 是有边界的自动执行模式：Agent 应持续推进需求实现、验证、修复和优化，不要每轮请求用户确认；只有遇到必须由用户决策或提供资源的问题时才停止。

Autopilot 的“成功”必须按完整任务边界判断。如果用户给出了多阶段 Runbook、MVP 清单、模块列表或“直到完成所有任务”的要求，必须维护剩余任务清单并循环迭代到清单全部完成或触发停止条件。不得把单个阶段通过、单个 API 通过、单个最小纵切通过、当前失败信号清零或局部 Definition of Done 通过，误判为整体完成。

推荐参数：

```text
autopilot = true
autopilot_max_iterations = 20
max_iterations = autopilot_max_iterations
max_no_progress_iterations = 3
optimization_iterations = 8
max_no_improvement_iterations = 3
minimum_validation_hardening_iterations = 2
intermediate_reporting = concise_progress_only
final_report_required = true
```

Autopilot 执行规则：

- 先明确可验收的成功标准；如果需求可合理推断，则直接执行并在最终报告中列出假设。
- 先完成 Agent 能力探测；根据当前环境能力选择真实验证、状态持久化、子 Agent、后台任务和外部资源策略。能力不足时按降级规则标记 `not_verified` 或 `blocked`。如果 `子 Agent/并行：available`，在探索、需求提取、验证和实现阶段按 `子 Agent 并发策略` 并行调度；不可用时降级为串行。
- 启动并维护看门狗状态；每轮迭代、上下文压缩、恢复和交付前都必须检查是否超时、无进展、状态漂移、验证缺失或交付不可验证。
- 优先探索现有代码、脚手架、测试命令和项目约定，再制定垂直切片计划。
- 每轮只做与当前失败信号或成功标准直接相关的最小修改。
- 每轮修改后尽可能运行当前环境支持的真实 `test` / `build` / `lint` / `typecheck` 或最小可重复验证命令；不能运行时不得声称验证通过。
- 如果验证失败，提取首个关键失败信号，形成可证伪假设，并自动进入下一轮。
- 不要因为一次失败就交付；不要因为一个阶段或纵切验证通过就交付；只有完整任务成功、触发停止条件或需要用户决策时才输出最终结果。
- 每次阶段验证通过后，先检查完整 Runbook / MVP / 成功标准中是否仍有未完成项；如果有，更新状态文件并自动选择下一项继续迭代。
- 初版实现验证通过后，再执行有边界的递归优化；优化必须可比较、可验证、可回退。
- 所有关键 REQ passed 且 fresh-eyes 复查完成后，必须进入交付前验证加固。Autopilot / strict 默认至少 2 轮，覆盖 boundary / negative / regression 三个攻击式验证维度；发现问题就新增或重开 REQ 并继续实现，不能把“已有测试通过”当作验证加固完成。
- 中间进展只报告关键阶段、当前失败信号、已运行验证和下一步，不要输出冗长日志。
- 最终输出必须包含实现内容、关键修改、迭代次数、优化轮次、运行过的真实验证、未验证项、剩余风险和用户验收建议。

Autopilot 必须停止并汇报的情况：

- 完整任务清单、Runbook 或用户目标中的所有关键成功标准已满足且验证通过。
- 达到迭代或优化预算。
- 连续多轮没有失败信号改善。
- 需要产品行为、API 兼容性、数据迁移、权限、架构落点或外部资源决策。
- 无法建立与用户目标对齐的可靠 feedback loop。
- 真实验证需要数据库、密钥、外部服务或破坏性操作，但用户没有确认可用资源或沙箱替代。
- 修改范围、diff 大小或风险超出预算。

## 看门狗机制

Autopilot、`medium` / `large` 任务和长时间 Verify-only 任务必须启用看门狗。看门狗用于防止 Agent 在无反馈、无验证、状态漂移或交付不可确认的情况下继续循环或错误宣布完成。

看门狗不是额外实现任务；它是每轮迭代前后都必须执行的安全检查。没有平台级 timer、后台线程或 hook 时，Agent 必须在对话流程中手动维护同等状态。

看门狗状态字段以 [examples/state-template.md](examples/state-template.md) 的 `## Watchdog` 为唯一结构来源；本节只描述执行规则，避免状态模板在多处漂移。

看门狗每次检查必须回答：

轻量检查每轮必做：

- `no_progress_count` 是否超过阈值。
- `last_validation_result` 是否缺失、失败或与当前目标不匹配。
- `state_drift` 是否 suspected / confirmed。
- `triggered` 是否为 true；若为 true，先处理 `required_action`。
- `fresh_eyes_required` 是否为 true。当所有关键 REQ passed 且 remaining_implementation_iterations > 0 时，本字段必须设为 true。若为 true 且未处理，required_action = context_compress_and_review。
- `new_test_count` 是否与 passed 的 REQ 数量匹配。当 passed 的 REQ 数大于 new_test_count 且剩余实现预算 > 0 时，required_action = narrow_scope，收窄到未补测试的 REQ 写测试并更新 new_test_count。
- `validation_hardening_status` 是否为 passed / blocked / not_available / user_accepted_limited。所有关键 REQ passed 后，如果验证加固轮次未达到 `minimum_validation_hardening_iterations`，或未覆盖 boundary / negative / regression，不能交付。

完整检查在每个 phase、每 3 轮、恢复后和交付前执行：

- 本轮是否产生了可度量进展，例如需求状态推进、失败信号缩小、验证覆盖增加或风险降低。
- 是否运行了与当前目标对齐的真实验证；如果没有，缺失原因是否已记录。
- 当前 Iteration State、Requirement Coverage Matrix、Definition of Done、代码 diff 和最近验证结果是否一致。
- 是否存在重复尝试、上下文漂移、修改范围膨胀、无效 patch 累积或被 mock / 硬编码掩盖的失败。
- 最终交付成果是否能被当前环境真实验证；不能验证时，缺少的最小资源、命令、数据、权限或用户决策是什么。
- 交付前验证加固是否主动尝试发现问题，而不是只重复运行已有 happy path 测试。

看门狗触发后必须采取对应动作：

- `run_validation`：已有可执行验证但尚未运行，必须先运行验证再继续或交付。
- `reconcile`：状态文件、当前代码、diff 或最近验证不一致，必须先进入 reconcile 阶段。
- `narrow_scope`：连续无进展但仍有可验证路径，收窄到首个失败信号或单条需求。
- `ask_user`：缺少产品决策、资源、权限、密钥、数据库、外部服务或验收标准。
- `context_compress_and_review`：所有 REQ 已 passed 但仍有剩余预算。执行上下文压缩，输出 Context Handoff Summary，清空对话中的实现细节。以"新接手项目的开发者"视角重新审视全部代码和 RCM。发现遗漏 → 创建新 REQ，重置 fresh_eyes_required = false，继续迭代。无遗漏 → fresh_eyes_required = false，继续优化或交付。
- `stop`：达到预算、无法建立 feedback loop、关键交付不可验证、状态漂移无法消除或风险超过收益。

交付前看门狗是硬性门禁：

- `delivery_verifiability = verifiable` 且关键需求全部 `passed` 时，才允许使用成功交付模板。
- `delivery_verifiability = partially_verifiable` 时，只有已明确区分 passed、not_verified、blocked，且未验证项均为非关键或已获用户接受，才允许有限成功交付；否则按提前停止输出。
- `delivery_verifiability = not_verifiable` 或 `unknown` 时，不允许声称完成；必须按提前停止输出，并列出无法验证的交付成果、缺少的最小验证条件和建议用户验收步骤。

## 迭代状态

`medium` / `large` 任务和 Autopilot 必须维护轻量 Iteration State，防止长任务上下文漂移。状态结构以 [examples/state-template.md](examples/state-template.md) 的 `## Current State`、`## Budgets`、`## Hypotheses` 和 `## Context Handoff Summary` 为唯一来源；本节只描述状态更新规则。

对于多阶段任务，必须维护完整任务清单、已完成任务、当前任务、剩余任务和整体完成状态。

当 `剩余任务` 非空且未触发停止条件时，不允许输出成功交付；只能输出阶段进展并继续下一轮。

每轮继续前必须检查：

- 当前修改是否仍直接服务于成功标准。
- 最近失败信号是否比上一轮更清晰或更接近解决。
- 是否有可重复 feedback loop。
- 是否正在累积没有验证价值的 patch。
- 是否已经触发停止条件。
- 看门狗是否触发 `run_validation`、`reconcile`、`ask_user`、`context_compress_and_review` 或 `stop`。

如果一轮修改没有改善失败信号，优先回退、隔离或重新收窄本轮修改；不要在未改善的坏 diff 上继续叠加 patch。无法安全回退时，保留现状但必须在 Iteration State 中标注风险和原因。

## 上下文压缩

Autopilot 或长任务中，不要依赖完整对话历史继续推进。上下文变长时，必须压缩成可执行状态摘要。

满足以下任一条件时进行上下文压缩：

- 已完成 3-5 轮实现迭代。
- 测试日志、diff、文件内容或错误堆栈明显变长。
- 当前对话接近上下文上限。
- Agent 开始重复尝试、遗漏成功标准、引用过期失败或偏离允许修改范围。
- 进入新阶段：探索、实现、修复、优化、交付。

压缩后只保留：

- 用户目标、成功标准和非目标。
- 当前 Definition of Done 状态。
- 当前 Iteration State。
- 已确认的架构、接口、兼容性和资源约束。
- 最近一次有效 diff 摘要。
- 最近一次验证命令、结果和首个关键失败信号。
- 已排除的假设。
- 当前最高优先级假设。
- 下一步最小动作。
- 不允许修改或不能破坏的内容。

不要保留：

- 大段完整日志。
- 已解决旧错误的完整堆栈。
- 重复文件内容。
- 无关探索记录。
- 已放弃方案的细节，除非它能防止重复踩坑。

上下文压缩输出结构以 [examples/state-template.md](examples/state-template.md) 的 `## Context Handoff Summary` 为唯一来源；不要在 `SKILL.md` 中维护第二份字段模板。

## 持久化任务状态

Autopilot 或复杂任务应优先把可恢复状态保存到项目内 `.agent-state/auto-iterate/<session>/state.json`。该文件用于跨会话恢复，不替代真实代码检查和验证；`.agent-state/auto-iterate/<session>/state.md` 只是由 JSON 渲染出的生成视图。

独立 session `state.json` 是当前 schema 的唯一权威状态源；legacy mirror 和 `state.md` 只能作为兼容旧流程的人类摘要，不得作为 Autopilot、多轮任务或并行任务的唯一状态源。

如果当前 Agent 环境不支持写入状态文件，必须在对话内维护同等结构的 Iteration State 和 Requirement Coverage Matrix，并在最终交付中明确标注 `状态持久化：not_available`。不要因为无法写状态文件而跳过状态管理。

启动或恢复时如果存在当前 session 的 `state.json` 且当前环境可读取，先读取它作为任务恢复状态；缺少 JSON 时只能降级读取 `state.md` 并标记 `degraded`。继续时不要依赖历史对话，只依赖状态文件、当前代码和真实验证结果。

恢复 session 时，如果 `remaining_implementation_iterations = 0` 或剩余实现预算已耗尽，Agent 必须先请求用户追加预算，不得自动继续修改。用户确认追加预算后，更新 `max_iterations` / `autopilot_max_iterations` 和 `remaining_implementation_iterations`；`implementation_iterations_used`、`optimization_iterations_used` 和历史验证记录不清零。

恢复前必须执行 reconcile 检查：

- 查看当前分支、git 状态和 diff 摘要；如果环境不支持 git 检查，标记为 `unknown`。
- 对比状态文件中的最近修改、关键文件和当前代码是否一致。
- 检查用户是否在上次停止后手动修改了相关文件。
- 重新运行最近一次可用验证命令，或说明为什么无法运行。
- 如果状态文件与当前代码不一致，先进入 `reconcile` 阶段，更新状态并重新确认下一步最小动作，不要直接继续旧假设。

每完成以下事件后更新状态文件：

- 一轮实现迭代。
- 一轮递归优化。
- 上下文压缩。
- 提前停止。
- 成功交付前。
- 看门狗触发或解除。
- 任务后技能沉淀或 `.agents/skills/index.md` 更新。

每次更新状态文件时，必须同步更新 `## At-a-Glance / 人类摘要`，确保进度、需求计数、验证结果、看门狗状态、交付可验证性和下一步与 Budgets、Requirement Coverage Matrix、Watchdog 和 Current State 一致。

必须写入：

- 用户目标、成功标准、非目标。
- Agent 能力探测结果和降级策略。
- Requirement Coverage Matrix 及每条需求状态。
- 当前 Iteration State。
- 当前 Watchdog 状态和最近触发原因。
- Definition of Done 状态；DoD 的成功标准状态必须引用 Requirement Coverage Matrix 中对应关键 REQ 的状态，不要独立重复评估。
- 已确认决策和资源限制。
- 已运行验证和结果。
- Style Consolidation / 技巧风格整理状态，包括参考的本地/全局 skills、采用规则、整理后修改文件、验证结果、跳过原因和不可用能力。
- 已排除假设。
- 当前假设和下一步最小动作。
- 剩余预算和停止风险。
- Skill Capture / 技能沉淀状态，包括 `.agents/skills` 写入文件、`.agents/skills/index.md` 更新、候选技能点、跳过原因和不可用能力。

不要写入：

- 密钥、token、密码、连接串或任何可恢复敏感凭据。
- 大段日志。
- 完整源码。
- 无关聊天内容。
- 已解决错误的完整堆栈。

状态模板见 [examples/state-template.md](examples/state-template.md)。必需章节和未来校验规则基线见 [references/state-schema.md](references/state-schema.md)。

## 需求覆盖矩阵

当任务来自本地需求文档、长清单、PRD、设计稿说明、issue 列表或任何多条需求集合时，Agent 必须先从原文提取 Requirement Coverage Matrix，再开始实现。不要只根据摘要或用户目标判断完成。

Requirement Coverage Matrix 字段以 [examples/state-template.md](examples/state-template.md) 的 `## Requirement Coverage Matrix` 为唯一结构来源；本节只描述提取、更新和停止规则。

执行规则：

- 每条原始需求、约束、兼容性要求和验收标准都必须有独立条目。
- 实现前先标记为 `pending`，代码已修改但未验证时标记为 `implemented`。
- 只有有真实验证证据时，才能标记为 `passed`。真实验证证据必须包含至少一个本轮新增的行为测试、集成测试或等价验证命令。不写测试的原因必须写入该 REQ 的"已知限制"字段，不得静默跳过。
- 需要用户决策、密钥、数据库、外部服务或架构确认时，标记为 `blocked` 并说明原因。
- 无法验证但没有阻塞时，标记为 `not_verified`，不能当作完成。
- 每轮迭代后更新矩阵，不要只更新文字总结。
- 测试通过不等于需求完成；最终完成必须逐项对照原始需求文档和矩阵。

停止规则：

- 存在 `pending`、`implemented` 或 `not_verified` 的关键需求时，不允许按成功交付输出。
- 如果还有未完成需求且未触发停止条件，必须继续迭代。
- 如果达到预算、无法验证或需要用户决策，必须按提前停止输出，并列出剩余未完成需求。
- 只有所有关键需求为 `passed`，或非关键未验证项已明确获得用户接受，才可以按成功交付输出。

## 完成定义

最终交付前必须逐项对照成功标准，不要只用“测试通过”替代需求验收。

Definition of Done 字段以 [examples/state-template.md](examples/state-template.md) 的 `## Definition of Done` 为唯一结构来源；本节只描述交付门禁。

Definition of Done 是交付门禁视图，不是第二套需求状态来源。成功标准必须直接引用 Requirement Coverage Matrix 中对应关键 REQ 的状态和验证证据；如果 RCM 和 DoD 不一致，先更新 RCM，再从 RCM 派生 DoD 摘要。

只有所有关键成功标准和关键需求覆盖项为 `passed`，且必要验证已真实运行或明确标注不可运行原因时，才可以按成功交付输出。存在 `blocked` 时必须按提前停止输出；存在 `pending`、`implemented` 或 `not_verified` 时必须明确不能声称完整完成。

如果最终交付成果无法被当前环境验证，必须把 `交付可验证性` 标记为 `not_verifiable` 或 `unknown`，并触发看门狗 `stop`。此时不得输出“已完成”“已交付成功”或等价表述，只能输出提前停止结果、已完成内容、未验证成果、缺少的最小验证条件和用户验收建议。

## 交付前验证加固

验证加固用于解决“严格实现清单时只跑便宜测试就交付”的问题。它不是重复运行已有 happy path，而是在所有关键 REQ 已 `passed`、fresh-eyes 复查已处理后，主动以验证者视角寻找遗漏。

执行规则：

- 验证加固不消耗实现迭代预算，单独记录 `validation_hardening_iterations_used`。
- strict / Autopilot 默认至少执行 `minimum_validation_hardening_iterations = 2`；普通 medium / large 默认至少 1。用户显式指定时以用户为准。
- 每轮选择一个主要维度，至少覆盖 `boundary`、`negative`、`regression`。涉及 UI、权限、并发、数据迁移、外部服务时追加 `ui`、`permission`、`concurrency`、`data`、`integration`。
- 每轮必须产生真实验证证据：新增行为测试、扩展现有测试、运行等价验证命令，或明确记录该维度 `not_available / blocked` 的原因和最小所需资源。
- 每轮优先使用局部最小可证伪验证，例如单测、局部集成脚本、单个 CLI/API 调用或最小 UI 断言。不要把验证加固理解为每轮重复跑全量测试。
- 重型 e2e、浏览器全量回归、真实数据库集成或完整 CI 只在相关 REQ 涉及该风险、改动影响面较大、局部验证无法覆盖，或最终交付门禁需要时运行。
- 如果重型验证因耗时、资源或权限延后，必须记录 `heavy_validation_deferred`、原因、风险和用户可复现命令；关键需求依赖该验证时，交付可验证性不得标为 `verifiable`。
- 发现遗漏、边界错误、兼容性风险或测试失败时，必须新增或重开 RCM 中的 REQ，`validation_hardening_status = found_issue`，回到实现迭代。
- 无新发现时，更新 `validation_hardening_dimensions_done`、`validation_hardening_iterations_used`、`Validation.已通过验证` 和 DoD 的 `验证加固` 字段。
- 未达到最小轮次、缺少必需维度、或状态仍为 `pending / found_issue` 时，不允许使用成功交付模板。

## Skill Capture / 技能沉淀

每次任务交付、提前停止或阶段性验收后，Agent 必须执行 `Skill Capture / 技能沉淀`。目标是在本项目 `.agents/skills` 中沉淀高价值技能点，并维护 `.agents/skills/index.md` 作为检索入口，避免同类问题反复重新探索。

沉淀范围：

- 真实失败信号和可复现 feedback loop。
- 调试路径、排查顺序和已排除假设。
- 验证策略、最小可证伪命令、边界/反例/回归测试设计。
- FastCar API、装饰器、数据库、队列、RPC、Serverless 或 CLI 模板的具体约束。
- 可复用脚手架、生成器、状态模板、命令路由和迁移步骤。
- 已证明有风险的反模式、停止条件和需要用户确认的决策边界。

写入规则：

- 优先更新或创建 `.agents/skills/<skill-name>/SKILL.md`；技能点较短且尚未成体系时，可先放入 `.agents/skills/<domain>.md`，后续再拆成独立 skill。
- 必须同步维护 `.agents/skills/index.md`，至少记录 skill 名称、适用场景、关键词、文件路径和最近来源任务。
- 只沉淀可复用、可验证、跨任务有价值的技能点；不要记录密钥、token、客户数据、一次性日志、大段源码、完整报错堆栈或只对本次任务有效的流水账。
- 每条技能点应包含触发场景、可靠做法、验证方式和常见误区；如果来自推断而非验证，必须标记 `not_verified`。
- 如果没有高价值技能点，必须把 `skillCapture.status` 标记为 `skipped_no_high_value` 并写明原因；如果当前环境不能写 `.agents/skills`，标记为 `not_available` 或 `blocked`。

交付门禁：

- `deliveryEvidence.status=ready / delivered` 前，`skillCapture.status` 不得为 `pending`。
- `skillCapture.status=captured` 时，必须记录本次写入或更新的 `capturedFiles`，并确认 `.agents/skills/index.md` 已同步。
- 技能沉淀不能替代真实验证，也不能为了沉淀而扩大本次功能修改范围；它是任务后知识归档步骤。

## 任务分级

先判断任务规模，再选择流程强度：

- `small`：单文件或明确局部修改。使用轻量流程：定位 -> 修改 -> 真实验证 -> 交付。Mermaid 和递归优化可选。
- `medium`：小功能或多文件修改。使用需求规格、现状探索、feedback loop、进度记录和验证。Mermaid/纯文本进度图和递归优化按需启用。
- `large`：新 module/新项目、架构不明确、涉及数据库/外部服务，或需要多轮优化。使用完整 15 步、架构确认、脚手架优先、真实测试、递归优化和 Mermaid 或纯文本进度图。

不确定时先按 `medium` 执行；一旦发现架构、数据、外部服务、兼容性或测试资源风险，升级为 `large`。

## 引用导航

先看 [index.md](index.md)，再按需进入 [contracts/readme.md](contracts/readme.md)、[examples/state-template.md](examples/state-template.md)、[references/index.md](references/index.md)、[compatibility/readme.md](compatibility/readme.md)、[adapters/readme.md](adapters/readme.md) 和 [changelog.md](changelog.md)。不要一次性加载全部 references。

## 通用禁令

- 不要在行为、兼容性、数据迁移或架构选择不明确时猜测产品意图。
- 不要绕过用户确认的架构和项目脚手架约定。
- 不要删除、跳过、削弱或伪造测试来让验证通过。
- 不要用代码演练、静态阅读或推测替代真实验证。
- 不要伪造数据库密码、API key、token、连接串或外部服务响应。
- 不要执行破坏性 git 命令，也不要覆盖用户已有改动。
- 不要追求抽象的"最优代码"；只有改进可度量、已验证且风险低于收益时才优化。
- 启用子 Agent 并发时，不得在 `active_sub_agents` 非空时开始新 dispatch。
- 不得在无隔离机制且用户未确认时启用 coder 并发写入。
- 子 Agent 不得读取或写入 `.agent-state/` 目录下任何文件。
- 不得将子 Agent 的只读探索或纯验证结果伪称为真实验证通过。
