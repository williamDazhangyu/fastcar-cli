# Protocol-only / LLM-only Autopilot 启动示例

默认自动模式不使用旧 Worker pipeline：主 Agent 应直接派发 `Agent(subagent_type="coder")`，自己负责验证、write guard、state merge 和交付门禁。CLI 只用于 session 管理、`--validate-state`、`--finalize`，或用 `--yes` 生成 native-subagent session 骨架。

只有用户显式要求 protocol-only / LLM-only、手动模式、不启动 subagent，或当前环境没有 `Agent(subagent_type="coder")` 工具时，才把下面内容发给当前 LLM，用于在同一会话里按自动迭代技巧执行复杂需求的有界多轮迭代。本示例只保留可复制骨架；执行规则以 `auto-iterate-coding/SKILL.md`、`examples/state-template.md` 和相关 references 为准，避免模板与主协议形成双重来源。

```text
请使用 auto-iterate-coding skill，进入 Autopilot 全自动迭代模式。

请严格按 auto-iterate-coding/SKILL.md 执行：
- 先完成能力探测、session `state.json` 读取/创建、reconcile 和 Requirement Coverage Matrix；缺少 `state.json` 的旧 session 可降级读取 `state.md`，但要标记 degraded。
- 每轮按真实 feedback loop 推进，实现后运行可用验证，并更新 `state.json` 的 At-a-Glance、Budgets、Current State、Watchdog、RCM 和 DoD，再刷新 `state.md` 生成视图。
- 如果 remaining_implementation_iterations = 0，先请求我追加预算，不要自动继续。
- 不要把阶段完成、最小纵切通过或原型可行误判为完整交付。
- 最终按 references/final-delivery.md 输出成功交付、有限成功或提前停止。

AI 实现流程清单：

用户目标：
[写清楚要实现什么]

成功标准：
1. [可验收标准 1]
2. [可验收标准 2]
3. [可验收标准 3]

非目标：
1. [本次不做什么]

允许修改范围：
[允许改哪些目录、模块、文件类型]

需要保持兼容的接口、命令或行为：
[不能破坏哪些 API、CLI、配置、数据格式]

可运行的验证命令：
[例如 npm test / pnpm test / cargo test / pytest / go test ./...]

外部资源、密钥、数据库、网络或沙箱限制：
[是否允许联网、数据库、密钥、mock、sandbox、新依赖]

交付格式：
最终输出实现总结、关键修改、完整任务清单完成状态、Requirement Coverage Matrix、Definition of Done、验证证据、未验证项、剩余任务、风险、验收建议，以及当前 session `state.json` / `state.md` 的最终状态摘要。

迭代预算：
max_iterations = 100
autopilot_max_iterations = 20

确认后开始自动化开发；除非触发停止条件，否则持续迭代到完整任务清单全部通过验证或预算耗尽。
```

## 示例填充

```text
用户目标：
实现一个用户登录功能，支持邮箱 + 密码登录，并返回 JWT token。

成功标准：
1. 用户可以通过正确邮箱和密码登录。
2. 密码错误时返回明确错误。
3. 不存在的用户返回明确错误。
4. 登录成功后返回 token。
5. 现有测试、构建、类型检查通过。

非目标：
1. 本次不实现注册。
2. 本次不实现刷新 token。
3. 本次不改动用户表结构，除非现有结构完全无法支持。

允许修改范围：
后端 auth/login 相关代码、测试文件、必要的类型定义和路由注册。

需要保持兼容的接口、命令或行为：
不要破坏现有用户 API。
不要修改已有 CLI 命令行为。
不要删除或削弱现有测试。

可运行的验证命令：
npm test
npm run build
npm run typecheck

外部资源、密钥、数据库、网络或沙箱限制：
不允许连接生产数据库。
可以使用本地测试数据库、fixture 或 mock server。
不要新增依赖，除非先说明原因并等待我确认。
```
