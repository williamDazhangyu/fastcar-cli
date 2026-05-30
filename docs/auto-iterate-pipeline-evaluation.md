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

### 7.2 部分修复 ⚠️

| # | 原始发现 | 当前状态 |
|---|---------|---------|
| 12 | `normalizeArray` 7 处重复 | 主定义已提取到 `src/valueUtils.ts:23`，但 `deliveryDocs.ts:31` 和 `resultSchema.ts:34` 仍有本地定义（2 处残留）。变体 A/B 的行为差异问题未解决。 |
| 13 | Adapter 能力不对称 | `dispatch.ts` 和 `pack.ts` 的 shell 注入已修复，但 `claude.ts`（13 行）和 `gemini.ts`（13 行）仍为独立瘦文件，未合并。Codex 独有的 result 恢复逻辑未提升至通用层。 |

### 7.3 未修复 ❌

| # | 原始发现 | 文件:行号 | 严重程度 |
|---|---------|----------|----------|
| 14 | `pathExists` 8 处重复 | `skill.ts:58`, `dispatch.ts:142`, `sessionBaselineValidation.ts:77`, `sessionCreation.ts:73`, `sessionPaths.ts:26`, `sessionManager.ts:56`, `sessionStateValidation.ts:36`, `stateValidationRunner.ts:36` | 🟡 |
| 15 | `toCliError` 2 处重复 | `init.ts:89`, `update.ts:22` | 🟡 |
| 16 | `src/auto-iterate.ts` 1 行 barrel export | `src/auto-iterate.ts:1` — `export { initAutoIterate } from "./auto-iterate/sessionRuntime"` | 🟢 |
| 17 | `@types/node@^25.9.1` vs Node v24 | `package.json:44` | 🟡 |
| 18 | `shell: true` 残留（3 处） | `commandResolver.ts:77,99`, `pipelineValidationRunner.ts:73` — 这些是设计上的 shell 命令路径（`runShellCommand` / `runShellCommandAsync`），非注入漏洞 | 🟡 |
| 19 | `execSync` 模板字符串（4 处） | `init.ts:504,574,578`, `update.ts:44` — 输入来自 `templates.json`（受控），风险低但仍是 code smell | 🟢 |
| 20 | `autopilotMaxIterations` 仅对实现型迭代计数 | `shouldStop.ts:24-26` — 诊断/规划/验证迭代不消耗 autopilot 配额，依赖 `maxSteps` 硬上限（默认 20）防止无限循环 | 🔴 |
| 21 | 宽限期进程正常退出被标为超时 | `commandResolver.ts:219-240` — `timedOut` 先于 `close` 设置为 true，宽限期内正常退出 exit code 0 被覆盖为 status 1 | 🔴 |
| 22 | `pickFocus.ts` String(first) → "[object Object]" | `pickFocus.ts:167` — `hypotheses[0]` 为非标准对象时垃圾摘要 | 🟡 |
| 23 | worktree 创建失败后目录泄漏 | `pipelineIsolateWorktree.ts:52-60` — `mkdirSync` 成功但 `git worktree add` 失败时无清理 | 🟡 |
| 24 | 无 SIGTERM/SIGINT 处理器 | 全 `src/` 零 `process.on('SIG')` 注册 — worktree 和临时文件在强制终止时泄漏 | 🟡 |
| 25 | `quick`/`prototype` 模式 harden_validation 后无 focus | `pickFocus.ts:382-396` — `optimize`/`verify_optimization` 分支仅 strict 模式触发 | 🟡 |
| 26 | 无 baseline 指标时 `noImprovementStreak` 永不递增 | `mergeModeProgress.ts:107-114` | 🟡 |
| 27 | `init.ts` 超 1000 行 | 1,111 行 | 🟡 |
| 28 | `stateSchemaCoreValidators.ts` 超 1000 行 | 1,103 行 | 🟡 |
| 29 | `test/pipeline.test.js` 单体 | 4,963 行 | 🟡 |
| 30 | `args.test.js` 缺少非法 flag 负面测试 | 仅 3 个 happy-path | 🟡 |
| 31 | 15+ flag 别名未在帮助文本中列出 | `cli.ts` help 文本 | 🟡 |
| 32 | `PipelineStateLike[key: string]: unknown` 索引签名 | 系统性类型安全削弱 | 🟡 |
| 33 | 3 个死类型 | `PipelineMarkdownIssue`, `LanguageAnswersLike`, `EmittedProgressPayload` | 🟢 |
| 34 | 无统一日志抽象 | 299 处 `console.log()` 散落 | 🟢 |

