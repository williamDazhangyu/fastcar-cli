# auto-iterate 由 CLI 驱动的设计与交付标注

> 状态：当前工作区实现同步中（post-PR-5 + PR-6 代码事实审计与文档校准，2026-05-23）
> 目标读者：fastcar-cli 维护者、auto-iterate skill 维护者、Router LLM 行为审阅者
> 关联代码：`src/auto-iterate.js`、`src/pipeline/*`、`src/adapters/*`、`skills/auto-iterate-coding/skill.md`、`skills/auto-iterate-coding/worker.md`、`skills/auto-iterate-coding/orchestrator.md`、`AGENTS.md`
> 关联计划：`~/.kimi/plans/wolfsbane-red-tornado-nebula.md`

本文档锁定 `fastcar-cli auto-iterate` 从「Agent 自治执行」改造为「CLI 驱动循环」的设计决策，并按当前工作区实际代码标注已交付、部分交付、待交付和未实现项。后续所有 PR 必须与本文档一致；本文档变更需要先 review。

---

## 0. 本次评估结论与当前代码事实

### 0.1 评估结论

本文档的方向成立：把 auto-iterate 从“Router LLM 读一份大 prompt 后自治执行”升级为“CLI 持有主循环、状态与验证，Worker Agent 只执行单步任务”，可以显著降低状态漂移、虚假验证和人工复制 prompt 的风险。

按当前工作区实际代码审计，CLI 驱动 pipeline 核心闭环已具备可运行实现：`--run` 进入 CLI 驱动循环（`initAutoIterate` → `runPipeline`），`--check` 做环境检查，`--json-progress` 输出 NDJSON 事件流，`src/pipeline/` 含 15 个模块，`src/adapters/` 含 TemplateAdapter、Kimi、Codex、Claude、Gemini、Cursor 适配器，`worker.md` 和 `orchestrator.md` 已存在，测试入口 `npm test` 已串起 auto-iterate 文档可靠性、pipeline、env-check、adapter、router UX 和 skill-consistency 测试。

同时，代码仍未达到本文档早期目标设计的完整规格。PR-5 范围的单步 prompt、`no_progress`、focus 类型和 `state_patch` 白名单已补齐；PR-6 的 plan/prototype/autopilot 运行时语义、delivery gate 事件、diagnose/optimize 专用 focus、假设队列、优化指标对比、CLI 多轮端到端机器验收、isolate 冲突保留，以及 Codex/Kimi 真实 Worker 单轮 smoke 和 Kimi 真实 Router UX smoke 已落地。Windows 本机和远程 Linux（Debian 6.1 x86_64, Node 24.15.0, npm 11.12.1）均已通过全量 `npm test`；Linux 还额外验证了无 Worker `--check` fallback、codex/kimi env-template 单轮 smoke、`--isolate` worktree 生命周期，以及 Codex native Worker 通过 OpenAI-compatible endpoint 的单轮 smoke。Cursor 官方安装器提供的 `agent` / `cursor-agent` 二进制已纳入 `--check` 和 native adapter 检测。当前 `src/pipeline/loopPolicy.js` 已集中承载 mode/autopilot/maxSteps loop shape，`src/pipeline/flags.js` 已把 flag 稳定性表代码化，避免文档与路由漂移。主要剩余未实现项集中在：`--autopilot` 尚未完成 Claude 真实终端稳定 UX 验收，Claude/Gemini/Cursor/Kimi 的 native Worker 矩阵仍受各自认证或运行时限制影响。详见 §0.2 和 §0.7。

### 0.2 当前实现与目标设计对照

| 项目 | 当前代码事实 | 交付标注 | 仍需补齐 |
|---|---|---|---|
| 主入口与旧路径兼容 | `parseArgs` 已支持全部 legacy flag 和 pipeline flag；`initAutoIterate` 中 `--run && !--no-run` 进入 `runPipeline`（约 680 行），不带 `--run` 仍走旧大 prompt 路径 | ✅ 已交付 | `--run` 非法组合已有保护，但 help/路由文档仍需持续同步 |
| `--run --once` 单轮闭环 | `runPipeline` 能创建 iteration 目录、写动态单步 prompt、spawn Worker、解析 result、运行验证、合并 state、输出事件；Windows 上 Codex 0.133.0 / Kimi 1.44.0 真实 Worker 单轮 smoke 已通过；Linux 上 Codex 0.133.0 / Kimi 1.44.0 native smoke 与 codex/kimi env-template 单轮 smoke 已通过 | ✅ 已交付 | Claude/Gemini/Cursor native smoke 仍需真实认证补齐 |
| 多轮 pipeline | `loopPolicy.js` 集中解析 `once/plan/autopilot/maxSteps` loop shape；`runPipeline` 写入 `mode.runtimeAutopilot` 和 `mode.loopShape`；需求关闭后不再直接成功，先输出 `delivery_gate`；运行时 delivery gate 已与 strict state 门禁对齐，除 post-change / verifiability / postAgent gate 外，还会阻断 cleanup 未完成、实现模式 styleConsolidation pending、contextResetReview 未通过和 skillCapture pending；Router UX 规则已代码化覆盖 §13.2 五个场景和 flag registry；Kimi 真实 Router UX smoke 已通过 | ⚠️ 部分交付 | Claude 真实终端端到端 UX 和 Claude/Gemini/Cursor native Worker 集成仍未完整稳定 |
| 状态写入 | `mergeIterationIntoState` 已实现 CLI 白名单合并、预算递增/递减、postChange/validation/watchdog/currentState/baseline 更新；merge 后调用 `validateStateJsonModel` | ✅ 已交付 | `notes`、`hypotheses` 已补 schema；后续新增字段仍需同步 schema/test |
| CLI 独立验证 | `runValidationCommands` 顺序运行全部命令，首个失败停止并写 `validation.log`；Worker 自报 passed 但 CLI failed 会降级为 implemented 并发 `reconcile` 事件；plan 模式返回 `skipped(plan_mode)` | ✅ 已交付 | `--no-validate` 统一表现为 `not_run` |
| NDJSON 进度 | `emitProgress` 在 `--json-progress` 下输出 NDJSON；当前事件包含 `session_started`、`iteration_start`、`pipeline_progress`、`agent_done`、`validation_done`、`state_merged`、`need_decision`、`pipeline_stopped` 等；`pipeline_progress` 在 Worker 运行中按 `--progress-interval` 输出 elapsed、budget、REQ 统计和 watchdog action | ✅ 已交付 | 事件命名已统一到代码实际名 |
| Worker 调用 | TemplateAdapter + Kimi/Codex/Claude/Gemini/Cursor 适配器可用，env template 优先；Claude/Gemini/Cursor env-template pipeline smoke 已覆盖；跨平台命令发现由 `which` 处理，跨平台 spawn 由 `cross-spawn` 处理，timeout 后进程树清理由 `tree-kill` 处理；所有 pipeline spawn 路径启用 `windowsHide`，避免 Windows 弹出 cmd 窗口；Codex native adapter 使用受限 one-shot Worker prompt、`codex exec --output-last-message` 兜底和 Windows native `codex.exe` 优先解析；Kimi 使用 `--quiet --afk --no-thinking --max-steps-per-turn ... --max-ralph-iterations 0 --agent-file ... -p @kimi-prompt.md`，并强制 Python UTF-8 环境；Cursor 支持官方 `agent` / `cursor-agent` headless 入口 | ✅ 已交付 | Claude/Gemini/Cursor native headless smoke 仍需 provider 认证补齐 |
| 环境检查 | `--check` 调用 `checkEnvironment`，检测 `kimi/codex/claude/gemini/cursor` PATH 或 `AUTO_ITERATE_*_CMD`，Cursor 额外识别官方 `agent` / `cursor-agent`，输出 `workers_available` 和 `workers_unavailable`，无 Worker 返回 `issues:["no_worker_cli_found"]` | ✅ 已交付 | 继续随真实 Worker 矩阵校准可用性原因 |
| 决策中断与恢复 | Worker `need_decision` 会输出事件并 exit 42；`--answer` 通过 `applyDecisionAnswer` 把 pending decision 写为 approved 后续跑 | ✅ 已交付 | `--answer` 当前是恢复前状态写入，不是 pipeline 内部事件消费模型 |
| 写范围保护 | `writeGuard` 已实现 verify 默认禁止写、plan 禁止写、prototype 默认 `prototype/**`、`.agent-state/` 禁写、`--scope` glob 范围检查、`--allow-modify` 放行 verify 写入；scope 列表按逗号/中文逗号/分号分隔，保留路径内空格；非 isolate git worktree 下会用 git status 前后快照补充审计 Worker 漏报的实际改动，包括 `.gitignore` 覆盖的 ignored matching 文件/目录，并对 ignored 目录生成有界内容摘要以捕获既有 ignored 文件二次修改 | ✅ 已交付 | isolate 冲突恢复仍需更多测试 |
| `--isolate` | 已实现 git worktree 创建、Worker 隔离运行、diff apply 回主工作区、清理 worktree；`need_decision` 和 `state_schema_failed` 会在退出前清理临时 worktree；merge 冲突会保留 worktree、写 state.isolate 并输出 `worktree_merge_failed`；untracked-only 和 tracked+untracked 合并都会先预检目标冲突，避免部分复制或半合并；Windows 单测和 Linux 远程 smoke 均已覆盖 worktree 创建/合并/清理 | ⚠️ 部分交付 | 真实 native Worker 行为仍需更多测试 |
| Pipeline 文件 | `src/pipeline/` 含 `runPipeline`、`mergeState`、`shouldStop`、`pickFocus`、`progress`、`resultSchema`、`envCheck`、`iterationPrompt`、`iterationPaths`、`watchdog`、`phaseGate`、`writeGuard`、`loopPolicy`、`flags`、`routerUx`，共 15 个模块 | ✅ 已交付 | `phaseGate` 仍是最小实现，不等于完整协议代码化 |
| Skill 分层 | `SKILL.md` 已有路径 A/B，`worker.md`、`orchestrator.md` 已存在 | ✅ 已交付 | 部分旧协议段落仍可继续细化路径 A/B 适用范围 |
| 测试 | `npm test` 已串起 6 个测试文件；`pipeline.test.js` 覆盖 132 个 pipeline 用例，含 loopPolicy、delivery_gate 与 strict 门禁一致性、deliveryEvidence/currentState authority gate、notes/traceability/documentation/validation bounded history、validation command config/history split、post-merge validation 逐命令历史证据、no_progress、Worker failed result gate、prompt-backed resume result gate 与 prompt_preserved 审计证据保留、isolate worktree session path sanitization、isolate ignored untracked merge gate、isolate untracked symlink gate、prompt、focus、baseline、need_decision、strict answer resume、answer schema guard、resultSchema requirement status gate、多 `--validate-cmd` 顺序执行、失败短路、验证历史 strict state gate、validation timeout diagnostic summary、Worker result 脱敏与结构化类型保持、key/value 脱敏可读性、脱敏宽度/深度边界、路径归一化复用、resume focus 机器字段、legacy focus 脱敏、writeGuard invalid path gate、normalizeActualFilesChanged 实际路径归一化、scope glob、scope 空格路径、多 scope 列表、ignored 文件审计、既有 ignored 文件二次修改、大型 ignored 文件有界摘要和大量 ignored 文件 bounded metadata 审计、prototype、isolate need_decision/schema/worker failure cleanup、isolate cleanup failure state gate、isolate 冲突、untracked-only 合并冲突和 untracked 预检、resume result focus 复用门禁、diagnose CLI 多轮、optimize CLI 多轮、diagnose hypothesisQueue、optimize metricComparison、result 缺失、worker 非零退出、valid result recovery after timeout、invalid result、agent_timeout 和 Claude/Gemini/Cursor env-template smoke；`auto-iterate-doc-reliability.test.js` 覆盖 60 个 schema/模板/dispatch/finalize 一致性用例，含 subAgentDispatch history 有界保留与计数累加、finalize strict 门禁失败不生成交付文档；`env-check.test.js` 覆盖 3 个环境检查用例；`adapters.test.js` 覆盖 22 个 adapter 用例；`router-ux.test.js` 覆盖 7 个 Router UX / flag registry 用例；Windows 与远程 Linux 全量测试均已通过 | ✅ 已交付 | 缺少 Claude 真实终端 UX 录制和 Claude/Gemini/Cursor native Worker CLI smoke |
| 单步 prompt | `iterationPrompt.js` 已注入允许修改范围、上轮 CLI 验证、focus 动态 hard rules、完整 result schema 和 status 语义 | ✅ 已交付 | 后续可继续压缩 mode 文案和增加 Worker UX 指令 |
| result.json status | `resultSchema.js` 支持 `completed/failed/blocked/need_decision/no_progress`；WORKER.md 已同步 `no_progress` | ✅ 已交付 | 本文目标设计中的 `changed/needs_decision` 已选择不采用，继续以代码实际命名为准 |
| focus 类型完整性 | `pickFocus` 完整支持全部 12 种 focus（`plan_once`、`verify_req`、`establish_baseline`、`extract_requirements`、`implement_req`、`fix_bug`、`harden_validation`、`optimize`、`hypothesis_test`、`reproduce`、`regression_check`、`verify_optimization`）；CLI 验证失败会转入 `fix_bug`；diagnose 和 optimize 有专用 focus 链路 | ✅ 已交付 | mode 允许集合仍是最小过滤，未拆独立 loop 文件 |
| mode 专用行为 | verify/plan 写权限语义、plan 单轮与 `skipped(plan_mode)`、prototype 默认 scope、diagnose reproduce/hypothesis/regression focus 与 hypothesisQueue、optimize baseline→optimize→verify_optimization 指标对比、no-improvement stop 和 CLI 多轮端到端机器验收已落地 | ✅ 已交付 | Claude 真实终端 stable UX 仍需补 |

### 0.3 当前 CLI flag 与 planned flag 边界

当前 `parseArgs` 已支持全部 legacy flag：`--from`、`--goal`、`--session`、`--list`、`--switch`、`--resume`、`--validate-state`、`--finalize`、`--dispatch`、`--capture-skills`、`--agent`、`--task`、`--files`、`--verify-command` / `--verify-cmd`、`--timeout`、`--dry-run`、`--strict-state`、`--yes`、`--examples`、`--query`、`--max-iterations` / `--max`、`--autopilot-max-iterations` / `--autopilot-max`，以及 `--strict`、`--quick`、`--diagnose`、`--verify`、`--plan-only`、`--optimize`、`--prototype`。

Pipeline flag 解析与行为标注：

| flag | 解析 | help | 行为 | 标注 |
|---|---|---|---|---|
| `--run` | ✅ | ✅ | 进入 `runPipeline` | ✅ 已交付 |
| `--once` | ✅ | ✅ | `maxSteps=1` | ✅ 已交付 |
| `--json-progress` | ✅ | ✅ | stdout 输出 NDJSON | ✅ 已交付 |
| `--check` | ✅ | ✅ | 输出 `env_check` | ✅ 已交付 |
| `--validate-cmd` | ✅ | ✅ | 覆盖 state 验证命令；可重复传入并按顺序执行，首个失败后停止 | ✅ 已交付 |
| `--max-steps` | ✅ | ✅ | 控制循环上限 | ✅ 已交付 |
| `--step-timeout` | ✅ | ✅ | Worker wall-clock timeout，默认 300 秒（代码实际默认）；`0` 表示关闭 wall-clock 上限 | ✅ 已交付 |
| `--inactivity-timeout` | ✅ | ✅ | Worker stdout/stderr 无输出超时，默认 120 秒；Template 和原生 Worker adapter 均透传，`0` 表示关闭 | ✅ 已交付 |
| `--validation-timeout` | ✅ | ✅ | CLI 验证命令超时，默认 600 秒；`0` 表示关闭验证命令超时 | ✅ 已交付 |
| `--progress-interval` | ✅ | ✅ | Worker 运行中 `pipeline_progress` 统计输出间隔，默认 15 秒 | ✅ 已交付 |
| `--focus` | ✅ | ✅ | 覆盖本轮 focus | ✅ 已交付 |
| `--answer` | ✅ | ✅ | resume 前写入 decision answer | ✅ 已交付 |
| `--isolate` | ✅ | ✅ | git worktree 隔离运行并 apply diff | ⚠️ 部分交付 |
| `--allow-modify` | ✅ | ✅ | verify 模式允许写文件 | ✅ 已交付 |
| `--no-validate` | ✅ | ✅ | 让验证结果为 `not_run` | ✅ 已交付 |
| `--no-run` | ✅ | ✅ | 压制 `--run`，回旧路径 | ✅ 已交付 |
| `--scope` | ✅ | ✅ | 限制 Worker 自报和 git 实际审计出的改动必须在 scope 内；支持 `*`、`**`、`?` 常用 glob；多个 scope 用逗号/中文逗号/分号分隔并保留路径空格；help 已展示 | ✅ 已交付 |
| `--autopilot` | ✅ | ✅ | 传入 `runPipeline`，写入 `mode.runtimeAutopilot` / `mode.loopShape`，影响多轮预算和事件语义 | ⚠️ 部分交付 |

### 0.4 术语统一

| 术语 | 本文含义 |
|---|---|
| Router LLM | 用户终端里的交互式 Agent，例如 Kimi Code / Claude Code / Codex CLI。负责自然语言路由、读取进度、询问用户决策。 |
| CLI | `fastcar-cli auto-iterate --run` 子进程。负责主循环、状态、验证、停止条件和 NDJSON 事件。 |
| Worker Agent | CLI 每轮 spawn 的无状态单步 Agent。只执行本轮 prompt，写 `result.json` 后退出。 |
| legacy dispatch | 现有 `--dispatch` 流程。可复用环境变量命令模板，但不等同于新的 pipeline worker。 |
| pipeline worker | 新 `--run` 流程中的单步 Worker。禁止直接读写 `.agent-state/`，状态合并只能由 CLI 完成。 |

### 0.5 本文档补全后的硬约束

1. 本文档必须同时描述 current 与 planned，避免后续 PR 作者误以为目标设计已经实现。
2. 后续实现 PR 必须先更新对应 schema / flag / 路由文档，再写代码；新增字段必须同步测试。
3. Router LLM 路由命令必须统一使用 `fastcar-cli auto-iterate` 全称；文档中 `auto-iterate` 只作为表格内的简写时才允许出现。
4. 任何声称“CLI 独立验证通过”的状态，必须来自 CLI 实际运行的验证命令，而不是 Worker 自报。
5. 不允许把 `--run`、`--check`、`--json-progress` 等 planned flag 加进自然语言路由后却没有对应 CLI 行为；每个新增 flag 必须在 `parseArgs`、help 文本、测试和本文档中同时出现。
6. 不带 `--run` 的现有启动文件生成路径是兼容性边界；PR-1 到 PR-4 都不得破坏现有 `--quick`、`--strict`、`--verify`、`--plan-only`、`--optimize`、`--prototype`、`--dispatch`、`--validate-state`、`--finalize` 行为。
7. `state.json` 字段扩展必须先落到 `validateStateJsonModel`、`skills/auto-iterate-coding/references/state.schema.json`、`state-schema.md` 和回归测试；不得只在 pipeline 代码里隐式写新字段。
8. Worker 适配器失败、Worker 输出非法、CLI 验证失败、写范围违规和状态校验失败都必须产生机器可读事件；不得只打印人类可读错误后退出。

### 0.6 文档评估补充

按当前仓库状态评估，本文档已经覆盖了“为什么做”和“目标架构是什么”，但原稿仍有三类需要补齐的工程落地信息：

| 缺口 | 风险 | 本次补齐位置 |
|---|---|---|
| planned flag 太多，何时允许出现在路由里不清楚 | Router LLM 可能提前生成当前 CLI 不支持的命令 | §9.3 planned flag 启用门禁 |
| 旧路径与新 `--run` 路径共存时迁移边界不够硬 | PR 作者可能改坏现有 prompt 生成、resume、dispatch 或 finalize | §10.4 迁移与回滚规则 |
| 分期路线图有 PR 名称，但缺少每个 PR 开工前和合并前的检查项 | 后续 PR 容易漏同步 help、测试、schema 和文档 | §12.6 PR 执行检查清单 |

因此本文档的当前状态定义为：

```text
文档状态：post-PR-5 + PR-6 代码事实标注与文档校准
实现状态：核心闭环可跑；PR-5 范围的 prompt、status、focus、state_patch/schema 同步已补齐；PR-6 的 plan/prototype/autopilot 基础语义、loopPolicy、flag registry 和机器 UX 验收已落地；文件清单与行数已按实际代码校准；剩余 gap 见 §0.7 P2 和 §13.2
下一步：补齐 Claude 真实终端 UX 验收、Claude/Gemini/Cursor 真实 Worker CLI 集成和失败恢复矩阵后，再把 --run --autopilot 升为 stable 推荐路径
禁止事项：不得仅凭本文档附录 A 把所有 Router LLM 默认路由切到 --run；必须先执行 --check 并确认 Worker 可用
```

