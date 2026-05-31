# FastCar CLI Auto-Iterate Pipeline 评估报告

> 评估日期：2026-05-30
> 评估范围：`src/`、`docs/`、`test/`、`skills/`、根级 Markdown 文档
> 评估方法：当前工作区代码阅读 + 交叉引用分析 + 针对性测试验证

## 一、结论

当前版本已形成闭环。评估重点是区分仍成立、已过时和仍值得优化的结论。

| 维度 | 当前判断 | 说明 |
|------|------|------|
| 架构设计 | 良好 | CLI → Adapter → Session → Pipeline 分层清晰，交付与状态门禁已显式建模 |
| 代码质量 | 中上 | 关键链路稳定，重复工具函数已明显收敛；剩余主要维护热点是 pipeline 集成测试仍偏大、日志散落和部分热路径同步 I/O |
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

`src/init.ts` 已通过拆出模板下载逻辑降到 1000 行以下，`src/auto-iterate/stateSchemaCoreValidators.ts` 已通过拆出基础校验器降到 1000 行以下。`test/pipeline.test.js` 已按 focus/loop、result schema、validation command 三类职责拆出专项测试，但仍是未来维护成本最高的热点。

### 3.3 重复工具函数

`asRecord()`、`normalizeArray()`、`pathExists()`、`toCliError()` 已收敛到共享工具层。后续重复工具函数治理应以新发现为准，不再沿用旧扫描结论。

### 3.4 测试组织

`test/pipeline.test.js` 仍偏大，但已拆出 focus/loop、result schema 和 validation command 相关用例。runner 风格已基本统一，后续重点应继续按领域拆分 pipeline 集成测试，而不是替换测试框架。

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
2. 继续按领域拆分 `test/pipeline.test.js` 中的集成测试。
3. 继续收敛日志与错误输出边界。
4. 最后再看剩余热路径同步 I/O。

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

2026-05-30 三次修复后补充验证：

- `npm run build` 通过。
- `node test/auto-iterate-args.test.js` 通过。
- `node test/auto-iterate-session-help.test.js` 通过。
- `node test/skill-consistency.test.js` 通过。
- `npm test` 全量通过。

2026-05-30 四次修复后补充验证：

- `npm run build` 通过。
- `node test/auto-iterate-args.test.js` 通过。
- `node test/skill-consistency.test.js` 通过。
- `node test/auto-iterate-session-help.test.js` 通过。
- `node test/adapters.test.js` 通过。

2026-05-30 五次修复后补充验证：

- `npm run build` 通过。
- `node test/auto-iterate-session-help.test.js` 通过。
- `node test/router-ux.test.js` 通过。
- `npm test` 全量通过。

2026-05-30 六次修复后补充验证：

- `npm run build` 通过。
- `node test/skill-consistency.test.js` 通过。
- `node test/pipeline.test.js` 通过。

2026-05-30 七次修复后补充验证：

- `npm run build` 通过。
- `node test/skill-consistency.test.js` 通过。
- `node test/auto-iterate-state-validation-runner.test.js` 通过。
- `node test/auto-iterate-session-help.test.js` 通过。

2026-05-30 八次修复后补充验证：

- `npm run build` 通过。
- `node test/skill-consistency.test.js` 通过。
- `node test/auto-iterate-session-runtime.test.js` 通过。
- `node test/auto-iterate-session-help.test.js` 通过。
- `node test/pipeline.test.js` 通过。

2026-05-30 九次修复后补充验证：

- `npm run build` 通过。
- `node test/pipeline-focus-loop.test.js` 通过。
- `node test/pipeline-result-schema.test.js` 通过。
- `node test/pipeline-validation.test.js` 通过。
- `node test/pipeline.test.js` 通过。
- `node test/auto-iterate-doc-reliability.test.js` 通过。
- `node test/auto-iterate-state-schema-core-validators.test.js` 通过。
- `node test/skill-consistency.test.js` 通过。
- `npm test` 全量通过。

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
- 未把 `test/pipeline.test.js` 完全拆分到所有领域测试文件；当前已完成 focus/loop、result schema 和 validation command 的职责拆分。
- 未对仍值得优化项做代码级重构。

---

## 七、当前状态逐项追踪（2026-05-30 二次核查）

以下基于对 `src/`、`test/`、`docs/` 的逐文件重新扫描，与原始评估的 45 项发现做逐项对照。

### 7.1 已修复 ✅

