---
name: auto-iterate-coding
description: 面向 AI Coding Agent 的有界自动迭代开发协议。Use when user says 自动迭代、全自动开发、快速启动、一直修到通过、验收 PRD、检查是否完成、只规划不要写代码、优化模块、恢复 session、切换 session、列出自动迭代任务, or when Codex, Kimi Code CLI, Claude Code, Copilot, Cursor, Gemini CLI or another AI coding agent needs to route natural language into fastcar-cli auto-iterate commands, or implement, debug, repair, verify, plan, or recursively optimize code through bounded edit-test-fix loops with progress tracking, real validation, state handoff, and graceful degradation when tool capabilities are unavailable.
---

# 自动迭代编码

## 定位

本 skill 是面向 AI Coding Agent 的有界自动迭代开发协议，不是独立 CLI 工具，也不依赖特定 Agent 平台。

Agent 应在当前运行环境允许的工具能力范围内，尽可能执行本协议中的需求理解、代码探索、实现、真实验证、失败修复、状态记录、递归优化和最终交付流程。

本协议可以被移植或嵌入到不同 Agent 生态中，例如项目级 `AGENTS.md`、`CLAUDE.md`、`.claude/skills/`、`.agents/skills/`、`.github/skills/`、`.cursor/rules/`、`.gemini/skills/` 或其他等价机制。平台私有能力只能作为可选增强，不得成为执行本协议的前提。

如果当前 Agent 环境缺少某项能力，例如无法写文件、无法运行 shell、无法访问网络、无法执行测试、无法使用子 Agent 或无法持久化状态，必须明确降级为 `not_verified` 或 `blocked`，不得伪造完成、验证或外部资源响应。

语言规则：Agent 的输出、状态记录、交付总结和生成文档必须与用户当前提示语言保持一致。用户使用中文时，不要突然切换为英文；英文仅用于固定术语、命令、代码、文件名、API 名称或用户明确要求保留英文的内容。

## 自动迭代 Skill 强触发词

如果用户消息包含以下意图或词语，Agent 必须优先读取本 skill，而不是直接凭记忆解释或手写命令：

- 自动迭代、auto-iterate、全自动开发、Autopilot。
- 完整实现、完整做完、全部实现、端到端实现、把需求都做完。
- 根据文档实现、按文档实现、实现这个文档、实现 docs、实现 docs 文档。
- 实现 PRD、根据 PRD 实现、按 PRD 实现、按 issue 实现、把文档里的需求都做完。
- 快速启动、开一个自动迭代任务、帮我自动推进。
- 一直修到通过、一直修到测试通过、不要停直到完成。
- 检查是否完成、帮我验收、验收 PRD、验证这个 PRD 是否都实现了。
- 只规划、先规划不要写代码、Plan-only。
- 优化模块、优化性能、提升可维护性但别改行为。
- 恢复任务、切换 session、列出自动迭代任务、resume session、switch session、list session。

触发后执行顺序：

```text
1. 先读取 auto-iterate-coding/SKILL.md
2. 按“自然语言命令路由”判断用户意图
3. 必要时调用 fastcar-cli auto-iterate ...
4. 将 CLI 输出的启动提示词作为后续执行依据
```

## 快速使用

使用本 skill 将一次编码任务从需求理解推进到实现、真实验证、递归优化和最终交付。

核心规则：所有迭代次数都是预算，不是必须执行次数。停止边界必须以用户提供的完整目标、流程清单、Runbook、成功标准和显式非目标为准；单个 Phase、子任务、最小纵切或局部验证通过，只能作为继续推进下一项的阶段信号，不能作为整体成功交付条件。当完整任务已验证、没有继续提升、风险高于收益、缺少用户决策或真实资源不可用时，才提前停止或最终交付。

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

## Agent 能力探测与降级

进入自动迭代前，Agent 必须确认当前运行环境支持哪些能力，并把能力限制纳入 Iteration State、Requirement Coverage Matrix 和最终交付。

需要探测的能力：