本轮文档精简取舍：已删除重复标题，并把早期“权威模板 / 必须实现”的措辞降级为当前代码事实或历史重构参考；暂不把 §0.7 与 §12 的已交付清单整体搬迁到新附录，因为这些段落同时承担交付归档、验收索引和后续 PR 定位用途。后续若继续压缩正文，应先新增稳定的“交付归档”附录结构，再移动内容，避免破坏现有引用和审阅路径。

### 0.7 已知代码偏离设计规格清单（2026-05-24 代码审计）

以下 gap 均已通过代码审计确认，按补齐优先级排列：

#### P0-1：`src/pipeline/iterationPrompt.js` 动态单步 prompt — ✅ 已补齐

当前实现已从最小骨架扩展为完整动态单步 prompt（171 行），包含 session/iteration/mode/focus、允许修改范围、上轮 CLI 验证结果、focus-specific hard rules、完整 result schema 和 status 语义。以下关键注入点均已实现：

- **允许修改的文件白名单**：在 prompt 中提前告知 Worker 可写范围，与 `writeGuard` 事后审计互补
- **上一轮 CLI 验证结果**：`lastValidation` 已注入 prompt，Worker 可看到上轮验证是 pass/fail/skipped
- **focus-type 动态硬约束**：`implement_req` 注入「必须写本切片行为测试」；`fix_bug` 注入「先写最小复现测试」；`verify_req` 注入「只读检查，禁止修改文件」；`harden_validation` 注入「覆盖 boundary/negative/regression」等
- **result.json 完整 schema**：prompt 中完整展示所有字段、status 语义和 state_patch 白名单

**验证证据**：`test/pipeline.test.js` 的 `iterationPrompt 注入文件范围、上一轮验证、focus 动态规则和完整 schema`。

#### P0-2：`resultSchema.js` 支持 `no_progress` 状态 - ✅ 已补齐

当前允许的 status 为 `completed | failed | blocked | need_decision | no_progress`。本文档选择向代码实际命名对齐，不采用早期目标设计里的 `changed` / `needs_decision`。

`no_progress` 会直接让 `updateNoProgressState` 累加 `noProgressStreak`，并在连续达到阈值时触发 watchdog stop。

**验证证据**：`test/pipeline.test.js` 的 `resultSchema 校验 worker result.json` 和 `no_progress result 直接累加 noProgressStreak`。

#### P1-1：`pickFocus.js` focus 类型完整性 — ✅ 已补齐

当前实现已支持 `plan_once`、`verify_req`、`establish_baseline`、`extract_requirements`、`implement_req`、`fix_bug`、`harden_validation`、`optimize`。CLI 验证失败后会优先对 implemented/not_verified/pending 需求产出 `fix_bug`。

- **`fix_bug`**：当 requirement status 为 failed/blocked 时应产出修复 focus
- **`harden_validation`**：全部 requirement passed 但 hardening 未达标时应产出验证加固 focus
- **`optimize`**：全 passed + hardening 完成后按 mode 决定是否进入优化 focus

**验证证据**：`test/pipeline.test.js` 的 `pickFocus 支持 fix/harden/optimize 和 mode-specific focus`。

#### P1-2：`mergeState.js` state_patch 白名单 — ✅ 已补齐

当前白名单允许 `currentState.currentTask/recentChanges/keyFiles`、`notes`、`hypotheses`、`optimizationMetrics`，以及 `deliveryEvidence` 的描述性子字段；`currentState.nextAction/overallStatus/lastValidationResult`、`deliveryEvidence.status`、`deliveryEvidence.goal` 等权威字段会被忽略，只能由 CLI/finalize gate 写入。`notes` 追加到 `state.notes[]`，`hypotheses` 合并到 `state.diagnose.hypotheses[]` 和 `state.diagnose.hypothesisQueue[]`，`optimizationMetrics` 用于 baseline/post 指标对比。`validateStateJsonModel`、`state.schema.json`、`state-schema.md`、state-template 和测试已同步。

**验证证据**：`test/pipeline.test.js` 的 `mergeState 白名单合并并禁止 worker 覆盖预算`，`test/auto-iterate-doc-reliability.test.js` 的 schema/模板一致性测试。

#### P2-1：mode-specific 基础行为 - ✅ 已补齐

当前 mode 分支已覆盖 plan 单轮与跳过验证、verify/plan deny-write、prototype 默认 `prototype/**` scope、diagnose 的 `reproduce` / `hypothesis_test` / `fix_bug` / `regression_check` focus、假设优先级队列，optimize 的 baseline → `optimize` → `verify_optimization` 状态机、baseline/post 指标对比、连续无改善停止和 CLI 多轮端到端机器验收。diagnose 的 `hypothesis_test` focus 会携带当前 pending 假设 ID 和摘要，merge 时优先按该 ID 推进队列项；新假设入队时自动分配不重复的 `H<n>` ID；旧状态只有 `diagnose.hypotheses[]` 且缺少 `hypothesisQueue[]` 时，会先物化为 pending 队列再逐条消费。真实终端 UX stable 仍归入 §13.2；Kimi smoke 已通过，Claude 仍待可用环境验收。

| mode | 当前实现状态 |
|---|---|
| **diagnose** | ✅ 已有专用 focus、`reproduce` baseline、`hypothesisQueue` 优先级状态推进，并有 CLI 多轮端到端机器验收覆盖 reproduce → hypothesis_test → fix_bug → regression_check |
| **optimize** | ✅ 已有 baseline → optimize → `verify_optimization`、baseline/post 指标对比和连续无改善停止策略，并有 CLI 多轮端到端机器验收覆盖 baseline → optimize → verify 后停止 |
| **plan** | ✅ 已补 `skipped(plan_mode)`，并写入 `postChange.status=skipped_with_reason` |
| **prototype** | ✅ 已补默认 scope `prototype/**` |

**验证证据**：`test/pipeline.test.js` 的 plan/prototype/baseline、`diagnose hypothesisQueue 消费 pending 假设并避免重复验证`、`optimize 比较 baseline/post metrics 并在连续无改善后停止`、`diagnose 模式 CLI 多轮端到端推进 reproduce/hypothesis/fix/regression`、`optimize 模式 CLI 多轮端到端推进 baseline/optimize/verify 后停止` 相关用例。

#### P2-2：NDJSON 事件名不匹配 - ✅ 已补齐

| 早期文档事件名 | 当前统一事件名 |
|---|---|
| `validation` | `validation_done` |
| `done` | `pipeline_stopped` |

当前文档、示例和测试已统一采用 `validation_done` / `pipeline_stopped`。`validation_done` 表示 CLI 验证已完成，`pipeline_stopped` 携带 `reason` 字段区分 `once_completed`、`no_focus`、`max_steps_reached`、`delivery_ready` 等停止原因。

#### P2-3：`--autopilot` runtime loop shape 与稳定性验收 - ⚠️ 部分补齐

当前 `parseArgs` 会把 `--autopilot` 写入 `options.autopilotRun = true`，help 也展示该 flag；`initAutoIterate` 已将 `autopilotRun` 传入 `runPipeline`。`loopPolicy.js` 集中计算 `runtimeAutopilot`、`loopShape` 和 `maxSteps`，`runPipeline` 写入 `state.mode.runtimeAutopilot` / `state.mode.loopShape`，并在 `session_started` 事件中输出 `runtime_autopilot` 与 `loop_shape`。

**剩余影响**：`fastcar-cli auto-iterate --run --autopilot ...` 已具备运行时 loop shape、`delivery_gate` 事件、`routerUx.js` 机器验收规则、diagnose/optimize CLI 多轮端到端机器验收和 Kimi 真实 Router UX smoke；但 Claude 真实终端 UX 录制和多 Agent 真实 Worker 集成矩阵仍未达到量产级 stable。

**补齐方向**：补 Claude 真实终端 UX 验收和 Claude/Gemini/Cursor Worker CLI 实机矩阵。

#### P2-4：flag/help/schema 文档漂移 - ✅ 已补齐当前已知项

当前代码已解析并实现 `--scope`，`runPipeline` 也传入 `writeGuard` 生效；`node bin/cli.js auto-iterate --help` 和顶层 help 均已展示 `--scope <glob[,glob]>`。`state_patch.notes/hypotheses/optimizationMetrics`、`mode.runtimeAutopilot`、`mode.loopShape`、`traceability`、`documentation` 和 `deliveryDocs` 已同步 `validateStateJsonModel`、`state.schema.json`、`state-schema.md`、state-template 和测试。traceability 只保存公开可审计推理摘要，不记录私有 chain-of-thought，并且 state 中只保留最近 200 条；notes、diagnose.hypotheses 和 diagnose.hypothesisQueue 每类最多保留最近 200 条；documentation 每类也只保留最近 200 条；validation.commands 的历史对象最多保留最近 200 条且不会回流为下一轮执行命令；完整每轮原始证据保留在 iterations 目录；`--finalize` 会先执行 Skill Capture 和 strict state 门禁，门禁通过后才生成 `.agent-state/auto-iterate/<session>/docs/{api.md,changelog.md,architecture.md,implementation.md}`，并在写入 `deliveryDocs` 后再次 strict 校验，避免失败 session 留下误导性交付文档。

**剩余影响**：后续任何新增 flag、state 字段或 NDJSON 事件仍必须按 §12.6 同步文档和测试。

**验证证据**：`test/pipeline.test.js` 的 `auto-iterate help 展示 --scope`，`test/auto-iterate-doc-reliability.test.js` 的 schema/模板一致性测试。

---

## 1. 背景与问题

### 1.0 原有 7 个启动模式

现代码库里 `MODE_CONFIGS`（`src/auto-iterate.js:62-133`）定义了 7 种启动模式，本设计不取消，而是让每种模式在新架构下有明确的【循环形状 + focus 集合 + 验证语义 + 收敛条件】。详见 §5.5。

| mode | label | 本质 |
|---|---|---|
| strict | 严格启动 | 生产代码有顺序全流程 |
| quick | 快速启动 | 推断需求后走流水线 |
| diagnose | Diagnose | 先复现再修 bug |
| verify | Verify-only | 只检查不修改 |
| plan | Plan-only | 只出计划不写代码 |
| optimize | Optimization-only | 有边界优化 |
| prototype | Prototype-only | 一次性原型 |

旧架构下，7 个 mode 只是 prompt 文本差异（`buildModeInstructions` 输出不同段落），Agent 自己读提示词、自己决定怎么跑。新架构下，这些差异必须落到 CLI 代码逻辑里。

### 1.1 现状

当前 `fastcar-cli auto-iterate` 的实际行为是：

1. CLI 读取用户输入 / 文档 / 模板，生成一份大 prompt（`buildPromptContent`，约 100+ 行）。
2. CLI 把 prompt 写到 `start-prompt.md`，**同时打印到 stdout**。
3. CLI 退出。
4. 用户 / 调用方 LLM（Router LLM）把 prompt 当作任务输入，自己在自己的会话里跑完整 20+ 轮迭代。
5. Router LLM 按 `skills/auto-iterate-coding/skill.md` 自治维护 `state.json`、跑测试、决定循环边界。
6. 跑完后用户可选 `--validate-state` / `--finalize` 让 CLI 做事后结构 lint。

**严格地说，CLI 现在没有循环。** 所谓的「自动迭代」全部发生在 Router LLM 的对话上下文里。

### 1.2 三个根本问题

#### 问题 1：控制权模糊，状态漂移

`state.json` 由 Router LLM 自己写，每轮 budgets / watchdog / requirements 是否如实更新完全靠 LLM 的纪律。多轮之后状态文件常出现与真实代码不一致的字段，CLI 只能事后 lint，无法实时纠正。

#### 问题 2：Agent 自报验证不可信

`state.validation.passed = true` 由 LLM 写入。LLM 可能根本没跑测试，或者跑了某个子集就声明全部通过。CLI 没有独立的 ground truth，只能信。

#### 问题 3：用户仍需手动复制 prompt，不是真正的「零人工」

即使 Router LLM 在终端里跑了 `fastcar-cli auto-iterate ...`，它拿到 stdout 之后还要把 prompt 内化为任务，决定怎么落地。中间环节是黑盒，用户看不见进度。如果换一个不熟悉 SKILL.md 的 LLM，整套机制就失效。

---

## 2. 终极目标与 UX

### 2.1 期望的用户体验

```
用户：把 docs/prd.md 里的需求都实现了，遇测试失败就一直修。

Kimi Code（Router LLM）：
  好的，正在准备环境……
  [静默 Shell: fastcar-cli auto-iterate --check --json-progress]
  [静默 Shell: fastcar-cli auto-iterate --run --autopilot --from docs/prd.md --json-progress]
  [读取 NDJSON 进度事件]
  已开始，共 7 个需求。现在在做 REQ-001 用户登录接口……
  ✅ REQ-001 完成并通过测试，进度 1/7。
  ✅ REQ-002 完成并通过测试，进度 2/7。
  ⚠ REQ-003 需要你拿个主意：存储选 PostgreSQL 还是 MongoDB？
  [AskUserQuestion]
用户：PostgreSQL。
Kimi Code：
  [静默 Shell: fastcar-cli auto-iterate --resume <session> --run --autopilot --answer postgres --json-progress]
  好的，继续……
  ✅ REQ-003 完成，进度 3/7。
  ……
  ✅ 全部完成，耗时 14 分钟。17 轮迭代，验证全部通过。
```

用户全程说了两句人话：

- 不敲 `fastcar-cli` 命令
- 不复制 prompt
- 不手动跑 `npm test`
- 不手动改 `state.json`

### 2.2 三角色职责表

| 角色 | 位置 | 职责 | 不做什么 |
|---|---|---|---|
| **Router LLM** | 用户终端会话（Kimi Code / Claude Code / Codex CLI / Cursor 等） | 翻译自然语言为 CLI 命令；读 NDJSON 进度；口语化汇报；遇 need_decision 用 AskUserQuestion 问用户 | 不直接改代码、不自己跑 npm test、不自己写 state.json |
| **CLI（fastcar-cli auto-iterate --run）** | 用户机器上的子进程 | 主循环；选 focus；构造单步 prompt；调 Worker；独立验证；合并 state；决定下一步；输出 NDJSON 事件 | 不依赖 LLM 决定循环边界 |
| **Worker Agent** | CLI spawnSync 出的单发子进程（codex / claude / kimi / gemini / …） | 读单步 prompt，做一件具体的事，写 result.json 后退出 | 不循环、不读写 state.json、不规划多个 REQ |

---

## 3. 架构

### 3.1 旧架构

```
用户  ─────►  Router LLM（终端会话）
                 │
                 ▼
            fastcar-cli auto-iterate
                 │ 生成大 prompt + state.json + 打印 prompt
                 ▼
            stdout（大 prompt 文本）
                 │
                 ▼
            Router LLM 把 prompt 当任务，自己跑 20+ 轮
                 │
                 ├─► 自己改代码
                 ├─► 自己跑 npm test
                 └─► 自己改 state.json
                 │
                 ▼
            可选：fastcar-cli auto-iterate --validate-state（结构 lint）
```

### 3.2 新架构

```
用户  ─────►  Router LLM（终端会话）
                 │ 翻译意图为命令
                 ▼
            fastcar-cli auto-iterate --run --autopilot --json-progress
            ┌───────────────────────────────────────────────┐
            │ CLI 主循环 runPipeline                         │
            │  ┌─────────────────────────────────────────┐ │
            │  │ for iter in 1..maxSteps                  │ │
            │  │   1. focus = pickNextFocus(state)        │ │
            │  │   2. prompt = buildIterationPrompt(...)  │ │
            │  │   3. spawnSync(Worker)                   │ │
            │  │   4. result = parseResultJson(...)       │ │
            │  │   5. cliValidation = runValidationCmds() │ │
            │  │   6. state = mergeIntoState(...)         │ │
            │  │   7. emitProgress(NDJSON)                │ │
            │  │   8. if shouldStop(state) break          │ │
            │  └─────────────────────────────────────────┘ │
            └───────────────────────────────────────────────┘
                 │ stdout：NDJSON 事件流（机器可读）
                 ▼
            Router LLM 实时解析事件
                 │ 口语化汇报；遇 exit 42 用 AskUserQuestion
                 ▼
            用户（只看到中文进度叙述）
```

### 3.3 三个关键闭环

#### 闭环 A：自然语言 → CLI 命令

由 Router LLM 主动走，靠 `AGENTS.md` + `skills/auto-iterate-coding/skill.md` 里的硬约束与触发词映射表。

#### 闭环 B：CLI 进度 → 人话汇报

CLI 在 `--json-progress` 下输出稳定 schema 的 NDJSON 事件，Router LLM 实时读 stdout，每 1-2 个事件变化后口语化转述。Worker 长时间运行时，主进程按 `--progress-interval` 周期性输出 `pipeline_progress`，携带 elapsed、heartbeat、budget_left、REQ 状态计数、focus、phase 和 watchdog_action。事件 schema 在 `src/pipeline/progress.js` 里冻结，后续只允许加字段、不允许改字段。

#### 闭环 C：交互式人工决策（need_decision）

CLI 遇到必须问用户的决策点时打印 `need_decision` 事件并 `process.exit(42)`。Router LLM 看到非零退出码 = 42 时用自身的 `AskUserQuestion`（或等价控件）问用户，拿到答案后用 `--resume ... --answer <id>` 续跑。

### 3.4 单步 prompt vs 全量 prompt

| 维度 | 全量 prompt（旧） | 单步 prompt（新） |
|---|---|---|
| 长度 | ~100 行讲义 | ≤ 40 行 |
| 上下文 | 整个协议（watchdog、RCM、fresh-eyes、validation hardening、style consolidation……） | 仅本轮要做的一件事 + 允许文件白名单 + 上一轮验证结果 |
| Worker 心智 | 「我要按协议跑 20+ 轮」 | 「我做完这一件事就写 result.json 退出」 |
| 控制权 | Worker 自治 | CLI 控制 |

全量 prompt 仍保留为 session 首轮上下文写到 `start-prompt.md`，作为 Worker 的「长期记忆」参考（但 Worker 默认不必读）。

---

### 3.5 原有协议原则的归属重排（最关键的一次心智更新）

现版 `skills/auto-iterate-coding/skill.md` 里所有协议性原则——最小纵切（vertical slice）、需求覆盖矩阵（RCM）、完成定义（DoD）、Watchdog、Reconcile、Validation Hardening、Fresh-Eyes 复查、可证伪假设、状态漂移检测、Skill Capture——**全部仍然有用，没有一条作废**。变的是**谁来执行**：

```
旧架构：       一个 LLM 全部背下来 + 自己自觉遵守 + 自报合规
新架构：       拆成三段归属
             ├─ CLI 强制类（变成代码 if/else）
             ├─ Worker 单步类（写进单步 prompt 的硬约束）
             └─ Orchestrator/Router 类（继续放在 SKILL.md）
```

### 3.5.1 归属重排表

| 原则 | 旧归属 | 新归属 | 实现位置 |
|---|---|---|---|
| 最小纵切（vertical slice） | Worker 自觉 | **CLI 强制** | `pickNextFocus` 每轮只产出一个 REQ id；单步 prompt 显式声明「本轮只做这一个切片」 |
| Requirement Coverage Matrix (RCM) | Worker 维护在 state.json | **CLI 维护** | `mergeIterationIntoState` 是 RCM 的唯一写入口；Worker 只能提 `state_patch` 建议 |
| Definition of Done (DoD) | Worker 自报 | **CLI 派生** | DoD 从 RCM 状态 + cliValidation + watchdog 派生，不由 Worker 写 |
| Watchdog | Worker 每轮自检 | **CLI 每轮强制检查** | `src/pipeline/watchdog.js`；触发条件确定性 JS，不靠 LLM 判断 |
| Reconcile（对账） | Worker 自觉触发 | **CLI 自动触发** | 每轮 merge 前比对 git diff vs report.files_changed；不一致 → `reconcile` 事件 |
| Validation Hardening | Worker 决定何时进入 | **CLI 阶段门禁决定** | `checkPhaseGate`：全 REQ passed → 切换到 `harden_validation` focus 阶段；按 mode 强制 N 轮（strict=2、quick=1） |
| Fresh-Eyes 复查 | Worker 自报已做 | **CLI 触发 + Worker 执行** | `state.watchdog.freshEyesRequired` 由 CLI 在「全 REQ passed 且有剩余预算」时置 true；该轮 prompt 注入 fresh-eyes 任务 |
| 可证伪假设（diagnose 模式） | Worker 自由发挥 | **CLI focus 类型化** | diagnose 模式的 focus = `hypothesis_test:<H1>`，每轮只测一个假设；CLI 维护 `state.diagnose.hypotheses[]` 队列 |
| 状态漂移检测（state_drift） | Worker 自检 | **CLI 校验** | `validateStateJsonModel` 每轮强制跑；claimed vs actual 不一致 → watchdog mismatch |
| Baseline（optimize / diagnose） | Worker 自觉建立 | **CLI 强制首轮** | `pickNextFocus` 在 mode=optimize/diagnose 首轮强制产 `establish_baseline` focus，未跑 baseline 不进主循环 |
| Skill Capture | 用户跑 `--capture-skills` | **保持不变** | 收尾后由 CLI 自动触发或用户显式跑 |
| 最少/最大迭代次数（budgets） | Worker 自觉递减 | **CLI 唯一递减** | `mergeIterationIntoState` 内递减；Worker 看到的是只读快照 |
| Context Compression / Handoff | Worker 自觉做 | **CLI 触发 + Worker 执行** | 当 watchdog 触发 `context_compress_and_review`，CLI 把该轮 focus 变为 `fresh_eyes_review`，prompt 注入 handoff 摘要 |
| 不为凑轮数制造无效修改 | Worker 自我克制 | **CLI 阻止** | `shouldStop` 在「全 REQ passed 且 hardening 完成」时强制停，不给 Worker「再写一轮」的机会 |
| Quality Gate（子 Agent merge 后） | 父 Worker 做 | **CLI 做（沿用现有 `initDispatch`）** | 已在 Phase 3 并行场景，不在本 PR 范围 |

