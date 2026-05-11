# 架构摩擦

用于自动修补开始掩盖结构问题时，识别并停止，避免用越来越多 patch 破坏代码库。

## 摩擦信号

出现以下情况时，停止自动修补并汇报架构摩擦：

- 没有正确 test seam。
- 只能测试 private implementation。
- 修复需要跨多个调用方重复修改。
- module interface 几乎和 implementation 一样复杂。
- 局部修改反复触发远处失败。
- module 只是浅层 pass-through，删除后复杂度不会集中下降。
- 为了测试不得不 mock 自己的内部 module。
- 调用方必须知道太多顺序、状态、配置或错误处理细节。
- 每轮修复都在扩大修改范围，但失败信号没有变尖锐。
- 一个修复需要在多个相似调用方复制条件分支、映射或错误处理。
- 新需求没有自然落点，只能散落到多个 unrelated module。
- 正确行为依赖隐式全局状态、时间、顺序或配置组合，且没有清晰 interface 表达。

## 汇报格式

```text
当前失败：
架构摩擦点：
涉及 module/interface/seam：
删除测试结论：
继续 patch 的扩散范围：
为什么继续自动修补风险高：
建议的重构方向：
需要用户确认的设计决策：
```

用户确认前，不要升级成大范围重构。

## 判断方法

使用 [architecture-language.md](architecture-language.md) 的术语。

重点判断：

- Interface 是否是自然测试面。
- Module 是否 deep，还是 shallow pass-through。
- Seam 是否有真实 adapter 变化。
- 继续 patch 是否会扩大知识和修改范围。
- 重构是否能提高 locality 和 leverage。

使用删除测试：想象删除这个 module。如果复杂度只是转移到调用方，说明 module 仍有价值；如果复杂度没有集中下降，说明它可能是 shallow pass-through。

决策规则：

- 小范围摩擦且有明确低风险 seam 时，可以在当前迭代内做最小重构，但必须先保持或建立验证。
- 需要改 public interface、数据模型、跨模块依赖方向、持久化格式或外部 API 时，必须请求用户确认。
- 用户未确认前，只允许记录候选、收窄失败信号或补测试 seam，不要进行大范围迁移。
