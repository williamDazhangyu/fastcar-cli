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