### 3.5.2 SKILL.md 内容怎么处理

- **保留**：上述「Orchestrator 类」原则——任务分级、Codex goal 边界、自然语言路由、模式选择哲学、ask-or-act 决策表、上下文压缩判断、Skill Capture 触发条件——仍是 Router LLM 与 SKILL 维护者的指南。
- **降级为参考**：所有「Worker 该怎么做事」的细则被 CLI 代码化后，SKILL.md 里相应段落改为「（已由 CLI 在 --run 模式下强制执行，本节仅供阅读源码者理解协议背景）」。
- **新增 `worker.md`**：从 SKILL.md 抽出「单步 Worker 能用到」的最小子集——例如「不要凭其他框架习惯推断 FastCar API」「import 规则」「禁止读写 .agent-state」——加上 result.json schema 与单步硬约束。约 80 行。

### 3.5.3 一个具体例子：最小纵切

旧版协议（SKILL.md：395 行）：

> 「新功能和缺陷修复必须使用垂直切片 TDD。每条 REQ 标为 passed 前，其验证证据中必须包含至少一个本轮新增的行为测试……」

旧实现：Worker 自己读这段话，自己决定是否守规。可能它就跑了一个 happy path 测试就标 passed。

目标实现（拆成三处；当前代码已完成第 1、3 点，第 2 点只强制 CLI 验证失败时降级）：

1. **CLI 代码**（`pickNextFocus`）：每轮只产出一个 REQ id，`focus.summary` 里明示「这是 vertical slice 第 N 个」。Worker 看到的就是一个切片，无法跨切片。
2. **CLI 代码**（`mergeIterationIntoState`）：目标约束是把 REQ 从 `pending` 升到 `passed` 时同时检查 evidence 与 cliValidation；当前实现已在 cliValidation 非 passed 时把 Worker 声称的 `passed` 降级为 `implemented`，尚未解析 evidence 是否包含「本轮新增测试」标记。
3. **Worker prompt**（`buildIterationPrompt`）：硬约束「本轮你必须写一个本切片的行为测试，并在 evidence 里列出测试文件路径」。

这样最小纵切原则正在从一句 Worker 自觉的散文收敛为 CLI 代码与 Worker prompt 的组合约束；当前刚性约束以 CLI validation gate 为主，evidence 内容语义检查仍属于后续可补强项。

### 3.6 状态权威与文件归属

CLI 驱动路径下必须明确“谁可以写哪个文件”，否则 Worker、Router 和 CLI 会互相覆盖。

| 文件 / 目录 | 旧路径 current | `--run` 目标路径 planned | 约束 |
|---|---|---|---|
| `.agent-state/auto-iterate/<session>/state.json` | CLI 初始化，后续 Agent 可维护 | CLI 唯一写入 | Worker result 只能提交 `state_patch` 建议。 |
| `.agent-state/auto-iterate/<session>/state.md` | CLI 初始化，后续 Agent 可维护 | CLI 从 `state.json` 派生刷新运行投影 | 不再作为机器权威源。 |
| `.agent-state/auto-iterate/<session>/start-prompt.md` | CLI 写入大 prompt | CLI 仍保留用于 legacy / fallback | `--run` Worker 默认读取单步 prompt，不依赖大 prompt。 |
| `.agent-state/auto-iterate/<session>/iterations/<n>/prompt.md` | 不存在 | CLI 写入 | 每轮单步 Worker 输入。 |
| `.agent-state/auto-iterate/<session>/iterations/<n>/result.json` | 不存在 | Worker 写入，CLI 校验后归档 | 只能写 result schema；不能写 state。 |
| `.agent-state/auto-iterate/<session>/iterations/<n>/validation.log` | 不存在 | CLI 写入 | 完整验证日志，不进入 state.json。 |
| 项目代码文件 | Agent 直接修改 | Worker 修改，CLI 通过 diff/write guard 审计 | verify/plan/prototype/optimize 受 mode 写范围限制。 |

`state.json` 是唯一机器权威；`state.md` 是给人看的投影。PR 实现时必须避免反向从 `state.md` merge 回 `state.json`，除非是 legacy resume 的显式降级路径。

### 3.7 失败模型

CLI 驱动循环不是“只要 Worker 返回 0 就继续”。下列失败必须被类型化，写入事件和 state：

| 失败类型 | 典型来源 | CLI 行为 | 事件 |
|---|---|---|---|
| `worker_spawn_failed` | 命令不存在、权限不足 | 不合并 result，记录 worker 不可用 | `error` |
| `agent_timeout` | Worker 超时或 hang | 杀掉本轮，持久化 `postChange.failed` / `watchdog.stop` 后停止本轮 | `agent_timeout` 后接 `error(reason=worker_failed)` |
| `invalid_result` | result.json 缺失、JSON 非法、schema 不符 | 不合并 result，持久化 `postChange.failed` / `watchdog.stop` 后停止 | `error` |
| `focus_mismatch` | Worker 回报的 focus 不是 CLI 下发 focus | 丢弃 `state_patch`，保留日志 | `watchdog_triggered` |
| `write_violation` | deny-write 或 scope 外文件被改 | 丢弃本轮结果，必要时要求 reconcile | `write_violation` |
| `validation_failed` | CLI 验证命令非 0 | req 不能标 passed；若 Worker 声称 passed 则触发 reconcile | `validation_done(status=failed)`，必要时接 `reconcile` |
| `state_schema_failed` | merge 后 `validateStateJsonModel` 不通过 | 不写入损坏 state，回滚到 merge 前 | `error` |
| `need_decision` | 产品/API/资源决策缺失 | 写 `decisionRequest.status=pending` 后 exit 42 | `need_decision` |

每类失败都必须能被单测覆盖。不得把多种失败统一成“失败了，请查看日志”，否则 Router LLM 无法稳定做自然语言转述和恢复。

## 4. 适配层

### 4.1 AgentAdapter 接口

```
class AgentAdapter {
  buildCommand(promptFile, { cwd, timeoutSec, resultFile, session, agentId })
    → { cmd, args, env, cwd, timeoutMs, useShell }

  parseOutput(stdout, stderr, exitCode, resultFile)
    → { text, success, raw }

  isComplete(parsedOutput)
    → boolean
}
```

每个适配器约 20-40 行。统一约束：**强制 non-interactive、强制 new session**（每轮 Worker 必须无状态启动）。

### 4.2 内置适配器实现状态

**✅ 已实现的一等公民适配器**：

| 适配器 | 文件 | 命令模板 |
|---|---|---|
| Kimi Code | `src/adapters/kimi.js` | `kimi --quiet --afk --no-thinking --max-steps-per-turn 8 --max-ralph-iterations 0 --agent-file src/adapters/kimi-worker-agent.yaml --work-dir {cwd} -p @kimi-prompt.md` |
| Codex | `src/adapters/codex.js` | `codex exec --cd <cwd> --sandbox danger-full-access --skip-git-repo-check -` + stdin 传 prompt |

通用执行层不再手写 `where` / `which` 平台分支，也不自行猜测 `.cmd` / PATHEXT / shebang 规则：命令发现交给成熟 npm 包 `which`，进程启动交给 `cross-spawn`，Worker timeout 后的进程树清理交给 `tree-kill`。Codex 在 Windows 上额外优先解析 npm 包内的 native `codex.exe`，这是针对 Codex `.cmd` shim 在 stdin/timeout 场景下不稳定的最小专用兜底，不作为通用 Windows 适配方案。

选这两个为一等公民的理由：

- **Kimi Code**：项目以它作为主用 Router 环境；当前 Kimi CLI help 暴露 `--quiet`、`--afk`、`--no-thinking`、`--max-steps-per-turn`、`--max-ralph-iterations`、`--agent-file`、`--work-dir` 和 `-p/--prompt`。适配器使用受限 Worker agent，只暴露 `ReadFile` / `WriteFile`，并生成短 `kimi-prompt.md`，避免 Kimi 在仓库根目录读取 `AGENTS.md` 后进入 Router/探索协议；同时设置 `PYTHONIOENCODING=utf-8` / `PYTHONUTF8=1` 避免 Windows GBK 输出失败。Windows + Kimi 1.44.0 下，`real-kimi-short-smoke` 已在约 15 秒内完成 result 写回、CLI validation 和 state merge；Linux 远程通过 Python 3.12.13 venv + `kimi-cli==1.44.0` + OpenAI-compatible `openai_responses` provider 配置后，`linux-kimi-native-smoke-openai-relay` 也已完成同样链路。
- **Codex**：OpenAI 官方 CLI，当前适配器使用 `codex exec --cd <cwd> --sandbox danger-full-access --skip-git-repo-check -` 通过 stdin 喂 prompt；已在 Windows + Codex 0.133.0 下验证 `--run --once --quick --agent codex --json-progress` 可完成 result 写回、CLI validation 和 state merge。真实运行仍受本地 Codex 版本、登录态和模型服务可用性影响。
- **Codex Linux 远程 smoke**：Debian 6.1 x86_64 / Node 24.15.0 下，Codex 0.133.0 使用临时 `CODEX_HOME`、自定义 `model_provider` 和 OpenAI-compatible endpoint 跑通 `--run --once --quick --agent codex --json-progress --validate-cmd true`，输出 `agent_done exit_code 0`、`validation_done: passed`、`state_merged`、`pipeline_stopped: once_completed`。API key 仅写入远程临时 Codex 登录态，不写入仓库文档。

**✅ 已实现的二等公民专用适配器**：

| 适配器 | 文件 | 命令模板 |
|---|---|---|
| Claude Code | `src/adapters/claude.js` | `claude -p @{promptFile}` |
| Gemini CLI | `src/adapters/gemini.js` | `gemini -p @{promptFile}` |
| Cursor | `src/adapters/cursor.js` | `agent --print --output-format text --trust --workspace {cwd} <prompt>`；兼容旧 `cursor agent --prompt @{promptFile}` |

这三个保留为二等公民的理由：

- **Claude Code**：远程已安装并可被 `--check` 识别，但无 Anthropic/Claude Code 登录态时返回 `Not logged in`；尝试用 OpenAI-compatible key 走 `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` 会遇到协议或模型兼容问题，不能标记 native smoke 通过。
- **Gemini CLI**：远程已安装并可被 `--check` 识别，但需要 `GEMINI_API_KEY`、Vertex AI 或 Google Cloud Auth；OpenAI-compatible key 不会被 Gemini CLI 当作可用 Google API 认证。
- **Cursor**：官方 installer 在 Linux 上提供 `agent` / `cursor-agent`，当前 `--check` 已能识别 `agent`；native headless 调用需要 Cursor 自己的 `CURSOR_API_KEY` 或 `agent login`，OpenAI-compatible key 不能替代。官方当前安装方式覆盖 macOS、Linux 和 Windows WSL，未验证原生 Windows `agent` 二进制。

**不进一等公民列表的**（永远走 TemplateAdapter）：

Windsurf / GitHub Copilot / Jules / Devin / OpenHands / Replit。这 6 个多为 IDE 集成或托管平台，本地 headless 调用面不稳定，不值得写专用适配器。用户配好 `AUTO_ITERATE_<XXX>_CMD` 环境变量后仍可使用。

### 4.3 TemplateAdapter 回落

读取现有 `DISPATCH_AGENT_CONFIGS`（`src/auto-iterate.js` line 187-243）的 `env` / `aliases` 映射；真正的命令模板来自对应环境变量，支持 `{prompt}` `{result}` `{session}` `{agentId}` 占位符，覆盖：

- 已实现专用适配器但需要环境变量覆盖命令模板的 Agent（例如不同版本 Claude / Gemini / Cursor 的 headless 参数不一致时）。
- 永远走 TemplateAdapter 的 6 种 Agent（Windsurf / Copilot / Jules / Devin / OpenHands / Replit）。
- 未来新增未知 Agent，只要它能被 `command shell` 调起来。

未来新增 Agent 需要先在 `DISPATCH_AGENT_CONFIGS` 增加 `label/env/aliases`，并通过环境变量提供命令模板；后续如有需要再升级为专用适配器。

### 4.4 工厂函数

```
loadAdapter(name)
  ├─ normalize 别名（codex-cli / codex_cli / codex → codex）
  ├─ 优先返回内置专用适配器（kimi / codex / claude / gemini / cursor）
  └─ 否则返回 TemplateAdapter(DISPATCH_AGENT_CONFIGS[name])
```

专用适配器覆盖范围为 kimi / codex / claude / gemini / cursor；未知或托管型 Agent 继续走 TemplateAdapter。

### 4.5 命令模板解析与安全边界

TemplateAdapter 不从 `DISPATCH_AGENT_CONFIGS` 读取命令模板本体；该对象只提供 `label`、`env` 和 `aliases`。实际模板来自环境变量，例如 `AUTO_ITERATE_CODEX_CMD`、`AUTO_ITERATE_KIMI_CMD`。模板允许的占位符固定为：

| 占位符 | 含义 |
|---|---|
| `{prompt}` | 本轮 prompt 文件路径 |
| `{result}` | Worker 必须写入的 result.json 路径 |
| `{session}` | 当前 auto-iterate session 名 |
| `{agentId}` | 可选 Worker id，用于日志或外部 Agent session 标识 |

解析规则：

1. 不做 shell 拼接式转义猜测；优先把模板解析为命令与参数数组。
2. 如果用户模板必须走 shell，必须显式记录 `useShell=true` 风险，并在 `env_check` 事件里输出。
3. Worker 命令默认 non-interactive、new session、超时受 `--step-timeout` 控制。
4. Adapter 不得把密钥、完整日志或大段源码写入 NDJSON 事件；只写摘要和路径。

---

## 5. 执行引擎

### 5.1 runPipeline 简化示意

```
async function runPipeline(options) {
  const sessionPaths = await ensurePipelineSession(options)
  const adapter = loadAdapter(options.agent)
  let state = readJsonFile(sessionPaths.sessionStateJsonPath)
  let lastValidation = state.postChange || null
  let noProgressStreak = 0

  for (let i = 0; i < maxSteps; i++) {
    if (shouldStop(state, lastValidation).stop) break

    const focus = pickNextFocus(state, options.focus)
    if (!focus) break

    emit({ event: "iteration_start", iter: i + 1, focus })

    write promptFile(buildIterationPrompt(state, focus))
    const { cmd, args, env, useShell, timeoutMs } = adapter.buildCommand(...)
    const spawnRes = spawnSync(...)
    const parsed = adapter.parseOutput(...)
    const report = parseAndValidateIterationResult(resultFile, parsed)

    const cliValidation = runValidationCommands(
      options.validateCmd ? [options.validateCmd] : state.validation.commands
    )
    emit({ event: "validation_done", iter: i + 1, status: cliValidation.status })

    state = mergeIterationIntoState(state, report, cliValidation, { iteration: i + 1 })
    const issues = validateStateJsonModel(state)
    if (issues.some(x => x.severity === "error")) {
      emit({ event: "error", reason: "state_corrupt" }); break
    }

    writeJsonFileAtomic(sessionPaths.sessionStateJsonPath, state)
    refreshStateMarkdownView(sessionPaths.sessionStateJsonPath, state)
    emit({ event: "state_merged", iter: i + 1, req_status, budget_left, ... })

    if (report.status === "no_progress") noProgressStreak++; else noProgressStreak = 0
    lastValidation = cliValidation
    if (options.once) break
  }

  emit({ event: "pipeline_stopped", reason, total_iters })
}
```

> 当前代码事实：上面是便于阅读的主循环示意，不是逐行权威模板。实际实现以 `src/pipeline/runPipeline.js` 为准；session 准备由 `src/auto-iterate.js:ensurePipelineSession` 完成，迭代路径由 `src/pipeline/iterationPaths.js:buildIterationPaths` 完成。

### 5.1.1 ensurePipelineSession 规格

当前代码库已实现 `ensurePipelineSession`。行为如下：

```text
ensurePipelineSession(options) → sessionPaths

1. 如果 options.resumeSession 存在且 options.run:
   a. 读取现有 sessionPaths
   b. 校验 state.json 存在；缺失则返回错误
   c. 如果带 --answer，则先调用 applyDecisionAnswer 将当前 pending decision 受限推进为 approved；非法答案返回错误，不启动 Worker
   d. 执行 strict state 门禁；失败则返回错误，不启动 Worker
   e. 刷新 current 指针

2. 如果 options.run 且无 resumeSession:
   a. 复用 createAutoIterateSession 的非交互生成路径
   b. 如果 options.session 不存在，按 mode + goal 生成默认 session 名
   c. 写入初始 state.json / state.md / start-prompt.md / auto-iterate-current.json
   d. 返回 sessionPaths

3. options.run 非 true:
   不进入 pipeline，走旧路径（不变）
```

复用的现有函数：`getSessionPaths`、`activateSession`、`buildStateModel`、`writeJsonFileAtomic`、`writeCurrentFile`。

### 5.1.2 buildIterationPrompt 简化模板

当前代码库的 `buildWorkerPrompt` 是给 `--dispatch` 用的，不适合单步迭代。`--run` 路径使用 `src/pipeline/iterationPrompt.js:buildIterationPrompt`。以下是简化示意模板，帮助理解单步 Worker 输入结构：

```text
你是 auto-iterate Worker Agent。本轮只做下面一件事，做完写 result.json 后立即退出。

## 本轮任务
Focus: implement_req:REQ-001
目标: 实现用户登录接口的最小纵切（Controller → Service → 测试）

## 允许修改的文件
- src/login.controller.ts
- src/login.service.ts
- test/login.test.ts

## 上一轮验证结果
CLI 验证: 未运行（首轮）

## 硬约束（违反则本轮作废）
- 禁止读写 .agent-state/ 下任何文件
- 禁止推进 REQ-001 以外的任何需求
- 禁止凭其他框架习惯推断 FastCar API；一切以 @fastcar/core @fastcar/koa 为准
- 必须写一个本切片的行为测试，并在 result.json.evidence 中列出测试文件路径
- 完成后立即写 result.json 并退出，不要继续改代码

## result.json 写入路径
.agent-state/auto-iterate/<session>/iterations/<n>/result.json

## result.json 格式
{
  "schemaVersion": 1,
  "status": "completed|no_progress|blocked|need_decision|failed",
  "focus": { "type": "implement_req", "req_id": "REQ-001" },
  "summary": "本轮完成登录接口最小纵切",
  "files_changed": ["src/login.controller.ts", ...],
  "state_patch": {
    "requirements": [{ "id": "REQ-001", "status": "implemented", "evidence": "新增 test/login.test.ts 覆盖..." }],
    "notes": []
  },
  "claimed_validation": { "ran": true, "passed": true, "commands": ["npm test -- login"] },
  "decision_request": null,
  "blocked_reason": null,
  "risks": [],
  "handoff": ""
}
```

`buildIterationPrompt(...)` 的当前实现参数来自 runPipeline 组装的上下文，包括 session、iteration、mode、focus、resultPath、lastValidation、scope / writeScope 和 autopilotRun。

模板中 `## 硬约束` 部分按当前 focus 类型动态注入相关规则（implement_req → 垂直切片 TDD；fix_bug → 可证伪假设；harden_validation → boundary/negative/regression 覆盖）。

> **✅ 当前实现状态**（2026-05-24）：`src/pipeline/iterationPrompt.js` 已完整注入允许修改文件、上一轮 CLI 验证结果、focus-type 动态硬约束和完整 result schema。上方模板仅作概念示意，实际输出以 `buildIterationPrompt` 和测试为准。

### 5.1.3 迭代文件路径集中定义

所有 per-iteration 文件统一通过以下函数获取路径，禁止在 pipeline 各处硬编码：

```text
buildIterationPaths(stateJsonPath, iterNumber) → {
  iterationDir:     ".agent-state/auto-iterate/<session>/iterations/<n>",
  promptPath:       ".agent-state/auto-iterate/<session>/iterations/<n>/prompt.md",
  resultPath:       ".agent-state/auto-iterate/<session>/iterations/<n>/result.json",
  validationLogPath:".agent-state/auto-iterate/<session>/iterations/<n>/validation.log",
  workerLogPath:    ".agent-state/auto-iterate/<session>/iterations/<n>/worker.log",
}
```

