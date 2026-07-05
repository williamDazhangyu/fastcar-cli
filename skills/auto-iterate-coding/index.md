# auto-iterate-coding 目录索引

> 先看这里，按你当前所处阶段点进去，不要一次性加载全部文件。

## 第一次用？

只读 [SKILL.md](./SKILL.md) §执行路径识别 + [references/quick-reference.md](references/quick-reference.md)，然后告诉用户"auto-iterate 已激活"。

## 按执行阶段导航

收到用户任务后，按以下路径找到你需要的文档：

| 阶段 | 你需要做什么 | 读这个 |
|---|---|---|
| **路由** | 用户大白话→判断模式、session、预算 | [references/natural-language-routing.md](references/natural-language-routing.md) |
| **启动握手** | 创建 session、对齐目标、确认预算 | [SKILL.md](./SKILL.md) §启动握手，详细提问模板见 [references/grill-session.md](references/grill-session.md) |
| **能力探测** | 确认当前环境能做什么、降级策略 | [SKILL.md](SKILL.md) §Agent 能力探测与降级 |
| **需求提取** | PRD/文档→Requirement Coverage Matrix | [SKILL.md](SKILL.md) §需求覆盖矩阵 + [references/iteration-policy.md](references/iteration-policy.md) §需求到实现 |
| **术语对齐** | 用户原话/文档/代码→共享领域语言 | [references/domain-language.md](references/domain-language.md) |
| **每轮迭代** | 单轮实现、验证、状态更新 | [references/iteration-policy.md](references/iteration-policy.md)（单轮单目标、变更预算、停止条件） |
| **诊断/Bug** | 复现→最小化→假设→探针→修复→回归 | [references/feedback-loop.md](references/feedback-loop.md) §Diagnose 六步循环 |
| **Issue 分流** | 优先级排序、scope 评估、session 分配 | [references/feedback-loop.md](references/feedback-loop.md) §Triage |
| **写测试** | 好测试/坏测试、TDD 纵切 | [references/test-quality.md](references/test-quality.md) |
| **验证** | 真实验证 vs 推测、验证证据等级 L0-L4 | [references/real-testing.md](references/real-testing.md) |
| **交付** | 交付模板、门禁、提前停止 | [references/final-delivery.md](references/final-delivery.md) |
| **阶段门禁** | 每阶段硬性检查项 | [references/phase-gates.md](references/phase-gates.md) |
| **进阶模式** | 重构候选、原型澄清、两轴复核 | [references/advanced-patterns.md](references/advanced-patterns.md) |
| **风格整理** | 按 skills 规范整理代码 | [SKILL.md](SKILL.md) §核心流程（步骤 14） |
| **技能沉淀** | 高价值经验写入 .agents/skills | [references/skill-capture.md](references/skill-capture.md) |
| **Session 管理** | 列出、切换、恢复、校验 | [references/natural-language-routing.md](references/natural-language-routing.md) + [references/state-schema.md](references/state-schema.md) |
| **主 Agent 裁判** | 派发 coder、校验、合并状态 | [references/judge-runbook.md](references/judge-runbook.md) |
| **Protocol-only** | 无 subagent 时的自律执行 | [SKILL.md](SKILL.md) §Protocol-only / LLM-only 工作流 |
| **速查** | 一页纸速查 | [references/quick-reference.md](references/quick-reference.md) |

## 输出纪律（任何阶段都适用）

Coder 不说话、主 Agent 不思考、进展按模板、交付按模板。完整规则见 [contracts/output-discipline-contract.md](contracts/output-discipline-contract.md)。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `SKILL.md` | 主协议入口 |
| `contracts/` | 机器可检查的硬约束（输出纪律、session 契约） |
| `examples/` | 启动模板、端到端示例 |
| `references/` | 详细流程和规则解释 |
| `changelog.md` | 变更记录 |

> `contracts/` 给机器校验用（决策表、枚举白名单、硬约束），`references/` 给 agent 执行用（流程、解释、示例）。校验前读 contracts/，执行前读 references/。

## 目录全览

详细文件索引和推荐读取组合见 [references/index.md](references/index.md)。

> 旧版 feedback / optimization / compatibility / adapters 文档层已移除。旧 `src/adapters/*` 运行时适配代码已删除，不在 skill 内维护第二套 adapter 文档。
