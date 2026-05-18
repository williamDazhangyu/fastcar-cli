# Delivery Template

交付不是口头总结，而是 `state.json.deliveryEvidence`、`cleanup`、`validation`、`requirements`、`watchdog` 和 `postAgentValidationGate` 一致后的输出视图。

交付前必须满足：

- 所有关键 REQ 为 `passed`，或非关键未验证项已被用户接受。
- `validation.finalVerifiability` 不是 `unknown`。
- `watchdog.deliveryVerifiability` 不是 `unknown` 或 `not_verifiable`。
- `cleanup.status=completed`，或用户明确确认保留临时产物并记录原因。
- `postAgentValidationGate.lastResult=passed`。
- `fastcar-cli auto-iterate --validate-state <session> --strict-state` 通过。

标准交付摘要必须包含：

- 本轮目标。
- 实际修改内容。
- 修改文件列表。
- baseline 命令、结果和失败归因。
- post-change 验证命令、结果和 delta 结论。
- cleanup 状态。
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