CLI 负责创建 `iterations/<n>/` 目录；Worker 只写 `result.json`；其余文件由 CLI 写入。

### 5.1.4 runPipeline 错误处理补全

§5.1 的伪代码省略了错误处理。以下分支必须体现在 PR-1 实现中（与 §3.7 失败类型一一对应）：

```text
spawn Worker 阶段:
  - spawnSync error (ENOENT 等) → emit error(worker_spawn_failed)，本次不合并 result 并停止
  - spawnSync timeout → 持久化失败状态，emit agent_timeout，再 emit error(worker_failed)
  - spawnSync exit ≠ 0 → 持久化失败状态，emit error(worker_failed) 并停止本轮

parse result 阶段:
  - result.json 缺失 → 持久化失败状态，emit error(missing_result_json) 并停止，不合并 result
  - JSON 非法 → 持久化失败状态，emit error(invalid_result_json) 并停止
  - schema 不符（resultSchema.js 校验不通过）→ 持久化失败状态，emit error(invalid_result_json) 并停止，记录校验错误详情
  - focus 不匹配 → emit watchdog_triggered，丢弃 state_patch

merge 阶段:
  - mergeIterationIntoState 返回 issues → emit error(state_corrupt)，不写盘，回滚
  - writeJsonFileAtomic 失败 → emit error，保留旧 state.json
```

### 5.2 状态合并规则（谁写什么）

| 字段 | 旧（谁写） | 新（谁写） |
|---|---|---|
| `state.json` 文件 | Worker LLM | CLI（`writeJsonFileAtomic`） |
| 代码文件 | Worker LLM | Worker LLM（CLI 通过 git diff 收割） |
| `state.requirements[].status` | Worker LLM | CLI（基于 report.state_patch + cliValidation 双重校验） |
| `state.postChange`（验证结果） | Worker LLM 自报 | **CLI 独立运行 `runValidationCommands` 后写入** |
| `state.budgets`（预算递减） | Worker LLM | CLI |
| `state.watchdog` | Worker LLM | CLI（根据 noProgressStreak、claimed_vs_actual_mismatch 等触发） |
| `state.phaseGate` | Worker LLM | CLI（`checkPhaseGate` 决定） |
| `state.decisionRequest` | Worker LLM | CLI（识别 Worker 提出的歧义） + `--answer` flag 由 Router LLM 提供答案 |

核心约束：**Worker 的 result.json 是建议，CLI 的合并才是真理。**

### 5.3 shouldStop 决定性条件

按优先级判断（先满足谁就停）：

1. `state.budgets.remainingImplementationIterations <= 0`
2. `state.watchdog.requiredAction === "stop"`
3. `state.watchdog.requiredAction === "ask_user"`（触发 need_decision）
4. 所有 `requirements.status === "passed"` 且 `state.watchdog.validationHardeningStatus === "done"`
5. `noProgressStreak >= 3`（连续 3 轮 status = no_progress）
6. `iteration >= ctx.maxSteps`（硬上限）

把 SKILL.md 中散文式的「停止条件」翻译为可单测的纯函数。

### 5.4 pickNextFocus 优先级

按优先级选下一轮 focus：

1. 有 `status="failed"` / `"blocked"` 的 req → `fix_bug:<req_id>`
2. 有 `status="pending"` 的 req → `implement_req:<req_id>`
3. 全部 passed 但 hardening 未达标 → `harden_validation`
4. 全部 passed 且 hardening 完成且 mode 允许 → `optimize:<module>`
5. 否则 → null（触发 shouldStop）

**实际 focus 六型受 mode 限制，详见 §5.5**。`--focus <type:id>` 可强制覆盖本轮选择，但必须在当前 mode 允许的 focus 集合里。

> **✅ 当前实现状态**（2026-05-24）：`src/pipeline/pickFocus.js` 已支持 `fix_bug`、`harden_validation`、`optimize`，并补充 diagnose / optimize 专用 focus、指标模型和 CLI 多轮端到端机器验收。Kimi 真实 Router UX smoke 已通过；Claude 真实终端 UX stable 仍见 §13.2。

### 5.5 mode 决定流程形状（异于统一管线）

**关键认知**：7 个 mode 不是同一个流水线的 prompt 差异。它们的【是否进循环、focus 取值范围、验证语义、允许写文件范围、成功条件】各不相同。这影响 `runPipeline`、`pickNextFocus`、`shouldStop`、`mergeIterationIntoState`、验证哪些是许可的，不能强行走一套代码。

下表是 mode 目标语义与当前实现状态的合并视图；当前代码已把 loop shape、focus 选择、write guard、mergeState 和 shouldStop 分散实现，仍允许后续继续收敛硬化。

| mode | 是否进循环 | autopilot 默认 | 允许 focus 类型 | 允许写文件 | CLI 独立验证 | shouldStop 额外条件 |
|---|---|---|---|---|---|---|
| **strict** | 是 | true | extract_requirements / implement_req / fix_bug / harden_validation / optimize | 全量 | 必跑 | delivery gate ready 后停；完整 hardening 轮次仍是目标约束 |
| **quick** | 是 | true | extract_requirements / implement_req / fix_bug / harden_validation | 全量 | 必跑 | delivery gate ready 后停；hardening 至少 1 轮仍是目标约束 |
| **diagnose** | 是 | true | reproduce / hypothesis_test / fix_bug / regression_check | 仅测试、instrumentation、bug 修复点 | 必跑（需包含原始复现用例） | 已实现 baseline / hypothesisQueue / regression_check 状态推进 |
| **verify** | 是（仅只读轮） | false | verify_req | **禁止**（除非用户明示 `--allow-modify`） | 必跑（作为 evidence） | 当前由 focus、writeGuard 与 delivery gate 共同控制 |
| **plan** | 否（只跑 1 轮） | false | plan_once | **禁止**（`--isolate` 依然可选） | 不跑 | loopPolicy 强制单轮，validation skipped(plan_mode) |
| **optimize** | 是 | false | establish_baseline → optimize → verify_optimization | 全量但范围受 `--scope` 限制 | 必跑（baseline + post） | `remainingOptimizationIterations` 只消耗实际 `optimize` 改动轮，baseline / verify 计入 non-implementation；已有待验证优化时即使优化预算归零也必须跑 `verify_optimization` |
| **prototype** | 是（限 1-2 轮） | false | extract_requirements / implement_req / fix_bug / harden_validation | 仅 prototype 目录下 | 跑原型启动命令验证能跑起来 | 当前复用 quick/strict focus，默认 scope 为 `prototype/**` |

**runPipeline 里的分支点（历史设计示意）**：

```
async function runPipeline(options) {
  const state = await ensurePipelineSession(options)
  const mode = state.mode
  const loopPolicy = resolveLoopPolicy(options, state)
  const effectiveScope = options.scope || (mode === "prototype" ? "prototype/**" : null)

  emit({ event: "mode_branch", mode, branch: loopPolicy.loopShape, denyWrite, scope: effectiveScope })

  for (let i = 0; i < loopPolicy.maxSteps; i++) {
    const focus = pickNextFocus(state, options.focus, mode)
    if (!focus) break
    // plan 由 loopPolicy 限定单轮并跳过验证；verify/prototype 由 writeGuard/scope 执行约束；
    // diagnose/optimize 的 reproduce/baseline/verify_optimization 顺序由 pickFocus + mergeState 推进。
    await runOneIteration({ state, focus, effectiveScope })
  }
}
```

**pickNextFocus 按 mode 过滤**：每个 mode 产出的 focus 集合不同，`pickNextFocus(state, override, mode)` 签名加第三个参数，在 `src/pipeline/pickFocus.js` 里按 mode 分枝。

> 当前代码事实：mode-specific 行为没有拆成 `runPlanOnce` / `runReproduceFirst` / `runDefaultLoop` 三类函数，而是由 `src/pipeline/loopPolicy.js` 解析 loop shape，由 `src/pipeline/pickFocus.js` 选择 focus，由 `src/pipeline/mergeState.js` 推进 diagnose / optimize 等模式状态，最后由 `src/pipeline/runPipeline.js` 统一执行。

**验证语义随 mode 变**：

- **strict / quick**：`runValidationCommands` 运行 `state.validation.commands`。
- **diagnose**：验证包含原始复现命令 + 回归验证两步。
- **verify**：运行验证但不依靠它推进；evidence 拼进 `requirement.evidence`。
- **plan**：不跑验证，`cliValidation = { passed: null, skipped_reason: "plan_mode" }`。
- **optimize**：跑两次验证（baseline + post）并对比。`mergeIterationIntoState` 需要能存两份验证结果；优化预算只约束实际 `optimize` 改动轮，不能让 baseline 或 post 验证抢占预算导致“已优化但未验证”。
- **prototype**：跑原型的启动命令，判断它能启动。

**Worker prompt 随 mode 变**：`buildIterationPrompt(state, focus, ctx)` 在 `ctx.mode` 上分枝，底部复用现有 `buildModeInstructions`（`src/auto-iterate.js:2854`）产出的 mode 说明，但需要**压缩到 5-10 行**作为单步 prompt 的 mode 提示，不要把原厚重描述原文塞进去。

**允许写文件的检查**：

- `verify` / `plan` 默认 deny-write。合并阶段检查 `report.files_changed` 如果非空 → 标 `watchdog.requiredAction = "violation"` 且该轮被丢弃。
- `prototype` 只能写 `prototype/**`；workers 违反 → 同上报 violation。
- `optimize` 在 `--scope` 路径外写 → 报 violation。
- 违规不计进预算，但计入 noProgressStreak。

**shouldStop 额外每个 mode 的停止条件**：在默认六条之上叠加上表「额外条件」列。`shouldStop(state, lastValidation, ctx, mode)` 签名加 mode 参数。

**predefined budgets**：`MODE_CONFIGS`（`src/auto-iterate.js:58`）里的 `defaultMaxIterations` / `defaultAutopilotMaxIterations` 直接复用，不重定：例如 verify=30/10、plan=30/10、prototype=30/8；strict=100/20。

> **✅ 当前实现状态**（2026-05-24）：上述 mode-specific 基础行为已在 `runPipeline` 中落地：
> - plan：已通过 `pickFocus` → `plan_once` 实现单轮退出，并返回 `skipped(plan_mode)`。
> - verify：已有 `writeGuard` deny-write 和 `verify_req` focus；`--allow-modify` 可显式放行。
> - prototype：pipeline 默认设置 `scope="prototype/**"`。
> - diagnose：已通过 `reproduce` focus 强制首轮 baseline，并用 `hypothesisQueue` 消费 pending 假设；CLI 多轮测试覆盖 reproduce → hypothesis_test → fix_bug → regression_check。
> - optimize：已有 baseline → optimize → verify_optimization 状态机、指标对比模型和连续无改善停止策略；CLI 多轮测试覆盖 baseline → optimize → verify 后停止。
> 真实终端 UX stable 仍见 §13.2；Kimi smoke 已通过，Claude 仍待可用环境验收。

### 5.6 入口分发与 `--resume --run` 实现策略

当前 `initAutoIterate` 的分发顺序是：`--list`、`--switch`、`--resume`、`--validate-state`、`--finalize`、`--dispatch`、`--capture-skills`，随后才进入生成启动文件。当前 `--resume <session>` 会 `activateSession(..., "resume")` 后直接返回。

新增 `--run` 时必须调整入口分发，避免 `--resume <session> --run` 被旧 resume 早返回吞掉：

```text
1. parseArgs 先识别 run/check/noRun/answer 等新增 flag。
2. --check 优先于 session 生成，直接做环境检查并退出。
3. --resume + --run：读取 session；若带 --answer，先受限批准 pending decision；随后执行 strict state 门禁，门禁通过后再进入 runPipeline。
4. --resume 不带 --run：保持旧行为，只切换并输出恢复提示。
5. --run 不带 --resume：ensurePipelineSession；如果 session 不存在则按 --from/--goal/--session 创建初始状态；未显式传 mode 且无 --from 时默认 quick，避免 Router 非交互场景进入 prompt。
6. --no-run：即使传了 --run 也强制走旧大 prompt 路径，用于调试和回归对比。
```

`--run` 模式应默认非交互；Router LLM 自动路由时仍建议同时传 `--yes` 与显式 `--session <generated-session>`，以兼容 PR 过渡期和旧路径 fallback。
`--run --from <file>` 未显式传 mode 时默认 strict；`--run --goal <text>` 未显式传 mode 时默认 quick。

### 5.7 mode 与 `--autopilot` 优先级

`MODE_CONFIGS[*].autopilot` 是模式默认值，`--autopilot` 是运行层覆盖值：

```text
runtimeAutopilot = options.autopilot ?? MODE_CONFIGS[mode].autopilot
```

- `strict`、`quick`、`diagnose` 默认 autopilot=true。
- `verify`、`plan`、`optimize`、`prototype` 默认 autopilot=false。
- 用户显式传 `--autopilot` 时，以 flag 为准，但仍受 mode 写入权限、focus 集合和停止条件限制。
- `plan` 即使传 `--autopilot` 也只跑 `plan_once`，不能进入实现循环。

---

## 6. 验证模型

### 6.1 CLI 独立 runValidationCommands

**入参格式**：`commands` 是字符串数组 `string[]`。CLI 从 `state.validation.commands` 中提取启动时的字符串命令和未执行配置对象的 `command` 字段；带 `iteration/result/status/phase/exitCode/summary` 的历史对象只作为证据，不会回流为下一轮执行命令。

```text
runValidationCommands(commands: string[], { cwd, timeoutSec })
  → {
       passed: boolean,
       ranAt: ISO timestamp,
       perCommand: [
         { command: string, exitCode: number, stdoutTail: string, stderrTail: string, durationMs: number }
       ]
     }
```

- 依次跑 `state.validation.commands` 中的配置命令；运行后的历史对象不会在下一轮重复执行。
- 任何一条 exit ≠ 0 → `passed: false`。
- stdout / stderr 各保留末 4KB 作为证据；当失败或超时没有任何输出时，summary 使用 error / signal / exit_code 生成可诊断摘要，避免 state 只留下空原因。
- 整体 timeout 默认 300 秒。

### 6.2 Agent 自报 vs CLI 验证不一致

Worker 的 `report.claimed_validation.passed` 与 CLI 的 `cliValidation.passed` 不一致时：

- 强制将相关 requirements.status 从 `passed` 降级为 `implemented` 或 `not_verified`。
- `state.watchdog.deliveryVerifiability = "mismatch"`。
- `state.watchdog.stateDrift = "claimed_vs_actual_mismatch"`。
- 下一轮 iterationPrompt 注入警告：「上一轮你声明通过，但 CLI 验证失败。注意核对实际行为。」

### 6.3 证据保留策略

- 每轮 stdout / stderr 各保留末 4KB 进 `state.postChange.perCommand[].stdoutTail / stderrTail`；无输出失败会保留 error / signal / exit_code 摘要，便于 resume 后定位 timeout 或 spawn 异常。
- 完整日志保留到 `.agent-state/auto-iterate/<session>/iterations/<n>/validation.log`，不进 state.json，避免文件膨胀。
- result.json 原文保留到 `.agent-state/auto-iterate/<session>/iterations/<n>/result.json`。

### 6.4 Worker `result.json` schema

`result.json` 是 Worker 与 CLI 的唯一结构化交接文件。Worker 输出是建议，CLI 合并才是真理。缺失或非法时不抛未捕获异常，也不合并 Worker 建议，而是先把 `state.json` 标记为 `postChange.failed`、`watchdog.requiredAction=stop` 和 `validation.finalVerifiability=unknown`，再分别输出 `error(reason=missing_result_json)` / `error(reason=invalid_result_json)` 并停止本轮；与实际 diff / 验证结果冲突时输出 `write_violation` / `watchdog_triggered` 等事件。`no_progress` 只消费 Worker 显式返回的合法 status。

最小 schema：

```json
{
  "schemaVersion": 1,
  "status": "completed",
  "focus": { "type": "implement_req", "req_id": "REQ-001" },
  "summary": "本轮完成登录接口最小纵切",
  "files_changed": ["src/login.js", "test/login.test.js"],
  "state_patch": {
    "requirements": [
      {
        "id": "REQ-001",
        "status": "implemented",
        "evidence": "新增 test/login.test.js 覆盖成功登录和失败密码"
      }
    ],
    "notes": ["等待 CLI 独立验证后才能标 passed"]
  },
  "claimed_validation": {
    "ran": true,
    "passed": true,
    "commands": ["npm test -- login"]
  },
  "decision_request": null,
  "blocked_reason": null,
  "risks": [],
  "handoff": "下一轮若验证失败，优先查看登录 DTO 校验"
}
```

字段约束：

| 字段 | 必填 | 说明 |
|---|---|---|
| `schemaVersion` | 是 | 初始为 `1`；破坏性变更必须 bump。 |
| `status` | 是 | `completed` / `no_progress` / `blocked` / `need_decision` / `failed`。 |

> **✅ 当前实现状态**（2026-05-24）：`src/pipeline/resultSchema.js` 的 `VALID_STATUSES` 为 `completed | failed | blocked | need_decision | no_progress`，`noProgressStreak` 已直接消费 Worker 显式 `no_progress`。详见 §0.7 P0-2。文档已按代码实际命名统一。
| `focus` | 是 | 必须与 CLI 本轮下发的 focus 匹配；不匹配则丢弃 `state_patch`。 |
| `summary` | 是 | 人类可读短摘要，不放大段日志。 |
| `files_changed` | 是 | Worker 声明的改动文件；CLI 必须用 git diff 或文件审计复核。 |
| `state_patch` | 否 | 只允许建议 requirements evidence、notes、hypotheses、optimizationMetrics、`currentState` 描述性字段和 `deliveryEvidence` 描述性子字段等白名单字段；不能直接改 budgets / watchdog / postChange / currentState 权威字段 / deliveryEvidence 权威字段。 |
| `claimed_validation` | 否 | Worker 自报验证；只能作为参考，不能覆盖 CLI 验证。 |
| `decision_request` | 否 | 需要用户决策时给出 question/options/target。 |
| `blocked_reason` | 否 | `status=blocked` 或 `needs_decision` 时必填。 |
| `risks` | 否 | 风险摘要数组。 |
| `handoff` | 否 | 下一轮可用的短交接，不放完整上下文。 |

`state_patch` 禁止包含：`budgets`、`watchdog`、`postChange`、`currentState.nextAction`、`currentState.overallStatus`、`currentState.lastValidationResult`、`deliveryEvidence.status`、`deliveryEvidence.goal`、`skillCapture`、`updatedAt`、任何 `.agent-state/` 路径内容、密钥或完整日志；`currentState` 和 `deliveryEvidence` 仅允许描述性摘要字段。

### 6.5 state schema delta（相对当前 `state.json`）

当前 schema 由 `src/auto-iterate.js:validateStateJsonModel` 约束。实现 CLI 驱动时，必须明确扩展点，不能在文档、代码和测试之间隐式漂移：

> PR-4 跟进项：本节仍是设计层 delta 表。若后续新增 state 字段或枚举，必须把本表落实为 `skills/auto-iterate-coding/references/state.schema.json` 的 explicit diff，并同步 `state-schema.md`、`validateStateJsonModel` 和回归测试；不得只保留 prose 说明。

| 字段 | 当前结构 | 目标变化 | 实现要求 |
|---|---|---|---|
| `requirements[].status` | 不包含 `failed` | 推荐仍使用 `pending/implemented/passed/not_verified/blocked`；失败信号放在 `postChange` / evidence | 如确需新增 `failed`，必须同步校验器和 state 模板。 |
| `decisionRequest` | `status/topic/background/recommended/impact/options/triggers` | 增加 pipeline 运行元信息，如 `targetField/raisedAt/raisedByIter/resumeHint` | 保留 `status="pending"`，不要另起 `pending: true` 布尔双轨。 |
| `watchdog.requiredAction` | `continue/narrow_scope/run_validation/reconcile/ask_user/stop/context_compress_and_review` | 写入违规不建议新增 `violation` action | 用 `write_violation` 事件 + `requiredAction="stop"` 或正式扩展枚举。 |
| `postChange` | 单命令摘要 | 已新增 `perCommand[]`，保留每条验证命令的 status、exitCode、duration、stdoutTail、stderrTail；`validation.commands[]` 也逐条追加本轮和 post-merge 验证历史，避免多命令被折叠成单条聚合证据；历史对象最多保留最近 200 条，且不会被下一轮当作配置命令重复执行 | 兼容旧 `command/result/reason` 字段，新增字段向后兼容。 |
| `validation.finalVerifiability` / `watchdog.deliveryVerifiability` | 可能缺失或为 `unknown` | `deliveryReady` 只接受显式 `verifiable` / `partially_verifiable` | 缺失、`unknown`、`not_verifiable` 或其它值都必须阻断 `delivery_ready`；`buildDeliveryGate` 对缺失值输出 `unknown_verifiability`。 |
| `budgets` | 初始预算由 CLI 生成，后续旧路径可由 Agent 更新 | `--run` 下 CLI 唯一递减 | Worker result 不允许写 budgets。 |
| `mode` | mode 默认含 autopilot 倾向 | 记录 `runtimeAutopilot` 与 `loop_shape` | 避免混淆模式默认与运行 flag。 |

