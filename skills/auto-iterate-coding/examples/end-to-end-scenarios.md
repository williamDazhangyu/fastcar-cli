# End-to-End Scenarios

本文件提供两个最小端到端案例，帮助 Agent 理解何时继续、何时交付、何时提前停止。真实执行时仍以用户目标、当前代码和验证结果为准。

## 案例一：Autopilot 成功交付

用户请求：

```text
帮我快速启动自动迭代，修复登录失败，session 叫 login-bugfix，最多跑 5 轮。
```

路由命令（自动模式）：

```bash
fastcar-cli auto-iterate --check --json-progress
fastcar-cli auto-iterate --run --autopilot --quick --goal "修复登录失败" --session login-bugfix --autopilot-max-iterations 5 --json-progress
```

关键流程：

1. Router 只读取 NDJSON 事件并转述进度；CLI 负责创建或读取 `.agent-state/auto-iterate/login-bugfix/state.json`，Worker 只执行单轮 prompt 并写 `result.json`。
2. 能力探测显示可读写文件、可运行 `npm test`，无外部数据库依赖。
3. 建立反馈闭环：`npm test -- auth.login` 复现密码校验失败。
4. Iteration 1：修复密码比较逻辑，运行目标测试通过，更新 RCM 中登录失败需求为 `passed`。
5. Iteration 2：运行 `npm test` 和 `npm run typecheck`，全部通过；Watchdog light/full check 均 clear。
6. 交付前检查：`剩余任务` 为空，关键需求全部 `passed`，`delivery_verifiability = verifiable`，临时 debug 已清理。

最终输出形态：

```text
实现了什么：修复登录密码校验路径，错误密码和正确密码行为均恢复。
完整任务清单完成状态：passed，剩余任务为空。
运行的真实验证：npm test -- auth.login passed；npm test passed；npm run typecheck passed。
交付可验证性：verifiable。
看门狗状态：clear。
Session state：.agent-state/auto-iterate/login-bugfix/state.json 已更新，state.md 生成视图已刷新。
```

## 案例二：Watchdog 提前停止

用户请求：

```text
Diagnose 当前 e2e 偶发失败，session 叫 flaky-e2e，最多跑 3 轮。
```

路由命令（自动模式）：

```bash
fastcar-cli auto-iterate --check --json-progress
fastcar-cli auto-iterate --run --autopilot --diagnose --goal "诊断当前 e2e 偶发失败" --session flaky-e2e --autopilot-max-iterations 3 --json-progress
```

关键流程：

1. Router 只读取 NDJSON 事件并转述进度；CLI 负责创建或读取 `.agent-state/auto-iterate/flaky-e2e/state.json`，Worker 只执行单轮 prompt 并写 `result.json`。
2. 能力探测显示可运行测试，但缺少浏览器服务账号，完整 e2e 不能稳定启动。
3. Iteration 1：尝试运行最小 e2e 复现命令，失败于缺少服务账号，记录 `blocked`。
4. Iteration 2：改用可用的单元测试和本地 mock 复现，未能复现用户描述的失败，`last_validation_result = not_aligned`。
5. Iteration 3：尝试从日志定位失败信号，但没有 artifact，`no_progress_count` 达到预算。
6. Watchdog full check 触发 `required_action = ask_user` 或 `stop`：缺少复现 artifact 和必要账号，继续 patch 会变成猜测。

提前停止输出形态：

```text
已完成内容：确认本地缺少完整 e2e 所需服务账号；尝试了最小 e2e 和单元级替代验证。
停止原因：无法建立与用户描述对齐的 feedback loop；达到 Autopilot 预算；Watchdog 触发 stop。
交付可验证性：not_verifiable。
已实现但未验证的交付成果：无生产修复，未做猜测性 patch。
缺少的最小验证条件：失败 e2e 日志、可用测试账号或可复现命令。
建议的下一步：用户提供 artifact 后恢复 session flaky-e2e 继续。
Session state：.agent-state/auto-iterate/flaky-e2e/state.json 已更新，state.md 生成视图已刷新。
```

如果本次停止时 `remaining_implementation_iterations = 0`，恢复 `flaky-e2e` 后不得自动继续修改。Agent 必须先请求用户追加预算；用户确认后只更新预算字段和追加预算记录，`implementation_iterations_used`、已完成内容、验证记录和 Watchdog 历史不清零。

## 手动 / fallback 补充

只有用户显式要求手动模式 / `--no-run`，或 `--check` 显示 Worker 不可用时，才把上面的自动命令降级为不带 `--run` 的启动命令，例如：

```bash
fastcar-cli auto-iterate --quick --goal "修复登录失败" --session login-bugfix --autopilot-max-iterations 5 --yes --no-run
```

此时当前 Agent 才读取 `.agent-state/auto-iterate/<session>/start-prompt.md`，并在同一会话里维护 state、RCM、DoD、Watchdog、验证记录和停止条件。
