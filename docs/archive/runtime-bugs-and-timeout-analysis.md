# fastcar-cli auto-iterate 运行时风险状态对照

> 本文件保留 2026-05-26 静态审计的历史脉络，但不再作为“当前 Bug 报告”使用。
> 任何新的 P0/P1 结论必须同时给出当前 commit、复现命令、失败日志和覆盖缺口；不能只引用本文件的历史描述。

## 当前结论

2026-05-26 的静态审计曾指出一组 `auto-iterate --run` / `--isolate` / Worker 超时相关风险。当前工作区已经实现了其中大多数修复，并有回归测试覆盖。继续把旧条目原样引用为“当前缺陷”会误导 Router、Worker 和维护者。

权威判断顺序：

1. 以当前工作区代码为准，重点看 `src/pipeline/*`、`src/adapters/*`、`src/auto-iterate/*`。
2. 以当前测试为证据，重点看 `test/pipeline.test.js`、`test/adapters.test.js`、`test/auto-iterate-session-manager.test.js`。
3. 历史报告只能作为回归检查清单，不能直接作为当前 P0/P1 缺陷清单。

## 历史条目对照

| 历史条目 | 当前状态 | 当前证据 |
| --- | --- | --- |
| `--isolate` 新建 untracked 文件永久丢失 | 已修复 | `src/pipeline/pipelineIsolateWorktree.js` 收集 untracked 和 ignored 文件，预检冲突后复制回主工作区；`test/pipeline.test.js` 覆盖普通 untracked、带空格路径、ignored 文件和冲突半合并防护。 |
| validation 历史对象被过滤 | 已修复 | `src/pipeline/mergeValidationHistory.js` 区分配置命令与历史对象并保留有界历史；`test/pipeline.test.js` 覆盖“保留验证配置命令并对历史对象使用有界历史”。 |
| Adapter 内部异常直接崩 Pipeline | 已修复 | `src/pipeline/pipelineWorkerProgress.js` 捕获 `adapter.run()` 同步/异步异常并返回 worker failure；pipeline 输出 `worker_failed` 路径。 |
| `applyDecisionAnswer` 无 pending 时污染 state | 已修复 | `src/auto-iterate/sessionManager.js` 无 pending 直接 no-op，非法答案和 schema 失败均不落盘；`test/auto-iterate-session-manager.test.js` 和 `test/pipeline.test.js` 覆盖。 |
| 非实现轮次消耗 implementation budget | 已修复 | `src/pipeline/mergeBudgetProgress.js` 区分 implementation、optimization 和 nonImplementation；`test/pipeline.test.js` 覆盖预算区分。 |
| `writeJsonFileAtomic` 固定 `.tmp` 竞争 | 已修复 | `src/auto-iterate/stateIO.js` 和 `src/pipeline/pipelineStateIO.js` 使用 pid、时间戳和随机后缀生成同目录临时文件。 |
| `parseValidationCommands` 子字符串误过滤 | 已修复 | `src/pipeline/pipelineValidationRunner.js` 只过滤完整占位符或特定占位前缀；测试覆盖合法命令中包含 `not_run` 的场景。 |
| Kimi Adapter 同步阻塞心跳 | 已修复 | `src/adapters/kimi.js` 使用 `runNativeCommandAsync`；Worker 运行中由 `runWorkerWithProgress` 输出 `pipeline_progress`。 |
| 纯 wall-clock 超时，缺少活跃检测 | 已修复为双层超时 | `src/adapters/commandResolver.js` 支持 wall-clock timeout、inactivity timeout、timeout warning 和 grace kill；CLI 暴露 `--step-timeout`、`--inactivity-timeout`、`--validation-timeout`。 |
| prompt 文件不存在导致 pipeline 崩溃 | 已收敛为 worker failure | Adapter 内部 `readFileSync` 仍可能抛错，但外层 `runWorkerWithProgress` 会捕获，不再直接崩 pipeline。 |

## 仍需谨慎表达的真实风险

- `state.md` 是派生视图，写入已经使用 atomic rename，但 read-modify-write 没有跨进程 CAS 或文件锁。多 CLI 实例同时操作同一 session 时仍可能 last-writer-wins；权威状态必须以 `state.json` 为准。
- Worker result 已经写好时，CLI 可能主动终止仍在运行的 Worker。当前实现会继续推进有效 result，但极端情况下仍应关注 Worker 后续写文件的竞态。
- `--isolate` 的真实 native Worker 矩阵仍受各 CLI 登录态、平台权限和认证方式影响；env-template/provider-proxy smoke 不能替代官方 native smoke。

## 新反馈的最低证据要求

如果有人再次提交类似 P0/P1 清单，请要求同时提供：

- `git rev-parse HEAD` 或发布包版本。
- 完整命令行和环境变量。
- NDJSON 事件、stdout/stderr 或失败 state 片段。
- 能证明当前测试未覆盖该路径的最小复现。

没有这些证据时，类似“`git diff HEAD` 不包含 untracked”“Kimi 使用 sync spawn”“`--answer` 会创建非法 state”等说法只能视为历史回归检查项。