---

## 7. NDJSON 事件 schema

### 7.1 事件枚举

| event | 触发时机 | 关键字段 |
|---|---|---|
| `session_started` | runPipeline 启动 | `session`, `mode`, `total_reqs`, `agent`, `loop_shape`（当前为 `default` / `plan_once` / `autopilot`）、`runtime_autopilot`, `scope`, `isolated` |
| `mode_branch` | mode 预置选定分支后 | `mode`, `branch`, `denyWrite`, `scope` |
| `write_audit` | git 实际改动与 Worker 自报需要对账；`actual_files` 已按 `resultSchema.normalizeRelativePath` 归一化并过滤非法/越界路径 | `iter`, `reported_files`, `actual_files` |
| `write_violation` | Worker 写了不被 mode 或 scope 允许的文件 | `iter`, `issues[]` |
| `iteration_start` | 每轮 focus 确定后 | `iter`, `focus: { type, req_id?, summary }` |
| `agent_done` | Worker 返回 | `iter`, `exit_code`, `timed_out`, `result`, `log` |
| `validation_done` | runValidationCommands 完成 | `iter`, `command`, `status`, `exit_code`, `summary` |
| `state_merged` | state.json 写盘后 | `iter`, `issues`, `state`, `req_status`, `budget_left` |
| `watchdog_triggered` | watchdog 升级 | `iter`, `required_action`, `reason` |
| `reconcile` | Worker 声称 passed 但 CLI 验证失败 | `iter`, `reason` |
| `need_decision` | 需要用户决策；之后 `process.exit(42)` | `iter`, `question`, `options[]`, `resume_hint` |
| `agent_timeout` | Worker 超时 | `iter`, `timeout_ms`, `detail` |
| `error` | 致命错误，循环中止 | `iter`, `reason`, `issues[]` |
| `error` / `worker_failed` | Worker 失败或超时 | `iter`, `reason`, `detail` |
| `pipeline_stopped` | 循环停止 | `reason`, `session` |

事件名以当前代码和测试为准：`validation_done` 表示 CLI 验证已完成，`pipeline_stopped` 表示循环停止并通过 `reason` 解释停止原因。

### 7.2 JSON 示例

```json
{"event":"session_started","session":"prd-auto-2026-05-23","mode":"strict","total_reqs":7,"agent":"kimi"}
{"event":"mode_branch","session":"prd-auto-2026-05-23","mode":"strict","branch":"autopilot","denyWrite":false,"scope":"unrestricted"}
{"event":"iteration_start","iter":1,"focus":{"type":"implement_req","req_id":"REQ-001","summary":"用户登录接口"}}
{"event":"agent_done","iter":1,"exit_code":0,"timed_out":false,"result":".agent-state/auto-iterate/prd-auto-2026-05-23/iterations/1/result.json"}
{"event":"validation_done","iter":1,"command":"npm test","status":"passed","exit_code":0}
{"event":"state_merged","iter":1,"req_status":{"REQ-001":"passed"},"budget_left":99}
{"event":"need_decision","iter":7,"question":"REQ-005 冲突：使用 JWT 还是 Session？","options":[{"id":"A","label":"JWT"},{"id":"B","label":"Session"}],"resume_hint":"fastcar-cli auto-iterate --resume prd-auto-2026-05-23 --run --autopilot --answer <id>"}
{"event":"pipeline_stopped","reason":"requirements_closed","session":"prd-auto-2026-05-23"}
```

### 7.3 兼容性规则

- 事件类型枚举锁死；新增事件类型视为 minor version bump。
- 已有字段不允许改名 / 改类型。
- 新增字段必须 backward-compatible（解析方忽略未知字段）。
- schema 常量集中放在 `src/pipeline/progress.js` 顶部，单测覆盖。

### 7.4 `env_check` 事件 schema

`--check --json-progress` 必须只做只读检测，不创建 session、不修改代码、不运行 Worker。输出一行 `env_check` 后退出，exit code 为 0；只有 CLI 自身异常才返回 1。

```json
{
  "event": "env_check",
  "cwd": "D:/code/demo",
  "usable": true,
  "workers_available": [
    { "id": "kimi", "source": "path", "command": "kimi", "env": "AUTO_ITERATE_KIMI_CMD", "available": true },
    { "id": "codex", "source": "env", "command": "codex", "env": "AUTO_ITERATE_CODEX_CMD", "available": true }
  ],
  "workers_unavailable": [
    { "id": "claude", "source": "missing", "command": "claude", "env": "AUTO_ITERATE_CLAUDE_CMD", "available": false, "reason": "not_found" }
  ],
  "recommended": "kimi",
  "issues": []
}
```

字段规则：

- `usable`：布尔值，`true` 表示至少有一个 Worker CLI 可用。
- `workers_available[].source`：`path`（PATH 中找到）或 `env`（通过环境变量配置）。
- `workers_available[].command` 只能输出命令名或用户显式配置的模板摘要，不能展开密钥。
- `workers_unavailable[].reason` 当前使用 `not_found` 表示 PATH 和 `AUTO_ITERATE_*_CMD` 均未发现。
- `recommended` 优先级：按 `priority` 排序后的首位可用 Worker > `null`。
- `issues` 用于 Router LLM 决定是否 fallback；没有 Worker 时必须包含 `no_worker_cli_found`。
- Router LLM 只有在 `workers_available=[]` 时才允许回退旧路径；其他错误应汇报并停止或请求用户修复环境。

---

## 8. 用户交互中断（need_decision）

### 8.1 触发条件

- Worker 的 `report.blocked_reason` 含「歧义 / 需要决策」类关键词。
- `state.watchdog.requiredAction === "ask_user"`。
- Worker 的 `report.state_patch.notes` 显式提出选项。

### 8.2 退出码约定

| exit code | 含义 |
|---|---|
| `0` | 正常完成 |
| `1` | 通用失败（错误事件已打印） |
| `42` | need_user_decision（专用退出码） |
| 其他 | spawnSync 错误码透传 |

### 8.3 --answer flag

`fastcar-cli auto-iterate --resume <session> --run --autopilot --answer <option_id>`

- 启动 runPipeline 前检查 `state.decisionRequest.status === "pending"`。
- 当 `decisionRequest.options[]` 非空时，`--answer` 必须匹配其中的 string 选项或对象选项 `{ id }`；不匹配时输出 `error(reason=invalid_decision_answer)` 并停止，不启动 Worker、不修改 pending state。
- 把 `--answer` 的值写到 `state.decisions.<key>`（key 由 `decisionRequest.targetField` 指定）。
- 将 `state.decisionRequest.status` 更新为 `approved` 或归档到历史决策记录。
- 继续循环。

### 8.4 decisionRequest 字段映射

为兼容当前 `state.json` 校验器，`decisionRequest` 不新增 `pending: true` 布尔字段，而是沿用 `status="pending"`，`question` / `targetField` / `answer` 均作为顶层字段：

```json
{
  "status": "pending",
  "topic": "REQ-005 鉴权策略选择",
  "background": "PRD 未说明使用 JWT 还是 Session，二者会影响接口兼容和存储设计",
  "recommended": "JWT",
  "impact": "决定 token 签发、失效、测试 fixture 和迁移范围",
  "options": [
    { "id": "A", "label": "JWT" },
    { "id": "B", "label": "Session" }
  ],
  "triggers": ["pipeline_worker"],
  "question": "REQ-005 冲突：使用 JWT 还是 Session？",
  "targetField": "decisions.req005AuthStrategy",
  "answer": null
}
```

`--answer <id>` 续跑时：

1. 校验 `decisionRequest.status === "pending"`。
2. 校验答案 id 存在于 `decisionRequest.options[]`。
3. 写入 `state.decisions[decisionRequest.targetField]` 或等价扁平记录。
4. 将 `decisionRequest.status` 改为 `approved`，并记录回答来源。
5. 清空或归档 pending 信息后继续循环。

如果答案 id 不存在，CLI 必须在恢复前失败并保持 `decisionRequest.status="pending"`，Router LLM 继续向用户询问有效选项后再用 `--resume --answer <id>` 续跑。


---

## 9. CLI 新增 flag 列表

当前 CLI 已通过 `--strict`、`--quick`、`--diagnose`、`--verify`、`--plan-only`、`--optimize`、`--prototype` 表达 mode。`--run` 实现初期必须优先复用这些既有 mode flag，不要要求用户改用 `--mode <name>`。如果后续为了机器调用增加 `--mode <name>`，它只能作为别名层，且必须与既有 flag 互斥校验；同一命令里同时出现 `--verify` 与 `--mode optimize` 应直接报错。

| flag | 含义 | 默认 |
|---|---|---|
| `--run` | 进入 CLI 驱动循环模式 | false（保持旧行为） |
| `--once` | 跑一轮就停 | false |
| `--autopilot` | 目标语义：不每轮询问用户；当前代码仅解析该 flag，实际循环由 `--max-steps` / `--autopilot-max-iterations` / 默认 20 控制 | false |
| `--max-steps <n>` | 硬上限 | `state.budgets.remainingImplementationIterations` |
| `--step-timeout <sec>` | 每轮 Worker wall-clock 超时；`0` 关闭 | 300 |
| `--inactivity-timeout <sec>` | 每轮 Worker 无 stdout/stderr 活跃超时；`0` 关闭 | 120 |
| `--validation-timeout <sec>` | CLI 验证命令超时；`0` 关闭验证命令超时 | 600 |
| `--json-progress` | stdout 输出 NDJSON | false（输出人类可读） |
| `--no-validate` | 跳过 CLI 独立验证（debug 用） | false |
| `--validate-cmd <cmd>` | 覆盖 state 里的验证命令；可重复传入多条命令并按顺序执行 | 无 |
| `--focus <type:id>` | 强制本轮 focus | 由 pickNextFocus 选 |
| `--isolate` | 每轮在临时 git worktree 跑 | false |
| `--answer <id>` | 提供 need_decision 答案后续跑 | 无 |
| `--check` | 仅做环境检查并返回 NDJSON | false |
| `--allow-modify` | 仅 verify 模式下：允许 Worker 写文件（默认禁止） | false |
| `--scope <glob[,glob]>` | 限定允许修改的文件范围；当前代码已解析并在 `writeGuard` 生效，支持逗号/中文逗号/分号分隔的多 scope，路径内空格会保留；help 文本已展示 | 无 |

### 9.1 flag 兼容矩阵

| 组合 | 行为 |
|---|---|
| `--run --quick/--strict/...` | 新 pipeline；如果 session 不存在，先按当前旧逻辑初始化 session，再进入 pipeline。 |
| `--run --goal <text>` | 新 pipeline；未显式传 mode 时默认 quick，不进入交互式 mode prompt。 |
| `--run --from <file>` | 新 pipeline；未显式传 mode 时默认 strict。 |
| `--run --resume <session>` | 读取现有 session；带 `--answer` 时先受限批准 pending decision，再执行 strict state 门禁并进入 pipeline；门禁失败时不得启动 Worker，也不得只打印恢复 prompt 后返回。 |
| `--run --resume <session> --once` | 本次 resume run 最多执行一轮；不得因为 session 历史 `budgets.totalCycles > 0` 在本轮启动前直接 `once_completed`。 |
| `--run --validate-state` | 非法组合；`--validate-state` 是独立门禁命令，不进入 pipeline；`--json-progress` 下输出 `error(reason=invalid_run_flag_combination)`。 |
| `--run --dispatch` | 非法组合；legacy dispatch 与 pipeline worker 不是同一套生命周期；`--json-progress` 下输出 `error(reason=invalid_run_flag_combination)`。 |
| `--run --finalize` | 非法组合；pipeline 正常结束后可由 CLI 内部调用 finalize；`--json-progress` 下输出 `error(reason=invalid_run_flag_combination)`。 |
| `--run --capture-skills` | 非法组合；技能沉淀是收尾门禁，不是迭代主循环；`--json-progress` 下输出 `error(reason=invalid_run_flag_combination)`。 |
| `--check --json-progress` | 只输出 `env_check`，不创建 session，不修改文件。 |
| `--check` 不带 `--json-progress` | 输出人类可读环境报告；仍不创建 session。 |
| `--no-run --run ...` | 强制 legacy 路径，用于回归对比；help 文本必须说明优先级。 |

恢复时如果当前 iteration 目录里已有未合并 `result.json`，CLI 只能在该结果显式带有与当前 focus 完全一致的 `focus` 元数据时复用；兼容例外仅限启动轮 `extract_requirements:REQ-BOOTSTRAP` 的无 focus 旧结果。后续 `fix_bug`、`harden_validation`、`optimize` 等 focus 不得复用缺少 focus 元数据的旧结果，避免把上一次 Worker 输出合并到新的任务焦点。

### 9.2 help 与路由文档同步要求

新增 flag 后必须同步以下位置：

1. `src/auto-iterate.js:parseArgs`。
2. `node bin/cli.js auto-iterate --help` 的输出。
3. `skills/auto-iterate-coding/skill.md` 或 PR-4 后的 `SKILL.md` / `worker.md` / `orchestrator.md`。
4. `skills/auto-iterate-coding/references/natural-language-routing.md`。
5. `AGENTS.md` 的强触发词与路由约束。
6. `test/auto-iterate-doc-reliability.test.js` 或新增 pipeline 测试。

如果其中任一处没有更新，本 PR 不算完整。

### 9.3 planned flag 启用门禁

planned flag 不允许只写在文档或自然语言映射里。每个 flag 必须按下面顺序推进，全部完成后才允许加入 Router LLM 默认路由：

| 阶段 | 允许状态 | 必须满足 |
|---|---|---|
| `documented` | 只允许出现在本文档设计章节 | §0.3 已标注 planned；help、README、AGENTS.md、SKILL.md 不宣传给用户 |
| `parsed` | CLI 能识别但可能报“未实现” | `parseArgs` 有字段；非法组合有明确错误；不影响旧路径 |
| `implemented` | CLI 行为可真实运行 | 至少有单测覆盖 happy path 和一个失败路径；help 文本同步 |
| `routable` | Router LLM 可默认生成该 flag | `AGENTS.md`、natural-language-routing、README 或 skill 文档同步；现有回归测试通过 |
| `stable` | 可作为推荐路径 | 通过 §13.2 UX 验收；失败和 fallback 事件稳定 |

当前工作区 flag 稳定性按实际代码标注如下：

| flag | 当前阶段 | 说明 |
|---|---|---|
| `--run` | `routable` | 可由 Router 在 Worker 可用时调用；旧路径仍是 fallback |
| `--once` | `routable` | 单轮 pipeline 已有端到端测试 |
| `--json-progress` | `routable` | stdout NDJSON 已有测试；事件名以代码为准 |
| `--check` | `routable` | 已实现 env_check；Router 默认应先运行 |
| `--validate-cmd` | `routable` | 已实现命令覆盖；重复传入会累积为多命令验证序列 |
| `--max-steps` | `implemented` | 代码可用，路由需谨慎生成 |
| `--step-timeout` | `implemented` | 代码可用，默认 300 秒 |
| `--focus` | `implemented` | 主要供调试和恢复，不建议自然语言默认生成 |
| `--answer` | `routable` | 与 `need_decision` / exit 42 配套 |
| `--isolate` | `implemented` | 有 happy path 测试，未达到 stable |
| `--allow-modify` | `implemented` | verify 模式修复时可由 Router 明确追加 |
| `--scope` | `routable` | 代码、help、writeGuard 和测试均已同步；优化/原型等范围受限任务可生成 |
| `--no-validate` | `implemented` | debug 用，不应自然语言默认生成 |
| `--no-run` | `routable` | 用户显式要求 fallback 时使用 |
| `--autopilot` | `routable` / `not_stable` | 已有 runtime loop shape、delivery_gate、Router 机器验收、diagnose/optimize CLI 多轮验收和 Kimi 真实 Router UX smoke；缺 §13.2 Claude 真实终端 UX，暂不标 stable |

当前上表已代码化到 `src/pipeline/flags.js`，并由 `test/router-ux.test.js` 覆盖 Router 只能默认生成 `routable` 及以上 flag；`--autopilot` 明确保持 `routable/not_stable`，未通过真实终端 stable 验收前不得升为 `stable`。

---

## 10. 向后兼容与退化路径

### 10.1 默认行为不变

- 不传 `--run` → 仍走旧路径：生成 state.json + 大 prompt，打印到 stdout。
- `--validate-state` / `--finalize` / `--dispatch` / `--list` / `--switch` / `--resume`（不带 `--run`）全部保持原行为。

### 10.2 --check 发现无 Worker → 退回旧「打印 prompt」

`fastcar-cli auto-iterate --check --json-progress` 在无 Worker 时输出类似：

```json
{"event":"env_check","usable":false,"workers_available":[],"workers_unavailable":[{"id":"kimi","command":"kimi","env":"AUTO_ITERATE_KIMI_CMD","available":false,"source":"missing","reason":"not_found"}],"recommended":null,"issues":["no_worker_cli_found"]}
```

Router LLM 看到 `workers_available: []` 时：

1. 明示告诉用户「本机未安装 Worker CLI，本次由我在当前会话里代跑，进度可能较慢」。
2. 退回旧路径：`fastcar-cli auto-iterate --from ... --yes`（仍只打印 prompt），自己接管 prompt。

这是唯一允许退化为旧模式的场景。

### 10.3 --no-run 强制旧路径

调试或对比时，`--no-run` 显式压制 `--run`，强制走旧路径。

### 10.4 迁移与回滚规则

CLI 驱动迁移必须按“新路径 opt-in、旧路径可回滚”的方式推进。任何 PR 只要导致旧路径不可用，就必须回滚或拆分。

迁移顺序：

1. PR-1 只新增 `--run --once`，不改变不带 `--run` 的启动行为。
2. PR-2 在 `--run` 内部完善状态合并和多轮控制，仍不修改自然语言路由默认命令。
3. PR-3 实现 `--check` 与 Autopilot 门禁后，Router LLM 才允许先运行 `--check` 再选择 `--run` 或 fallback。
4. PR-4 完成 skill 分层后，才允许把 `--run --autopilot --json-progress` 写成推荐默认路径。

回滚边界：

| 回滚对象 | 必须仍然可用 | 不允许残留 |
|---|---|---|
| 回滚 PR-1 | `fastcar-cli auto-iterate --quick --goal ... --yes` 仍生成启动文件 | `parseArgs` 误吃旧 flag、help 宣传已不存在 flag |
| 回滚 PR-2 | PR-1 的 `--run --once` 如保留则仍能单轮运行；否则完全回到旧路径 | 半写入的 `state.json` 新字段导致 `--validate-state` 失败 |
| 回滚 PR-3 | `--check` 如果移除，Router 文档也必须撤回默认检查步骤 | AGENTS.md 仍要求调用不存在的 `--check` |
| 回滚 PR-4 | 旧 `SKILL.md` fallback 仍能指导 Agent 自治执行 | WORKER.md / ORCHESTRATOR.md 引用悬空但 skill install 仍分发 |

数据兼容：

- `state.json.schemaVersion` 在本设计阶段保持 `1`，除非新增字段破坏旧校验器或旧 session 语义。
- 新字段必须向后兼容：旧 session 缺字段时使用默认值，不得要求用户手动迁移。
- `state.md` 继续作为人类视图，不能成为 pipeline 的机器权威输入。
- `start-prompt.md` 继续保留，作为 fallback 和审计材料；`--run` 不能依赖用户复制它。

发布策略：

- npm 发版说明必须明确列出哪些 flag 是 stable，哪些仍是 experimental。
- README 中的推荐命令只能使用 `routable` 或 `stable` flag。
- 如果一个 planned flag 只在本文档出现，README 和 AGENTS.md 中必须避免把它写成“现在可用”。

---

## 11. 文件清单与交付标注

### 11.1 修改

| 文件 | 改动 | 状态 |
|---|---|---|
| `src/auto-iterate.js` | `parseArgs` 新增 pipeline flag；`initAutoIterate` 新增 `--run` / `--check` 分支；`ensurePipelineSession`、`applyDecisionAnswer` 等函数 | ✅ 已交付 |
| `AGENTS.md` | 已加 CLI 驱动优先说明和 Router/Worker 硬边界；`test/skill-consistency.test.js` 锁住禁止复制 prompt、禁止手动运行、Worker 不写 state 和 CLI 权威职责 | ✅ 已交付 |
| `skills/auto-iterate-coding/skill.md` | 顶部加路径 A/B 识别，frontmatter 加 CLI 驱动路径声明 | ✅ 已交付 |

### 11.2 新增

**当前工作区已交付：**

