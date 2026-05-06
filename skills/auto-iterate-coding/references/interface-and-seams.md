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