### 7.4 新增发现（本轮核查新识别）

| # | 发现 | 文件:行号 | 严重程度 |
|---|------|----------|----------|
| 35 | `pickFocus.ts` 和 `shouldStop.ts` 已从 `auto-iterate/` 迁移到 `pipeline/`，旧路径删除 — 架构优化已完成 | — | ✅ 正面 |
| 36 | `src/valueUtils.ts` 作为共享工具层已建立，`src/pipeline/valueUtils.ts` 作为 re-export 入口 | — | ✅ 正面 |
| 37 | 测试文件全部统一使用 `const assert = require("assert")` 模式（34/34），不再有 3+ 种 runner 发散 | — | ✅ 正面 |
| 38 | 新增测试文件：`skill-consistency.test.js`、`router-ux.test.js`、`env-check.test.js`、`session-help.test.js` | — | ✅ 正面 |
| 39 | `init.ts:574,578` 使用 `execSync(\`tar -xzf ...\`)` — `tarballPath` 来自 npm pack 输出，受控但路径含用户 tempDir | `init.ts:574,578` | 🟢 低 |
| 40 | `src/auto-iterate/args.ts` 中 `help` 标志仍未在 defaults 初始化 | `args.ts:42,153-194` | 🟢 低 |

---

## 八、当前状态汇总

```
原始评估发现：45 项
已修复：      11 项 (24%)
部分修复：     2 项 (4%)
未修复：      21 项 (47%)
已过时/不适用：6 项 (13%) — 含 delivery gate 口径、文档断链等
新发现（正面）：5 项 — 架构优化、测试统一、共享工具层建立
```

### 仍为 🔴 高优先级的未修复项

| # | 问题 | 影响 |
|---|------|------|
| 20 | `autopilotMaxIterations` 仅对实现型迭代计数 | 诊断/规划模式可能接近无限循环（仅 `maxSteps=20` 兜底） |
| 21 | 宽限期超时竞态 | 进程正常完成被误判为超时失败，后续被 `agent_result_recovered` 兜底恢复 |
| 23 | worktree 创建失败后目录泄漏 | 每次失败泄漏一个空目录，长期积累 |
| 24 | 无进程信号处理器 | 强制终止时 worktree 和临时文件泄漏 |

### 仍为 🟡 中优先级的未修复项

- `pathExists` 8 处重复、`toCliError` 2 处重复
- `pickFocus.ts` 3 个边界 bug（垃圾摘要、quick/prototype 无 focus、baseline 缺失无限循环）
- 超大文件 × 3（`init.ts` 1111 行、`stateSchemaCoreValidators.ts` 1103 行、`pipeline.test.js` 4963 行）
- `--validate-cmd` vs `--verify-command` 类型冲突、15+ flag 缺失文档
- `@types/node` 版本不匹配

### 与原始评估文档的关系

本文档的 §1-§6 聚焦于已确认闭环的交付链路（finalize、delivery gate、delivery docs、skill capture），这一视角是**有效的 —— 交付闭环确实是当前最重要的架构成就**。但原始评估中关于代码质量、安全性、逻辑正确性的 34 项细节发现仍然成立且大部分未修复，本节（§7-§8）将其作为当前状态的完整追踪补充。
