# Natural Language Routing

用于把用户自然语言请求映射为 `fastcar-cli auto-iterate ...` 命令。Agent 只有在用户表达“帮我启动/生成/恢复/切换/检查/规划/诊断/原型/优化”时才执行命令；如果只是询问命令含义，只解释不执行。

## 执行原则

- 优先用用户原话推断 `mode`、`goal`、`from`、`session`、迭代预算和是否允许修改。
- 用户已明确目标、文件路径或 session 名时，不要重复询问。
- 只有缺少会影响安全、兼容性或外部资源的关键信息时，才向用户提问。
- 自动模式的 `--run --json-progress` 命令不追加 `--yes`；手动 / fallback 启动命令会创建或更新 session，自动调用时追加 `--yes --no-run`，避免卡在 CLI 交互提示并明确禁止进入 Worker pipeline。`--list`、`--switch`、`--resume`、`--validate-state` 不追加 `--yes`。
- 每次自然语言路由启动新任务时都必须显式传入 `--session <name>`；用户未指定时，Agent 生成英文小写、数字和连字符组成的默认 session 名。`--validate-state` 复用已有 session 或 state 文件，不创建新 session。
- 自动模式下，`--run --json-progress` 的 NDJSON 事件流是后续执行依据；Router 只转述进度并在 `need_decision` 时询问用户。
- 手动 / fallback 模式下，调用不带 `--run` 的启动命令后，才把 CLI 输出的启动提示词作为后续执行依据。
- 调用命令或无 CLI fallback 创建状态后，必须先在对话中输出 auto-iterate 激活声明，列出 mode、session、state 文件、current 指针、状态持久化能力和下一步最小动作。
- 如果没有 session state、start-prompt 或 current 指针，不得把当前会话内的多轮修改称为完整 auto-iterate session；必须标记为 degraded / not_available。
- CLI 驱动 `--run` 路径必须非交互；未显式传 mode 且无 `--from` 时 CLI 默认 quick，带 `--from` 时默认 strict。Router 仍应优先显式传入推断出的 mode，便于状态和事件可读。

## Goal 术语边界

本协议中的 `goal` 可能出现在不同上下文，含义不同。Agent 必须先判断用户说的是哪一种，不得把一种 `goal` 能力伪装成另一种：

- Codex `/goal`：交互式 Codex 的会话级目标入口，用于记录当前整体 objective、status 和可选 token_budget。它适合承载“这次对话/任务最终要达成什么”。
- `fastcar-cli auto-iterate --goal "<目标>"`：这是 fastcar-cli 的目标文本参数，只负责把简短目标写入自动迭代 session 和启动提示。
- `Goal: <文本>` 或 `Goal：<文本>`：这是普通提示词内容。fastcar-cli 可以把位置参数里的该前缀清洗成目标文本，但它不会自动创建 Codex goal，也不会改变 Codex 运行时的 goal 状态。
- Codex goal 模型：这是 Codex 运行时提供的任务目标状态能力，通常包含 objective、status、可选 token_budget 和完成/阻塞状态。交互式 Codex 中通过输入 `/goal` 使用该入口；不能通过普通提示词、`codex goal` 子命令或 `fastcar-cli --goal` 强制启用。
- “Codex goal 处理/接手”：如果用户说的是当前 Codex 会话的整体目标，优先使用可用的 Codex goal 模型记录或读取目标；如果用户说的是把某个 auto-iterate session 的 REQ 或子任务交给另一个 Codex worker，则按 `fastcar-cli auto-iterate --dispatch ... --agent codex ...` 处理。

推荐组合方式：

```text
1. 先在交互式 Codex 输入 /goal，设置会话级整体目标。
2. 再运行 fastcar-cli auto-iterate --check --json-progress。
3. Worker 可用时运行 fastcar-cli auto-iterate --run --autopilot --quick --goal "<同一目标摘要>" --session <session> --json-progress；Worker 不可用或用户要求手动时，才运行 fastcar-cli auto-iterate --quick --goal "<同一目标摘要>" --session <session> --yes --no-run。
4. Codex /goal 只记录会话级目标和高层状态；auto-iterate state.json 记录 session、mode、预算、RCM、验证证据、恢复状态和交付门禁。
5. 只有 state.json 中关键需求、验证、清理、Skill Capture 和 post-agent gate 满足交付条件后，才把 Codex goal 标记为 complete。
```

执行规则：

