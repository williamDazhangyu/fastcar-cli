# 自动迭代编码状态


## Session / 会话
session：session-only-test
状态文件：.agent-state/auto-iterate/session-only-test/state.md
启动提示：.agent-state/auto-iterate/session-only-test/start-prompt.md
current 指针：.agent-state/auto-iterate-current.json
恢复优先级：当前消息显式 session > session state > current 指针 > 对话推断
语言规则：输出、状态记录和交付总结必须与用户当前提示语言保持一致；用户使用中文时不要突然切换为英文，除非术语、命令、代码或用户明确要求保留英文

## Mode / 模式
模式：quick / 快速启动
模式说明：适合小中型任务，Agent 先从代码库推断流程清单。
Autopilot：true
允许 Agent 推断流程清单：true
允许修改文件：true

模式执行规则：
快速启动模式：
- Agent 先探索代码库并生成“推断版 AI 实现流程清单”。
- 只有以下情况才停止询问用户：成功标准会影响产品行为、修改范围可能跨模块、验证命令缺失且无法推断、需要数据库/密钥/外部服务/新依赖、可能破坏兼容性。
- 在实现前把推断出的成功标准、修改范围、验证命令和 Requirement Coverage Matrix 写入状态。

## Task / 任务
用户目标：
修复登录失败

成功标准：
- 由 Agent 先探索代码库后推断，并在实现前写入需求覆盖矩阵（Requirement Coverage Matrix）

非目标：
- 不做与本需求无关的重构、架构迁移或新依赖引入

允许修改范围：
优先限于与目标直接相关的最小文件集合；跨模块修改前停止确认

兼容性约束：
- 保持现有公开 API、CLI 命令、配置、数据格式和测试行为；可能破坏兼容性时停止确认

## Agent 能力摘要
读文件/搜索代码：unknown
修改文件：unknown
运行命令：unknown
真实测试：unknown
状态持久化：available
子 Agent/并行：unknown
网络/外部服务：unknown
数据库/密钥：user-confirmed-required
git 状态/diff：unknown
媒体/文档处理：not_needed
降级策略：能力不可用时标记 not_verified 或 blocked，不得伪造验证
阻塞能力：待 Agent 启动后探测

## Budgets / 预算
max_iterations：100
autopilot_max_iterations：10
implementation_iterations_used：0
optimization_iterations_used：0
total_cycles：0
remaining_implementation_iterations：10
remaining_optimization_iterations：未开始
计数口径：实现迭代 = 修改 + 验证/记录 + 状态更新的闭环；只读探索、reconcile、上下文压缩、向用户提问和纯验证不计入实现迭代

## Recovery / Reconcile / 恢复一致性检查
当前分支：待检查
git 状态/diff 摘要：待检查
状态文件与当前代码是否一致：unknown
上次停止后外部修改：unknown
最近验证是否已重新运行：no
reconcile 结论：启动时先检查

## Current State / 当前状态
当前阶段：quick_start
任务规模：auto
Autopilot：true
完整任务清单：待从成功标准、原始清单和模式规则提取
已完成任务：无
当前任务：先探索代码库并生成推断版 AI 实现流程清单
剩余任务：所有需求
整体完成状态：in_progress
最近修改：无
关键文件：未探索
最近验证命令：未运行
最近验证结果：未运行
首个关键失败信号：无
未验证项：全部成功标准尚未验证
需要用户决策：无
反馈闭环：未建立
架构摩擦：none
原型状态：not_needed

## Watchdog / 看门狗
enabled：true
check_interval：每轮迭代前后、上下文压缩后、恢复后、最终交付前
light_check：每轮必做，检查 no_progress_count / last_validation_result / state_drift / triggered
full_check：每个 phase、每 3 轮、恢复后和交付前执行完整字段检查
last_progress_iteration：0
last_progress_summary：CLI 已生成初始状态，Agent 尚未开始执行
last_validation_iteration：0
last_validation_command：未运行
last_validation_result：未运行
no_progress_count：0 / 按模式 max_no_progress_iterations
unverified_iteration_count：0
state_drift：none
delivery_verifiability：unknown
triggered：false
trigger_reason：无
required_action：run_validation

