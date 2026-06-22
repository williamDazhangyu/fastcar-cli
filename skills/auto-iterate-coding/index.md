# auto-iterate-coding 目录索引

这是本 skill 的导航层。先看这里，再进入具体约束文档。

## 建议阅读顺序

1. [SKILL.md](./SKILL.md)
1. [contracts/readme.md](./contracts/readme.md)
1. [examples/state-template.md](./examples/state-template.md)
1. [references/index.md](./references/index.md)
1. [changelog.md](./changelog.md)

## 目录职责

| 路径 | 作用 |
| --- | --- |
| `SKILL.md` | 主协议入口，定义触发词、模式、状态、验证和交付门禁。 |
| `contracts/` | 强约束契约层，放机器可检查的目录、状态和交付规则。 |
| `examples/` | 启动、状态和端到端示例。 |
| `references/` | 详细流程、规则解释、校验说明和长文档。 |
| `changelog.md` | 目录、约定和协议变更记录。 |

## 使用规则

- 先看 `SKILL.md`，再看 `contracts/` 和 `references/index.md`。
- 需要直接运行的样例优先看 `examples/`。
- 需要细则时再查 `references/`。
- 每次改动后同步更新 `changelog.md`，避免 AI 只看到旧约定。

## 精简说明

- 旧版 feedback / optimization / compatibility / adapters 文档层已移除。旧 `src/adapters/*` 运行时适配代码已删除，不在 skill 内维护第二套 adapter 文档。
- 新内容以 `SKILL.md`、`contracts/`、`examples/` 和 `references/` 为准。

## 历史 / 废弃文档

以下文件已不再维护，仅供历史参考：

| 文件 | 状态 | 替代方案 |
| --- | --- | --- |
| `orchestrator.md` | ⚠️ 已合并 | 内容已合并到 [judge-runbook.md](references/judge-runbook.md) |