- 在交互式 Codex 中，使用 `/goal` 创建、查看或更新当前 goal；如果需要先确认本地版本是否启用该能力，可运行 `codex features list` 并确认 `goals` 为 `stable true`。
- 不要仅因为 `codex --help` 或 `codex exec --help` 没有 `goal` 子命令就判定 goal 模型不可用；`/goal` 是交互式入口，不是独立 CLI 子命令。
- 如果当前 Codex 运行时提供 goal 能力，启动长任务或用户明确要求使用 goal 模型时，可通过 `/goal` 创建或读取当前 goal，并把 objective 与 auto-iterate session 的 `task.goal` 保持语义一致。
- Codex goal 的 `status=complete` 只能在用户目标真实完成且无需继续工作时设置；`status=blocked` 只能在同一阻塞条件连续出现并且无用户输入或外部状态变化就无法继续时设置。
- 如果当前环境没有 Codex goal 能力，必须说明不可用并降级为普通 prompt、`codex exec`、客户端可粘贴文本或 `fastcar-cli auto-iterate --goal`；不得声称已经创建或更新 Codex goal。
- 如果用户只是说“让 auto-iterate goal 处理”，按父任务启动映射为 `--goal` 参数。
- 如果用户说“让 Codex goal 处理 <session> 的 <REQ>”，通常按 Codex worker dispatch 处理，并优先 dry-run 生成 prompt；只有用户明确指当前会话的整体目标时，才使用 Codex goal 模型。
- 不要用 `/goal` 替代 auto-iterate session；`/goal` 不创建 `.agent-state/auto-iterate/<session>/state.json`，也不记录 RCM、验证证据或恢复指针。

## 自动 / 手动模式映射表

自然语言启动类请求默认走自动模式（路径 A）：Router 先运行 `fastcar-cli auto-iterate --check --json-progress`，只有 Worker 可用且用户没有要求手动模式时，才运行第二条 `--run --json-progress` 命令。手动模式（路径 B）只在用户显式要求 `--no-run`、Worker 不可用、CLI 不支持目标 flag 或运行环境不能 spawn Worker 时使用。

