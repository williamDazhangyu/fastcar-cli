# Third-Party Adoption

第三方项目接入 auto-iterate-coding 时，建议只保留最小入口：

1. `SKILL.md`
1. `index.md`
1. `contracts/`
1. `examples/`
1. `references/`
1. `compatibility/`
1. `adapters/`

## 最小接入原则

- 先接入入口和契约，不要先复制全部历史文档。
- 目录结构优先稳定，文件内容可以逐步细化。
- 兼容层优先保留 fallback 入口，等第三方项目稳定后再收敛。

## 推荐做法

- 把第三方项目的本地约定写进 `compatibility/`。
- 把平台差异写进 `adapters/`。
- 把强约束写进 `contracts/`。
- 把真实样例写进 `examples/`。
- 把解释和扩展写进 `references/`。
