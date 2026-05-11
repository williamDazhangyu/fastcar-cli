# TDD 垂直切片

用于新功能、修 bug 的 test-first 循环，以及防止横向切片导致测试质量下降。

## 核心循环

新功能优先使用 tracer-bullet TDD：

```text
RED: 写一个外部行为测试 -> 确认失败
GREEN: 写最小实现 -> 确认通过
NEXT: 基于刚学到的内容选择下一个行为
```

规则：

- 一次只写一个行为测试和一个最小实现。
- 测试 public interface 和可观察行为，不测试私有实现细节。
- 不预先实现未来需求。
- RED 状态下不要重构；先到 GREEN。

## 禁止横向切片

不要把 RED 理解为“先写全部测试”，再一次性实现全部代码。

错误方式：

```text
RED:   test1, test2, test3, test4
GREEN: impl1, impl2, impl3, impl4
```

正确方式：

```text
RED -> GREEN: test1 -> impl1
RED -> GREEN: test2 -> impl2
RED -> GREEN: test3 -> impl3
```

横向切片常见问题：

- 批量测试的是想象中的行为，不是刚刚学到的真实行为。
- 测试数据结构、函数形状或调用顺序，而不是用户可观察能力。
- 测试对真实行为变化不敏感，重构时却容易失败。
- 在不了解实现前过早承诺测试结构。

## 每轮检查

每个 TDD 循环后检查：

```text
[ ] 测试描述行为，而不是实现步骤
[ ] 测试只穿过 public interface
[ ] 测试应能承受内部重构
[ ] 代码只满足当前测试
[ ] 没有加入投机性功能
```

如果没有正确 test seam，把它记录为架构摩擦。不要用脆弱 mock、测试私有方法或硬编码输出来制造虚假信心。

## 行为优先

测试应通过 public interface 验证可观察行为，而不是验证 implementation shape。

优先测试：

- 用户、调用方或 CLI 能观察到的输入输出。
- 状态变化、错误行为、事件、HTTP 状态、生成文件或持久化结果。
- 真实代码路径上的集成行为。

避免测试：

- 私有方法、内部调用顺序、临时数据结构、日志文本和 implementation helper。
- 因重命名、拆函数或重排内部模块就会失败的细节。
- 只为了让 mock 满足预期而写的测试。

## Bug 修复路径

修 bug 时先把 feedback loop 的最小复现转成回归测试，前提是存在正确 seam。

流程：

```text
1. 用原始 feedback loop 复现用户问题
2. 在正确 seam 上写最小失败测试
3. 确认测试失败且失败模式对齐用户问题
4. 做最小修复
5. 运行回归测试
6. 重新运行原始 feedback loop
```

如果没有正确 seam，不要硬测私有实现。把“没有正确 test seam”标为架构摩擦，并在 Requirement Coverage Matrix 中把相关验证标为 `not_verified` 或 `blocked`。

## 重构门槛

只有 GREEN 后才允许重构。每一步重构都必须保持验证通过，并且只做与当前目标相关的低风险整理。不要在 RED 状态或验证不可运行时做大范围抽象。