| 用户说法 | 自动模式（路径 A：CLI 驱动） | 手动 / fallback（路径 B：Agent 自治） |
| --- | --- | --- |
| “快速开始修这个问题” / “开一个自动迭代任务” / “让 auto-iterate goal 处理 <目标>” / “启动 auto-iterate goal：<目标>” | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --quick --goal "<目标>" --session <session> --json-progress` | `fastcar-cli auto-iterate --quick --goal "<目标>" --session <session> --yes --no-run` |
| “完整实现这个文档” / “把文档里的需求都做完” | 文档路径明确时：`fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --strict --from <文档路径> --session <session> --json-progress`；不能确定时先搜索或询问文档路径 | `fastcar-cli auto-iterate --strict --from <文档路径> --session <session> --yes --no-run` |
| “完整实现 docs” / “实现 docs 文档” | 先确认 `docs` 是文件还是目录；如果是目录，先找候选需求文档，再按上一行 `--from <文档路径>` 启动自动模式 | 先确认具体文档路径，再用 `--strict --from <文档路径> --yes --no-run` |
| “根据 docs/prd.md 全部实现” / “按 docs/prd.md 做完” | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --strict --from docs/prd.md --session <session> --json-progress` | `fastcar-cli auto-iterate --strict --from docs/prd.md --session <session> --yes --no-run` |
| “严格按这个 PRD 做” / “完整实现这个文档” | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --strict --from <文档路径> --session <session> --json-progress` | `fastcar-cli auto-iterate --strict --from <文档路径> --session <session> --yes --no-run` |
| “检查这个 PRD 是否实现了，不要改代码” / “帮我验收” | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --once --verify --from <文档路径> --session <session> --json-progress` | `fastcar-cli auto-iterate --verify --from <文档路径> --session <session> --yes --no-run` |
| “诊断这个 bug” / “debug 这个问题” / “先复现再修” | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --diagnose --goal "<目标>" --session <session> --json-progress` | `fastcar-cli auto-iterate --diagnose --goal "<目标>" --session <session> --yes --no-run` |
| “诊断 npm test 失败” / “flaky 测试” | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --diagnose --goal "<目标>" --session <session> --validate-cmd "npm test" --json-progress`（若用户给出其它验证命令则替换） | `fastcar-cli auto-iterate --diagnose --goal "<目标>" --session <session> --yes --no-run` |
| “只帮我规划一下，不要写代码” | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --once --plan-only --goal "<目标>" --session <session> --json-progress` | `fastcar-cli auto-iterate --plan-only --goal "<目标>" --session <session> --yes --no-run` |
| “先做原型验证状态机” / “做一次性原型” | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --prototype --goal "<目标>" --session <session> --json-progress` | `fastcar-cli auto-iterate --prototype --goal "<目标>" --session <session> --yes --no-run` |
| “试几个 UI 方案” / “做 UI 原型” | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --prototype --goal "<目标>" --session <session> --json-progress` | `fastcar-cli auto-iterate --prototype --goal "<目标>" --session <session> --yes --no-run` |
| “优化这个模块” / “提升性能但别改行为” | `fastcar-cli auto-iterate --check --json-progress` → `fastcar-cli auto-iterate --run --autopilot --optimize --goal "<目标>" --session <session> --json-progress` | `fastcar-cli auto-iterate --optimize --goal "<目标>" --session <session> --yes --no-run` |
| “校验自动迭代 state” / “检查 session 是否一致” / “检查 sub-agent 协议一致性” | 不启动自动流水线；能确定 session 或 state 路径时调用 `fastcar-cli auto-iterate --validate-state <session|state.md|state.json>`，不能确定时先运行 `--list` 或询问 | 同自动模式；这是只读管理命令，不属于 fallback 执行循环 |
| “校验当前自动迭代 state” / “检查当前 session 状态” | `fastcar-cli auto-iterate --validate-state` | 同自动模式 |
| “让 Codex goal 处理 REQ-001” / “派发给 Codex worker” | 默认将“Codex goal”理解为 Codex worker / dispatch 口语；调用 `fastcar-cli auto-iterate --dispatch <session> --agent codex --task "<子任务>" --files "<白名单>" --verify-command "<验证命令>" --dry-run`；确认 prompt 后再去掉 `--dry-run` 并配置 `AUTO_ITERATE_CODEX_CMD` | 同自动模式；`--dispatch` 是独立子任务派发，不是路径 A/B 主循环 |
| “让 Claude Code 处理 REQ-001” / “派发给 Gemini/Kimi/Cursor worker” | `fastcar-cli auto-iterate --dispatch <session> --agent <claude|gemini|kimi|cursor|windsurf|copilot|jules|devin|openhands|replit> --task "<子任务>" --files "<白名单>" --verify-command "<验证命令>" --dry-run`；确认 prompt 后再配置对应 `AUTO_ITERATE_<AGENT>_CMD` | 同自动模式；`--dispatch` 是独立子任务派发，不是路径 A/B 主循环 |
| “列出自动迭代任务” | `fastcar-cli auto-iterate --list` | 同自动模式；session 管理命令不追加 `--yes` |
| “切换到登录修复任务” | `fastcar-cli auto-iterate --switch <session>` | 同自动模式；session 管理命令不追加 `--yes` |
| “恢复登录修复任务” | 先 `fastcar-cli auto-iterate --list` 匹配 session，再 `fastcar-cli auto-iterate --resume <session> --run --autopilot --json-progress` | `fastcar-cli auto-iterate --resume <session>`；若用户明确手动继续，再按当前会话协议执行 |
| “session 叫 login-bugfix” | 在第二条 `--run` 命令中追加 `--session login-bugfix` | 在 fallback 启动命令中追加 `--session login-bugfix` |
| “最多迭代 5 次” / “最多跑 5 轮” | 在第二条 `--run` 命令中追加 `--autopilot-max-iterations 5` | 在 fallback 启动命令中追加 `--autopilot-max-iterations 5` |
| “最少迭代 5 次” / “至少跑 5 轮” / “最少 5 轮” | 不要映射为 `--autopilot-max-iterations 5`；启动后由 CLI/state 记录 `minimum_implementation_iterations=5`，继续使用默认或用户另给的最大预算 | 不要映射为 `--autopilot-max-iterations 5`；启动后由 Agent 在 state 的 `minimum_implementation_iterations` 记录 5 |
| “普通预算 50 轮” / “max_iterations 50” | 在第二条 `--run` 命令中追加 `--max-iterations 50` | 在 fallback 启动命令中追加 `--max-iterations 50` |
| “Autopilot 预算 10 轮” | 在第二条 `--run` 命令中追加 `--autopilot-max-iterations 10` | 在 fallback 启动命令中追加 `--autopilot-max-iterations 10` |
## 手动模式 / fallback 路径映射

以下说法表示用户**主动要求**走路径 B（Agent 自治执行，不 spawn 子 Worker），Agent 应在对应启动命令中追加 `--no-run`。

| 用户说法 | Agent 行为 |
| --- | --- |
| "手动模式" / "我自己来" / "在当前对话里执行" | 在已推断出的 mode 命令中追加 `--no-run` |
| "不要 spawn worker" / "不用子 Agent" / "不走 CLI 驱动" | 在已推断出的 mode 命令中追加 `--no-run` |
| "用老路径" / "旧模式" / "fallback 模式" / "无 CLI fallback" | 在已推断出的 mode 命令中追加 `--no-run` |
| "不要自动迭代流水线" / "不要 --run" | 在已推断出的 mode 命令中追加 `--no-run` |
| "生成大 prompt 我自己跑" / "把 start-prompt 给我" | 对应 mode 命令 + `--no-run`；CLI 输出后把 `start-prompt.md` 内容呈现给用户 |
| "你直接改，不要调外部工具" | 对应 mode 命令 + `--no-run` |

注意：

- 手动模式通常与具体任务意图同时出现（例如"快速修复登录问题，手动模式"）。Agent 先按"意图判断顺序"推断 mode 和参数，再追加 `--no-run`。
- 如果用户只说了"手动模式"但未给任务目标，先追问目标，再追加 `--no-run`。
- 被动降级（`--check` 返回无可用 Worker、环境无法 spawn、CLI 版本不支持目标 flag）不需要用户开口，Agent 自动走路径 B，并在启动命令中追加 `--yes --no-run`，让命令形态明确表达“不是 Worker pipeline”。


## 意图判断顺序

## Few-shot 路由优化

自然语言路由应先执行“意图判断顺序”和硬约束，再使用 few-shot 样本做贴近表达的类比。few-shot 只用于帮助 Agent 识别用户说法和命令形态，不得覆盖下列硬规则：

- CLI 驱动路径仍必须先执行 `fastcar-cli auto-iterate --check --json-progress`，Worker 可用且用户未要求手动模式时，才进入 `--run --json-progress`。
- 用户明确说“手动模式”“不走 CLI 驱动”“不按固定流程”“只遵从协议规范执行”“不要 spawn worker”时，必须追加 `--no-run`，不得再追加 `--run`。
- `Route` 样本是目标命令形态；用户未提供 session 时，Agent 必须生成新的 `--session <session>`，不要照抄样本里的占位 session。
- few-shot 中的资源限制、兼容性要求和禁止事项必须进入 `--goal`、启动 state 或后续执行约束，不得因为样本命令较短而丢失。
- 样本冲突时按“意图判断顺序”裁决；例如“验收且不要改代码”优先 `--verify`，不是 quick 修复。

可通过 `fastcar-cli auto-iterate --examples` 查看当前 few-shot 路由样本；按关键词可筛选，例如 `fastcar-cli auto-iterate --examples protocol-only`、`fastcar-cli auto-iterate --examples dispatch`、`fastcar-cli auto-iterate --examples 验收`。

```text
0. 明确要求手动模式 / 不走 CLI 驱动 / 不要 spawn worker：在后续推断出的命令中追加 --no-run
1. state 校验：validate-state
2. session 管理：列出 / 切换 / 恢复
3. 明确派发给 Codex / worker / goal：dispatch；这里的 goal 多数是口语，不等于当前会话 Codex goal 模型
4. 明确禁止修改：verify 或 plan-only
5. 明确要求诊断、debug、复现、flaky、性能回归：diagnose
6. 明确要求原型、试方案、验证状态机、验证数据模型：prototype
7. 明确要求规划：plan-only
8. 明确要求验收/检查完成度：verify
9. 明确要求优化/重构且保持行为：optimize
10. 提供长文档、PRD、issue 路径：优先 --from
11. 默认小中型目标：quick
12. 明确生产、完整、严格、复杂：strict
```

## 预算推断

- 用户说“最多迭代 N 次 / 最多跑 N 轮 / 自动修 N 轮以内”时，优先映射为 `--autopilot-max-iterations N`。
- 用户说“最少迭代 N 次 / 至少跑 N 轮 / 最少 N 轮”时，N 是下限检查点，不是上限预算；不得映射为 `--autopilot-max-iterations N`，也不得解释为“仅 N 轮”。
- 当前 CLI 没有最小轮次参数时，先按正常模式启动命令，使用默认或用户另给的最大预算；启动后必须在 state 的 `minimum_implementation_iterations` 和预算追加记录中写入 N。
- 用户同时给出“最少 A 轮”和“最多 B 轮”时，A 是下限、B 是上限；若 `A > B`，必须先请求用户澄清或追加最大预算，不得自动把 A 当成 B。
- 用户明确说 `max_iterations`、普通预算、总预算时，映射为 `--max-iterations N`。
- 用户同时给出普通预算和 Autopilot 预算时，同时追加两个参数。
- 用户没有给预算时，不要追问，使用 CLI 默认值。
- 未带“最少/至少”修饰的迭代次数是安全预算，不是必须执行次数；不要为了消耗预算而继续修改。
- 达到 `minimum_implementation_iterations` 前，不能只因局部测试通过就交付；如果完整任务已通过，剩余轮次应转为有意义的验证、清理、边界检查或风险复核，不能制造无效 patch。

## Session 推断

- 用户明确说“session 叫 X”时使用 `--session X`。
- 用户没给 session 时，Agent 必须生成一个默认 session 名并显式传给 CLI，不要省略 `--session`。
- 默认 session 名使用英文小写、数字和连字符，优先由模式和目标关键词组成，例如 `quick-login-bugfix`、`diagnose-flaky-e2e`、`prototype-order-state-machine`、`verify-prd-check`。
- 如果生成后发现 session 已存在，优先追加短后缀或时间语义后缀生成新 session；不要覆盖历史 session，除非用户明确要求。
- 如果用户说的是“登录修复任务”“PRD 验收任务”等自然名称，Agent 应优先尝试从已有 session 中匹配；不确定时先运行 `fastcar-cli auto-iterate --list`。

## 示例

```text
用户：帮我快速启动自动迭代，修复登录失败，session 叫 login-bugfix
Agent：fastcar-cli auto-iterate --check --json-progress -> fastcar-cli auto-iterate --run --autopilot --quick --goal "修复登录失败" --session login-bugfix --json-progress

