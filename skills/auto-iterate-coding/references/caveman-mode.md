# Caveman Mode：超压缩通信

用于 Autopilot 长任务或上下文紧张时，将 Agent 输出压缩到最小，同时保持技术准确性。

## 定位

Autopilot 默认的 `intermediate_reporting = concise_progress_only` 已经要求 Agent 只输出关键阶段、当前失败信号和下一步。Caveman Mode 是更激进的压缩级别：Agent 的每轮输出被压缩到 1-3 行的电报风格，token 消耗降低约 75%。

## 何时启用

- Autopilot 模式的 `intermediate_reporting = caveman`。
- 上下文接近上限，需要节省 token 继续推进。
- 用户明确要求"简短点"、"只说关键"、"压缩输出"。
- 多 session 并行时，减少每个 session 的输出噪音。

## 输出格式

Caveman Mode 下，Agent 每轮输出只包含：

```text
[轮次] [动作] [结果] [下一步]
```

### 示例

普通输出：
```text
第 3 轮迭代：修改了 src/auth/login.ts 中的 token 验证逻辑。
运行 npm test 后，3 个测试通过，1 个失败：test "expired token should return 401"。
失败原因是 token 过期检查使用了 Date.now() 而不是传入的当前时间。
下一轮将修复时间比较逻辑，改用参数传入的 now。
```

Caveman 输出：
```text
[3] fix login.ts token check | build=0 test=3/4 FAIL: expired token 401 | next: fix Date.now() → param now
```

### 字段定义

| 字段 | 含义 | 必填 |
|------|------|------|
| `[轮次]` | 当前实现迭代编号 | 是 |
| `[动作]` | 本轮的修改摘要（< 8 词） | 是 |
| `[结果]` | 验证结果：exit code、通过/失败数、关键错误 | 是 |
| `[下一步]` | 下一轮的最小动作 | 是 |
| `[阻塞]` | 需要用户决策或资源 | 仅在 blocked 时 |
| `[预算]` | 剩余实现迭代轮次 | 每 5 轮或预算 < 5 时 |

## 停用条件

以下情况自动退出 Caveman Mode：

- 需要用户决策（need_decision / blocked）：输出完整问题描述和选项。
- 任务完成：输出完整交付总结。
- 提前停止：输出提前停止模板。
- 用户要求详细输出。

## 与上下文压缩的关系

Caveman Mode 是**通信风格**的改变，上下文压缩是**状态存储**的改变。两者互补：

| 手段 | 作用域 | 效果 |
|------|--------|------|
| Caveman Mode | 每轮 Agent 输出 | 减少输出 token |
| 上下文压缩 | 对话历史 | 减少输入 token |
| 领域语言 | 所有输出 | 减少描述 token |

三者叠加使用，在长任务中可节省 80%+ token 消耗。

## 与 Autopilot 的集成

在 Autopilot 模式中，`intermediate_reporting` 有三个级别：

| 级别 | 输出内容 | 适用场景 |
|------|---------|---------|
| `concise_progress_only`（默认） | 关键阶段、当前失败信号、下一步 | 普通 Autopilot |
| `caveman` | 1-3 行电报风格 | 长任务、上下文紧张 |
| `full` | 完整输出 | 调试、用户要求详细 |

在 SKILL.md §全自动迭代模式的 `intermediate_reporting = concise_progress_only` 中增加 `caveman` 选项。

## 质量要求

Caveman Mode 压缩的是输出长度，不是技术准确性：

- 错误消息必须保留关键信息（exit code、失败测试名、关键 stack frame）。
- 不能因为压缩而省略验证结果。
- 不能因为压缩而跳过 Watchdog 检查。
- 交付前必须退出 Caveman Mode，输出完整交付总结。