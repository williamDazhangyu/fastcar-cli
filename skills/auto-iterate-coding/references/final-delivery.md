# 最终交付 / Final Delivery

用于交付总结、验证证据、风险说明和用户验收建议。
包含成功交付模板、提前停止模板、交付门禁契约和验证证据要求。

---

## 交付语言规则

交付总结、提前停止说明、阶段验收摘要和最终对话回复必须跟随用户当前提示语言；已有 session 时优先跟随 `state.language.code`。

当 `state.language.code=zh` 或用户当前消息为中文时，必须使用中文字段标签和中文说明，不得用英文开头或英文收尾。英文只保留命令、路径、JSON key、API 名称和 `verifiable` / `passed` / `blocked` / `not_verified` 等机器枚举值。

当 `state.language.code=en` 且用户当前消息不是中文时，可以使用英文交付模板。不得因为文件名、命令输出或英文状态值把中文 session 的最终总结切换为英文。

## 成功交付模板

不要只说"完成"。必须提供可验收证据。

成功交付前必须先证明完整任务边界已经完成：用户目标、Runbook、MVP 清单、成功标准中的所有关键项均为 `passed`，且状态文件中的 `剩余任务` 为空。阶段完成、最小纵切完成或局部 e2e 通过，只能作为阶段进展，不能作为最终交付。

成功交付前还必须通过交付可验证性检查：最终交付成果必须能被当前环境中的真实验证、用户确认的沙箱验证或明确可复现的验收步骤证明。无法验证、验证条件未知或看门狗处于 triggered 状态时，不得使用成功交付模板。

成功交付前必须完成交付前验证加固：所有关键 REQ `passed` 后，至少完成 `minimum_validation_hardening_iterations`，并覆盖 boundary / negative / regression 维度。无法覆盖的维度必须明确标记为 `blocked / not_available / user_accepted_limited`，否则不得使用成功交付模板。

成功交付前必须完成 Context Reset Review Gate：Agent 必须清空对话实现细节，只依据 `.agent-state/auto-iterate/<session>/state.json`、原始需求、当前代码/diff、真实验证结果、项目规范和相关 skills 重新读取事实，并按 Standards / Spec 两轴复核。发现问题时必须新增或重开 REQ 并回到实现循环；无发现时把 `contextResetReview.status=passed`、`decision=pass`、`reviewCyclesUsed>=1` 写入 state。不得用"我记得已经完成"替代该门禁。

成功交付前必须完成临时产物清理：

- 删除或吸收一次性原型、prototype route、variant switcher、临时 TUI 外壳和 harness。
- 删除所有带唯一前缀的 debug instrumentation，例如 `[DEBUG-...]`。
- 确认没有为了通过验证而留下的硬编码、跳过测试、弱化断言或内部 mock。
- 如果临时产物需要保留，必须说明用户确认的原因、保留位置和后续清理条件。

## Style Consolidation / 技巧风格整理

> 详见 [SKILL.md](../SKILL.md) §核心流程（步骤 14）。

实现需求的模式在成功交付前必须完成技巧风格整理：读取本项目 `.agents/skills` 和全局 skills 中与本次代码相关的代码风格、FastCar API 约束、TypeScript 规范、反模式和验证建议，只整理本次需求相关代码，不扩大行为范围，整理后重新运行相关验证。如果当前任务不是实现需求，标记 `not_applicable`。

## Skill Capture / 技能沉淀

> 详见 [SKILL.md](../SKILL.md) §Skill Capture / 技能沉淀。

成功交付、提前停止或阶段性验收前必须完成技能沉淀检查：只沉淀可复用、可验证、跨任务有价值的技能点，写入 `.agents/skills`，同步维护 `.agents/skills/index.md`。如果没有高价值技能点，标记 `skipped_no_high_value` 并说明原因。

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

## 交付门禁契约 / Delivery Gate Contract

本文档定义交付门禁的硬性通过/失败条件，使用决策表而非散文。

### 交付可验证性状态机

| 当前状态 | 条件 | 下一状态 | 允许的操作 |
|----------|------|----------|-----------|
| `unknown` | 尚未运行任何验证 | `not_verifiable` | 仅可进入验证阶段 |
| `not_verifiable` | 缺少验证命令/环境/资源 | `partially_verifiable` | 标记 not_verified，请求用户确认 |
| `partially_verifiable` | 部分需求已验证，部分 not_verified | `verifiable`（如果能补全）| 允许有限成功交付（需用户接受） |
| `verifiable` | 所有关键需求 passed，验证命令可重复运行 | — | 允许成功交付 |

### 成功交付条件（全部满足）