用户：让 auto-iterate goal 处理：修复登录失败，session 叫 login-bugfix
Agent：fastcar-cli auto-iterate --check --json-progress -> fastcar-cli auto-iterate --run --autopilot --quick --goal "修复登录失败" --session login-bugfix --json-progress

用户：启动 auto-iterate goal：按 docs/impl/agent-generation-contract-P0-spec.md 有界自动迭代实现 Agent 生图 P0，session 叫 agent-generation-p0
Agent：fastcar-cli auto-iterate --check --json-progress -> fastcar-cli auto-iterate --run --autopilot --quick --goal "按 docs/impl/agent-generation-contract-P0-spec.md 有界自动迭代实现 Agent 生图 P0" --session agent-generation-p0 --json-progress

用户：帮我快速启动自动迭代，修复登录失败，最多跑 5 轮，session 叫 login-bugfix
Agent：fastcar-cli auto-iterate --check --json-progress -> fastcar-cli auto-iterate --run --autopilot --quick --goal "修复登录失败" --session login-bugfix --autopilot-max-iterations 5 --json-progress

用户：帮我快速启动自动迭代，修复登录失败，最少跑 5 轮，session 叫 login-bugfix
Agent：fastcar-cli auto-iterate --check --json-progress -> fastcar-cli auto-iterate --run --autopilot --quick --goal "修复登录失败" --session login-bugfix --json-progress；启动后在 state 记录 `minimum_implementation_iterations：5`，不要追加 `--autopilot-max-iterations 5`