## Requirement Coverage Matrix / 需求覆盖矩阵
REQ-BOOTSTRAP：
原文摘要：启动后必须先从用户目标、成功标准、原始清单文档和当前模式提取完整 Requirement Coverage Matrix
类型：验证
状态：pending
相关文件：.agent-state/auto-iterate/session-only-test/state.md
验证证据：无
阻塞原因：无
下一步：读取原始清单和当前代码，拆分 REQ-001...REQ-N，并在实现或验证前更新本矩阵

## Definition of Done / 完成定义
成功标准 1：not_verified - 由 Agent 先探索代码库后推断，并在实现前写入需求覆盖矩阵（Requirement Coverage Matrix）
真实验证：未运行
沙箱验证：未运行
未验证项：全部成功标准尚未验证
Requirement Coverage Matrix 状态：未提取完整矩阵，REQ-BOOTSTRAP pending
交付可验证性：unknown
看门狗状态：triggered - required_action: run_validation
剩余风险：尚未开始执行

## Decisions / 已确认决策
已确认的架构决策：未确认，优先从现有代码和脚手架推断
已确认的产品行为：以本文件成功标准为准；快速模式下先由 Agent 推断并等待必要确认
已确认的接口兼容性：
- 保持现有公开 API、CLI 命令、配置、数据格式和测试行为；可能破坏兼容性时停止确认
用户提供的限制：
- 不要连接生产数据库
- 不要写入密钥、token、密码或连接串
- 不要新增依赖，除非先说明原因并等待确认

## Hypotheses / 假设
已排除假设：无
排序候选假设：未生成
当前主要假设：可以通过当前 Agent 能力探测、现有项目结构和验证命令推进本模式
下一步最小动作：先探索项目结构、脚本和相关代码，生成推断版成功标准、修改范围、验证命令和 Requirement Coverage Matrix

## Validation / 验证
已通过验证：无
失败验证：无
未运行验证及原因：尚未开始
沙箱验证：无
不可用能力导致的未验证项：待 Agent 能力探测
最终交付可验证性：unknown
可运行的验证命令：
- 由 Agent 从 package.json、Makefile、scripts、CI 配置和项目约定中识别；缺失时标记 not_verified

## Temporary Artifacts / Cleanup / 临时产物清理
临时 debug 前缀：无
一次性 harness：无
原型文件或路由：无
待删除 artifacts：无
清理状态：pending

## Context Handoff Summary / 上下文交接摘要
目标：修复登录失败
成功标准：由 Agent 先探索代码库后推断，并在实现前写入需求覆盖矩阵（Requirement Coverage Matrix）
当前状态：快速启动 启动前，等待 Agent 读取状态并开始执行
已完成：CLI 已生成初始状态和启动提示
完整任务清单完成状态：未提取
剩余任务：所有需求
当前失败：无
已验证命令：未运行
已排除假设：无
当前假设：可以先完成 Agent 能力探测和 feedback loop 识别
下一步：先探索项目结构、脚本和相关代码，生成推断版成功标准、修改范围、验证命令和 Requirement Coverage Matrix
禁止事项：不要伪造验证，不要泄露或写入密钥，不要破坏兼容性约束；Verify-only/Plan-only 未获明确允许不得修改项目文件
Watchdog：enabled，交付前必须从 unknown 更新为 verifiable / partially_verifiable / not_verifiable
剩余预算：实现迭代 10 / 普通预算 100

## Resume Prompt / 恢复提示
下次继续时，请使用 auto-iterate-coding skill。
如果存在本文件，请先读取它作为任务恢复状态。
继续时不要依赖历史对话，只依赖本状态文件、当前代码和真实验证结果。
从“下一步最小动作”继续，并在每轮迭代后更新本文件。
如果 Requirement Coverage Matrix 中仍存在 pending / implemented / not_verified 的关键需求，不要按成功交付输出。
如果 Watchdog triggered 为 true，先处理 required_action；交付可验证性为 not_verifiable 或 unknown 时，不要按成功交付输出。
如果 Temporary Artifacts / Cleanup 中仍有未清理的 debug 日志、harness、原型路由或一次性文件，不要按成功交付输出，除非用户明确要求保留并已标记原因。
