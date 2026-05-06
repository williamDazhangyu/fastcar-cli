# 重构候选

用于 GREEN 后识别安全重构机会、deep module 机会和不应继续自动修补的区域。

## 候选清单

GREEN 后寻找：

- Duplication：真实重复逻辑、重复类型、重复常量或重复错误处理。
- Long methods：长函数可拆成私有 helper，但测试仍留在 public interface。
- Shallow modules：interface 很大、implementation 很薄，几乎只是 pass-through。
- Feature envy：逻辑长期操作别的 module 的数据，可能应该移动到数据所在 module。
- Primitive obsession：大量字符串、数字或裸对象承载领域概念，适合引入值对象、enum 或 type。
- Poor seam：无法通过自然 interface 测试，只能 mock 内部细节。
- Scattered changes：同一行为修改必须触碰多个调用方。
- Hidden invariants：调用方必须记住顺序、前置条件或配置组合。
- New code reveals old problem：新增代码暴露了既有 module 的命名、职责或依赖方向问题。

## 小步重构

每一步都要让代码库保持可工作：

```text
1. 保持行为不变
2. 做最小结构调整
3. 运行相关真实验证
4. 保留或回退
5. 再进入下一步
```

不要在 RED 时重构。不要把重构和新行为混在同一轮，除非那是到达 GREEN 所必需的最小 seam 修正。

## 用户决策边界

以下情况需要用户确认：

- 修改 public interface。
- 改变数据模型、迁移、权限或兼容性。
- 删除或合并 module。
- 引入新 seam、adapter、依赖或运行时层级。
- 与现有架构决策或 ADR 冲突。

未确认前，只提出候选和收益/风险，不直接实施大范围重构。
