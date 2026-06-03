# 主 Agent 裁判 Runbook

## 定位

本 Runbook 是默认自动迭代路径的可执行裁判清单。核心原则固定为：

```text
主 Agent（裁判） -> coder subagent（运动员） -> 主 Agent（裁判）
```

每轮只允许一个 coder 修改业务代码。主 Agent 不亲自修改业务代码；主 Agent 必须亲自完成校验、审计、状态合并、预算、Watchdog 和交付门禁。

## 每轮裁判步骤

1. 读取 `state.json`，执行恢复一致性检查：current 指针、git status/diff、上一轮产物、最近验证是否可信。
2. 用 `pickNextFocus` 或等价判断选择一个最小 focus；同一轮不得混合多个无关目标。
3. 构建 coder prompt：写明 `result.json` 路径、读写范围、禁止运行命令、禁止写 state、禁止声明整体完成。
4. 派发 `Agent(subagent_type="coder")`；coder 只允许修改 scope 内业务代码并写入本轮 `result.json` 后停止。
5. 主 Agent 读取 `result.json`，用 `resultSchema` 或等价 schema 做机械 schema 校验；非法则拒绝本轮，不得合并。
6. 主 Agent 用确定性 Node runner 执行验证命令，记录 `command`、`exit_code`、`duration_ms`、stdout/stderr tail。
7. 主 Agent 用 `git diff --name-only` 或等价工具事实审计实际改动；scope violation 必须拒绝本轮。
8. 主 Agent 写入本轮 `iterations/<n>/validation.log`。
9. 主 Agent 合并 state：coder 只能把 requirement 推到 `implemented`；只有主 Agent 验证通过后才能标记 `passed`。
10. 主 Agent 刷新 `state.json` 和 `state.md`，更新预算、Watchdog、RCM、DoD、traceability 和下一步。
11. 执行 `shouldStop` / delivery gate；需要用户决策时只问必要问题，否则进入下一轮。

## validation.log 门禁

每个存在 `iterations/<n>/result.json` 的实现轮次，交付前必须有同目录 `validation.log`。

`validation.log` 至少应证明：

- schema 检查已执行，或本轮因 schema invalid 被拒绝。
- 每条真实验证命令有 `exit_code`。
- 每条真实验证命令有 `duration_ms`，且大于 0。
- scope/write guard 结论已记录，或明确说明 git/scope 审计不可用并标记风险。

没有这些证据时，不得按成功交付输出；应进入验证补强、reconcile 或 need_decision。

## Coder 硬边界

Coder 必须遵守：

- 只能做本轮 focus。
- 只能写 scope 内业务文件和本轮指定 `result.json`。
- 不得运行 build/test/lint/install/migration/network/git 等命令。
- 不得写 `state.json`、`state.md`、`auto-iterate-current.json`、`start-prompt.md` 或其它 session 权威文件。
- 不得声明整体完成；不得询问用户；不得把需求标记为 `passed`。

## Protocol-only 例外

用户显式要求 `--no-run`、手动模式、不启动 subagent，或当前环境没有可用原生 Agent 工具时，进入 protocol-only / LLM-only。该模式不使用主 Agent / coder 角色边界，由当前 LLM 自律执行同一组 RCM、验证、state、Watchdog 和交付门禁。

自动模式运行中不得因 coder 失败、任务较小或验证失败而静默切换为 protocol-only；需要切换时必须进入 `need_decision` 或 `blocked`。