用户：帮我验收 docs/prd.md，不要改代码，session 叫 prd-check
Agent：fastcar-cli auto-iterate --check --json-progress -> fastcar-cli auto-iterate --run --once --verify --from docs/prd.md --session prd-check --json-progress

用户：帮我诊断登录偶发失败，先复现再修，session 叫 login-diagnose
Agent：fastcar-cli auto-iterate --check --json-progress -> fastcar-cli auto-iterate --run --autopilot --diagnose --goal "诊断登录偶发失败，先复现再修" --session login-diagnose --json-progress

用户：先做一个逻辑原型验证订单状态机，session 叫 order-prototype
Agent：fastcar-cli auto-iterate --check --json-progress -> fastcar-cli auto-iterate --run --autopilot --prototype --goal "验证订单状态机" --session order-prototype --json-progress

用户：恢复登录修复任务
Agent：先运行 fastcar-cli auto-iterate --list 匹配 session；如果唯一匹配 login-bugfix，则运行 fastcar-cli auto-iterate --resume login-bugfix

用户：检查 login-bugfix 的 sub-agent 协议一致性
Agent：fastcar-cli auto-iterate --validate-state login-bugfix

用户：检查当前自动迭代 state 是否一致
Agent：fastcar-cli auto-iterate --validate-state

