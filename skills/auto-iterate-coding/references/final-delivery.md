# 最终交付

用于交付总结、验证证据、风险说明和用户验收建议。

## 成功交付模板

不要只说“完成”。必须提供可验收证据。

成功交付前必须先证明完整任务边界已经完成：用户目标、Runbook、MVP 清单、成功标准中的所有关键项均为 `passed`，且状态文件中的 `剩余任务` 为空。阶段完成、最小纵切完成或局部 e2e 通过，只能作为阶段进展，不能作为最终交付。

成功交付前还必须通过交付可验证性检查：最终交付成果必须能被当前环境中的真实验证、用户确认的沙箱验证或明确可复现的验收步骤证明。无法验证、验证条件未知或看门狗处于 triggered 状态时，不得使用成功交付模板。

成功交付前必须完成交付前验证加固：所有关键 REQ `passed` 后，至少完成 `minimum_validation_hardening_iterations`，并覆盖 boundary / negative / regression 维度。无法覆盖的维度必须明确标记为 `blocked / not_available / user_accepted_limited`，否则不得使用成功交付模板。

成功交付前必须完成 Context Reset Review Gate：Agent 必须清空对话实现细节，只依据 `.agent-state/auto-iterate/<session>/state.json`、原始需求、当前代码/diff、真实验证结果、项目规范和相关 skills 重新读取事实，并按 Standards / Spec 两轴复核。发现问题时必须新增或重开 REQ 并回到实现循环；无发现时把 `contextResetReview.status=passed`、`decision=pass`、`reviewCyclesUsed>=1` 写入 state。不得用“我记得已经完成”替代该门禁。

成功交付前必须完成临时产物清理：

- 删除或吸收一次性原型、prototype route、variant switcher、临时 TUI 外壳和 harness。
- 删除所有带唯一前缀的 debug instrumentation，例如 `[DEBUG-...]`。
- 确认没有为了通过验证而留下的硬编码、跳过测试、弱化断言或内部 mock。
- 如果临时产物需要保留，必须说明用户确认的原因、保留位置和后续清理条件。

## Style Consolidation / 技巧风格整理

实现需求的模式（strict、quick、diagnose、prototype）在成功交付前必须完成技巧风格整理：

- 读取本项目 `.agents/skills` 和全局 skills 中与本次代码相关的代码风格、FastCar API 约束、TypeScript 规范、反模式和验证建议。
- 只整理本次需求相关代码，不扩大行为范围，不做无关重构，不引入新依赖，不削弱测试。
- 将整理依据写入 `styleConsolidation.localSkillsReviewed` 和 `styleConsolidation.globalSkillsReviewed`，将采用规则写入 `appliedRules`。
- 整理后必须重新运行相关验证，并把结果写入 `styleConsolidation.verificationSummary`。
- 如果当前任务不是实现需求，或没有可整理代码，标记 `not_applicable` 并记录 `skippedReasons`；如果无法读取 skill 或无法验证，标记 `blocked / not_available`。

## Skill Capture / 技能沉淀

成功交付、提前停止或阶段性验收前必须完成技能沉淀检查：

- 从本次任务的真实失败信号、调试路径、验证策略、框架 API 约束、复用脚手架、反模式和停止条件中提取高价值技能点。
- 只沉淀可复用、可验证、跨任务有价值的技能点，并写入本项目 `.agents/skills` 下的合适 skill 文档。
- 同步维护 `.agents/skills/index.md`，至少包含 skill 名称、适用场景、关键词和文件路径，便于后续查找。
- 不要写入密钥、客户数据、一次性日志、大段源码或只对本次任务有效的流水账。
- 如果没有高价值技能点，必须在 `Skill Capture / 技能沉淀` 中标记 `skipped_no_high_value` 并说明原因；不能写文件时标记 `blocked` 或 `not_available`。

```text
实现了什么：
关键修改位置：
使用的脚手架/模板/生成器：
当前完成阶段：
完整任务清单完成状态：
剩余任务：
可视化进度图：
实现迭代总数：
递归优化轮次：
验证加固轮次：
验证加固覆盖维度：
上下文清空复核：
总循环次数：
保留的优化：
放弃的优化及原因：
运行的真实验证：
是否使用沙箱模拟：
未完成或无法运行的验证：
交付可验证性：verifiable / partially_verifiable
看门狗状态：clear
Context Reset Review Gate：passed
临时产物清理：
技巧风格整理：
技能沉淀：
剩余风险：
建议用户如何验收：
```

交付总结必须区分真实测试、沙箱验证和未验证项。不要把未运行的验证写成已通过。

如果 `剩余任务` 非空，必须使用提前停止模板或阶段进展摘要，不得使用成功交付模板。

如果交付成果无法被验证，必须把它归入提前停止，而不是成功交付。输出中必须说明：哪些成果已实现但未验证、缺少哪类最小验证条件、用户需要如何提供资源或执行验收。

## 提前停止模板

```text
已完成内容：
停止原因：
当前停止阶段：
可视化进度图：
实现迭代总数：
递归优化轮次：
总循环次数：
最后一个关键错误：
已运行的验证：
未运行验证及原因：
交付可验证性：partially_verifiable / not_verifiable / unknown
看门狗触发原因：
已实现但未验证的交付成果：
缺少的最小验证条件：
未清理临时产物：
技能沉淀状态：
需要用户提供的资源或决策：
建议的下一步：
```

## 验证证据要求

列出实际运行过的命令和结果：

- 命令名称。
- 成功或失败。
- 关键输出摘要。
- 如果失败，首个相关错误和下一步。
- 如果跳过，明确原因。
- 如果无法验证最终交付成果，明确标记为 `not_verifiable` 或 `unknown`，并说明最小可验证条件。

不要声称“应该能工作”。只能说“已通过 X 验证”或“未能运行 Y，原因是 Z”。

## 风险表达

剩余风险要具体：

- 哪些行为未覆盖。
- 哪些环境未验证。
- 哪些兼容性仍需用户确认。
- 哪些外部依赖使用了沙箱或 mock。
- 哪些优化被放弃以及为什么。

避免泛泛写“可能有风险”。