| # | 原始发现 | 修复证据 |
|---|---------|---------|
| 1 | `asRecord`/`toRecord` 16 处重复 | 已提取到 `src/valueUtils.ts:5`，`src/pipeline/valueUtils.ts:1` re-export。17 个文件改为 import。`toRecord` 名称已完全消除。 |
| 2 | `asArray` 3+ 处重复 | 已提取到 `src/valueUtils.ts:15`，单一定义。 |
| 3 | `delDirEctory` 拼写错误 | `src/utils.ts:29` 新增 `delDirectory`，`src/utils.ts:55` 保留 `delDirEctory = delDirectory` 兼容别名。 |
| 4 | `pack.ts` 命令注入 | `execSync(\`${pm} --version\`)` → `spawnSync(pm, ["--version"], { shell: false })` |
| 5 | `dispatch.ts` 命令注入 | `spawnSync(command, [])` shell:true → `spawnSync(cmd, args)` shell:false |
| 6 | README 断链 `template-example/README.md` | 已从 README.md 中移除。 |
| 7 | `反馈.md`/`优化.md` 过期引用 | `changelog.md:6` 已标注"已移除"，不再作为活跃引用。 |
| 8 | `commander` 死依赖 | 已从 `package.json` 的 `dependencies` 中移除。 |
| 9 | `yarn.lock` + `package-lock.json` 并存 | `yarn.lock` 已删除，仅保留 `package-lock.json`。 |
| 10 | `delivery gate` 口径分散 | `deliveryGates.ts` 已是单一事实源，`finalizeDeliveryState` 统一收敛。 |
| 11 | `finalize` 不生成文档或不做门禁 | `sessionFinalize.ts` + `pipelineFinalization.ts` + `deliveryDocs.ts` 形成闭环，被 3 个测试覆盖。 |
| 12 | `normalizeArray` 7 处重复 | 已收敛到 `src/valueUtils.ts`，并保留 `normalizeArrayLoose()` 兼容不压缩空值的旧语义。`deliveryDocs.ts` 和 `resultSchema.ts` 不再保留本地定义。 |
| 14 | `pathExists` 8 处重复 | 已提取到 `src/fsUtils.ts`，auto-iterate 与 skill 相关调用改为共享 import。 |
| 15 | `toCliError` 2 处重复 | 已提取到 `src/cliError.ts`，`init.ts` 和 `update.ts` 改为共享 import。 |
| 17 | `@types/node@^25.9.1` vs Node v24 | `package.json` 已调整为 `@types/node@^24.0.0`，`package-lock.json` 锁定到 24.x。 |
| 20 | `autopilotMaxIterations` 仅对实现型迭代计数 | runtime autopilot 下已改用 `totalCycles` 限制所有迭代类型，并新增测试覆盖。 |
| 21 | 宽限期进程正常退出被标为超时 | `commandResolver.ts` 区分 `timeoutRequested` 和最终 `timedOut`，允许宽限期内正常退出，并新增竞态测试。 |
| 22 | `pickFocus.ts` String(first) → "[object Object]" | 已改为 `describeUnknownHypothesis()`，对象型 hypothesis 会序列化为可读摘要。 |
| 23 | worktree 创建失败后目录泄漏 | `makeIsolatedWorktree()` 在 `git worktree add` 失败后 best-effort 清理目标目录，并新增测试覆盖。 |
| 24 | 无 SIGTERM/SIGINT 处理器 | isolated worktree 运行期间已注册信号清理，`need_decision`、Worker 失败和 state schema 失败路径也有清理测试覆盖。 |
| 25 | `quick`/`prototype` 模式 harden_validation 后无 focus | quick/prototype 已允许 `optimize` / `verify_optimization` focus，并取消该分支只限 strict 的判断。 |
| 26 | 无 baseline 指标时 `noImprovementStreak` 永不递增 | `verify_optimization` 在指标不可比时也会推进 `noImprovementStreak`，避免优化循环卡住。 |
| 30 | `args.test.js` 缺少非法 flag 负面测试 | 已补充 `parseArgs` 对缺值 option 和 unknown flag 不误吞 goal 的负面边界测试。 |
| 19 | `execSync` 模板字符串（4 处） | `init.ts` 和 `update.ts` 已改为共享 `runCommandOrThrow()`，通过 `spawnSync(command, args, { shell: false })` 执行 `npm pack` / `tar`。 |
| 39 | `init.ts:574,578` 使用 `execSync(\`tar -xzf ...\`)` | 已改为 `runCommandOrThrow("tar", ["-xzf", tarballPath, "-C", extractDir])`，不再拼接 shell 字符串。 |
| 13 | Adapter 能力不对称 | 已把 Codex 原有的最终输出 JSON 恢复能力提取为 `src/adapters/resultRecovery.ts`，并接入 Codex/Kimi/Claude/Gemini/Cursor native adapter。 |
| 40 | `src/auto-iterate/args.ts` 中 `help` 标志未在 defaults 初始化 | `AutoIterateArgs.help` 已改为非可选并默认 `false`，新增参数测试覆盖。 |
| 31 | 15+ flag 别名未在帮助文本中列出 | `FLAG_REGISTRY` 已补充 help/aliases 元数据，`sessionHelp.ts` 按 registry 渲染 mode/session/pipeline/skill/other 分组，测试确保所有 registry-backed help 均出现在 `--help` 输出中。 |
| 32 | `PipelineStateLike[key: string]: unknown` 索引签名 | 已移除 `PipelineStateLike` 顶层泛索引签名，并显式补齐 pipeline 实际使用的 state 字段；`skill-consistency.test.js` 增加静态回归检查。 |
| 34 | 无统一日志抽象 | 已新增 `src/cliOutput.ts` 并接入 `sessionHelp.ts`、`stateValidationRunner.ts` 等 auto-iterate 核心输出路径；`skill-consistency.test.js` 增加静态回归检查。 |
| 27 | `init.ts` 超 1000 行 | 已将模板下载逻辑提取到 `src/templateDownloader.ts`，`src/init.ts` 降至 903 行；`skill-consistency.test.js` 增加静态回归检查。 |
| 28 | `stateSchemaCoreValidators.ts` 超 1000 行 | 已将基础 state schema validators 提取到 `src/auto-iterate/stateSchemaBasicValidators.ts`，`stateSchemaCoreValidators.ts` 降至 916 行；`skill-consistency.test.js` 增加静态回归检查。 |
| 29 | `test/pipeline.test.js` 单体 | 已拆出 `test/pipeline-focus-loop.test.js`、`test/pipeline-result-schema.test.js` 和 `test/pipeline-validation.test.js`，`test/pipeline.test.js` 降至 4,474 行；`npm test` 已接入新测试文件。 |

