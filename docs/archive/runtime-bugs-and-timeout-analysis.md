# auto-iterate 旧运行时风险归档

本文件只保留旧 `auto-iterate` 运行时风险的历史上下文，不再作为当前 Bug 清单、P0/P1 状态矩阵或实现依据。

旧 CLI Worker 路径已经移除，包括 `fastcar-cli auto-iterate --run`、旧隔离运行、adapter 运行时和外部 Worker 主循环。当前默认架构是主 Agent 直接管理 `coder` subagent；CLI 只负责 session 管理、只读校验、自然语言路由辅助、状态文件和交付文档生成。

## 当前权威入口

- 当前架构说明：`docs/auto-iterate-current-architecture.md`
- 当前状态结构：`skills/auto-iterate-coding/references/state-schema.md`
- 当前自然语言路由：`skills/auto-iterate-coding/references/natural-language-routing.md`
- 当前协议入口：`skills/auto-iterate-coding/SKILL.md`
- 当前测试证据：`test/auto-iterate/**`、`test/skills/**`

判断当前实现是否存在缺陷时，应优先读取当前代码、当前测试和最近验证日志；不要从本归档页反推出当前行为。

## 历史风险的使用方式

旧报告只能作为迁移审计线索，用来提醒维护者检查同类风险是否在当前架构中重新出现。它不能直接证明当前版本仍存在旧 Worker、旧 adapter、旧 `--isolate` 或旧超时模型的问题。

如果类似风险再次出现，新的问题报告至少需要提供：

- 当前 commit 或发布包版本。
- 完整复现命令和关键环境信息。
- stdout/stderr、`validation.log`、`result.json` 或相关 `state.json` 片段。
- 当前代码路径与失败路径说明。
- 现有测试未覆盖该路径的最小证据。

没有这些证据时，相关说法只能视为历史回归检查项，不能标记为当前缺陷。
