# FastCar CLI Auto-Iterate Pipeline 评估报告

> 评估日期：2026-05-30
> 评估范围：`src/`、`docs/`、`test/`、`skills/`、根级 Markdown 文档
> 评估方法：当前工作区代码阅读 + 交叉引用分析 + 针对性测试验证

## 一、结论

当前版本已形成闭环。评估重点是区分仍成立、已过时和仍值得优化的结论。

| 维度 | 当前判断 | 说明 |
|------|------|------|
| 架构设计 | 良好 | CLI → Adapter → Session → Pipeline 分层清晰，交付与状态门禁已显式建模 |
| 代码质量 | 中上 | 关键链路稳定，但仍有重复工具函数、超大文件、日志散落和部分热路径同步 I/O |
| 文档质量 | 中上 | 交付与状态文档体系完整，但评估文档本身还有降噪空间 |
| 测试覆盖 | 良好 | `finalize`、delivery gate、state schema、skill capture、Router UX 均有针对性测试 |

### 1.0 评估标准

- `已实现`：有实现代码，并且有与该行为直接相关的测试或门禁证据。
- `已过时`：旧问题已被实现或测试证据推翻，不应再作为当前风险。
- `仍值得优化`：实现已成立，但从维护性、可读性、规模或长期成本来看还有提升空间。
- `证据不足`：只有局部或间接证据，不能据此扩展成更广泛的结论。

### 1.1 证据对照

| 结论 | 主要证据 | 证据强度 | 影响 |
|------|----------|------|
| `finalize` 已形成闭环 | `src/auto-iterate/sessionFinalize.ts`、`src/pipeline/pipelineFinalization.ts`、`src/pipeline/deliveryDocs.ts` | 强 | 可交付链路已实现，不应再把“是否实现”列为当前主风险 |
| 交付门禁已收敛 | `src/pipeline/deliveryGates.ts`、`src/pipeline/phaseGate.ts`、`src/pipeline/shouldStop.ts`、`src/pipeline/pipelineDeliveryGate.ts` | 强 | 旧的“多处口径漂移”结论已过时 |
| 交付文档可生成且受门禁保护 | `test/auto-iterate-session-finalize.test.js`、`test/auto-iterate-doc-reliability.test.js` | 强 | `api.md` / `changelog.md` / `architecture.md` / `implementation.md` 不是口头承诺，而是测试覆盖的实际产物 |
| 技能沉淀已接入交付流程 | `src/auto-iterate/skillCapture.ts`、`test/auto-iterate-doc-reliability.test.js` | 强 | `skillCapture` 不再是边缘流程，而是 finalize 的硬前置 |
| 文档与状态模板一致 | `test/auto-iterate-doc-reliability.test.js` | 中 | 评估文档可以依赖 state schema 作为长期稳定基线 |

## 二、已确认闭环

- `src/pipeline/deliveryGates.ts` 已是 delivery gate 的单一事实源。
- `src/auto-iterate/sessionFinalize.ts` 会先执行 `captureSkills()`，再做 strict 校验，通过后生成 `docs/`，最后再次校验。
- `src/pipeline/pipelineFinalization.ts` 会把 `deliveryEvidence`、`cleanup`、`styleConsolidation`、`contextResetReview`、`skillCapture`、`postAgentValidationGate`、requirements closure 和 validation hardening 一起收敛。
- `src/pipeline/deliveryDocs.ts` 会生成 `api.md`、`changelog.md`、`architecture.md`、`implementation.md`，并用 `traceability` 和 `deliveryEvidence` 作为输入。
- `test/auto-iterate-session-finalize.test.js` 已覆盖成功、门禁失败、skill capture 缺失和 resolver error 等关键路径。

### 2.1 仍成立的结论

- `finalize` 是“执行技能沉淀 + strict 门禁 + 生成交付文档 + 再次校验”的收尾流程。
- `deliveryEvidence`、`cleanup`、`styleConsolidation`、`contextResetReview`、`skillCapture`、`postAgentValidationGate` 仍是交付前关键状态。
- `deliveryDocs` 的输入是状态化证据和可追溯迭代记录。
- 这些结论都有直接实现路径和测试覆盖。

