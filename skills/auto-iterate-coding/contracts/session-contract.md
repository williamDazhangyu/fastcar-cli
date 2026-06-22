# Session Contract — 会话状态契约

> 本文档是项目级机器可检查的硬约束，不包含解释性散文。详细说明见 `references/state-schema.md`。

## 1. 目录结构

每个独立 session 必须满足以下最小文件集：

```
.agent-state/
├── auto-iterate-current.json          # 当前活动 session 指针
└── auto-iterate/
    └── <session>/
        ├── state.json                 # 机器权威状态源（必须存在）
        ├── state.md                   # 由 state.json 渲染的人类视图（必须存在）
        └── start-prompt.md            # 启动提示（必须存在）
```

## 2. state.json 必填字段

以下字段缺失时，`--validate-state` 必须报 error：

| 字段 | 类型 | 约束 |
|------|------|------|
| `schemaVersion` | `number` | 必须等于 `1` |
| `task.goal` | `string` | `minLength: 1` |
| `task.successCriteria` | `string[]` | `minItems: 1` |
| `task.nonGoals` | `string[]` | 必须存在（可为空数组） |
| `task.allowedScope` | `string` | `minLength: 1` |
| `task.compatibility` | `string[]` | 必须存在（可为空数组） |
| `session.name` | `string` | `minLength: 1` |
| `session.stateFile` | `string` | 必须存在 |
| `session.promptFile` | `string` | 必须存在 |
| `session.currentFile` | `string` | 必须存在 |
| `mode.name` | `string` | 枚举：`strict` / `quick` / `diagnose` / `verify` / `plan` / `optimize` / `prototype` |
| `mode.autopilot` | `boolean` | 必须存在 |
| `budgets.maxIterations` | `number` | 必须存在 |
| `budgets.implementationIterationsUsed` | `number` | 必须存在 |
| `budgets.remainingImplementationIterations` | `number` | 必须存在 |
| `currentState.overallStatus` | `string` | 枚举：`in_progress` / `blocked` / `passed` |
| `watchdog.triggered` | `boolean` | 必须存在 |
| `watchdog.requiredAction` | `string` | 枚举：`none` / `run_validation` / `reconcile` / `narrow_scope` / `ask_user` / `context_compress_and_review` / `stop` |
| `watchdog.deliveryVerifiability` | `string` | 枚举：`verifiable` / `partially_verifiable` / `not_verifiable` / `unknown` |
| `phaseGate.phase` | `string` | 枚举：`explore` / `req_extract` / `coding` / `validation` / `cleanup` / `delivery` |
| `phaseGate.canProceed` | `boolean` | 必须存在 |
| `implementationContract.status` | `string` | 枚举：`pending` / `approved` / `blocked` |
| `baseline.status` | `string` | 枚举：`pending` / `passed` / `failed` / `skipped_with_reason` / `not_available` |
| `iterationPolicy.maxChangedFilesPerIteration` | `number` | 必须存在 |
| `iterationPolicy.maxDiffLinesPerIteration` | `number` | 必须存在 |
| `requirements` | `array` | 必须存在（可为空数组） |
| `decisions` | `array` | 必须存在（可为空数组） |
| `subAgentDispatch.enabled` | `boolean` | 必须存在 |
| `traceability.iterations` | `array` | 必须存在（可为空数组） |
| `validation.entries` | `array` | 必须存在（可为空数组） |
| `deliveryEvidence.status` | `string` | 枚举：`pending` / `ready` / `delivered` |
| `skillCapture.status` | `string` | 枚举：`pending` / `captured` / `skipped_no_high_value` / `not_available` / `blocked` |
| `postAgentValidationGate.status` | `string` | 枚举：`pending` / `passed` / `failed` |

## 3. 关键枚举值白名单

| 枚举字段 | 允许值 |
|----------|--------|
| `mode.name` | `strict`, `quick`, `diagnose`, `verify`, `plan`, `optimize`, `prototype` |
| `currentState.overallStatus` | `in_progress`, `blocked`, `passed` |
| `watchdog.requiredAction` | `none`, `run_validation`, `reconcile`, `narrow_scope`, `ask_user`, `context_compress_and_review`, `stop` |
| `watchdog.deliveryVerifiability` | `verifiable`, `partially_verifiable`, `not_verifiable`, `unknown` |
| `phaseGate.phase` | `explore`, `req_extract`, `coding`, `validation`, `cleanup`, `delivery` |
| `requirements[].status` | `pending`, `implemented`, `passed`, `blocked`, `not_verified` |
| `validation.entries[].status` | `passed`, `failed`, `skipped`, `not_available`, `not_run` |
| `deliveryEvidence.status` | `pending`, `ready`, `delivered` |
| `skillCapture.status` | `pending`, `captured`, `skipped_no_high_value`, `not_available`, `blocked` |
| `postAgentValidationGate.status` | `pending`, `passed`, `failed` |

## 4. auto-iterate-current.json 格式

```json
{
  "stateJsonFile": ".agent-state/auto-iterate/<session>/state.json",
  "stateFile": ".agent-state/auto-iterate/<session>/state.md",
  "promptFile": ".agent-state/auto-iterate/<session>/start-prompt.md",
  "session": "<session-name>"
}
```

## 5. 一致性规则

- 缺少 `state.json`、`state.md`、`start-prompt.md` 或 current 指针任一文件时，状态持久化标记为 `degraded`。
- `state.json.schemaVersion` 不匹配当前 CLI 支持版本时，必须先迁移或停止恢复。
- 不得以 `state.md`（生成视图）作为机器恢复、交付门禁或并发调度的唯一依据。
- 多个 CLI 实例同时操作同一 session 时，`state.json` 为 last-writer-wins；`state.md` 写入使用 atomic rename。