用户：校验 login-bugfix 整个自动迭代 session 是否一致
Agent：fastcar-cli auto-iterate --validate-state login-bugfix

用户：让 Codex goal 处理 login-bugfix 的 REQ-001，只能改 src/auth.js 和 test/auth.test.js
Agent：fastcar-cli auto-iterate --dispatch login-bugfix --agent codex --task "处理 REQ-001" --files "src/auth.js,test/auth.test.js" --verify-command "npm test" --dry-run

用户：派发给 Codex worker：session 是 login-bugfix，任务是修复登录 token 过期问题，只允许改 src/auth.js,test/auth.test.js，跑 npm test
Agent：fastcar-cli auto-iterate --dispatch login-bugfix --agent codex --task "修复登录 token 过期问题" --files "src/auth.js,test/auth.test.js" --verify-command "npm test" --dry-run

用户：让 Codex goal 接手当前自动迭代任务的 REQ-002，文件白名单是 src/auto-iterate.js 和 test/auto-iterate-doc-reliability.test.js，先生成 worker prompt 不实际执行
Agent：fastcar-cli auto-iterate --dispatch --agent codex --task "处理 REQ-002" --files "src/auto-iterate.js,test/auto-iterate-doc-reliability.test.js" --verify-command "npm test" --dry-run

用户：用 Codex worker 处理 dispatch-codex 这个 session 的“补充 resume 降级测试”，只能改 test/auto-iterate-doc-reliability.test.js，验证命令 npm test
Agent：fastcar-cli auto-iterate --dispatch dispatch-codex --agent codex --task "补充 resume 降级测试" --files "test/auto-iterate-doc-reliability.test.js" --verify-command "npm test" --dry-run

用户：确认 prompt 后，让本地 Codex 真实执行这个 worker
Agent：先在当前 shell 设置 `AUTO_ITERATE_CODEX_CMD='codex exec --cd . --sandbox workspace-write -o "{result}" - < "{prompt}"'`，再运行同一条 `--dispatch ...` 命令并去掉 `--dry-run`

用户：确认 prompt 后，让本地 Kimi 真实执行这个 worker
Agent：优先使用 `fastcar-cli auto-iterate --run --agent kimi --json-progress ...` 的内置受限 Kimi Worker；旧 `--dispatch` 路径需要显式配置 `AUTO_ITERATE_KIMI_CMD='kimi --quiet --afk --no-thinking --max-steps-per-turn 8 --max-ralph-iterations 0 --agent-file src/adapters/kimi-worker-agent.yaml --work-dir . -p "@{prompt}"'` 后再去掉 `--dry-run`

父任务启动推荐句式：让 auto-iterate goal 处理：<目标>，session 叫 <session>。

Codex `/goal` + auto-iterate 推荐句式：先在交互式 Codex 输入 `/goal`，把当前 Codex goal 设为：<整体目标>；再执行 `fastcar-cli auto-iterate --check --json-progress`，Worker 可用时启动 `fastcar-cli auto-iterate --run --autopilot --quick --goal "<同一目标摘要>" --session <session> --json-progress`。Worker 不可用或用户要求手动时，才使用 `fastcar-cli auto-iterate --quick --goal "<同一目标摘要>" --session <session> --yes --no-run`。

子任务派发推荐句式：让 Codex worker 处理 <session> 的 <REQ 或子任务>，只能改 <文件白名单>，验证命令 <命令>，先 dry-run。兼容旧口语“让 Codex goal 处理”，但必须先判断是当前会话 goal 还是 worker dispatch；不得把 `fastcar-cli --goal` 伪装成 Codex goal 模型。

真实执行句式：确认 prompt 后用本地 Codex/Kimi 执行；如果没有配置 `AUTO_ITERATE_CODEX_CMD` 或 `AUTO_ITERATE_KIMI_CMD`，先只生成 prompt，不要猜测交互式命令。
```