### 7.1.1 已重新判定为误报/不适用 ✅

| # | 原始发现 | 当前证据 |
|---|---------|---------|
| 18 | `shell: true` 残留（3 处） | 残留点分别位于 `runShellCommand()` / `runShellCommandAsync()` / pipeline validation command，是明确执行用户配置命令字符串的边界；非把结构化参数拼接进 shell 的注入漏洞。 |
| 33 | 3 个死类型 | `PipelineMarkdownIssue` 被 `pipelineStateIO.ts` 使用，`LanguageAnswersLike` 被 `language.ts` 使用，`EmittedProgressPayload` 被 `progress.ts` 使用。源码引用证明不是死类型。 |
| 16 | `src/auto-iterate.ts` 1 行 barrel export | `test/auto-iterate-session-runtime.test.js` 明确验证 `dist/src/auto-iterate` re-export runtime 入口；这是兼容入口，不是需要删除的死文件。 |

### 7.3 未修复 ❌

| # | 原始发现 | 文件:行号 | 严重程度 |
|---|---------|----------|----------|
| — | 暂无仍按原始评估定义未修复的项目 | — | — |

### 7.4 新增发现（本轮核查新识别）

| # | 发现 | 文件:行号 | 严重程度 |
|---|------|----------|----------|
| 35 | `pickFocus.ts` 和 `shouldStop.ts` 已从 `auto-iterate/` 迁移到 `pipeline/`，旧路径删除 — 架构优化已完成 | — | ✅ 正面 |
| 36 | `src/valueUtils.ts` 作为共享工具层已建立，`src/pipeline/valueUtils.ts` 作为 re-export 入口 | — | ✅ 正面 |
| 37 | 测试文件全部统一使用 `const assert = require("assert")` 模式（34/34），不再有 3+ 种 runner 发散 | — | ✅ 正面 |
| 38 | 新增测试文件：`skill-consistency.test.js`、`router-ux.test.js`、`env-check.test.js`、`session-help.test.js` | — | ✅ 正面 |

---

## 八、当前状态汇总

```
当前逐项追踪：42 项
已修复：      33 项
部分修复：     0 项
未修复：      0 项
已过时/不适用：9 项 — 含 delivery gate 口径、文档断链、shell 边界误判、死类型误报和兼容 barrel 入口等
新发现（正面）：4 项 — 架构优化、测试统一、共享工具层建立
```

### 仍为 🔴 高优先级的未修复项

本轮已修复原先列出的高优先级项。当前未发现新的 🔴 高优先级未修复项。

### 仍为 🟡 中优先级的未修复项

- 当前没有仍按原始评估定义未修复的 🟡 项；`test/pipeline.test.js` 仍偏大（4,474 行），作为后续维护性优化继续拆分。

### 与原始评估文档的关系

本文档的 §1-§6 聚焦于已确认闭环的交付链路（finalize、delivery gate、delivery docs、skill capture），这一视角是**有效的 —— 交付闭环确实是当前最重要的架构成就**。§7-§8 已按 2026-05-30 三次修复后的代码状态更新，旧的高优先级 pipeline 行为风险不应再作为当前风险重复推进。
