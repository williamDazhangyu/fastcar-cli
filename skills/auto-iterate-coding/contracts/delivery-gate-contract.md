# Delivery Gate Contract — 交付门禁契约

> 本文档定义交付门禁的硬性通过/失败条件，使用决策表而非散文。详细解释见 `references/final-delivery.md`。

## 1. 交付可验证性状态机

| 当前状态 | 条件 | 下一状态 | 允许的操作 |
|----------|------|----------|-----------|
| `unknown` | 尚未运行任何验证 | `not_verifiable` | 仅可进入验证阶段 |
| `not_verifiable` | 缺少验证命令/环境/资源 | `partially_verifiable` | 标记 not_verified，请求用户确认 |
| `partially_verifiable` | 部分需求已验证，部分 not_verified | `verifiable`（如果能补全）| 允许有限成功交付（需用户接受） |
| `verifiable` | 所有关键需求 passed，验证命令可重复运行 | — | 允许成功交付 |

## 2. 成功交付条件（全部满足）

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

## 3. 有限成功交付条件（全部满足）

| # | 条件 |
|---|------|
| 1 | 所有关键需求 status 为 `passed` 或 `not_verified`（非关键） |
| 2 | `delivery_verifiability = partially_verifiable` |
| 3 | 未验证项已明确区分且非关键 |
| 4 | 未验证项已获用户接受 |
| 5 | 条件 3-13 与成功交付相同 |

## 4. 提前停止条件（任一触发）

| # | 条件 | 触发动作 |
|---|------|----------|
| 1 | `budgets.remainingImplementationIterations = 0` 且有关键需求未 passed | 输出剩余需求、已完成内容、建议追加预算 |
| 2 | `watchdog.requiredAction = stop` | 输出停止原因、已完成内容、未验证项 |
| 3 | `watchdog.no_progress_count >= max_no_progress_iterations` | 输出无进展原因、已尝试方向、建议 |
| 4 | 存在 `blocked` 的关键需求 | 输出阻塞原因、需要用户的决策/资源 |
| 5 | `delivery_verifiability = not_verifiable` 或 `unknown` | 输出无法验证的交付成果、缺少的最小验证条件、用户验收建议 |
| 6 | 用户要求停止 | 输出当前状态摘要 |

## 5. DoD 与 RCM 一致性规则

| 规则 | 违规时动作 |
|------|-----------|
| DoD 的每条成功标准必须引用 RCM 中对应 REQ 的状态 | 先更新 RCM，再从 RCM 派生 DoD 摘要 |
| RCM 中 `passed` 的 REQ 数量 ≥ DoD 中 `passed` 的成功标准数量 | 不一致时以 RCM 为准 |
| 不得在 DoD 中独立重复评估（DoD 是 RCM 的派生视图） | 直接引用 RCM 条目 ID |

## 6. validation.log 存在性规则

| 场景 | 是否需要 validation.log |
|------|------------------------|
| 存在 `iterations/<n>/result.json` 的实现轮次 | **必须** |
| 只读探索、需求拆解、reconcile、上下文压缩 | 不需要 |
| 纯验证（无代码修改） | 不需要（但需更新 validation.entries） |
| 递归优化轮次 | 必须（记录优化前后对比） |
| 验证加固轮次 | 必须 |