- 读取文件和搜索代码。
- 修改、创建或删除项目文件。
- 运行 shell、脚本、测试、构建、lint 或 typecheck。
- 写入和读取 `.agent-state/auto-iterate-coding.md`。
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
网络/外部服务：available / unavailable / user-confirmed-required
数据库/密钥：available / unavailable / user-confirmed-required
git 状态/diff：available / unavailable / unknown
媒体/文档处理：available / unavailable / not_needed
降级策略：
阻塞能力：
```

## 模式选择

`auto-iterate-coding` 可以按用户目标选择不同执行强度。Agent 或配套 CLI 应优先根据用户说法和任务风险选择模式；不确定时使用 `strict` 或先询问用户。

| 用户说法 / 任务类型 | 推荐模式 | 执行重点 |
| --- | --- | --- |
| “修这个 bug” | `small` / `medium`，必要时 `quick` | 建立最小复现和反馈闭环，最小修改后验证。 |
| “一直修到测试通过” | `Autopilot` | 有界循环修复失败信号，直到完整目标通过或触发停止条件。 |
| “实现这个完整需求” | `medium` / `large` + `Autopilot` | 需求覆盖矩阵、垂直切片、真实验证和递归优化。 |
| “先规划，不要写代码” | `Plan-only` | 只读探索、架构理解、任务拆解和验证策略，不修改文件。 |
| “帮我检查是否完成” | `Verify-only` | 提取需求矩阵、验证现有实现、输出差距和证据，不主动修复。 |
| “优化这段代码” | `Optimization-only` | 先建立 baseline，只有验证通过且收益明确时保留优化。 |
| “根据 PRD 全部实现” | `Autopilot` + Requirement Coverage Matrix | 从原文逐条提取需求，直到关键需求全部 passed 或提前停止。 |

配套 CLI 可以生成启动文件，例如：

```bash
fastcar-cli auto-iterate --strict
fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix
fastcar-cli auto-iterate --verify --from docs/prd.md --session login-verify
fastcar-cli auto-iterate --plan-only --goal "规划订单模块重构" --session order-refactor-plan
fastcar-cli auto-iterate --optimize --goal "优化查询性能" --session query-optimize
fastcar-cli auto-iterate --list
fastcar-cli auto-iterate --switch login-verify
fastcar-cli auto-iterate --resume login-bugfix
```

## 自然语言命令路由

用户不需要记住 `fastcar-cli auto-iterate` 的所有参数。当用户用大白话要求启动、切换、恢复、检查、规划或优化自动迭代任务时，Agent 应先识别用户意图，再自动调用对应命令。

执行原则：

- 优先用用户原话推断 `mode`、`goal`、`from`、`session`、迭代预算和是否允许修改。
- 用户已明确目标、文件路径或 session 名时，不要再重复询问。
- 只有缺少会影响安全、兼容性或外部资源的关键信息时，才向用户提问。
- 调用命令后，直接把 CLI 输出的启动提示词作为后续执行依据。
- Agent 根据自然语言路由自动调用命令时，应追加 `--yes` 进入非交互生成模式，避免卡在 CLI 交互提示。
- 如果用户只是询问命令含义，不要执行命令；只有用户表达“帮我启动/生成/恢复/切换/检查/规划/优化”时才执行。

自然语言映射表：

| 用户说法 | Agent 应调用 |
| --- | --- |
| “快速开始修这个问题” / “开一个自动迭代任务” | `fastcar-cli auto-iterate --quick --goal "<目标>" --yes` |
| “完整实现这个文档” / “把文档里的需求都做完” | 如果能确定文档路径，调用 `fastcar-cli auto-iterate --strict --from <文档路径> --yes`；不能确定时先搜索或询问文档路径 |
| “完整实现 docs” / “实现 docs 文档” | 先确认 `docs` 是文件还是目录；如果是目录，先找候选需求文档，不要盲目把目录当文件传给 `--from` |
| “根据 docs/prd.md 全部实现” / “按 docs/prd.md 做完” | `fastcar-cli auto-iterate --strict --from docs/prd.md --yes` |
| “严格按这个 PRD 做” / “完整实现这个文档” | `fastcar-cli auto-iterate --strict --from <文档路径> --yes` |
| “检查这个 PRD 是否实现了，不要改代码” / “帮我验收” | `fastcar-cli auto-iterate --verify --from <文档路径> --yes` |
| “只帮我规划一下，不要写代码” | `fastcar-cli auto-iterate --plan-only --goal "<目标>" --yes` |
| “优化这个模块” / “提升性能但别改行为” | `fastcar-cli auto-iterate --optimize --goal "<目标>" --yes` |
| “列出自动迭代任务” | `fastcar-cli auto-iterate --list` |
| “切换到登录修复任务” | `fastcar-cli auto-iterate --switch <session>` |
| “恢复登录修复任务” | `fastcar-cli auto-iterate --resume <session>` |
| “session 叫 login-bugfix” | 在命令中追加 `--session login-bugfix` |
| “最多迭代 5 次” / “最多跑 5 轮” | 在命令中追加 `--autopilot-max-iterations 5` |
| “普通预算 50 轮” / “max_iterations 50” | 在命令中追加 `--max-iterations 50` |
| “Autopilot 预算 10 轮” | 在命令中追加 `--autopilot-max-iterations 10` |
| “不要同步 latest” | 在命令中追加 `--no-latest` |

意图判断顺序：

```text
1. session 管理：列出 / 切换 / 恢复
2. 明确禁止修改：verify 或 plan-only
3. 明确要求规划：plan-only
4. 明确要求验收/检查完成度：verify
5. 明确要求优化/重构且保持行为：optimize
6. 提供长文档、PRD、issue 路径：优先 --from
7. 默认小中型目标：quick
8. 明确生产、完整、严格、复杂：strict
```

预算推断：

- 用户说“最多迭代 N 次 / 最多跑 N 轮 / 自动修 N 轮以内”时，优先映射为 `--autopilot-max-iterations N`。
- 用户明确说 `max_iterations`、普通预算、总预算时，映射为 `--max-iterations N`。
- 用户同时给出普通预算和 Autopilot 预算时，同时追加两个参数。
- 用户没有给预算时，不要追问，使用 CLI 默认值。
- 迭代次数是安全预算，不是必须执行次数；不要为了消耗预算而继续修改。

session 推断：

- 用户明确说“session 叫 X”时使用 `--session X`。
- 用户没给 session 时，可以让 CLI 自动生成。
- 如果用户说的是“登录修复任务”“PRD 验收任务”等自然名称，Agent 应优先尝试从已有 session 中匹配；不确定时先运行 `fastcar-cli auto-iterate --list`。

示例：

```text
用户：帮我快速启动自动迭代，修复登录失败，session 叫 login-bugfix
Agent：fastcar-cli auto-iterate --quick --goal "修复登录失败" --session login-bugfix --yes

