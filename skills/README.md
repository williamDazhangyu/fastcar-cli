# FastCar Skills

本目录提供可安装到 AI Agent 的 FastCar 知识包，面向 Codex、Claude Code、Cursor、Kimi Code、Gemini CLI 等主流工具。

## 文件说明

| 路径 | 作用 |
| --- | --- |
| `AGENTS.md` | 共享 Agent 开发规范，安装 skill 时会同步到目标位置。 |
| `*/SKILL.md` | 单个 skill 的触发说明、规则和示例。 |
| `fastcar-framework/assets/` | 可复用项目模板资产。 |
| `fastcar-framework/references/` | 更完整的 API 参考资料。 |

## Skill 设计约定

- 每个 `SKILL.md` 必须包含 frontmatter：`name` 和 `description`。
- `description` 应同时说明中文用途和英文触发场景，便于不同 Agent 检索。
- 文档结构优先使用：适用场景、先读规则、核心示例、禁止事项、验证建议。
- 示例代码必须包含关键 import，不要依赖 Agent 猜测 API 来源。
- FastCar Koa 示例禁止使用 `@Body`、`@Param`、`@Query`。
- 数据库示例必须在数据库层完成分页、聚合、分组和 JOIN。

## 安装命令

```bash
fastcar-cli skill list
fastcar-cli skill install fastcar-framework
fastcar-cli skill install auto-iterate-coding
fastcar-cli skill install all --local
fastcar-cli skill targets
```

## 启动自动迭代开发

先单独安装 `auto-iterate-coding`，再在项目根目录生成启动文件：

```bash
fastcar-cli skill install auto-iterate-coding
fastcar-cli auto-iterate
```

如果 AI 实现流程清单很长，可以从本地文档导入：

```bash
fastcar-cli auto-iterate --from docs/ai-checklist.md
fastcar-cli auto-iterate -f docs/ai-checklist.md
```

`fastcar-cli auto-iterate` 会交互式询问 AI 实现流程清单和迭代预算，并生成：

- `.agent-state/auto-iterate-coding.md`
- `.agent-state/auto-iterate-start-prompt.md`

生成后，把 `.agent-state/auto-iterate-start-prompt.md` 的内容发给 Agent。

单独安装自动迭代编码 skill：

```bash
# 交互式选择安装位置
fastcar-cli skill install auto-iterate-coding

# 全局安装
fastcar-cli skill install auto-iterate-coding --global

# 本地安装到当前项目
fastcar-cli skill install auto-iterate-coding --local

# 安装到指定 Agent
fastcar-cli skill install auto-iterate-coding --target codex
```

## 主流 Agent 使用方式

| Agent | 推荐方式 |
| --- | --- |
| Codex | 将需要的 skill 目录放入 Codex skills 目录；每个目录保留 `SKILL.md`。 |
| Claude Code | 使用 `fastcar-cli skill install <name> --target claude`，或复制对应 skill 目录。 |
| Cursor | 使用 `fastcar-cli skill install <name> --target cursor`，必要时把核心规则迁移到 Cursor rules。 |
| Kimi Code | 使用默认目标：`fastcar-cli skill install <name>`。 |
| Gemini CLI | 直接读取 `AGENTS.md` 和对应 `SKILL.md`，或复制 skill 目录到团队约定位置。 |

当前 CLI 内置安装目标以 `fastcar-cli skill targets` 输出为准；其他 Agent 可以直接复用本目录的 Markdown 结构。

## 维护清单

新增或修改 skill 时检查：

- `SKILL.md` frontmatter 是否准确。
- README 或 CLI 帮助文本是否需要同步。
- `skills/AGENTS.md` 中的共享规则是否需要补充。
- 示例代码是否保持 Node.js / TypeScript / FastCar API 兼容。
