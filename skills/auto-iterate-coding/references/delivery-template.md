# Delivery Template

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
