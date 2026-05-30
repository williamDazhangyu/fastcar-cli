# auto-iterate CLI Orchestrator

本文件记录 `fastcar-cli auto-iterate --run` 路径下谁负责什么，供维护者和 Router LLM 审阅。核心原则：CLI 持有主循环、状态、验证和停止条件；Worker 只执行单步；Router 只路由和转述。

## 职责分工

| 协议原则 | CLI 职责 | Worker 职责 | Router LLM 职责 |
| --- | --- | --- | --- |
| 自然语言路由 | 提供 `--run`、`--check`、`--json-progress` 等 flag | 不参与 | 把用户意图翻译为 `fastcar-cli auto-iterate ...` |
| Requirement Coverage Matrix | 通过 `mergeIterationIntoState` 独占合并 | 只提交 `requirements` 建议 | 只读进度并转述 |
| 最小纵切 | `pickNextFocus` 每轮只选一个 focus | 只做该 focus | 不扩大范围 |
| Definition of Done | 从 RCM、CLI 验证、delivery_gate 和 watchdog 派生 | 不声明整体完成 | 最终只转述 CLI 结果 |
| Watchdog | 每轮检查预算、决策、验证和状态漂移 | 返回 blocked / need_decision 信号 | 遇 need_decision 问用户 |
| CLI 验证 | `runValidationCommands` 独立运行命令并写证据 | 不伪造验证 | 不自行替代 CLI 验证 |
| 可追溯记录 | 清洗并合并 `trace`、补充验证和路径证据 | 只提交公开推理摘要，不输出私有思考链 | 只转述公开摘要 |
| 交付文档 | `--finalize` 生成 docs/api.md、changelog.md、architecture.md、implementation.md | 只提交 documentation 建议 | 转述文档路径 |
| 预算递减 | `mergeIterationIntoState` 唯一递减 | 禁止写 budgets | 不手动编辑 budgets |
| 停止条件 | `shouldStop` 决定 continue / stop | 做完即退出 | 不为了凑轮数继续 |
| 恢复 | `--resume <session> --run` 读取 state 后继续 | 无状态 | 根据用户回答传 `--answer` |

## 代码化出口

- `src/pipeline/runPipeline.ts`：主循环，负责 spawn Worker、解析结果、运行验证、合并状态和输出事件。
- `src/pipeline/loopPolicy.ts`：集中解析 `once`、`plan`、`autopilot`、`maxSteps` 的 loop shape 与运行轮数。
- `src/pipeline/flags.ts`：集中维护 pipeline flag 稳定性，Router 默认路由只能使用 `routable` 及以上 flag。
- `src/pipeline/iterationPrompt.ts`：构造单步 Worker prompt。
- `src/pipeline/iterationPaths.ts`：集中管理每轮 prompt、result、worker.log、validation.log 路径。
- `src/pipeline/pickFocus.ts`：选择 `extract_requirements`、`implement_req`、`fix_bug`、`harden_validation`、`optimize`、`verify_optimization`、`reproduce`、`hypothesis_test`、`regression_check`、`verify_req`、`plan_once`、`establish_baseline` 等 focus。
- `src/pipeline/mergeState.ts`：白名单合并 Worker 建议，禁止 Worker 覆盖预算、watchdog、验证和 session 元数据。
- `src/pipeline/shouldStop.ts`：预算耗尽、`--once`、watchdog stop、need_decision 和需求关闭时停止。
- `src/pipeline/resultSchema.ts`：校验 `result.json`。
- `src/pipeline/deliveryDocs.ts`：在 finalize 阶段根据 state 生成 `.agent-state/auto-iterate/<session>/docs/` 下的可追溯交付文档。
- `src/pipeline/envCheck.ts`：实现 `--check`，输出 `env_check` 事件。
- `src/pipeline/progress.ts`：`--json-progress` 下 stdout 只输出 NDJSON。
- `src/pipeline/watchdog.ts`：集中判断 `ask_user`、`stop`、验证失败和 no-progress 触发。
- `src/pipeline/phaseGate.ts`：根据 mode 与需求状态派生当前阶段和是否可继续。
- `src/pipeline/writeGuard.ts`：执行 verify/plan 写保护、`--scope` 范围检查和 `.agent-state/` 禁写。
- `src/pipeline/routerUx.ts`：把 Router UX 验收规则代码化，覆盖先 `--check` 再 `--run --autopilot --json-progress`、exit 42 后 `--resume --answer`、中断恢复、无 Worker fallback 和禁止手动复制/运行句式。
- `src/adapters/*`：Worker CLI 适配器；环境变量命令模板使用 `{prompt}`、`{result}`、`{session}`、`{iteration}`。

## 事件契约

`--json-progress` 模式下 stdout 必须是 NDJSON。当前事件包括：

- `env_check`：只读环境检查。
- `session_started`：pipeline 启动，包含 session、mode、agent、loop_shape。
- `iteration_start`：本轮 focus 和 prompt 路径。
- `agent_done`：Worker exit code、result 路径、log 路径。
- `validation_done`：CLI 验证命令、状态、exit code 和摘要。
- `state_merged`：状态已原子写回。
- `delivery_gate`：交付门禁检查结果，包含 open/blocked requirements、verifiability、delivery evidence 和 blocking reasons。
- `need_decision`：需要用户决策，CLI 以 exit code 42 退出。
- `worktree_created` / `worktree_merged` / `worktree_cleaned`：`--isolate` worktree 生命周期。
- `pipeline_stopped`：停止原因。
- `error`：机器可读错误。

## 路径 A 与路径 B

路径 A 是 CLI 驱动。Router LLM 不直接改代码、不自己写 state、不自己跑验证；Worker 遵守 `worker.md`。

路径 B 是无 CLI fallback。只有 Worker CLI 不可用、CLI flag 不存在、用户显式 `--no-run` 或运行环境无法 spawn Worker 时，才按 `SKILL.md` 后续完整协议由当前 Agent 手动执行。
