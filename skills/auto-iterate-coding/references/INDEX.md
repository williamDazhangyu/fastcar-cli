# 引用索引

只读取当前阶段需要的文件；不要一次性加载全部 references。

| 文件 | 触发条件 | 优先级 | 用途 |
| --- | --- | --- | --- |
| `requirement-to-implementation.md` | 新功能、PRD、文档实现、严格启动 | 必读 | 需求规格化、现状探索、脚手架优先、垂直切片 |
| `natural-language-routing.md` | 用户用自然语言启动、恢复、规划、验收、诊断、原型或优化任务 | 必读 | 将用户说法映射为 CLI 命令、预算和 session |
| `feedback-loop.md` | bug、测试失败、性能回归、Autopilot | 必读 | 建立可重复 pass/fail 信号和假设驱动调试 |
| `real-testing.md` | 需要验证、沙箱、外部资源判断 | 必读 | 区分真实验证、沙箱验证和未验证项 |
| `stop-conditions.md` | 每轮继续前、预算耗尽、阻塞、风险上升 | 必读 | 判断继续、收窄、请求用户或提前停止 |
| `final-delivery.md` | 交付前 | 必读 | 成功交付、有限成功、提前停止和验证证据 |
| `state-schema.md` | 维护、恢复或校验 session state | 必读 | 固定 state.json 强约束、state.md 生成视图和兼容恢复规则 |
| `tdd-vertical-slices.md` | 新功能、bug 修复、需要 test-first | 按需 | 行为测试、tracer bullet、避免横向切片 |
| `test-quality.md` | 测试设计或评审 | 按需 | 判断测试是否验证行为而非实现细节 |
| `two-axis-review.md` | Verify-only、PRD 验收、Review since X、交付前复核 | 按需 | 分离 Standards 规范符合度和 Spec 需求符合度，避免一个轴掩盖另一个轴 |
| `mocking-boundaries.md` | 需要 mock、替身或外部依赖 | 按需 | 决定 mock 边界和真实依赖替代 |
| `prototype-clarification.md` | 状态机、数据模型、UI 方向不确定 | 按需 | 一次性逻辑原型或 UI 原型规则 |
| `architecture-friction.md` | 没有 test seam、patch 扩散、远处失败 | 遇到时读 | 识别架构摩擦并停止自动修补 |
| `architecture-language.md` | 需要描述 module/interface/seam | 遇到时读 | 统一架构术语 |
| `interface-and-seams.md` | 需要设计可测试接口或 adapter | 遇到时读 | interface、seam、adapter 设计 |
| `refactor-candidates.md` | GREEN 后考虑重构 | 按需 | 识别安全重构和 deep module 机会 |
| `recursive-optimization.md` | 初版验证通过后优化 | 按需 | 有边界递归优化 |
| `plain-optimization.md` | 低风险整理、类型/枚举/常量收敛 | 按需 | 朴素低风险优化 |
| `progress-visualization.md` | 长任务、用户询问进度、最终图示 | 可选 | Mermaid 和纯文本进度图 |
| `sub-agent-concurrency.md` | `子 Agent/并行：available`、探索/验证/需求/实现阶段、Autopilot、`--validate-state`、`--dispatch` | 按需 | 并发调度规则、Codex CLI worker adapter、四阶段 Fan-out、安全约束、合并规则、Session 隔离、session 基线与 sub-agent state 校验 |

## 推荐读取组合

- 严格实现 / Autopilot：`requirement-to-implementation.md`、`feedback-loop.md`、`real-testing.md`、`stop-conditions.md`、`final-delivery.md`，交付前按需读取 `two-axis-review.md`。
- Diagnose：`feedback-loop.md`、`tdd-vertical-slices.md`、`real-testing.md`、`stop-conditions.md`、`final-delivery.md`。
- Verify-only：`real-testing.md`、`two-axis-review.md`、`stop-conditions.md`、`final-delivery.md`。
- Prototype-only：`prototype-clarification.md`、必要时 `progress-visualization.md`。
- Optimization-only：`recursive-optimization.md` 或 `plain-optimization.md`，再配合 `real-testing.md` 和 `stop-conditions.md`。
- State / sub-agent 校验：`natural-language-routing.md`、`state-schema.md`、`sub-agent-concurrency.md`。