用户：帮我快速启动自动迭代，修复登录失败，最多跑 5 轮，session 叫 login-bugfix
Agent：fastcar-cli auto-iterate --quick --goal "修复登录失败" --autopilot-max-iterations 5 --session login-bugfix --yes

用户：帮我验收 docs/prd.md，不要改代码，session 叫 prd-check
Agent：fastcar-cli auto-iterate --verify --from docs/prd.md --session prd-check --yes

用户：恢复登录修复任务
Agent：先运行 fastcar-cli auto-iterate --list 匹配 session；如果唯一匹配 login-bugfix，则运行 fastcar-cli auto-iterate --resume login-bugfix
```

## Session 与模式切换

同一个项目中可能同时存在多个任务、多个模式。为了避免覆盖状态，推荐每个任务使用独立 session。

推荐状态结构：

```text
.agent-state/
├── auto-iterate-coding.md                 # 当前活动 session 的 legacy 状态镜像
├── auto-iterate-start-prompt.md           # 当前活动 session 的 legacy 启动提示镜像
├── auto-iterate-current.json              # 当前活动 session 指针
└── auto-iterate/
    └── <session>/
        ├── state.md
        └── start-prompt.md
```

Agent 判断当前模式和任务的优先级：

```text
1. 用户当前消息中显式指定的模式或 session
2. start-prompt.md 中的当前启动模式和 session
3. session state.md 中的 ## Session 和 ## Mode
4. .agent-state/auto-iterate-current.json 中的当前 session 指针
5. legacy 镜像 .agent-state/auto-iterate-coding.md
6. 如果都没有，则进入模式选择或 strict
```

执行规则：

- 如果 session state 和 legacy 镜像同时存在，以 session state 为准。
- `--switch <session>` 只切换当前活动 session，不重新生成任务内容。
- `--resume <session>` 用于恢复历史 session，并输出应发送给 Agent 的启动提示路径。
- legacy 镜像仅用于兼容旧流程，不应作为多任务并行时的唯一状态源。
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
10. 提取关键失败信号
11. 基于失败信号继续迭代
12. 验证通过或触发停止条件
13. 验证通过后，执行有边界的递归优化
14. 输出交付总结、验证证据、风险和可选 Mermaid 进度图
```

默认参数：

```text
task_size = auto
max_iterations = 100
max_no_progress_iterations = 5
max_changed_files_per_iteration = 8
max_diff_lines_per_iteration = 800
optimization_iterations = 10
max_no_improvement_iterations = 2
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
optimization_iterations = 5
max_no_improvement_iterations = 2
intermediate_reporting = concise_progress_only
final_report_required = true
```

Autopilot 执行规则：

