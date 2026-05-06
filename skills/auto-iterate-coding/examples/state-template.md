# Auto Iterate Coding State Template

将本模板复制为项目内 `.agent-state/auto-iterate-coding.md`，用于 Autopilot 或复杂任务跨会话恢复。

不要在状态文件中写入密钥、token、密码、连接串、大段日志或完整源码。

```text
# Auto Iterate Coding State

## Task
用户目标：
成功标准：
非目标：
允许修改范围：
兼容性约束：

## Agent Capability Summary
读文件/搜索代码：available / unavailable / unknown
修改文件：available / unavailable / unknown
运行命令：available / unavailable / unknown
真实测试：available / unavailable / unknown
状态持久化：available / unavailable / unknown
子 Agent/并行：available / unavailable / unknown
网络/外部服务：available / unavailable / user-confirmed-required
数据库/密钥：available / unavailable / user-confirmed-required
git 状态/diff：available / unavailable / unknown
媒体/文档处理：available / unavailable / not_needed
降级策略：
阻塞能力：

## Budgets
max_iterations：
autopilot_max_iterations：
implementation_iterations_used：
optimization_iterations_used：
remaining_implementation_iterations：
remaining_optimization_iterations：

## Recovery / Reconcile
当前分支：
git 状态/diff 摘要：
状态文件与当前代码是否一致：yes / no / unknown
上次停止后外部修改：none / detected / unknown
最近验证是否已重新运行：yes / no / unavailable
reconcile 结论：continue / update_state_first / blocked

## Current State
当前阶段：
任务规模：
Autopilot：
完整任务清单：
已完成任务：
当前任务：
剩余任务：
整体完成状态：in_progress / blocked / passed
最近修改：
关键文件：
最近验证命令：
最近验证结果：
首个关键失败信号：
未验证项：
需要用户决策：

## Requirement Coverage Matrix
REQ-001：
原文摘要：
类型：功能 / 兼容性 / 验证 / 性能 / 安全 / 文档 / 约束
状态：pending / implemented / passed / blocked / not_verified
相关文件：
验证证据：
阻塞原因：
下一步：

REQ-002：
原文摘要：
类型：
状态：pending
相关文件：
验证证据：
阻塞原因：
下一步：

## Definition of Done
成功标准 1：passed / not_verified / blocked
成功标准 2：passed / not_verified / blocked
成功标准 3：passed / not_verified / blocked
真实验证：
沙箱验证：
未验证项：
Requirement Coverage Matrix 状态：
剩余风险：

## Decisions
已确认的架构决策：
已确认的产品行为：
已确认的接口兼容性：
用户提供的限制：

## Hypotheses
已排除假设：
当前主要假设：
下一步最小动作：

## Validation
已通过验证：
失败验证：
未运行验证及原因：
沙箱验证：
不可用能力导致的未验证项：

## Context Handoff Summary
目标：
当前状态：
已完成：
完整任务清单完成状态：
剩余任务：
当前失败：
已验证命令：
已排除假设：
当前假设：
下一步：
禁止事项：
剩余预算：

## Resume Prompt
下次继续时，请使用 auto-iterate-coding skill。
如果存在本文件，请先读取它作为任务恢复状态。
继续时不要依赖历史对话，只依赖本状态文件、当前代码和真实验证结果。
从“下一步最小动作”继续，并在每轮迭代后更新本文件。
如果 Requirement Coverage Matrix 中仍存在 pending / implemented / not_verified 的关键需求，不要按成功交付输出。
```
