# Contracts

这里放机器可检查的强约束。

## 作用

- 固定目录职责和文件边界。
- 固定状态、交付和命名契约。
- 让第三方项目知道哪些内容不能随意改写。

## 契约文件

| 文件 | 用途 |
|------|------|
| `session-contract.md` | 会话状态硬约束：目录结构、state.json 必填字段、枚举值白名单、一致性规则 |
| `output-discipline-contract.md` | 输出纪律硬约束：角色输出边界、中间进展模板、禁止输出清单、违规检测规则 |

## 关联文件

以下文件提供了契约的详细解释和上下文：

- [state-template.md](../examples/state-template.md) — 状态模板（人类阅读视图）
- [state-schema.md](../references/state-schema.md) — 状态 schema 详细说明
- [state.schema.json](../references/state.schema.json) — 独立 JSON Schema artifact
- [final-delivery.md](../references/final-delivery.md) — 最终交付流程和交付门禁