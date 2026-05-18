# Iteration Policy

本策略约束每轮自动迭代的目标、预算、停止和回滚。机器状态落点是 `state.json.iterationPolicy`。

## 单轮单目标

- 每轮只能处理一个明确目标、一个失败信号或一个 REQ。
- `maxGoalsPerIteration` 必须等于 `1`。
- 同一轮出现多个目标时，必须拆分、重新规划或请求用户确认。

## 变更预算

默认预算：

- `maxChangedFiles = 8`
- `maxDiffLines = 800`
- `maxNoProgressIterations = 3`

超预算处理：

- 低风险轻微超限可以记录为 Soft Rule，但不得静默继续。
- 高风险目录、跨层修改、删除/迁移重要逻辑、修改测试预期或新增依赖必须触发 `ask_user`。
- 修改范围超出 Implementation Contract 时，必须标记目标漂移并阻断或升级确认。

## 停止条件

必须停止或升级的场景：

- 连续失败达到阈值。
- 验证从通过变为失败。
- 新增 regression 未处理。
- 修改范围失控或目标漂移。
- 验证结果无法判定。
- 外部资源、密钥、数据库、权限或产品行为需要用户决策。

## 回滚策略

- 只允许回滚本轮 Agent 自己的修改。
- 不得使用破坏性 git 命令覆盖用户已有改动。
- 无法安全回滚时，保留失败证据，更新 `blockingReasons` 和 `deliveryEvidence.risks`，然后 `stop` 或 `ask_user`。
- 回滚后仍计入一次实现迭代，因为本轮已经产生修改、验证和状态更新闭环。