- 先明确可验收的成功标准；如果需求可合理推断，则直接执行并在最终报告中列出假设。
- 先完成 Agent 能力探测；根据当前环境能力选择真实验证、状态持久化、子 Agent、后台任务和外部资源策略。能力不足时按降级规则标记 `not_verified` 或 `blocked`。
- 优先探索现有代码、脚手架、测试命令和项目约定，再制定垂直切片计划。
- 每轮只做与当前失败信号或成功标准直接相关的最小修改。
- 每轮修改后尽可能运行当前环境支持的真实 `test` / `build` / `lint` / `typecheck` 或最小可重复验证命令；不能运行时不得声称验证通过。
- 如果验证失败，提取首个关键失败信号，形成可证伪假设，并自动进入下一轮。
- 不要因为一次失败就交付；不要因为一个阶段或纵切验证通过就交付；只有完整任务成功、触发停止条件或需要用户决策时才输出最终结果。
- 每次阶段验证通过后，先检查完整 Runbook / MVP / 成功标准中是否仍有未完成项；如果有，更新状态文件并自动选择下一项继续迭代。
- 初版实现验证通过后，再执行有边界的递归优化；优化必须可比较、可验证、可回退。
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

## 迭代状态

`medium` / `large` 任务和 Autopilot 必须维护轻量 Iteration State，防止长任务上下文漂移。状态可以在内部持续更新；对用户只输出必要摘要。

```text
Iteration State
任务规模：
Autopilot：
当前阶段：
成功标准：
非目标：
实现迭代：current / max
递归优化：current / max
剩余预算：
最近修改：
最近验证命令：
最近验证结果：
首个关键失败信号：
当前主要假设：
下一步最小动作：
未验证项：
需要用户决策：
```

对于多阶段任务，Iteration State 必须额外维护：

```text
完整任务清单：
已完成任务：
当前任务：
剩余任务：
整体完成状态：in_progress / blocked / passed
```

当 `剩余任务` 非空且未触发停止条件时，不允许输出成功交付；只能输出阶段进展并继续下一轮。

每轮继续前必须检查：

- 当前修改是否仍直接服务于成功标准。
- 最近失败信号是否比上一轮更清晰或更接近解决。
- 是否有可重复 feedback loop。
- 是否正在累积没有验证价值的 patch。
- 是否已经触发停止条件。

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

上下文压缩输出使用：

```text
Context Handoff Summary
目标：
成功标准：
当前状态：
已完成：
关键文件：
当前失败：
已验证命令：
已排除假设：
当前假设：
下一步：
禁止事项：
剩余预算：
```

## 持久化任务状态

Autopilot 或复杂任务应优先把可恢复状态保存到项目内 `.agent-state/auto-iterate-coding.md`。该文件用于跨会话恢复，不替代真实代码检查和验证。

如果当前 Agent 环境不支持写入状态文件，必须在对话内维护同等结构的 Iteration State 和 Requirement Coverage Matrix，并在最终交付中明确标注 `状态持久化：not_available`。不要因为无法写状态文件而跳过状态管理。

启动时如果存在 `.agent-state/auto-iterate-coding.md` 且当前环境可读取，先读取它作为任务恢复状态；继续时不要依赖历史对话，只依赖状态文件、当前代码和真实验证结果。

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

必须写入：

- 用户目标、成功标准、非目标。
- Agent 能力探测结果和降级策略。
- Requirement Coverage Matrix 及每条需求状态。
- 当前 Iteration State。
- Definition of Done 状态。
- 已确认决策和资源限制。
- 已运行验证和结果。
- 已排除假设。
- 当前假设和下一步最小动作。
- 剩余预算和停止风险。

不要写入：

- 密钥、token、密码、连接串或任何可恢复敏感凭据。
- 大段日志。
- 完整源码。
- 无关聊天内容。
- 已解决错误的完整堆栈。

状态模板见 [examples/state-template.md](examples/state-template.md)。

## 需求覆盖矩阵

当任务来自本地需求文档、长清单、PRD、设计稿说明、issue 列表或任何多条需求集合时，Agent 必须先从原文提取 Requirement Coverage Matrix，再开始实现。不要只根据摘要或用户目标判断完成。

Requirement Coverage Matrix 格式：

```text
Requirement Coverage Matrix
REQ-001：
原文摘要：
类型：功能 / 兼容性 / 验证 / 性能 / 安全 / 文档 / 约束
状态：pending / implemented / passed / blocked / not_verified
相关文件：
验证证据：
阻塞原因：
下一步：
```

执行规则：

- 每条原始需求、约束、兼容性要求和验收标准都必须有独立条目。
- 实现前先标记为 `pending`，代码已修改但未验证时标记为 `implemented`。
- 只有有真实验证证据时，才能标记为 `passed`。
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

```text
Definition of Done
成功标准 1：passed / not_verified / blocked
成功标准 2：passed / not_verified / blocked
成功标准 3：passed / not_verified / blocked
真实验证：
沙箱验证：
未验证项：
Requirement Coverage Matrix 状态：
剩余风险：
```

