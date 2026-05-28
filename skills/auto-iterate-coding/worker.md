# auto-iterate Pipeline Worker

本文件只给 `fastcar-cli auto-iterate --run` 每轮 spawn 的无状态 Worker Agent 使用。Worker 只完成本轮 focus，写 `result.json` 后退出。

## 单步边界

- 只做本轮 prompt 指定的一件事：`extract_requirements`、`implement_req`、`fix_bug`、`verify_req`、`harden_validation`、`optimize`、`verify_optimization`、`reproduce`、`hypothesis_test`、`regression_check`、`plan_once`、`establish_baseline` 或后续 CLI 明确给出的 focus。
- 不要推进下一个 REQ，不要判断整体项目是否完成，不要递减 budgets。
- 禁止读取或写入 `.agent-state/` 下任何文件，唯一例外是本轮 prompt 给出的 `result.json` 路径。
- 禁止伪造验证结果；CLI 会独立运行 `--validate-cmd` / state 中的验证命令并写入证据。
- 禁止输出私有思考链；如需说明依据，只写公开、可审计的 `trace.rationaleSummary`、决策和证据摘要。
- 只能修改本轮 focus 直接相关的代码、测试、类型或文档；不确定范围时返回 `blocked`。
- 不得写入密钥、token、密码或连接串，不得执行破坏性 git 命令。
- 不得新增依赖，除非本轮 prompt 明确允许。

## FastCar 代码规则

- `@fastcar/*` 模块必须使用 TypeScript 静态 `import`，不要用 CommonJS `require()`。
- FastCar Koa 没有 `@Body`、`@Param`、`@Query` 装饰器；Controller 第一个参数是请求数据对象，第二个参数是可选 `ctx?: Context`。
- 路由装饰器必须写成函数调用：`@GET()`、`@POST()`、`@REQUEST("/api")`。
- 分页、聚合、分组和关联查询必须在数据库层完成，不要全表查询后在 JS 内存中 `.slice()`、`.reduce()` 或 N+1 拼装。
- 实体创建使用构造函数对象形式；状态、类型、模式等离散字段使用字符串枚举。

## result.json schema

Worker 必须向 prompt 指定的路径写入 JSON：

```json
{
  "status": "completed",
  "summary": "本轮完成内容摘要",
  "files_changed": ["src/example.ts"],
  "requirements": [
    {
      "id": "REQ-001",
      "summary": "需求摘要",
      "type": "功能",
      "status": "implemented",
      "relatedFiles": ["src/example.ts"],
      "evidence": "代码已实现；等待 CLI 验证",
      "blockedReason": "无",
      "nextStep": "运行 CLI 验证"
    }
  ],
  "state_patch": {
    "currentState": {
      "currentTask": "本轮 focus 摘要"
    }
  },
  "trace": {
    "rationaleSummary": "公开推理摘要，不包含私有思考链",
    "decisions": [
      { "topic": "本轮决策", "reason": "公开理由", "impact": "影响范围" }
    ],
    "evidence": [
      { "source": "文件、命令或观察", "detail": "证据摘要" }
    ]
  },
  "documentation": {
    "apiChanges": ["写入 api.md 的 API 变化"],
    "architectureNotes": ["写入 architecture.md 的架构说明"],
    "implementationNotes": ["写入 implementation.md 的核心实现说明"],
    "changelogEntries": ["写入 changelog.md 的变更记录"]
  },
  "risks": "剩余风险",
  "blocked_reason": ""
}
```

允许的 `status`：

- `completed`：本轮 focus 已完成，仍由 CLI 验证决定是否 passed。
- `no_progress`：本轮没有安全、可验证或范围内产出；必须在 `summary` 和 `risks` 中说明原因。
- `failed`：本轮执行失败，摘要中说明首个关键失败信号。
- `blocked`：缺少文件范围、产品决策、外部资源或安全确认。
- `need_decision`：必须问用户；同时提供 `decision_request.question` 和 `decision_request.options`。

`state_patch` 只允许建议非权威字段，例如 `currentState.currentTask/recentChanges/keyFiles`、`notes`、`hypotheses`，以及 `deliveryEvidence` 中的描述性摘要字段。Worker 不得写 `budgets`、`watchdog`、`postChange`、`validation`、`session`、`mode`、`schemaVersion`，也不得写 `currentState.nextAction`、`currentState.overallStatus`、`currentState.lastValidationResult`、`deliveryEvidence.status`、`deliveryEvidence.goal` 等权威字段。

`trace` 与 `documentation` 是顶层建议字段，由 CLI 清洗并合并进 `state.traceability` 和 `state.documentation`。Worker 不得直接写 `deliveryDocs`；`--finalize` 会在 `.agent-state/auto-iterate/<session>/docs/` 生成 `api.md`、`changelog.md`、`architecture.md`、`implementation.md`。
