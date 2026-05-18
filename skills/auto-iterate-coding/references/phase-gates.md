# Phase Gates

`auto-iterate-coding` 的执行落点是 `.agent-state/auto-iterate/<session>/state.json`。阶段门禁不是建议文本，而是 `phaseGate`、`implementationContract`、`baseline`、`iterationPolicy`、`cleanup`、`deliveryEvidence` 和 `postAgentValidationGate` 的结构化状态。

固定阶段：

| 阶段 | 检查项 | 强制等级 | 失败动作 | 阻断原因格式 |
| --- | --- | --- | --- | --- |
| `requirement` | 已读取用户目标、原始清单和成功标准，RCM 至少覆盖所有关键验收项 | Hard Gate | `stop` 或 `ask_user` | `requirement.blocked: missing_rcm / missing_success_criteria / unclear_goal` |
| `contract` | `implementationContract.status=approved`，目标、范围、非目标、成功标准、验证计划和风险点非空 | Hard / Escalation | `ask_user` 或 `replan` | `contract.blocked: missing_contract / open_questions / scope_unclear` |
| `baseline` | `baseline.status` 为 `passed` / `failed` / `skipped_with_reason` / `not_available`，且失败或跳过有原因 | Hard Gate | `run_validation`、`ask_user` 或 `stop` | `baseline.blocked: missing_baseline / unknown_result / missing_skip_reason` |
| `coding` | baseline 可判定，本轮只有一个目标，`diffBudget` 在预算内，未触碰越界或高风险文件 | Hard / Escalation | `replan`、`ask_user` 或 `stop` | `coding.blocked: multi_goal / over_budget / out_of_scope / high_risk_unconfirmed` |
| `validation` | `postChange.status` 可判定，`deltaAssessment` 已比较 baseline 与 post-change，未保留新增 regression | Hard Gate | `revert`、`retry_new_direction` 或 `stop` | `validation.blocked: not_run / regression / delta_unknown` |
| `cleanup` | `cleanup.status=completed`，或用户明确确认保留临时产物且记录风险 | Hard Gate | `run_cleanup`、`ask_user` 或 `stop` | `cleanup.blocked: pending / debug_artifact / unconfirmed_prototype` |
| `delivery` | 关键 REQ passed，`validation.finalVerifiability != unknown`，交付证据含验证、风险、未完成项和确认来源，post-agent strict gate passed | Hard Gate | `context_reset_and_repair` 或 `stop` | `delivery.blocked: open_requirements / unknown_verifiability / incomplete_evidence / strict_gate_failed` |

决策表执行要求：

- 每个阻断必须写入 `phaseGate.blockingReasons`，并同步到 `Context Handoff Summary`。
- `失败动作` 是下一步最小动作，不是建议；Agent 不得绕过后继续编码或交付。
- `Hard / Escalation` 表示低风险时可先记录风险并拆分，高风险、范围扩大、目标漂移、新增依赖或测试预期变化必须进入 `decisionRequest`。
- `delivery` 阶段必须同时满足 `deliveryEvidence` 内容完整和 `postAgentValidationGate.lastResult=passed`，不能只依赖口头总结。

Hard Gate 执行口径：

- `fastcar-cli auto-iterate --validate-state <session> --strict-state` 是交付前裁判。
- `ERROR` 必须阻断交付；strict 模式下大部分 `WARN` 也升级为 `ERROR`。
- 如果 strict 校验失败，Agent 必须进入 `postAgentValidationGate.nextAction=context_reset_and_repair`，生成 Context Handoff Summary，只保留 `state.json`、当前代码和首个阻断项继续修补。
- `gate_repair_cycles_used` 不计入普通实现迭代；但如果发现功能缺口或关键 REQ 未实现，必须回到 implementation iteration 消耗实现预算。