| # | 条件 | 检查方式 |
|---|------|----------|
| 1 | 所有关键需求 status = `passed` | 遍历 RCM，逐一核对 |
| 2 | `delivery_verifiability = verifiable` | 检查 watchdog 字段 |
| 3 | 每个实现轮次有对应 `validation.log` | 检查 `iterations/<n>/validation.log` 存在 |
| 4 | `validation.log` 中每条命令 `exit_code` 有值 | 解析 validation.log |
| 5 | `validation.log` 中每条命令 `duration_ms > 0` | 解析 validation.log |
| 6 | `budgets.remainingImplementationIterations >= 0` | 检查 budgets 字段 |
| 7 | `watchdog.triggered = false` | 检查 watchdog 字段 |
| 8 | `fresh_eyes_required = false`（或已处理） | 检查 watchdog 字段 |
| 9 | `validation_hardening_status` 为 `passed` / `blocked` / `not_available` / `user_accepted_limited` | 检查 watchdog 字段 |
| 10 | `new_test_count >= passed REQ 数量`（或已知限制已记录） | 检查 RCM 与 watchdog |
| 11 | `styleConsolidation.status` 为 `completed` / `not_applicable` / `skipped_with_reason` | 检查 styleConsolidation |
| 12 | `skillCapture.status` 不为 `pending` | 检查 skillCapture |
| 13 | `postAgentValidationGate.status = passed` | 检查 postAgentValidationGate |

### 有限成功交付条件（全部满足）

| # | 条件 |
|---|------|
| 1 | 所有关键需求 status 为 `passed` 或 `not_verified`（非关键） |
| 2 | `delivery_verifiability = partially_verifiable` |
| 3 | 未验证项已明确区分且非关键 |
| 4 | 未验证项已获用户接受 |
| 5 | 条件 3-13 与成功交付相同 |

### 提前停止条件（任一触发）

| # | 条件 | 触发动作 |
|---|------|----------|
| 1 | `budgets.remainingImplementationIterations = 0` 且有关键需求未 passed | 输出剩余需求、已完成内容、建议追加预算 |
| 2 | `watchdog.requiredAction = stop` | 输出停止原因、已完成内容、未验证项 |
| 3 | `watchdog.no_progress_count >= max_no_progress_iterations` | 输出无进展原因、已尝试方向、建议 |
| 4 | 存在 `blocked` 的关键需求 | 输出阻塞原因、需要用户的决策/资源 |
| 5 | `delivery_verifiability = not_verifiable` 或 `unknown` | 输出无法验证的交付成果、缺少的最小验证条件、用户验收建议 |

### Delivery Template 检查列表

交付不是口头总结，而是 `state.json.deliveryEvidence`、`cleanup`、`validation`、`requirements`、`watchdog` 和 `postAgentValidationGate` 一致后的输出视图。

交付前必须满足：

- 所有关键 REQ 为 `passed`，或非关键未验证项已被用户接受。
- `validation.finalVerifiability` 不是 `unknown`。
- `watchdog.deliveryVerifiability` 不是 `unknown` 或 `not_verifiable`。
- `cleanup.status=completed`，或用户明确确认保留临时产物并记录原因。
- 实现需求的模式中，`styleConsolidation.status=completed`，或已明确标记 `not_applicable / blocked / not_available` 并记录原因；交付前不得保持 `pending`。
- `contextResetReview.status=passed` 且 `decision=pass`；只有用户明确有限接受时才允许 `user_accepted_limited`，`pending / failed / blocked / not_available` 都不得交付。
- `skillCapture.status` 不是 `pending`；交付、提前停止或阶段性验收前必须沉淀高价值技能点，或记录 `skipped_no_high_value / blocked / not_available` 原因。
- `postAgentValidationGate.lastResult=passed`。
- `fastcar-cli auto-iterate --finalize <session> --yes` 通过；旧 session 可用 `--validate-state <session> --strict-state` 做兼容校验。

标准交付摘要必须包含：

- 本轮目标。
- 实际修改内容。
- 修改文件列表。
- baseline 命令、结果和失败归因。
- post-change 验证命令、结果和 delta 结论。
- cleanup 状态。
- Style Consolidation / 技巧风格整理状态、参考的本地/全局 skills、采用规则和整理后验证结果。
- Context Reset Review Gate 状态、reviewCyclesUsed、Standards / Spec 复核结论和 reopenedRequirements。
- Skill Capture / 技能沉淀状态，以及 `.agents/skills/index.md` 是否已同步更新。
- `postAgentValidationGate` 结果和修复循环次数。
- 风险与限制。
- 未完成事项。
- 是否需要用户后续确认。

如果 strict 校验失败：

```text
禁止交付
记录失败到 postAgentValidationGate.failureSummary
生成 Context Handoff Summary
仅保留 state.json、当前代码、首个阻断项和验证命令
重新进入 context_reset_and_repair
```

## 验证证据要求

列出实际运行过的命令和结果：

- 命令名称。
- 成功或失败。
- 关键输出摘要。
- 如果失败，首个相关错误和下一步。
- 如果跳过，明确原因。
- 如果无法验证最终交付成果，明确标记为 `not_verifiable` 或 `unknown`，并说明最小可验证条件。

不要声称"应该能工作"。只能说"已通过 X 验证"或"未能运行 Y，原因是 Z"。

## 风险表达

剩余风险要具体：

- 哪些行为未覆盖。
- 哪些环境未验证。
- 哪些兼容性仍需用户确认。
- 哪些外部依赖使用了沙箱或 mock。
- 哪些优化被放弃以及为什么。

避免泛泛写"可能有风险"。
