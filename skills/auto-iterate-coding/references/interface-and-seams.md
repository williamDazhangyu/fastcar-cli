# 接口与 Seam

用于设计可测试 interface、依赖注入、adapter、deep module seam 和 mock 边界。

## 好 interface

好 interface 让测试自然：

- 接收依赖，不在内部创建外部 client。
- 返回结果，避免只有副作用。
- surface area 小：方法少、参数少、调用顺序少。
- 隐藏复杂 implementation，让调用方获得 leverage。
- 明确错误模式、状态变化和配置要求。

优先：

```typescript
function calculateDiscount(cart): Discount {
  // implementation hidden behind the interface
}
```

避免：

```typescript
function applyDiscount(cart): void {
  cart.total -= discount;
}
```

## Seam 纪律

选择 seam 时先问：

- 行为真的需要在这里变化吗？
- 是否至少有两个 adapter，例如 production + test？
- 这个 seam 会减少调用方知识，还是只增加一层转发？
- 测试是否能穿过 module interface，而不是穿透 implementation？
- internal seam 是否被不必要地暴露给调用方？

一个 adapter = 假想 seam。两个 adapter = 真实 seam。不要引入只有一个实现的 port，除非它马上解决真实测试或部署问题。

## 依赖分类

评估 deepening 或 seam 设计时，先分类依赖：

- In-process：纯计算、内存状态、无 I/O。通常直接 deepening，不需要 adapter。
- Local-substitutable：有本地测试替身，例如内存文件系统、测试数据库。优先用替身测试 deep module。
- Remote but owned：自己控制的远程服务。定义 port，生产用 HTTP/gRPC/queue adapter，测试用 in-memory adapter。
- True external：第三方服务。通过注入的 port 使用 mock adapter。

## Deep Module 方向

目标是 small interface + deep implementation：

- 调用方需要知道的事情变少。
- 行为集中到一个 module 内部。
- 测试集中穿过同一个 interface。
- 重复的错误处理、状态机、转换逻辑或协议细节从调用方移入 implementation。

避免 shallow module：

- 方法很多但每个方法只转发。
- 参数和返回 shape 几乎复制底层依赖。
- 调用方仍要知道底层顺序、错误码或配置。
- 删除 module 后复杂度不变，只是少一层文件。

---

## Mock 边界

用于决定何时 mock、何时使用真实依赖或测试替身。

### Mock 原则

只在系统边界 mock：第三方外部 API（支付、邮件、短信、模型服务）；时间、随机数、系统时钟；文件系统（真实临时目录不可行时）；数据库（测试数据库或本地替身不可行时）。

不要 mock：自己的 class/module；内部协作者；受当前代码库控制的业务逻辑；为方便测试的任意函数。

优先级：真实依赖的测试环境 > 本地可替身依赖 > 系统边界 mock > 不验证并明确标注。

### 设计可 mock 的边界

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

### SDK 风格接口

外部依赖 adapter 优先提供具体操作，而不是一个泛用 fetcher。SDK 风格让每个 mock 返回一个具体 shape，减少测试 setup 中的条件逻辑，也让 type safety 更清晰。
