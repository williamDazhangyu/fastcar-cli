# 架构术语

用于统一架构讨论里的语言。保持这些词一致，不要随意替换成 component、service、API 或 boundary。

## 术语

`Module`：任何有 interface 和 implementation 的东西。它可以是函数、class、package 或一个垂直切片。

`Interface`：调用方必须知道的一切，包括类型、约束、错误模式、调用顺序、配置和性能特征。不只是类型签名，也不只是 TypeScript 的 `interface` 关键字。

`Implementation`：module 内部代码。

`Depth`：interface 的杠杆率。小 interface 后面隐藏大量行为就是 deep；interface 几乎和 implementation 一样复杂就是 shallow。

`Seam`：可以改变行为而不在原处编辑的位置。用 seam，不用 boundary，避免和 DDD bounded context 混淆。

`Adapter`：满足某个 seam 上 interface 的具体实现。

`Leverage`：调用方从 depth 获得的能力。一个 implementation 通过少量 interface 支撑多个调用方和测试。

`Locality`：维护者从 depth 获得的集中性。修改、bug、知识和验证集中在一个地方。

## 原则

- Depth 是 interface 的属性，不是 implementation 行数的属性。
- Interface 是测试面。调用方和测试应该穿过同一个 seam。
- 一个 adapter 通常是假想 seam，两个 adapter 才通常是真 seam。
- 删除测试：想象删除 module。如果复杂度消失，它可能只是 pass-through；如果复杂度重新分散到多个调用方，它在提供 locality。
- 不要为了测试暴露 internal seam；deep module 可以有内部 seam，但不要把它们变成 external interface。

## 使用要求

提出架构摩擦、重构候选或接口设计时，使用这些字段：

```text
涉及 module：
当前 interface：
当前 implementation：
seam 位置：
adapter 数量：
depth 问题：
leverage/locality 收益：
```
