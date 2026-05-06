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

## 汇报格式

```text
当前失败：
架构摩擦点：
涉及 module/interface/seam：
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
