# 引用索引

只读取当前阶段需要的文件；不要一次性加载全部 references。

## 契约（Contracts）

契约文档定义机器可检查的硬约束，不使用解释性散文。

| 文件 | 触发条件 | 优先级 | 用途 |
| --- | --- | --- | --- |
| `../contracts/output-discipline-contract.md` | 每轮输出前、交付前、看门狗检查 | 必读 | 输出纪律硬性规则：角色输出规则、中间进展模板、禁止输出清单、违规检测 |
| `../contracts/session-contract.md` | 创建、恢复或校验 session | 必读 | 目录结构、state.json 必填字段、枚举白名单、一致性规则 |

## 引用（References）

| 文件 | 触发条件 | 优先级 | 用途 |
| --- | --- | --- | --- |
| `natural-language-routing.md` | 用户用自然语言启动、恢复、规划、验收、诊断、原型或优化任务 | 必读 | 将用户说法映射为 CLI 命令、预算和 session |
| `feedback-loop.md` | bug、测试失败、性能回归、Autopilot、issue 分流、系统视角 | 必读 | 建立可重复 pass/fail 信号、假设驱动调试、Diagnose 六步、Triage 分流、Zoom Out 系统视角 |
| `real-testing.md` | 需要验证、沙箱、外部资源判断 | 必读 | 区分真实验证、沙箱验证和未验证项 |
| `iteration-policy.md` | 每轮实现、失败修复、预算或回滚判断、停止条件、需求到实现、Caveman 超压缩通信 | 必读 | 单轮单目标、变更预算、停止条件与提前停止输出模板、继续前检查、安全回滚、需求规格化、现状探索、架构确认、垂直切片、Caveman Mode |
| `final-delivery.md` | 交付前 | 必读 | 成功交付、有限成功、提前停止和验证证据 |
| `state-schema.md` | 维护、恢复或校验 session state | 必读 | 固定 state.json 强约束、state.md 生成视图、Skill Capture 和兼容恢复规则 |
| `state.schema.json` | 第三方 Agent、测试或文档工具需要读取机器状态 schema | 必读 | 独立 JSON Schema artifact，覆盖 state.json 必填对象、关键枚举和门禁实体 |
| `phase-gates.md` | 自动迭代进入编码、验证、cleanup 或交付前 | 必读 | 阶段状态机、Hard Gate、阻断原因和 post-agent strict 校验循环 |
| `judge-runbook.md` | 默认自动模式、主 Agent 派发 coder、恢复或交付前审计 | 必读 | 主 Agent 裁判步骤、单 coder 运动员边界、validation.log 门禁 |
| `test-quality.md` | 测试设计或评审、新功能 test-first | 按需 | 判断测试是否验证行为而非实现细节、Red-Green-Refactor TDD、垂直切片策略 |
| `advanced-patterns.md` | GREEN 后重构、原型澄清、交付前两轴复核 | 按需 | 三合一进阶模式：Refactor Candidates、Prototype Clarification、Two-Axis Review |
| `interface-and-seams.md` | 需要设计可测试接口、adapter、mock 边界 | 遇到时读 | interface、seam、adapter 设计、mock 原则和边界 |
| `domain-language.md` | 启动握手、RCM 提取、Zoom Out、术语不一致 | 遇到时读 | 领域术语提取、术语表维护、命名和交付总结一致性 |
| `skill-capture.md` | 任务交付、提前停止或阶段性验收后 | 必读 | 技能沉淀规则：正例、反例、`.agents/skills/index.md` 格式契约、与 `fastcar-cli skill install` 的关系 |
| `quick-reference.md` | 首次使用、需要快速查阅 | 可选 | 一页纸快速参考卡：常见场景、核心概念、停止条件、预算默认值 |
| `progress-visualization.md` | 长任务、用户询问进度、最终图示 | 可选 | Mermaid 和纯文本进度图 |
| `grill-session.md` | 启动握手、需求不明确、需要对齐 | 必读 | Agent 主动 interview 用户，9 步 Grill 流程 |

## 推荐读取组合

本节是"按模式和场景选引用"的入口。`auto-iterate-coding` 不是只服务编码任务；只要任务可以拆成目标、约束、验证证据和停止条件，也可以用于写作、文档整理、PRD 评审、研究报告、方案设计、测试计划、Runbook、迁移计划、发布说明等非代码产物。非代码任务的验证证据可以是结构化清单覆盖、事实来源核对、术语一致性检查、可读性审阅、格式校验、链接/命令可用性检查或用户确认的验收标准；不能把"看起来写完了"当作已验证。

### 单一模式

