# Mock 边界

用于决定何时 mock、何时使用真实依赖或测试替身。

## Mock 原则

只在系统边界 mock：

- 第三方外部 API，例如支付、邮件、短信、模型服务。
- 时间、随机数、系统时钟。
- 文件系统，且真实临时目录不可行时。
- 数据库，且测试数据库或本地替身不可行时。

不要 mock：

- 自己的 class/module。
- 内部协作者。
- 受当前代码库控制的业务逻辑。
- 只是为了让测试写起来方便的任意函数。

优先级：

```text
真实依赖的测试环境 > 本地可替身依赖 > 系统边界 mock > 不验证并明确标注
```

## 设计可 mock 的边界

在系统边界注入依赖，不要在业务逻辑内部直接创建外部 client。

优先：

```typescript
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}
```

避免：

```typescript
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

## SDK 风格接口

外部依赖 adapter 优先提供具体操作，而不是一个泛用 fetcher。

优先：

```typescript
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch("/orders", { method: "POST", body: data }),
};
```

避免：

```typescript
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

SDK 风格让每个 mock 返回一个具体 shape，减少测试 setup 中的条件逻辑，也让 type safety 更清晰。