| 文件 | 实际行数 | 说明 |
|---|---|---|
| `src/pipeline/runPipeline.js` | 682 | 完整主循环：ensurePipelineSession 准备 session 后，runPipeline 执行 loop → spawn → validate → merge → emit（含 worktree 隔离、answer 恢复、delivery_gate 和 NDJSON 事件）；delivery_gate 同步阻断 cleanup/styleConsolidation/contextResetReview/skillCapture 未完成状态，避免 strict state 会失败但运行时误报 ready |
| `src/pipeline/mergeState.js` | 456 | 白名单合并 + 禁止 key 保护 + requirements 合并 + baseline/metrics/hypothesis 模式推进 |
| `src/pipeline/shouldStop.js` | 84 | 纯函数决策树 + `deliveryReady` 交付门禁 |
| `src/pipeline/pickFocus.js` | 251 | 完整 12 种 focus 类型选择（plan_once / verify_req / establish_baseline / extract_requirements / implement_req / fix_bug / harden_validation / optimize / hypothesis_test / reproduce / regression_check / verify_optimization），CLI 验证失败转入 fix_bug，diagnose/optimize 专用链路，`--focus` override 按 mode 白名单过滤 |
| `src/pipeline/loopPolicy.js` | 22 | 集中解析 mode/autopilot/maxSteps loop shape，写入 `state.mode.runtimeAutopilot` 与 `loopShape` |
| `src/pipeline/flags.js` | 91 | flag 稳定性注册表（`FLAG_REGISTRY`），含 `validateRoutableCommand` 路由校验 |
| `src/pipeline/routerUx.js` | 184 | Router 机器验收规则：NDJSON 解析、中文进度转述、模式推断、路由构建、need_decision 恢复、反例检测 |
| `src/pipeline/progress.js` | 21 | NDJSON + 人类可读双输出 |
| `src/pipeline/resultSchema.js` | 70 | result.json 校验，支持 `completed/failed/blocked/need_decision/no_progress` 五状态 |
| `src/pipeline/validationCommands.js` | 53 | 验证命令配置与历史证据分类，避免历史对象回流执行 |
| `src/pipeline/envCheck.js` | 65 | Worker CLI 可用性检测（kimi/codex/claude/gemini/cursor），Cursor 支持官方 `agent`/`cursor-agent` |
| `src/pipeline/iterationPrompt.js` | 172 | 动态单步 prompt：注入允许修改范围、上轮 CLI 验证结果、focus 动态 hard rules、完整 result schema 和 status 语义 |
| `src/pipeline/iterationPaths.js` | 21 | 迭代文件路径集中管理 |
| `src/pipeline/watchdog.js` | 43 | Watchdog 纯函数（need_decision / stop / validation_failed / no_progress_streak） |
| `src/pipeline/phaseGate.js` | 29 | 阶段门禁（最小实现） |
| `src/pipeline/writeGuard.js` | 91 | 写范围检查：mode deny-write、scope 限制、`.agent-state/` 禁写 |
| `src/adapters/index.js` | 78 | 5 agent 配置 + `getAdapter` factory + env template 优先覆盖 |
| `src/adapters/commandResolver.js` | 154 | 跨平台命令发现（`which`）+ 进程启动（`cross-spawn`）+ 超时进程树清理（`tree-kill`），Codex Windows 优先解析 native `codex.exe` |
| `src/adapters/template.js` | 26 | 通用环境变量模板适配器 |
| `src/adapters/kimi.js` | 86 | Kimi Code 专用适配器，含受限 Worker agent + 短 prompt 生成 + Python UTF-8 环境 |
| `src/adapters/codex.js` | 65 | Codex 专用适配器，含 native `codex.exe` 优先兜底 |
| `src/adapters/claude.js` | 14 | Claude Code 适配器 |
| `src/adapters/gemini.js` | 14 | Gemini CLI 适配器 |
| `src/adapters/cursor.js` | 37 | Cursor 适配器，兼容 `cursor` / 官方 `agent` / `cursor-agent` |
| `src/adapters/kimi-worker-agent.yaml` | 9 | Kimi 受限 Worker agent 规格 |
| `src/adapters/kimi-worker-agent.md` | 12 | Kimi 受限 Worker system prompt |
| `skills/auto-iterate-coding/worker.md` | 63 | 单步 Worker 约束 |
| `skills/auto-iterate-coding/orchestrator.md` | 59 | CLI 代码化协议职责 |
| `test/pipeline.test.js` | 约 4392 | 132 个 pipeline 集成测试，覆盖 loopPolicy、delivery_gate 与 strict 门禁一致性、deliveryEvidence/currentState authority gate、notes/traceability/documentation/validation bounded history、validation command config/history split、post-merge validation 逐命令历史证据、no_progress、Worker failed result gate、prompt-backed resume result gate 与 prompt_preserved 审计证据保留、isolate worktree session path sanitization、isolate ignored untracked merge gate、isolate untracked symlink gate、prompt、focus、baseline、need_decision、strict answer resume、answer schema guard、resultSchema requirement status gate、多 `--validate-cmd` 顺序执行、失败短路、验证历史 strict state gate、validation timeout diagnostic summary、Worker result 脱敏与结构化类型保持、key/value 脱敏可读性、脱敏宽度/深度边界、路径归一化复用、resume focus 机器字段、legacy focus 脱敏、writeGuard invalid path gate、normalizeActualFilesChanged 实际路径归一化、scope glob、scope 空格路径、多 scope 列表、ignored 文件审计、既有 ignored 文件二次修改、大型 ignored 文件有界摘要和大量 ignored 文件 bounded metadata 审计、prototype、isolate need_decision/schema/worker failure cleanup、isolate cleanup failure state gate、isolate 冲突、untracked-only 合并冲突和 untracked 预检、resume result focus 复用门禁、diagnose/optimize CLI 多轮、diagnose hypothesisQueue ID 唯一性、focus ID 消费与 legacy hypotheses 物化、result 缺失、worker 非零退出、valid result recovery after timeout、invalid result、`--focus` mode 过滤和 Claude/Gemini/Cursor env-template smoke |
| `test/router-ux.test.js` | 146 | 7 Router UX / flag registry 用例 |
| `test/adapters.test.js` | 254 | 22 adapter 契约测试，覆盖命令构造、超时、非零退出、result 缺失 |
| `test/env-check.test.js` | 93 | 3 环境检查测试，含 Cursor 官方 `agent` 二进制识别 |
| `test/auto-iterate-doc-reliability.test.js` | 约 2992 | 60 个 schema/模板/dispatch/finalize 一致性测试 |
| `test/skill-consistency.test.js` | 90 | 4 文档一致性测试 |
| `test/fixtures/pipeline-worker.js` | 192 | Worker 模拟 fixture |

**当前已交付约 6800 行 pipeline / adapter / 测试 / Worker-Orchestrator 文档 / fixture 代码。** 15 个 pipeline 模块 + 8 个 adapter 模块 + 6 个测试文件均已就位。

---

## 12. 分期交付路线图

| PR | 内容 | 状态 |
|---|---|---|
| **PR-0** | 本文档（`docs/auto-iterate-cli-driven.md`） | ✅ 已形成，当前在做代码事实标注 |
| **PR-1** | parseArgs + 单轮 run + 通用 TemplateAdapter + runPipeline + mergeState + shouldStop + pickFocus + progress + resultSchema + envCheck + 测试 | ✅ 当前工作区已交付 |
| **PR-2** | Phase 1 收尾：Kimi/Codex 专用适配器 + iterationPrompt + iterationPaths + validateStateJsonModel 调用 + noProgressStreak + 多命令验证 + Worker/CLI reconcile + 事件补齐 | ✅ 当前工作区已交付 |
| **PR-3** | Phase 2：phaseGate + `--isolate` / `--allow-modify` + mode-specific 写权限语义 + Claude/Gemini/Cursor 适配器 + `--answer` 恢复 | ⚠️ 部分交付：写权限、适配器、answer、isolate 和 mode loop 已有；真实 Worker/UX 矩阵仍待补齐 |
| **PR-4** | 文档与协议重构：SKILL.md 重写 + AGENTS.md 硬约束收敛 | ✅ 当前工作区已交付：SKILL 路径 A/B、WORKER、ORCHESTRATOR 和 AGENTS Router/Worker 硬边界已同步 |
| **PR-5** | 补齐 §0.7 P0/P1：单步 prompt、`no_progress`、focus 类型和 state_patch 白名单 | ✅ 已交付 |
| **PR-6** | 补齐 §0.7 P2：mode loop、Autopilot 语义、flag/help/事件命名统一、UX 验收 | ⚠️ 部分交付：loopPolicy/flags 已代码化，UX/真实 Worker/失败恢复矩阵仍待验收 |

每个 PR 都应可独立 ship、独立回滚。当前文档已按工作区实现追加 PR-5 / PR-6 待交付边界。

### 12.1 PR-1 最小可交付边界（✅ 已交付）

PR-1 的目标是证明"CLI 能驱动一轮 Worker 并自己验证"。当前工作区已交付：

1. ✅ `parseArgs` 识别全部 pipeline flag（`--run`、`--once`、`--json-progress` 等）。
2. ✅ `initAutoIterate` 支持 `--run --once` 和 `--resume <session> --run --once`。
3. ✅ `src/adapters/index.js` + `template.js`（通用模板适配器）+ 5 个专用适配器。
4. ✅ 完整 `runPipeline`（1804 行）+ `mergeState`（680 行）+ `shouldStop`（89 行）+ `pickFocus`（250 行，完整 focus 类型和 `--focus` mode 过滤）+ `progress` + `resultSchema`（含 `no_progress`）+ `validationCommands` + `envCheck`。
5. ✅ NDJSON 事件覆盖完整核心路径。
6. ✅ `test/pipeline.test.js`（约 4392 行，132 个用例）+ `test/router-ux.test.js` + `test/adapters.test.js` + `test/env-check.test.js` + `test/skill-consistency.test.js`。
7. ✅ `worker.md` + `orchestrator.md` + AGENTS.md 更新。
8. ✅ 测试入口已包含 6 个测试文件，`npm test` 当前通过。

后续 PR 已补齐：
- ✅ 专用 Kimi/Codex/Claude/Gemini/Cursor 适配器（PR-2/PR-3）
- ✅ `iterationPrompt.js` 完整动态 prompt（PR-2/PR-5）
- ✅ `--answer` 实际恢复逻辑（PR-3）
- ✅ `pickFocus` 的 fix_bug/harden_validation/optimize/diagnose/optimize 专用 focus（PR-5/PR-6）
- ✅ `loopPolicy.js` / `flags.js` / `routerUx.js`（PR-6）
- ✅ `commandResolver.js` 跨平台命令发现层（PR-3）

### 12.2 PR-2 最小可交付边界（✅ 已交付）

PR-2 的目标是补齐一阶段一等公民和管道健壮性。当前工作区已交付：

1. ✅ Kimi / Codex 专用适配器（一等公民，env template 仍优先）。
2. ✅ `iterationPrompt.js`（171 行）+ `iterationPaths.js` 已就位；`iterationPrompt.js` 已补全动态 focus hard rules、写范围、上轮验证和完整 result schema。
3. ✅ 全部验证命令依次执行，首个失败后停止。
4. ✅ Worker 自报 vs CLI 验证差异 reconcile + req 降级。
5. ✅ `noProgressStreak` 跟踪，达到阈值后 `requiredAction=stop`。
6. ✅ NDJSON 事件覆盖 env/session/iteration/agent/validation/reconcile/watchdog/write/worktree/stop/error/delivery_gate。
7. ✅ `validateStateJsonModel` 在 pipeline 每轮 merge 后调用，失败时不写入损坏 state。

### 12.3 PR-3 最小可交付边界（⚠️ 部分交付）

PR-3 的目标是补齐真正 Autopilot 所需的门禁与恢复能力。当前工作区部分交付：

1. ✅ `watchdog.js` + `phaseGate.js` + `writeGuard.js` 纯函数。
2. ✅ `--answer <id>` 实际恢复 pending decision。
3. ✅ mode-specific 写权限语义（`writeGuard` 已实现 verify/plan deny-write + `--scope` 限制 + `.agent-state/` 禁写）；mode 循环形状（diagnose 强制 reproduce、optimize baseline 闭环、plan 跳过验证、prototype 默认 scope）见 §0.7 P2-1。
4. ✅ `--isolate` / `--allow-modify` flag 实现。
5. ✅ Claude / Gemini / Cursor 适配器和契约测试。
6. ⚠️ Worker 超时依赖 adapter/spawn timeout；写范围违规、worktree 创建/合并/清理已有类型化事件和测试。
7. ⚠️ Autopilot runtime loop shape 已实现，但 stable UX 和最终交付门禁仍未验收，见 §0.7 P2-3。

### 12.4 PR-4 最小可交付边界（✅ 已交付）

PR-4 的目标是让文档、skill 和项目级 Agent 规则不再互相打架。当前工作区已交付：

已交付：

1. ✅ `SKILL.md` 重构为 Router/Orchestrator 视角，含双路径开场白和路径 A/B 标注。
2. ✅ 新增 `worker.md`（61 行），只描述单步 Worker 约束和 result schema。
3. ✅ 新增 `orchestrator.md`（53 行），记录 CLI 代码化的协议职责分工表和事件契约。
4. ✅ `AGENTS.md` 已加入 CLI 驱动优先和 Router/Worker 硬边界；Worker 不写 `.agent-state`、Router 不要求复制 prompt / 手动运行、CLI 权威职责均由测试锁住。
5. ✅ `test/skill-consistency.test.js`（4 个测试）检查路由、schema、focus 和反例句型。
6. ✅ `skill install` 同步后的文档仍能指导旧 fallback 路径。

已知 gap（由本次评估发现，属本文档 §0.7 范围）：

- `SKILL.md` 中部分旧协议段落的路径 A/B 标注可进一步细化（当前已标注主要章节）。
- 旧 Agent 自治协议完整保留用于 fallback 路径。

不得回退：

1. 不得把旧 Agent 自治协议彻底删除；无 Worker 环境仍需要 fallback。
2. 不得让 `SKILL.md` 同时要求 Router 调 CLI 又亲自维护 budgets。

### 12.5 PR-5 / PR-6 待交付清单

PR-5 优先补齐 P0/P1：

- [x] `iterationPrompt.js` 注入允许修改文件、上轮 CLI 验证结果、focus 动态 hard rules、完整 result schema。
- [x] `resultSchema.js`、`worker.md`、§6.4 统一 result status，决定采用 `completed` / `need_decision`，不采用早期 `changed` / `needs_decision`。
- [x] 增加 `no_progress` 状态，并让 `updateNoProgressState` 直接消费 Worker 显式状态。
- [x] `pickFocus.js` 增加 `fix_bug`、`harden_validation`、`optimize`，并补对应测试。
- [x] `mergeState.js` 白名单补 `notes`、`hypotheses`，同步 state schema / state-schema / state-template。

PR-6 补齐 P2 与 UX：

- [x] 将 `--autopilot` 传入 `runPipeline`，由 `loopPolicy.js` 集中解析并写入 `mode.runtimeAutopilot` / `mode.loopShape`，形成基础 loop shape。
- [x] 补齐 Autopilot `delivery_gate` 交付门禁事件，避免 requirements passed 后直接成功。
- [x] 补齐 Router 事件节奏和 §13.2 UX 机器验收规则（`src/pipeline/routerUx.js` + `test/router-ux.test.js`）。
- [x] 跑 Kimi 真实终端 Router UX smoke 验收：Kimi 按中文请求执行 `--check --json-progress` 和 `--run --once --quick --agent kimi --json-progress`，转述 `env_check`、`session_started`、`iteration_start`、`agent_done`、`validation_done`、`state_merged`、`pipeline_stopped`，未要求用户手动复制 prompt 或手动运行命令。
- [ ] 跑 Claude 真实终端 UX stable 验收。
- [x] diagnose 实现专用 `reproduce` / `hypothesis_test` / `regression_check`；optimize 实现 baseline→optimize→`verify_optimization` 最小状态机。
- [x] diagnose 补 `reproduce` baseline 与假设优先级队列；optimize 补 baseline/post 指标对比和连续无改善停止策略。
- [x] diagnose / optimize 补 CLI 多轮端到端机器验收；真实终端 UX 仍归入 Kimi/Claude §13.2 stable 验收。
- [x] prototype 默认 `prototype/**` scope，plan 模式验证返回 `skipped(plan_mode)`。
- [x] 文档与代码统一 NDJSON 事件名，采用当前代码名 `validation_done` / `pipeline_stopped`。
- [x] help 文本补 `--scope <glob>`，并用测试锁住 help / parseArgs / docs 一致性。
- [x] 将 §9.3 flag 稳定性表代码化到 `src/pipeline/flags.js`，并用 Router UX 测试锁住默认路由只能使用 `routable` 及以上 flag。
- [x] Codex 真实 Worker 单轮 smoke 通过：Windows + Codex 0.133.0 下，`--run --once --quick --agent codex --json-progress --validate-cmd "cmd /c exit 0"` 能写回 `result.json`、输出 `validation_done`、合并 state 并 `pipeline_stopped: once_completed`；`--step-timeout 1` 能稳定输出 `worker_failed/process timed out`。
- [x] Kimi 真实 Worker 单轮 smoke 通过：Windows + Kimi 1.44.0 下，受限 `agent-file` + 短 `kimi-prompt.md` 后，`--run --once --quick --agent kimi --json-progress --validate-cmd "cmd /c exit 0"` 能在约 15 秒内写回 `result.json`、输出 `validation_done`、合并 state 并 `pipeline_stopped: once_completed`；旧完整 prompt 方式会触发 Kimi Router/探索行为并超时，已不作为默认适配路径。
- [x] Linux 远程验证通过：Debian 6.1 x86_64 / Node 24.15.0 / npm 11.12.1 下，安装 git 后 `npm test` 全量通过；`auto-iterate --check --json-progress` 在无 Worker CLI 环境下正确输出 `workers_available: []` 和 `no_worker_cli_found`；`AUTO_ITERATE_CODEX_CMD` / `AUTO_ITERATE_KIMI_CMD` env-template 单轮 smoke 均输出 `validation_done: passed` 与 `pipeline_stopped: once_completed`；`--isolate` 输出 `worktree_created`、`worktree_merged`、`worktree_cleaned`。
- [x] Linux Codex native Worker smoke 通过：远程 Codex 0.133.0 通过 OpenAI-compatible endpoint 登录后，`--run --once --quick --agent codex --json-progress --validate-cmd true` 输出 `agent_done exit_code 0`、`validation_done: passed`、`state_merged` 与 `pipeline_stopped: once_completed`。
- [x] Linux Kimi native Worker smoke 通过：远程并行安装 Python 3.12.13 venv，不替换系统 Python 3.11.2；安装 `kimi-cli==1.44.0` 后，用 OpenAI-compatible `openai_responses` provider 写入远程临时 `~/.kimi/config.toml`，`--run --once --quick --agent kimi --json-progress --validate-cmd true` 输出 `agent_done exit_code 0`、`validation_done: passed`、`state_merged` 与 `pipeline_stopped: once_completed`。
- [x] Linux Cursor 官方 CLI 检测适配完成：官方 installer 提供的 `agent` / `cursor-agent` 已被 `--check` 识别为 `cursor` worker；native 调用返回 `Authentication required`，需要 `CURSOR_API_KEY` 或 `agent login` 后才能做真实 Worker smoke。
- [x] Claude/Gemini/Cursor env-template Worker smoke 通过：`pipeline.test.js` 用 `AUTO_ITERATE_CLAUDE_CMD` / `AUTO_ITERATE_GEMINI_CMD` / `AUTO_ITERATE_CURSOR_CMD` 跑通 `--agent claude|gemini|cursor --run --once --quick --json-progress`，证明 agent id、env template、result 写回、CLI validation 和 state merge 链路可用；真实 native CLI smoke 仍受各自 provider 认证限制。
- [x] Windows Codex/Kimi native Worker smoke 通过：本地 Windows 上 Codex 0.133.0 和 Kimi 1.44.0 均已通过 `--run --once --quick --json-progress`，输出 `agent_done exit_code 0`、`validation_done: passed`、`state_merged` 与 `pipeline_stopped: once_completed`。
- [ ] Linux/Windows Claude/Gemini native smoke：Claude 需要真实 Claude Code 登录态或 Anthropic 兼容协议；Gemini 需要 Google/Gemini API key 或 Vertex/GCA；OpenAI-compatible key 不能直接替代。
- [x] Worker 适配器机器矩阵覆盖命令构造、超时、非零退出、result 缺失和非法 result：`adapters.test.js` 覆盖 TemplateAdapter 成功/非零/超时，`pipeline.test.js` 覆盖 `worker_failed`、`missing_result_json` 和 `invalid_result_json`。
- [x] 跑 §13.2 的 UX 零人工机器验收规则。
- [ ] 跑 §13.2 的 Claude 真实终端 UX 零人工验收，达到后再把 `--run --autopilot --json-progress` 升为 stable 推荐路径。

### 12.6 每个 PR 的执行检查清单

每个实现 PR 开工前必须先完成：