- Quick：`natural-language-routing.md`、`iteration-policy.md`、`feedback-loop.md`、`real-testing.md`、`final-delivery.md`。适合目标明确的小中型改动、文档补丁、示例补全或轻量写作修订；Agent 先从仓库、文档和约定推断流程清单；术语不一致时追加 `domain-language.md`。
- 严格实现 / Autopilot / Strict：`iteration-policy.md`、`feedback-loop.md`、`real-testing.md`、`final-delivery.md`，交付前按需读取 `advanced-patterns.md` §Two-Axis Review。适合 PRD、issue、长清单、生产代码或正式文档的完整实现。
- Autopilot：`iteration-policy.md`、`feedback-loop.md`、`real-testing.md`、`final-delivery.md`，长任务配合 `progress-visualization.md`。适合"完整做完""一直修到通过""迭代 N 次以内"等有边界自动推进任务；预算是上限，不是必须消耗。
- Diagnose：`feedback-loop.md`、`test-quality.md`、`real-testing.md`、`iteration-policy.md`、`final-delivery.md`。适合困难 bug、性能回归、flaky 测试，也适合定位文档生成失败、示例不可运行、发布说明与实际 diff 不一致等非代码问题。
- Verify-only：`real-testing.md`、`advanced-patterns.md` §Two-Axis Review、`iteration-policy.md`、`final-delivery.md`。适合验收 PRD、检查实现完成度、审查文档是否覆盖原始需求、核对写作产物是否满足提纲和事实约束；默认不修改文件。
- Plan-only：`iteration-policy.md`、`interface-and-seams.md`、`final-delivery.md`。适合只规划、不写代码或不改文档的场景，例如模块重构方案、写作大纲、迁移计划、测试策略和调研路线；涉及术语或业务边界时追加 `domain-language.md`。
- Prototype-only：`advanced-patterns.md`、必要时 `progress-visualization.md`。适合正式实现前澄清状态机、数据模型、交互方向、信息架构或文档结构；原型结论未吸收前不能声称生产或正式文档完成。
- Optimization-only：`feedback-loop.md`（朴素优化和递归优化章节），再配合 `real-testing.md` 和 `iteration-policy.md`。适合性能、可维护性、类型、命名、结构和文档清晰度优化；必须保持外部行为或原始含义不变。
- State / sub-agent 校验 / session / validate-state：`natural-language-routing.md`、`state-schema.md`、`state.schema.json`、`phase-gates.md`、`iteration-policy.md`、`final-delivery.md`、`judge-runbook.md`。适合 `--list`、`--switch`、`--resume`、`--validate-state`、state 校验、恢复一致性检查、交付前 strict 门禁和 session 状态审计。
- Native sub-agent：`natural-language-routing.md`、`state-schema.md`、`final-delivery.md`。适合主 Agent 直接派发 `Agent(subagent_type="coder")`；主 Agent 仍负责 Quality Gate、验证命令、write guard、state merge 和最终交付。

### 组合模式

- Quick + Autopilot：用于目标短但需要自动推进的小任务，例如修复一个 CLI 文案错误、补一段文档、更新示例或改写一节指南。读取 Quick 组合后追加 `iteration-policy.md` 和 `final-delivery.md`；若涉及多文件或状态持久化，再读 `state-schema.md`。
- Strict + Autopilot + Requirement Coverage Matrix：用于"根据 PRD/issue/长文档全部实现"或"根据提纲写完整文档"。先用 `iteration-policy.md` 逐条提取需求，再用 `feedback-loop.md` 和 `real-testing.md` 建立代码或非代码验证证据，最后用 `advanced-patterns.md` §Two-Axis Review 做交付前复核。
- Strict + Verify-only：用于验收已有实现、已有文档或已有报告是否满足原始清单。读取 `advanced-patterns.md` §Two-Axis Review 区分规范符合度和需求符合度；只在用户明确允许修复时才转入实现模式。
- Diagnose + Autopilot：用于持续失败信号，例如测试一直失败、构建不稳定、文档生成链路失败、链接校验反复失败或写作输出持续偏离提纲。先建立可重复 feedback loop，再有界修复。
- Plan-only + Strict：用于大任务前的只读设计阶段，例如先规划模块改造、文档重构、白皮书结构、PRD 拆解或迁移路线。Plan-only 阶段不得修改文件；用户确认计划后再启动 Strict 或 Quick。
- Prototype-only + Strict：用于先验证方案再正式吸收，例如 UI 原型、状态机原型、文档信息架构原型、报告章节结构样稿。原型文件必须有清理或吸收计划；正式交付必须回到 Strict/Quick 并重新验证。
- Optimization-only + Verify-only：用于保持行为或含义不变的优化审查，例如代码重构、文档去重、术语统一、章节顺序调整、发布说明压缩。先建立 baseline，再验证外部行为、原始事实和核心含义没有回归。
- Native sub-agent + Strict/Autopilot：用于任务可拆分且文件 ownership 清晰的长任务，例如让 coder 处理单个 REQ 或一个独立文件范围。默认每轮只派发一个 coder；主 Agent 按 `judge-runbook.md` 亲自验证、审计、合并和判定下一步。
- State validate + Resume：用于恢复历史 session、切换任务或交付前审计。先运行或执行等价的 `validate-state` 检查；若 state、current 指针、diff 或最近验证不一致，必须进入 reconcile，而不是继续旧假设。交付前必须读取 `phase-gates.md`、`iteration-policy.md` 和 `final-delivery.md`，strict 校验失败时进入 `postAgentValidationGate.nextAction=context_reset_and_repair`。
- 写作 / 文档生成 + Verify-only：用于文章、指南、PRD、报告、教程、Runbook、README 或发布说明。将提纲、事实约束、目标读者、语气、格式和来源作为 Requirement Coverage Matrix；验证方式包括事实核对、结构覆盖、链接检查、术语一致性和样例可运行性。
- 写作 / 文档生成 + Autopilot：用于"按大纲完整写完""持续改到满足清单""迭代 20 次以内优化文档"。每轮必须围绕一个最小写作目标或验证失败信号推进，例如补缺章节、消除矛盾、压缩重复、增强示例、统一术语或修复格式；不得为了消耗轮次做无意义改写。
- 研究 / 调研 + Plan-only + Verify-only：用于技术选型、方案比较、竞品梳理或事实密集型报告。先规划问题和证据口径，再做只读验证；需要最新外部事实时必须使用可用网络或标记 `not_verified`。
- 任务后 Skill Capture：交付、提前停止或阶段性验收前，按 `final-delivery.md` 和 `state-schema.md` 更新 `Skill Capture / 技能沉淀`，将高价值经验写入 `.agents/skills`，并维护 `.agents/skills/index.md`；没有高价值内容时记录 `skipped_no_high_value`。