## 三、仍值得优化

### 3.1 文档降噪

`docs/auto-iterate-cli-driven.md` 仍偏长，适合继续去行号化、去编译产物引用，拆出更稳定的设计和状态说明。

### 3.2 大文件

`src/init.ts` 和 `src/auto-iterate/stateSchemaCoreValidators.ts` 仍偏大。它们不是阻塞问题，但确实是未来维护成本最高的两个热点。

### 3.3 重复工具函数

`asRecord()`、`normalizeArray()` 仍有多处重复定义。这个问题真实存在，但是否提取到共享工具层，应以维护收益为准，不要为了统一而统一。

### 3.4 测试组织

`test/pipeline.test.js` 仍偏大，runner 风格也不完全一致。能优化，但优先级低于真正会影响行为的代码问题。

### 3.5 日志与错误处理

`console.log()` 和 `process.exitCode` 仍较分散。这个问题更像长期工程卫生，不是当前最紧急项。

## 四、当前不应再继续强调的旧风险

- `delivery gate` 口径分散：已修复。
- `README.md` 的断链：已修复。
- `skills/auto-iterate-coding/` 引用已 gitignored 文件：已修复。
- `finalize` 不生成文档或不做门禁：已被测试覆盖，不应再作为当前结论。

### 4.1 证据状态

| 旧风险 | 当前状态 | 说明 |
|------|------|------|
| `delivery gate` 口径分散 | 已过时 | 现已由统一 gate 和 finalize 流程覆盖 |
| `README.md` 断链 | 已过时 | 不应再作为当前文档风险 |
| `skills/auto-iterate-coding/` 引用 gitignored 文件 | 已过时 | 该历史问题已被清理 |
| `finalize` 不生成文档或不做门禁 | 已过时 | 测试已证明实际行为与文档一致 |

## 五、优先行动

1. 继续压缩重复表述。
2. 再决定是否提取共享工具函数。
3. 然后处理最影响可维护性的超大文件。
4. 最后再看日志、runner、I/O。

## 六、验证

已核对：

- `src/auto-iterate/sessionFinalize.ts`
- `src/pipeline/pipelineFinalization.ts`
- `src/pipeline/deliveryDocs.ts`
- `src/pipeline/phaseGate.ts`
- `src/pipeline/shouldStop.ts`
- `src/pipeline/pipelineDeliveryGate.ts`
- `test/auto-iterate-session-finalize.test.js`

并运行了 `node test/auto-iterate-session-finalize.test.js`，4 个用例通过。
`node test/auto-iterate-doc-reliability.test.js` 覆盖了状态模板、门禁、finalize、skill capture、route 文档一致性。
`node test/pipeline.test.js` 覆盖了 delivery gate、phase gate、finalizeDeliveryState、deliveryDocs 与验证/预算/路由的核心联动。

### 6.1 覆盖映射

| 测试 | 证明的结论 |
|------|------------|
| `test/auto-iterate-session-finalize.test.js` | `finalize` 交付闭环存在，且 strict 门禁失败时不会生成交付文档 |
| `test/auto-iterate-doc-reliability.test.js` | 状态模板、交付门禁、skill capture、文档索引与 schema 的一致性成立 |
| `test/pipeline.test.js` | delivery gate 收敛、phase gate、finalizeDeliveryState、deliveryDocs、预算与验证协作关系成立 |

### 6.2 未覆盖范围

- 未做端到端人工验收录像或截图留档。
- 未验证外部服务、真实数据库或生产数据场景。
- 未覆盖所有 `console.log()` / `process.exitCode` 的静态清理效果。
- 未把 `src/init.ts`、`src/auto-iterate/stateSchemaCoreValidators.ts`、`test/pipeline.test.js` 拆分为更小文件。
- 未对仍值得优化项做代码级重构。
