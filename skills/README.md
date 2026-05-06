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

如果已经让 Agent 读取了 `auto-iterate-coding`，用户可以直接用大白话描述意图，让 Agent 自动路由到对应命令：

```text
帮我快速启动自动迭代，修复登录失败，session 叫 login-bugfix
帮我快速启动自动迭代，修复登录失败，最多跑 5 轮
帮我验收 docs/prd.md，不要改代码，session 叫 prd-check
只帮我规划订单模块重构，不要写代码
恢复登录修复任务
列出所有自动迭代任务
```

Agent 应自动转换为类似命令：

```bash
fastcar-cli auto-iterate --quick --goal "修复登录失败" --session login-bugfix
fastcar-cli auto-iterate --quick --goal "修复登录失败" --autopilot-max-iterations 5
fastcar-cli auto-iterate --verify --from docs/prd.md --session prd-check
fastcar-cli auto-iterate --plan-only --goal "订单模块重构"
fastcar-cli auto-iterate --resume login-bugfix
fastcar-cli auto-iterate --list
```

也可以手动执行命令。先单独安装 `auto-iterate-coding`，再在项目根目录生成启动文件：

```bash
fastcar-cli skill install auto-iterate-coding
fastcar-cli auto-iterate
fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix
fastcar-cli auto-iterate --verify --from docs/prd.md --session login-verify
fastcar-cli auto-iterate --list
fastcar-cli auto-iterate --resume login-bugfix
fastcar-cli auto-iterate --mode plan --goal "设计支付模块"
```

如果 AI 实现流程清单很长，可以从本地文档导入：

```bash
fastcar-cli auto-iterate --from docs/ai-checklist.md
fastcar-cli auto-iterate -f docs/ai-checklist.md
```

`fastcar-cli auto-iterate` 会交互式选择启动模式，询问 AI 实现流程清单或轻量目标，并生成 session 文件和当前活动镜像：

- `.agent-state/auto-iterate/<session>/state.md`
- `.agent-state/auto-iterate/<session>/start-prompt.md`
- `.agent-state/auto-iterate-current.json`
- `.agent-state/auto-iterate-coding.md`（当前活动 session 的 legacy 状态镜像）
- `.agent-state/auto-iterate-start-prompt.md`（当前活动 session 的 legacy 启动提示镜像）

生成后，把 `.agent-state/auto-iterate/<session>/start-prompt.md` 的内容发给 Agent。旧流程也可以继续使用 `.agent-state/auto-iterate-start-prompt.md`。

常用模式：

```bash
# 严格启动：完整流程清单
fastcar-cli auto-iterate --strict

# 快速启动：小中型任务，Agent 先推断流程清单
fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix
fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --autopilot-max-iterations 5

# Verify-only：只检查/验收，不主动修改
fastcar-cli auto-iterate --verify --from docs/prd.md --session login-verify

# 查看、切换、恢复 session
fastcar-cli auto-iterate --list
fastcar-cli auto-iterate --switch login-verify
fastcar-cli auto-iterate --resume login-bugfix

# Plan-only：只规划，不写代码
fastcar-cli auto-iterate --plan-only --goal "规划订单模块重构"

# Optimization-only：先建立 baseline，再做有边界优化
fastcar-cli auto-iterate --optimize --goal "优化查询性能"
```

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