只有所有关键成功标准和关键需求覆盖项为 `passed`，且必要验证已真实运行或明确标注不可运行原因时，才可以按成功交付输出。存在 `blocked` 时必须按提前停止输出；存在 `pending`、`implemented` 或 `not_verified` 时必须明确不能声称完整完成。

## 任务分级

先判断任务规模，再选择流程强度：

- `small`：单文件或明确局部修改。使用轻量流程：定位 -> 修改 -> 真实验证 -> 交付。Mermaid 和递归优化可选。
- `medium`：小功能或多文件修改。使用需求规格、现状探索、feedback loop、进度记录和验证。Mermaid 和递归优化按需启用。
- `large`：新 module/新项目、架构不明确、涉及数据库/外部服务，或需要多轮优化。使用完整 14 步、架构确认、脚手架优先、真实测试、递归优化和 Mermaid 图。

不确定时先按 `medium` 执行；一旦发现架构、数据、外部服务、兼容性或测试资源风险，升级为 `large`。

## 引用导航

只读取当前阶段需要的引用文件：

启用 Autopilot 时，优先读取 [requirement-to-implementation.md](references/requirement-to-implementation.md)、[feedback-loop.md](references/feedback-loop.md)、[real-testing.md](references/real-testing.md)、[stop-conditions.md](references/stop-conditions.md) 和 [final-delivery.md](references/final-delivery.md)。初版实现验证通过后，再读取 [recursive-optimization.md](references/recursive-optimization.md)；出现架构摩擦时，再读取 [architecture-friction.md](references/architecture-friction.md)。

- 需求到实现：读 [requirement-to-implementation.md](references/requirement-to-implementation.md)，用于需求规格化、现状探索、架构确认、脚手架优先和垂直切片策略。
- Feedback loop：读 [feedback-loop.md](references/feedback-loop.md)，用于建立可重复 pass/fail 信号、每轮输入、复现对齐和假设驱动调试。
- TDD 垂直切片：读 [tdd-vertical-slices.md](references/tdd-vertical-slices.md)，用于新功能、修 bug 的 test-first 循环和 tracer bullet。
- 测试质量：读 [test-quality.md](references/test-quality.md)，用于判断测试是否验证行为、是否耦合实现细节。
- Mock 边界：读 [mocking-boundaries.md](references/mocking-boundaries.md)，用于决定何时 mock、何时使用真实依赖或测试替身。
- 真实测试：读 [real-testing.md](references/real-testing.md)，用于验证策略、沙箱决策、敏感资源和未验证项标注。
- 进度可视化：读 [progress-visualization.md](references/progress-visualization.md)，用于 `medium` / `large` 任务、用户询问进度、Mermaid 或最终进度图。
- 递归优化：读 [recursive-optimization.md](references/recursive-optimization.md)，用于初版实现已通过验证、`optimization_iterations > 0` 或用户要求 N 次递归优化。
- 朴素优化：读 [plain-optimization.md](references/plain-optimization.md)，用于低风险、贴近现有代码的 enum/type/interface/常量/重复代码收敛。
- 架构术语：读 [architecture-language.md](references/architecture-language.md)，用于统一 module/interface/seam/adapter/depth/leverage/locality 术语。
- 接口与 seam：读 [interface-and-seams.md](references/interface-and-seams.md)，用于设计可测试 interface、依赖注入、adapter 和 deep module seam。
- 架构摩擦：读 [architecture-friction.md](references/architecture-friction.md)，用于没有 test seam、浅 module、局部修改反复触发远处失败或需要用户设计决策时。
- 重构候选：读 [refactor-candidates.md](references/refactor-candidates.md)，用于 GREEN 后识别安全重构机会和 deep module 机会。
- 停止条件：读 [stop-conditions.md](references/stop-conditions.md)，用于判断是否继续迭代、优化或提前停止。
- 最终交付：读 [final-delivery.md](references/final-delivery.md)，用于交付总结、验证证据、风险和验收建议。

## 通用禁令

- 不要在行为、兼容性、数据迁移或架构选择不明确时猜测产品意图。
- 不要绕过用户确认的架构和项目脚手架约定。
- 不要删除、跳过、削弱或伪造测试来让验证通过。
- 不要用代码演练、静态阅读或推测替代真实验证。
- 不要伪造数据库密码、API key、token、连接串或外部服务响应。
- 不要执行破坏性 git 命令，也不要覆盖用户已有改动。
- 不要追求抽象的“最优代码”；只有改进可度量、已验证且风险低于收益时才优化。