- [ ] 读本文档 §0、§9.3、§10.4 和当前 PR 对应的 §12.x。
- [ ] 跑 `node bin/cli.js auto-iterate --help`，记录当前 help 输出，确认要新增的 flag 不会覆盖旧语义。
- [ ] 跑 `npm test`，确认基线是绿的；如果不是绿的，先记录失败，不要把失败归因于本 PR。
- [ ] 用 `rg --files src test skills docs` 找到需要同步的文档、schema 和测试。
- [ ] 确认本 PR 不需要改 `SKILL.md`；除 PR-4 外，默认不重写 skill 主协议。

每个实现 PR 合并前必须通过：

- [ ] `npm test`。
- [ ] `node bin/cli.js auto-iterate --quick --goal "兼容性冒烟" --session compat-smoke --yes` 在临时目录能生成 session。
- [ ] 如果改了 `--resume` / state 校验，临时目录中 `node bin/cli.js auto-iterate --resume compat-smoke` 仍可用。
- [ ] 如果新增 planned flag，help、parseArgs、非法组合、文档和测试全部同步。
- [ ] 如果新增 state 字段，`validateStateJsonModel`、`state.schema.json`、`state-schema.md`、state-template 和测试全部同步。
- [ ] 如果新增 NDJSON 事件，事件 schema、示例、解析测试和 stdout/stderr 分离测试全部同步。
- [ ] 如果新增 Worker 适配器，至少覆盖命令构造、超时、非零退出和 result 缺失四种情况。
- [ ] 如果 PR 修改自然语言路由，必须证明对应 flag 已达到 §9.3 的 `routable`。

PR 审阅时的一票否决项：

- [ ] Worker 自报验证被直接写成 `passed`。
- [ ] `--run` 修改或删除旧大 prompt 路径。
- [ ] `--json-progress` 的 stdout 混入非 JSON 日志。
- [ ] verify / plan 模式默认允许写业务文件。
- [ ] 新 flag 在 README / AGENTS.md 中被推荐，但 CLI 尚未实现。
- [ ] 新增字段只存在于 pipeline 代码，schema 和测试没有同步。

---

## 13. 验收标准

### 13.0 文档评估结论

按当前工作区代码事实评估，本方案已从纯设计进入可运行核心闭环阶段，但还不能标记为量产级 Autopilot stable。理由如下：

| 维度 | 结论 | 说明 |
|---|---|---|
| 方向正确性 | 通过 | CLI 持有主循环、验证和状态，比 Router LLM 自治更可靠。 |
| current/planned 边界 | 有条件通过 | §0.2 和 §0.7 已明确 8 类设计规格 gap；核心闭环可跑但细节偏离待补齐。后续增强不得破坏旧路径兼容。 |
| 实现可切片性 | 通过 | §12.1-§12.6 已把已交付和待交付边界拆成可回滚单元。 |
| 状态一致性 | 有条件通过 | 必须执行 §3.6、§6.5、§9.2，否则容易出现 schema 漂移。 |
| UX 零人工目标 | 未完成 | CLI 事件、`--check`、fallback、Router 机器规则和 Kimi 真实 Router UX smoke 已具备，但 §13.2 Claude 真实终端 UX 仍未验收。 |
| 技术风险 | 中 | Codex 与 Kimi 真实 Worker 单轮 smoke 已在 Windows 和 Linux 通过，且 result BOM、result path write guard、Windows timeout 已补测试；其它 Worker CLI 的 provider 认证、参数版本和 Autopilot UX 仍需矩阵兜底。 |

当前最需要守住的三条线：

1. ~~先让 `--run --once` 真实可跑~~（✅ 已达成：`pipeline.test.js` 覆盖 132 个 pipeline 用例；Windows 上 Codex 0.133.0 / Kimi 1.44.0 真实 Worker 单轮 smoke 已通过；Linux 上全量 `npm test`、Codex native smoke、Kimi native smoke、codex/kimi env-template smoke、无 Worker fallback 和 `--isolate` smoke 已通过；Claude/Gemini/Cursor env-template smoke 已通过；Kimi 真实 Router UX smoke 已通过；Cursor 官方 `agent` 已纳入检测）。下一步：补齐 Claude 真实终端 UX 和 Claude/Gemini/Cursor native Worker CLI smoke 后再把 Autopilot 标成 stable。
2. ~~先让 CLI 独立验证成为唯一 passed 证据~~（✅ 已达成：reconcile + req 降级已落地）。~~补齐 `no_progress` 状态联动~~（✅ 已达成）。
3. 先保持旧路径完全兼容（✅ 当前代码中 `--no-run` / 不带 `--run` 仍走旧路径），再逐步把 Router LLM 路由迁到 `--run`。

### 13.1 代码层

- [x] `parseArgs` 不破坏现有 flag 行为（旧路径保持兼容，15 个 pipeline flag 已解析）。
- [x] `--run` 跑通时，`state.json.updatedAt` 在每轮后变化；`postChange` 由 CLI 写入（status/command/result/reason）。
- [x] Worker 自报 passed 但 CLI 验证失败 → req 降级为 `implemented`，evidence 记录「CLI 验证失败」。
- [x] `--json-progress` 输出每行有效 JSON；事件名以当前代码 `validation_done` / `pipeline_stopped` 为准。
- [x] `validateStateJsonModel` 在每轮 merge 后通过 `writeValidatedState` 调用。
- [x] `--once` 退出后用 `--resume <session> --run` 能续跑（含 `--answer` 恢复决策）。
- [x] `--check` 在没装任何 Worker CLI 的环境下返回 `workers_available: []`。
- [x] exit code 42 在 `need_decision` 事件后稳定复现；`--answer <id>` 能将 `decisionRequest.status` 从 `pending` 推进到 `approved`。
- [x] verify / plan 写保护、`.agent-state/` 禁写、`--scope` 范围检查已在 `writeGuard` 实现。
- [x] `--scope <glob>` 出现在 help 文本中。
- [x] `--autopilot` 具备基础 runtime loop shape，并写入 state / NDJSON。
- [x] `--autopilot` 具备 `delivery_gate` 最终交付门禁事件。
- [x] `--autopilot` 具备 Router 事件节奏和 UX 机器验收规则。
- [ ] `--autopilot` 具备 Claude 真实终端 UX 验收。
- [x] Codex 真实 Worker 单轮 smoke 已通过，并覆盖 Worker timeout 可控失败路径。
- [x] `result.json` 支持 `no_progress` 并与 `noProgressStreak` 联动。
- [x] `pickFocus` 实现 `fix_bug`、`harden_validation`、`optimize`。
- [x] diagnose / optimize 的专用 focus、假设队列、指标模型和停止策略落地。
- [x] diagnose / optimize 的 CLI 多轮端到端机器验收。
- [x] prototype / plan 的关键 mode-specific 行为落地。

### 13.2 UX 层（「零人工」验收）

本节分两层：机器可验证规则由 `src/pipeline/routerUx.js`、`test/router-ux.test.js` 和 diagnose/optimize CLI 多轮 pipeline 测试覆盖；Kimi Code CLI 真实 Router UX smoke 已通过；stable 仍需在一个未初始化的干净 fastcar 项目里，用 Claude Code 或更完整的 Kimi/Claude 长流程启动会话，用户只输入中文请求完成验收：

- [x] **用例 1 机器规则（implement + autopilot + fix-on-fail）**：用户说「把 docs/demo-prd.md 里的需求都实现了，遇测试失败就一直修」。Router LLM 必须：
  1. 不要求用户跑任何命令；
  2. 自己 Shell 跑 `fastcar-cli auto-iterate --check`，再跑 `fastcar-cli auto-iterate --run --autopilot --from ... --json-progress`；
  3. 实时口语化进度（中文）；
  4. 完成后报告总结，不要求用户手动打开任何文件。
- [x] **用例 2 机器规则（人工决策）**：中途遇到 need_decision。Router LLM 看到 exit 42 后用 AskUserQuestion 问选项，拿到答案后自动 `--resume --answer` 续跑。
- [x] **用例 3 机器规则（中断恢复）**：中途 Ctrl+C 中断。用户下次说「接着上次那个任务推进」。Router LLM 自动调 `--list` + `--resume <last>`，不要求用户输 session 名。
- [x] **用例 4 机器规则（无 Worker 环境）**：环境里没装任何 Worker CLI。Router LLM 从 `--check` 识别出，明示告诉用户「本机未安装 Worker CLI，本次由我在当前会话里代跑」，然后才退回旧「打印 prompt」模式。
- [x] **用例 5 机器规则（反例，必须不出现）**：Router LLM 不能出现「请你然后运行 xxx 命令」「请复制下面 prompt 贴到 codex 里」「请手动运行 npm test」。这些句型出现即为验收失败。
- [x] **Kimi 真实终端 UX smoke**：Kimi Code CLI 按中文请求执行 `--check --json-progress`，随后执行 `--run --once --quick --agent kimi --json-progress --validate-cmd "cmd /c exit 0"`，转述关键 NDJSON 事件并给出中文结论，未出现手动复制或手动运行指令。
- [ ] **真实终端 UX stable**：在 Claude Code 或完整 Kimi/Claude 长流程中跑完整零人工流程，记录命令、NDJSON 转述、need_decision / resume / fallback 行为和最终交付摘要。

---

## 14. 风险与缓解

### 14.1 风险表

| 风险 | 缓解 |
|---|---|
| 4 个 Worker CLI 的命令行 flag 各版本不同 | 适配器留环境变量覆盖（`AUTO_ITERATE_CODEX_CMD` 等仍生效）；TemplateAdapter 永远可用作回落 |
| Worker 输出 result.json 不合法 | `parseAndValidateIterationResult` 不抛异常；缺失或非法 result 会先持久化失败状态，再输出 `missing_result_json` / `invalid_result_json` 并停止，合法 `no_progress` 才会累加 watchdog streak |
| `state.json` 字段太多，merge 容易漏 | 每轮 merge 后强制跑 `validateStateJsonModel`；CI 加单测 |
| 用户旧的 Agent 自治流程被破坏 | 默认行为不变；`--run` 是 opt-in |
| Worker 偷偷写 `.agent-state/` 或漏报实际改动 | WORKER.md 明确禁止；iterationPrompt 里再硬约束；非 isolate git worktree 用 status 前后快照产生 `write_audit` 并合并进 `writeGuard`，同时用 `--ignored=matching` 捕获 ignored 文件/目录写入，并对 ignored 目录做有界内容摘要以发现既有 ignored 文件二次修改；大型 ignored 文件超出摘要阈值时退化为路径/大小/mtime 元数据摘要，大量 ignored 文件超出数量阈值时切换为 `bounded` streaming metadata hash，避免每轮全量读取或保存大目录 entry 列表；`--isolate` 模式通过 worktree merge 边界隔离 |
| 验证命令很慢导致每轮超时 | `--validation-timeout` + `runValidationCommands` 独立 timeout；`--no-validate` 可临时跳过 |
| **Router LLM 不遵守 AGENTS.md，仍让用户复制命令** | (a) AGENTS.md 采用「不要说 X」的硬制句型；(b) 加 5-10 条口语化近义句表；(c) 项目 `AGENTS.md` 顶部重复强调；(d) 验收反例用例 5 |
| **不同 LLM 对意图 → 命令映射准确率不一** | AGENTS.md 里完整映射表，不靠语义推理；强触发词「完全包含」匹配优先于语义 |
| **NDJSON 事件 schema 漂移** | 事件类型与关键字段由 `test/pipeline.test.js` 和文档一致性测试锁定；新增字段必须 backward-compatible |
| **Worker 超时 / 完全 hang** | `--step-timeout` wall-clock 上限 + `--inactivity-timeout` 活跃检测；超时写 `timeout-warning.json`，打印 `worker_timeout_warning` / `agent_timeout` 事件 |
| **Skill 与 CLI 代码冲突导致 Worker / Router 走偏** | PR-4 一次性重构§14.3；PR-1 / PR-2 期间靠 `AGENTS.md` 临时公告中转；加 `test/skill-consistency.test.js` 防后续漂移 |
| **老项目升级 fastcar-cli 后，本地 SKILL.md 还是旧本** | `skill install` 选项增加「检测本地 SKILL.md 是否含双路径公告」提示；未含 → 警告用户迁移 |
| **mode 默认走 strict 循环，对 verify / plan / prototype 是错的** | `loopPolicy.js` + `pickFocus.js` 按 mode 选择 loop shape 和 focus；plan 只跑一轮；verify 默认 deny-write。`mode_branch` 事件里明示说出走哪个分支。 |
| **verify / plan 下 Worker 偏要写文件** | merge 随 deny-write 扫描 Worker 自报和 git 实际改动；违规 → `write_audit` / `write_violation` 事件 + 本轮丢弃 + watchdog 报警。 |
| **diagnose 没复现就进修复** | `pickFocus.js` 在 mode=diagnose 且无 baseline 时优先产出 `reproduce` focus；拿不到 baseline reproduction 不进修复 focus。 |
| **optimize 没 baseline 就优化** | `pickNextFocus` 在 mode=optimize 下，首轮必须产出 `establish_baseline` focus；baseline 验证未走不选出 optimize focus。 |

### 14.2 本文档自身的剩余风险

| 风险 | 处理策略 |
|---|---|
| 代码位置行号会随 PR 变化 | 附录 C 只作为当前索引；PR 修改相关函数时同步更新。 |
| Agent CLI 参数可能在 2026 年后继续变化 | 适配器必须支持环境变量覆盖；本文命令模板不是永久 API 承诺。 |
| planned flag 过多导致首个 PR 过大 | PR-1 只实现 `--run --once` 最小闭环；其余 flag 按 §12 推进。 |
| Skill 重构晚于代码实现，短期内新旧协议并存 | PR-1/PR-2 期间在 `AGENTS.md` 加临时公告；PR-4 一次性收敛。 |
| 文档验收偏 UX，难自动化 | UX 反例句型写入 `skill-consistency.test.js`，其余用 e2e fixture 验证。 |

---

### 14.3 原则冲突问题与 Skill 重构策略

问题本身：Worker 和 CLI 现在并列拥有一套原则。现状 SKILL.md 里的写法隐含「一个 Agent 读完后自己负责所有事」，一旦拆成三谁负责不同部分，冲突必须提前解决。否则出事点包括：

### 14.3.1 快查：三种典型冲突

| 冲突场景 | 表现 | 必须以谁为准 |
|---|---|---|
| **Worker 读了旧 SKILL.md** | Worker 看到「每轮要更新 RCM / Watchdog / DoD」会去改 `state.json` | CLI：Worker 禁止读写 `.agent-state/` |
| **Worker 看到 N 轮价档自己推进 20+ 轮** | Worker 不肯在一个切片后退出 | CLI：单步 prompt 额外加「完成本轮即退出」硬约束；SKILL.md 删「多轮」表述 |
| **Router LLM 读了旧 SKILL.md** | Router LLM 以为是自己背下来全部协议跳入“自治模式” | AGENTS.md 、SKILL.md 顶部：`--run` 下 Router 只负责路由 + 转述 + 问决策 |
| **同一条原则词同意异（例如 "reconcile"）** | Worker 读到以为要自己重读代码，CLI 同时也在跳 reconcile 事件 | 明确文本上加「（由 CLI 执行）、「（本轮不要做）」标记 |
| **预算双重递减** | Worker 看见 budgets，误以为是自己要递减 | CLI：唯一递减者；Worker 看到的是只读快照 |
| **验证双重跑** | Worker 以为不跑 npm test 是犯规，但 CLI 也要跑 | Worker prompt 明示允许跑，但说明“CLI 会再跑一次，以 CLI 为准” |
| **fresh-eyes 双重触发** | Worker 看 SKILL 以为自己要拿主意触发，但 CLI 又会在另一轮指定 | CLI 独占触发权；Worker prompt 只在被指定那轮收到 fresh-eyes 任务 |

### 14.3.2 是否需要重构 Skill：**是，必须**

不重构会出下面这些问题（都可能坏掉「零人工」目标）：

1. **双重控制**：Worker 读完 SKILL.md（遇到一份 733 行的“个人责任”文件）会起来自行推进、不肯退出。举例：SKILL.md 第 410-460 行写 autopilot 要跑到全部需求完成。这与 CLI 告诉 Worker 「你就做这一个 REQ」冲突。
2. **状态争写**：SKILL.md 多处说 Agent 要写 state.json（例如 第 116 行 「更新 Iteration State、RCM、DoD 和 Watchdog」）。Worker 读到会去改，而 CLI 同时在原子写入。状态相互覆盖。
3. **路由冲突**：SKILL.md 现有「自然语言命令路由」节未看到「不要让用户复制命令」这件事。Router LLM 会仁慈地把推荐命令贴给用户。
4. **模式语义重复**：SKILL.md 里 7 个 mode 的详细描述，现在在 CLI `MODE_CONFIGS` / `runPipeline` 分支里也有一套。代码变化后 SKILL.md 不跟着变，二者会漂移。
5. **预算争补**：SKILL.md 充满「最少/最多 N 轮」描述。Worker 读到会在本轮内部报“我本轮是第 3 轮”，但实际 CLI 才是唯一计数者。
6. **验证加固 双验**：SKILL.md 说 Agent 要主动做 hardening，但 CLI 现在是阶段门禁控制者。Worker 提前跳到 hardening 会走偏。

### 14.3.3 Skill 重构的 5 个具体动作（PR-4 交付）

在 **PR-4（文档）**里完成下面 5 件事。不提前做，避免 PR-1/PR-2 代码动荡期 Skill 反复改。

#### 动作 1：拆 SKILL.md 为三层

```
skills/auto-iterate-coding/
├─ SKILL.md（重写，~300 行）
│   只保留 Router/Orchestrator 魔术：
│   - 定位与开发背景
│   - 强触发词、自然语言命令路由【加上 `--run --autopilot --json-progress`】
│   - mode 选择哲学
│   - ask-or-act 决策
│   - Codex goal 边界
│   - 能力探测与降级
│   - 任务分级
│   - 未装 Worker CLI 时的无 CLI fallback
│
├─ WORKER.md（新增，~80 行）
│   只给被 spawn 起来的单步 Worker 看：
│   - 你只做本轮这一件事，做完写 result.json 后退出
│   - 禁止读写 `.agent-state/`
│   - 禁止试图推进下一个 REQ
│   - 禁止伪造验证结果（CLI 会独立验证）
│   - import 规则、数据库查询规则、Controller 规则、实体/枚举规则
│   - result.json schema
│
└─ ORCHESTRATOR.md（新增，~150 行，供读代码的人）
    谁负责什么的完整划分：
    - 来自本文档 §3.5 的加强版
    - watchdog / fresh-eyes / hardening / phase gate / RCM / DoD 如何被 CLI 代码化
    - 谁不能动什么状态字段的表
```

**原则代码化后，SKILL.md 不再以同样语气谈论「你要怎么怎么」**。凡是被 CLI 代码接管的原则，原文改为表述句：「（在 `--run` 模式下由 CLI 自动执行，本条仅供阅读源码与无 CLI fallback 场景参考）」。

#### 动作 2：添加「双路径」开场白

SKILL.md 首节之后加一节标题为「执行路径识别」的内容（以下为示例，使用装饰性缩进避免误会为本设计文档的章节）：

> **《执行路径识别》**
>
> 当前环境必须走下面两条路径之一，不可混用：
>
> **A. CLI 驱动路径（默认、推荐）** —— 调用 `fastcar-cli auto-iterate --run --autopilot ...`。进入后你是 Router LLM：只读 NDJSON 转述进度、遇决策点问用户、不直接改代码。本文档后面「核心流程」「看门狗机制」「迭代状态」「需求覆盖矩阵」等节，在该路径下由 CLI 代码执行；你不要主动去「执行」它们。
>
> **B. 无 CLI fallback 路径（仅在环境完全不能 spawn Worker CLI 时使用）** —— `fastcar-cli auto-iterate --check` 返回 `workers_available: []` 且本身不是这些 CLI 之一时。才走本文档描述的完整协议：你同时扮演 Router + Worker + Orchestrator，亲手维护 state.json、跑验证、递减预算。

这让后面几百行原本有了明确适用范围，不会让 CLI 驱动下的 Worker 误读。

#### 动作 3：每个变成 CLI 职责的段落加表述词前缀

逐节加上表述句「【仅适用于路径 B】」或「【路径 A 下由 CLI 执行，你不要主动去做】」。例如 SKILL.md 第 472 行「看门狗机制」开头会变成：

> 《看门狗机制》
>
> 【路径 A 下由 CLI `watchdog.js` 执行，Worker / Router 不要主动介入看门狗状态】
>
> 【路径 B 无 CLI fallback 时才需要手动维护以下状态】
>
> Autopilot、`medium` / `large` 任务 ……（下面原文保留）

干完这一道后，Worker 仍可读到原文体会背景，不会误以为是自己的任务。

#### 动作 4：在 `frontmatter.description` 里额外加一句

现状项目 `skills/auto-iterate-coding/skill.md` 第 3 行的 description 是 Router LLM 唯一会优先读到的入口。在现有描述后拼接：

