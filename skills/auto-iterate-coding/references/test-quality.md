# 测试质量

用于判断测试是否验证真实行为、是否耦合实现细节，以及是否能作为长期回归保护。

## 好测试

好测试通过 public interface 验证调用方关心的行为。它描述系统做什么，而不是怎么做。

特征：

- 测试用户、调用方或外部系统关心的行为。
- 只使用 public interface。
- 能承受内部重构。
- 名称像规格，而不是实现步骤。
- 一个测试聚焦一个逻辑行为。
- 断言可观察结果、错误模式、状态变化或返回值。

示例：

```typescript
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);

  const result = await checkout(cart, paymentMethod);

  expect(result.status).toBe("confirmed");
});
```

## 坏测试

坏测试耦合内部结构。警告信号是：行为没变，只是重构、重命名或移动内部函数，测试就失败。

红旗：

- mock 自己的内部 module。
- 测试 private 方法。
- 断言内部调用次数或调用顺序。
- 通过数据库查询等外部手段绕过 interface 验证。
- 测试名称描述 HOW，而不是 WHAT。
- 测试只覆盖函数形状或数据结构形状。

示例：

```typescript
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);

  await checkout(cart, payment);

  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

## 验证路径选择

优先通过同一 interface 完成操作和验证。

避免：

```typescript
await createUser({ name: "Alice" });
const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
expect(row).toBeDefined();
```

优先：

```typescript
const user = await createUser({ name: "Alice" });
const retrieved = await getUser(user.id);
expect(retrieved.name).toBe("Alice");
```

数据库直查、日志检查、内部状态读取可以作为诊断工具，但不要默认作为行为测试的主要断言面。

---

## TDD 垂直切片

用于新功能、修 bug 的 test-first 循环，以及防止横向切片导致测试质量下降。

### 核心循环

新功能优先使用 Red-Green-Refactor TDD：

```text
RED: 写一个最小失败测试 → 确认失败（且失败原因符合预期）
GREEN: 写最小实现 → 确认通过（只让当前测试通过，不写多余代码）
REFACTOR: 在 GREEN 状态下做低风险整理 → 确认测试仍然通过
```

规则：一次只写一个行为测试和一个最小实现；测试 public interface 和可观察行为；不预先实现未来需求；RED 状态下不要重构；REFACTOR 只做低风险整理。

### 禁止横向切片

不要把 RED 理解为"先写全部测试"，再一次性实现全部代码。

错误方式：`RED: test1, test2, test3, test4 → GREEN: impl1, impl2, impl3, impl4`
正确方式：`RED → GREEN: test1 → impl1 → RED → GREEN: test2 → impl2 → ...`

横向切片问题：批量测试的是想象中的行为；测试数据结构而不是行为；对真实行为变化不敏感，重构时却容易失败。

| 维度 | 横切（错误） | 纵切（正确） |
|------|------------|------------|
| 方式 | 先写完所有 Model → Service → Controller | 每个功能 Controller → Service → Model → 测试一条龙 |
| 测试 | 批量测试想象中的行为 | 每轮测试刚学到的真实行为 |
| 反馈 | 写到最后一层才发现第一层就错了 | 每片切下来都能跑，错误立即发现 |

### 每轮检查

```text
[ ] 测试描述行为，而不是实现步骤
[ ] 测试只穿过 public interface
[ ] 测试应能承受内部重构
[ ] 代码只满足当前测试
[ ] 没有加入投机性功能
```

### Bug 修复路径

修 bug 时先把 feedback loop 的最小复现转成回归测试：用原始 feedback loop 复现 → 在正确 seam 上写最小失败测试 → 确认失败模式对齐 → 做最小修复 → 运行回归测试 → 重新运行原始 feedback loop。

如果没有正确 seam，不要硬测私有实现。把"没有正确 test seam"标为架构摩擦，并在 RCM 中把相关验证标为 `not_verified` 或 `blocked`。

### 重构门槛

只有 GREEN 后才允许重构。每一步重构都必须保持验证通过，并且只做与当前目标相关的低风险整理。

## Test Hygiene / 测试维护约束

Agent 编写的测试是有价值的回归保护，但无节制的测试增长会导致构建变慢、测试集过时、维护成本上升。必须坚持"少而精"原则。

### 约束规则

1. **行为测试优先**：只通过 public interface 验证可观察行为。禁止测试 private 函数、内部调用顺序、内部数据结构形状。禁止 mock 本模块内部函数（允许 mock 外部依赖边界）。

2. **避免重复覆盖**：在写入测试前，先搜索已有的测试文件，确认同一行为是否已经被测试过。已经覆盖的，不再重复写入。更新已有测试比新增更好。

3. **每被测模块一个主测试文件**：一个 `src/services/foo.ts` 对应的测试文件最多一个 `test/foo.test.ts`。超出时合并到该文件。

4. **新增即删除**：每新增一个测试文件，Agent 必须删除等价数量的旧测试代码（按行数计），或合并到已有测试文件中。不允许纯增不减。

5. **测试行数上限**：`test/` 目录总行数不能超过 `src/` 目录总行数的 50%。超出时 Agent 必须先删除或合并已有测试，再写入新测试。CLI 交付门禁按 session 启动时的 `bloatBaseline` 做增量判断：历史已超标但本次未恶化时只警告，本次新增或加重超标时阻断；`--check-bloat` 始终报告全量状态。

6. **清理僵尸测试**：每次 session 开始时，检查 `test/` 中引用已删除源文件或已重构类型的测试文件，标记为 `stale_test_candidate` 并建议清理。

7. **交付前检查**：交付前运行 `git diff --stat test/`，如果当前 session 新增测试行数超过 200 行而未删除等价旧测试，Agent 必须发出警告："本轮测试增长显著（+N 行），建议确认是否必要。"

8. **过时测试标记**：超过 6 个月未修改的测试文件，需要在交付总结中列出，并建议用户手动审查。
