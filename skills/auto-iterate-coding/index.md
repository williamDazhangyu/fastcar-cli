# auto-iterate-coding 目录索引

这是本 skill 的第三方接入导航层。先看这里，再进入具体约束文档。

## 建议阅读顺序

1. [skill.md](./skill.md)
1. [contracts/readme.md](./contracts/readme.md)
1. [examples/state-template.md](./examples/state-template.md)
1. [references/index.md](./references/index.md)
1. [compatibility/readme.md](./compatibility/readme.md)
1. [adapters/index.md](./adapters/index.md)
1. [adapters/readme.md](./adapters/readme.md)
1. [changelog.md](./changelog.md)

## 目录职责

| 路径 | 作用 |
| --- | --- |
| `SKILL.md` | 主协议入口，定义触发词、模式、状态、验证和交付门禁。 |
| `contracts/` | 强约束契约层，放机器可检查的目录、状态和交付规则。 |
| `examples/` | 启动、状态和端到端示例。 |
| `references/` | 详细流程、规则解释、校验说明和长文档。 |
| `compatibility/` | 第三方项目接入、迁移和版本兼容说明。 |
| `adapters/` | 平台或 Agent 的适配层，优先按平台子目录组织。 |
| `changelog.md` | 目录、约定和协议变更记录。 |

## 第三方项目接入规则

- 先看 `index.md`，再看 `contracts/` 和 `compatibility/`。
- 需要直接运行的样例优先看 `examples/`。
- 需要细则时再查 `references/`。
- 如果要适配不同 Agent 或项目脚手架，先查 `adapters/`。
- 每次改动后同步更新 `changelog.md`，避免 AI 只看到旧约定。
- 平台适配优先查 `adapters/index.md`，再进入对应平台子目录。

## 兼容说明

- 旧版反馈与优化说明已收敛到 `references/`、`compatibility/` 和 `changelog.md`，不再依赖根级历史文件。
- 兼容 fallback 入口仍保留，但新内容以 `index.md`、`contracts/` 和 `compatibility/` 为准。