```
... When fastcar-cli auto-iterate supports --run mode and a Worker CLI is available, Router MUST invoke `fastcar-cli auto-iterate --run --autopilot --json-progress ...` and act only as translator/reporter; do NOT inline-implement the protocol in the chat session.
```

这是防 Router LLM 走偏的唯一硬入口。

#### 动作 5：`AGENTS.md` 加入 Worker / Router 分工硬约束

已在本文档 §10、§14 说明，不重复。关键是 `AGENTS.md` 要作为项目级硬约束，比 SKILL.md 优先级更高。

### 14.3.4 重构顺序

**必须同步交付**，不能只改代码不改 Skill、也不能只改 Skill 不改代码：

- **PR-1 / PR-2 期间**：SKILL.md 暂不动，但 `AGENTS.md` 顶部需提前加一个临时公告：「本项目正在向 CLI 驱动迁移；若 `fastcar-cli auto-iterate --run` 可用，优先使用。」这样算 PR-1/PR-2 上线后用户不会被旧 SKILL.md 手足无措。
- **PR-4** 交付本节全部 5 个动作，拆 SKILL.md、新增 WORKER.md、新增 ORCHESTRATOR.md、加双路径公告、改 frontmatter description。动一次、动到位。
- **不要在 PR-1、PR-2、PR-3 里零碎改 SKILL.md**。出事点是：PR-1 上线迭代倒半部在 PR-2，迭代中 Skill 被改 N 次会出现‌不同版本的 Skill 与不同版本的代码交叉运行，这会拖 Router LLM 下水。

### 14.3.5 冲突预防检查（每个 PR 都会跑的单测）

加一个 `test/skill-consistency.test.js`：

- 如果 CLI 代码中 `runPipeline` 存在某个 focus 类型（如 `hypothesis_test`），WORKER.md 里必须出现该词。
- 如果 `state.json` schema 加了新字段，SKILL.md / WORKER.md / ORCHESTRATOR.md 中至少一处提过。
- 反例检查：SKILL.md 中出现「你要写 state.json」「你要递减 budgets」「你要迭代 N 轮」这三句型时，必须同一行存在「路径 B」或 `--run` 以外场景限定。

### 14.4 SKILL.md 里那些原则还有用吗？

**有，一条不丢**，但各自有不同的出路。下表是快查（详见 §3.5）：

| SKILL.md 原则 | 新架构下的状态 | 有什么不同 |
|---|---|---|
| 最小纵切 / 垂直切片 TDD | 仍是黑不可越的核心 | CLI 每轮只发一个切片给 Worker，Worker 也无法越界推进 |
| Requirement Coverage Matrix | 仍是唯一需求状态源 | CLI 独占写入权；Worker 只提 patch |
| Definition of Done | 仍是交付门禁列表 | 从 RCM + cliValidation + watchdog 派生，不再闹心另一套 |
| Watchdog | 仍是每轮安全检查 | 触发逻辑从 prose 变成 `watchdog.js` JS 函数 |
| Reconcile | 仍是状态不一致时的必走路径 | CLI 每轮自动检查，不靠 Worker 自觉 |
| 验证加固 | 仍是交付前硬门禁 | 阶段转换由 `checkPhaseGate` 决定 |
| Fresh-Eyes 复查 | 仍是防误判完成的必需 | CLI 设置 flag，Worker 在被指定的那轮执行 |
| 可证伪假设（diagnose） | 仍是 diagnose 的灵魂 | 变成 focus 类型 `hypothesis_test:<H>`，每轮一个 |
| 状态漂移 / state_drift | 仍是头号风险 | CLI 每轮 `validateStateJsonModel` + claimed vs actual 对比 |
| Baseline（optimize/diagnose） | 仍是必须首轮建立 | `pickNextFocus` 首轮强制 establish_baseline |
| Skill Capture | 仍是收尾交付 | 原路不变 |
| budgets / 迭代预算 | 仍是硬限制 | CLI 唯一递减者 |
| Context Compression / Handoff | 仍是 long-task 必要净化 | CLI 触发，单轮 prompt 注入 handoff |
| 不为凑轮数制造无效修改 | 仍是完整性原则 | `shouldStop` 在该停时不给 Worker 机会 |
| Codex goal 边界 | 仍由 Router LLM 遵守 | 不变 |
| 自然语言路由表 | 仍由 Router LLM 查表 | 不变（附录 A） |
| ask-or-act 决策 | 仍由 Router LLM 使用 | + CLI exit code 42 机制补充 |
| 任务分级（small / medium / large） | 仍由 Router LLM 判断 | 决定传哪个 `--mode` |
| import 规则、数据库查询规则、实体/枚举规则、Controller 规则 | 仍是 Worker 每轮必须守的代码规范 | 抽到 `worker.md`，Worker prompt 首轮永久多载 |

**总原则**：

- **原则本身不质疑**：FastCar 在 7 个 mode、几十轮迭代、方法论上果敢有效。本改造不是为了推翻方法论，是为了使方法论不再依赖“LLM 是否严格读了协议”。
- **能代码化的全部代码化**：Watchdog、阶段门禁、递减、边界检查、状态漂移检测、反凑轮。这些在代码里变成可单测的出口。
- **不能代码化的仍由 LLM 遵守**：什么是合理的取舍设计、什么是可维护代码、什么是合理的测试覆盖、什么是跨文件影响。这些留给 Worker 在单步内发挥。

## 15. 不在本阶段范围

- Phase 3 多 Agent 并行（`--parallel`、跨 worktree merge）
- 不重写 `buildPromptContent`（旧大 prompt 模式保留）
- 不修改现有 `initDispatch`（保持兼容）
- 不实现 Codex `/goal` 集成（`AGENTS.md` 已有边界说明，沿用）
- 不改 `validateStateJsonModel` 字段定义（沿用现有 schema）
- 不为 Windsurf / Copilot / Jules / Devin / OpenHands / Replit 写专用适配器，永远走 TemplateAdapter（详见 §4.2）

---

## 16. 测试策略

### 16.1 测试金字塔

CLI 驱动改造的测试从四个层次保证正确性，从下到上：

| 层级 | 测试类型 | 覆盖内容 | 交付 PR |
|---|---|---|---|
| L1 单元 | 纯函数单测 | `pickNextFocus`、`shouldStop`、`mergeIterationIntoState`、`checkPhaseGate`、`parseAndValidateIterationResult`、`validateStateJsonModel` | PR-1/PR-2 |
| L2 集成 | Pipeline 集成 | `runPipeline --once` 端到端：spawn → parse → validate → merge → emit；Worker 超时、非法 result、写违规等失败路径 | PR-2 |
| L3 适配器 | 适配器契约 | 每个专用适配器（Kimi / Codex）的 `buildCommand` 输出格式、`parseOutput` 在 exit 0/非 0/超时三种情况下的行为 | PR-1/PR-2/PR-3 |
| L4 文档一致性 | Skill / schema / code 三方对齐 | `test/skill-consistency.test.js`（§14.3.5）+ 现有 `test/auto-iterate-doc-reliability.test.js` 扩展 | PR-4 |

### 16.2 现有测试兼容

`test/auto-iterate-doc-reliability.test.js`（约 2992 行）必须保持全部通过。PR-1/PR-2 期间新增的 pipeline 测试以独立文件 `test/pipeline.test.js` 和 `test/adapters.test.js` 存在，不与现有测试互相污染。

### 16.3 可测试性硬约束

以下模块必须导出纯函数，禁止依赖全局状态或文件系统副作用：

- `src/pipeline/pickFocus.js`：输入 `(state, override, mode)` → 输出 `focus | null`
- `src/pipeline/shouldStop.js`：输入 `(state, lastValidation, ctx, mode)` → 输出 `{ stop: boolean, reason: string }`
- `src/pipeline/mergeState.js`：输入 `(state, report, cliValidation, ctx)` → 输出 `{ state, issues }`
- `src/pipeline/resultSchema.js`：输入 `(raw)` → 输出 `{ valid: boolean, result?, errors[] }`

`runPipeline` 本身允许副作用（spawnSync、写文件），但应通过依赖注入方式传入 adapter 和 fs 操作，方便集成测试用 mock adapter 替换。

### 16.4 envCheck 测试

`--check` 的测试覆盖三种场景：

1. **有 Worker**：PATH 中有 kimi / codex → `workers_available` 非空，`recommended` 非 null。
2. **无 Worker 但环境变量已配**：`AUTO_ITERATE_KIMI_CMD` 已设 → 仍报 `usable: true`（因为 template 可被 CLI 解析，实际可用性由运行时决定）。
3. **无 Worker**：什么都没有 → `workers_available: []`，`issues` 含 `no_worker_cli_found`。

测试文件：`test/env-check.test.js`（PR-3 交付）。

---

## 17. `--isolate` 详细行为

### 17.1 动机

`--isolate` 让每轮 Worker 在临时 git worktree 中运行，防止 Worker 的修改污染主工作区。适用于：

- 高风险重构前先隔离试跑
- Worker 行为不确定时保护主分支
- verify 模式下确保 Worker 不会意外修改文件（作为 deny-write 的补充）

### 17.2 行为定义

```text
1. runPipeline 在进入循环前检查 --isolate flag。
2. 如果 --isolate 为 true：
   a. 检查当前目录是否为 git 仓库根目录；不是则拒绝启动，输出 error 事件。
   b. 创建临时 worktree：git worktree add --detach <tmpdir>/auto-iterate-<session>-<iter>
   c. 后续 spawn Worker 时，cwd 指向临时 worktree 而非原项目目录。
   d. 验证命令在临时 worktree 中运行（因为修改在 worktree 里）。
   e. 本轮结束后，CLI 从 worktree 读取 diff，合并到主工作区（通过 git cherry-pick 或 patch apply），然后删除 worktree。
   f. 如果 --once，worktree 用完立即清理。
3. --isolate 与 deny-write（verify/plan 模式）互斥：--isolate 本身是隔离写入，不是禁止写入。
   同时传 --isolate --verify 时，--verify 的 deny-write 优先，Worker 在 worktree 里也不允许改文件。
```

### 17.3 事件

`--isolate` 启用时，`session_started` 事件增加 `isolated: true` 字段。每轮 worktree 创建/合并/清理失败时输出 `error` 事件，reason 为 `worktree_create_failed` / `worktree_merge_failed` / `worktree_cleanup_failed`。合并前会先预检 untracked 文件目标路径；如果主工作区已存在同名目标，CLI 在应用 tracked diff 或复制任何 untracked 文件之前停止，避免 `git apply` 已落地但 untracked 复制失败，或 untracked-only 合并中前置文件已复制但后续冲突造成半合并状态。当 Worker 返回 `need_decision`，或 CLI 在 pending decision / state merge / post-merge validation 状态写入阶段遇到 `state_schema_failed` 时，CLI 在退出前先清理临时 worktree，避免中断或门禁失败长期残留隔离目录。若合并和 post-merge 验证已通过但 worktree cleanup 失败，CLI 会把 `state.postChange.status` 改为 `failed`、`watchdog.requiredAction="stop"`、`validation.finalVerifiability="unknown"`，避免后续 resume 误判本轮健康完成。当合并失败时，CLI 保留隔离 worktree，事件中输出 `preserved_worktree`，并写入 `state.isolate.conflictWorktree` 与 `state.watchdog.requiredAction="stop"`。

### 17.4 限制

- 仅在 git 仓库中可用；非 git 项目传 `--isolate` 直接报错退出。
- `--isolate` 不解决 Worker 写入 `.agent-state/` 的问题；该禁止仍由 prompt 硬约束和 write guard 保证。
- worktree 合并可能产生冲突；冲突时本轮停止并保留 worktree 目录供人工处理，输出 `error(reason=worktree_merge_failed,preserved_worktree=...)`，并在 state 中记录冲突 worktree。

---

## 18. NDJSON 输出与日志分离

### 18.1 stdout vs stderr

CLI 在 `--json-progress` 模式下，**stdout 只输出 NDJSON 事件**，**stderr 输出人类可读日志和诊断信息**。这保证 Router LLM 能安全地把 stdout 的每一行当 JSON 解析，不会被日志污染。

```text
stdout：{"event":"iteration_start","iter":1,...}\n{"event":"agent_done",...}\n...
stderr：[auto-iterate] 正在启动 Worker (kimi)...
stderr：[auto-iterate] Worker 已退出，exit=0，耗时 48.2s
stderr：[auto-iterate] 正在运行验证命令: npm test
```

### 18.2 实现约束

- `src/pipeline/progress.js` 的 `emit(event)` 函数写 `process.stdout`。
- 所有 `console.log` / `console.warn` / `console.error` 在 `--json-progress` 下重定向到 `process.stderr`。
- Router LLM 解析 stdout 时如果遇到非 JSON 行，应跳过并报告 warning，不能 crash。
- 不带 `--json-progress` 时，保持现有行为：stdout 输出人类可读文本。

### 18.3 验证日志

Worker 的完整 stdout/stderr 和 CLI 验证命令的完整输出不进入 NDJSON 事件流。它们被写入：

- `.agent-state/auto-iterate/<session>/iterations/<n>/worker.log`（Worker 完整输出）
- `.agent-state/auto-iterate/<session>/iterations/<n>/validation.log`（CLI 验证完整输出）

只在 NDJSON 事件中保留摘要（exit code、duration、末 4KB tail）。

---

## 附录 A：强触发词映射表（供 Router LLM 查表）

本附录描述 `--run` 稳定后的目标路由。当前仓库已实现 `--run`、`--check`、`--json-progress` 和基础多轮 pipeline，Router LLM 可以在 `--check` 发现可用 Worker CLI 后使用本表命令；若 Worker 不可用、用户显式 `--no-run`，或目标能力属于 §0.7 未实现项，则回退到旧命令，例如 `fastcar-cli auto-iterate --quick --goal ... --yes`、`--strict --from ... --yes`、`--verify --from ... --yes`。

标注规则：

- ✅ 可默认路由：当前代码已实现，且不依赖 §0.7 未完成项。
- ⚠️ 可试用：命令可运行，但涉及 Autopilot / mode loop / scope help 等未 stable 能力。
- ❌ 暂不默认路由：需要先补齐 §0.7。

| 用户原话（中文） | 期望命令 | 当前标注 |
|---|---|---|
| 把 docs/prd.md 里的需求都实现了 | `fastcar-cli auto-iterate --check --json-progress` → Worker 可用后 `fastcar-cli auto-iterate --run --autopilot --from docs/prd.md --json-progress` | ⚠️ 可试用：Autopilot loop 未 stable |
| 实现这个 PRD / 根据这个文档实现 | 同上 | ⚠️ 可试用 |
| 一直修到测试通过 / 修到通过为止 | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --diagnose --goal "<问题描述>" --validate-cmd "npm test" --json-progress` | ⚠️ 可试用：真实终端 stable UX 未验收 |
| 验收这个 PRD / 检查是否完成 | `fastcar-cli auto-iterate --validate-state <session> --strict-state`（不启动循环；如果用户只给 PRD 文件，使用下一行 verify 命令） | ✅ 可默认路由 |
| 只规划不要写代码 | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --once --plan-only --from <file> --json-progress` | ✅ 可默认路由：plan 单轮、deny-write、`skipped(plan_mode)` 已落地 |
| 优化 src/order 模块 | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --optimize --scope src/order --json-progress` | ⚠️ 可试用：真实终端 stable UX 未验收 |
| 接着上次那个任务推进 / 继续 / 恢复 | `fastcar-cli auto-iterate --list` → `fastcar-cli auto-iterate --resume <last_session> --run --autopilot --json-progress` | ⚠️ 可试用：恢复可用，Autopilot 未 stable |
| 复现下这个 bug / 一直调不出问题在哪 / 性能回退 | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --diagnose --goal "<问题描述>" --json-progress` | ⚠️ 可试用 |
| 验收 / 检查这个 PRD / 看看哪些需求还没实现 | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --once --verify --from <file> --json-progress` | ✅ 可默认路由；默认禁止写 |
| 出个原型 / 先试试看 / 快速验证个思路 | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --prototype --goal "<原型问题>" --scope "prototype/**" --json-progress` | ⚠️ 可试用：prototype 默认 scope 已落地，原型 UX 仍待验收 |
| 列出在跑的任务 | `fastcar-cli auto-iterate --list` | ✅ 可默认路由 |
| 切换到 xxx 任务 | `fastcar-cli auto-iterate --switch <name>` | ✅ 可默认路由 |
| 启动一个自动迭代任务 / 帮我开个任务 | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --goal "<推断的目标>" --json-progress` | ⚠️ 可试用 |
| 端到端实现 / 全自动开发 | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --from <文档或推断> --json-progress` | ⚠️ 可试用 |

英文近义句示例（避免 Router LLM 卡在不完全匹配上）：

- "Implement everything in docs/prd.md" → 同「实现这个 PRD」
- "Keep fixing until tests pass" → 同「一直修到测试通过」
- "Just plan, do not code" → 同「只规划不要写代码」
- "Verify whether the PRD is done" → 同「验收这个 PRD」
- "Resume my last task" → 同「接着上次那个任务推进」

---

## 附录 B：mode 代码实现划分（历史重构参考）

当前代码事实：mode-specific 行为由 `src/pipeline/loopPolicy.js`、`src/pipeline/pickFocus.js`、`src/pipeline/mergeState.js` 和 `src/pipeline/runPipeline.js` 集中协作完成，仓库中没有 `src/pipeline/loops/` 目录，也没有 `runDefaultLoop` / `runPlanOnce` / `runReproduceFirst` 函数。下表仅保留为后续重构参考，不代表当前必须实现的文件清单。

如果未来为了降低 `runPipeline.js` 复杂度而拆分 loops，可参考以下划分：

| 文件 | 负责 mode | 说明 |
|---|---|---|
| `src/pipeline/loops/defaultLoop.js` | strict / quick | 默认 implement → fix → harden → optimize 全流程 |
| `src/pipeline/loops/diagnoseLoop.js` | diagnose | 额外的 `runReproduceFirst` 前置阶段 |
| `src/pipeline/loops/verifyLoop.js` | verify | deny-write；只跑 `verify_req` focus |
| `src/pipeline/loops/planOnce.js` | plan | 只跑一轮，产出 `plan.md`，不进循环 |
| `src/pipeline/loops/optimizeLoop.js` | optimize | 首轮 baseline，后续轮比较验证 |
| `src/pipeline/loops/prototypeLoop.js` | prototype | 范围限 `prototype/**`，原型启动验证 |

公共模块（设想中的 `runPipeline.js` 作为入口分发）：

```
src/pipeline/runPipeline.js              # 入口，根据 state.mode 分发到 loops/*
src/pipeline/common/iterationCore.js     # spawnSync + parseResult + cliValidation + merge + emit
src/pipeline/common/writeGuard.js        # deny-write / scope 检查
src/pipeline/pickFocus.js                # 内部按 mode 分枝
src/pipeline/shouldStop.js               # 同上
```

这样每个 `loops/*.js` 只需要调 `iterationCore` + 定义本 mode 的 focus 选择与停止条件。是否拆分应以当前测试覆盖和维护收益为准，不应为了匹配本附录而做无行为收益的目录迁移。

---

## 附录 C：相关代码位置索引（写给后续 PR 作者）

| 代码 | 位置 |
|---|---|
| 旧大 prompt 构造 | `src/auto-iterate.js:3885-` `buildPromptContent` |
| Worker prompt 模板（新迭代 prompt 的参考） | `src/auto-iterate.js:1963-` `buildWorkerPrompt` |
| state.json 构造 | `src/auto-iterate.js:3195-` `buildStateModel` |
| state.json schema 校验 | `src/auto-iterate.js:2731-` `validateStateJsonModel` |
| 现有 Worker spawnSync | `src/auto-iterate.js` `initDispatch` 内 |
| 适配器配置原型 | `src/auto-iterate.js:191-` `DISPATCH_AGENT_CONFIGS` |
| **mode 配置表** | `src/auto-iterate.js:62-133` `MODE_CONFIGS` |
| **mode 提示词生成** | `src/auto-iterate.js:3119-` `buildModeInstructions` |
| **mode 默认值注入** | `src/auto-iterate.js:3165-` `withModeDefaults` |
| 原子写状态 | `src/auto-iterate.js:2721-` `writeJsonFileAtomic` |
| finalize（收尾） | `src/auto-iterate.js:5451-` `finalizeAutoIterateSession` |
| 入口分发 | `src/auto-iterate.js:5493-` `initAutoIterate` |
| 命令行解析 | `src/auto-iterate.js:319-755` `parseArgs` |
| **Pipeline 适配器工厂** | `src/adapters/index.js:41-72` `getAdapter` |
| **Pipeline 跨平台命令解析** | `src/adapters/commandResolver.js` |
| **Pipeline loop 策略** | `src/pipeline/loopPolicy.js` `resolveLoopPolicy` |
| **Pipeline flag 注册表** | `src/pipeline/flags.js` `FLAG_REGISTRY` |
| **Pipeline Router UX** | `src/pipeline/routerUx.js` |

后续 PR 直接复用这些函数，不重写。
