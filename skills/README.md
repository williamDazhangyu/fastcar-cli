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
fastcar-cli auto-iterate --quick --goal "修复登录失败" --session login-bugfix --yes
fastcar-cli auto-iterate --quick --goal "修复登录失败" --autopilot-max-iterations 5 --yes
fastcar-cli auto-iterate --verify --from docs/prd.md --session prd-check --yes
fastcar-cli auto-iterate --plan-only --goal "订单模块重构" --yes
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

`fastcar-cli auto-iterate` 会交互式选择启动模式，询问 AI 实现流程清单或轻量目标，并生成 session 文件和当前活动指针：

- `.agent-state/auto-iterate/<session>/state.json`
- `.agent-state/auto-iterate/<session>/state.md`
- `.agent-state/auto-iterate/<session>/start-prompt.md`
- `.agent-state/auto-iterate-current.json`

其中 `state.json` 是机器权威状态源，`state.md` 是生成的人类阅读视图。

生成后，把 `.agent-state/auto-iterate/<session>/start-prompt.md` 的内容发给 Agent。

常用模式：

```bash
# 严格启动：完整流程清单
fastcar-cli auto-iterate --strict

# 快速启动：小中型任务，Agent 先推断流程清单
fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --session login-bugfix --yes
fastcar-cli auto-iterate --quick --goal "修复登录失败问题" --autopilot-max-iterations 5 --yes

# Diagnose：困难 bug / 性能回归，先建立反馈闭环
fastcar-cli auto-iterate --diagnose --goal "诊断登录偶发失败" --session login-diagnose --yes

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

# Prototype-only：一次性原型澄清状态模型、数据模型、交互或 UI 方向
fastcar-cli auto-iterate --prototype --goal "验证订单状态机"
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

## 自然语言触发示例

如果 Agent 已读取 `auto-iterate-coding`，可以直接对 Agent 说下面这些大白话，Agent 应自动路由到对应的 `fastcar-cli auto-iterate ... --yes` 命令。

自然语言路由必须每次生成独立 session：用户已指定时使用该 session；用户未指定时，由 Agent 根据模式和目标生成英文小写、数字和连字符组成的默认 session，并在命令中显式追加 `--session <name>`。

### 查看自然语言示例

也可以用 CLI 直接输出可复制的自然语言触发语：

```bash
fastcar-cli auto-iterate --examples
fastcar-cli auto-iterate --examples 验收
fastcar-cli auto-iterate --examples 诊断
fastcar-cli auto-iterate --examples 原型
fastcar-cli auto-iterate --examples 规划
fastcar-cli auto-iterate --examples session
```

### 快速启动开发任务

```text
帮我快速启动自动迭代，修复登录失败问题，session 叫 login-bugfix
快速开始修复用户登录失败，最多跑 5 轮，session 叫 login-fix
开一个自动迭代任务，实现用户登录功能，session 叫 user-login
帮我自动推进这个问题：订单列表分页错误，最多迭代 8 次
启动快速自动迭代，目标是修复支付回调重复处理问题
```

### 严格按文档完整实现

```text
完整实现 docs/prd.md 里的所有需求，session 叫 prd-implement
严格按照 docs/ai-checklist.md 实现，不要遗漏任何需求，最多跑 10 轮
根据 docs/login.md 全部实现登录模块，session 叫 login-prd
按这个 PRD 完整做完：docs/payment-prd.md
把 docs/order.md 文档里的需求都做完，使用严格启动模式
```

### docs 目录相关

```text
完整实现 docs 里的需求文档
根据 docs 目录下的 PRD 完整实现功能
帮我找出 docs 里的需求文档，并启动严格自动迭代实现
实现 docs 文档中的所有需求，如果有多个文档先让我选择
按 docs 下的需求说明完整开发，session 叫 docs-implement
```

### Verify-only：只检查/验收，不修改代码

```text
帮我验收 docs/prd.md 是否都实现了，不要修改代码，session 叫 prd-check
检查当前实现是否满足 docs/login.md，不能改代码
验证这个 PRD 是否已经完成：docs/payment-prd.md
只检查订单模块是否满足需求，不要修复，最多跑 3 轮
帮我做一次 Verify-only，检查登录功能是否完整实现
```

### Diagnose：困难 bug / 性能回归

```text
帮我诊断这个登录偶发失败问题，先建立复现闭环，session 叫 login-diagnose
Diagnose 当前 npm test 失败，最多跑 8 轮，session 叫 test-diagnose
调试订单导出性能回归，先建立 baseline 和可重复验证
帮我 debug 支付回调重复处理问题，不要猜修复，先复现
诊断这个 flaky e2e，尽量提高复现率并列出假设
```

### Plan-only：只规划，不写代码

```text
只帮我规划订单模块重构，不要写代码
先规划实现用户权限系统，不要修改任何文件
帮我制定支付模块改造计划，先不要实现
Plan-only：分析如何实现消息通知功能
只输出实现计划、风险和验证策略，不进入编码
```

### Prototype-only：一次性原型澄清

```text
先做一个逻辑原型验证订单状态机，不要直接实现生产代码
Prototype：给设置页做 3 个 UI 方案，通过 variant 切换
帮我做一次性原型，验证这个数据模型是否能表达退款流程
先让我玩一下这个交互流程原型，结论确认后再实现
做一个 UI 原型比较仪表盘的几种信息架构，不能影响生产构建
```

### Optimization-only：优化但保持行为不变

```text
优化登录模块代码结构，但不要改变外部行为
优化订单查询性能，先建立 baseline，最多跑 5 轮
提升支付模块可维护性，不要新增依赖
帮我做一次 Optimization-only，目标是减少重复代码
优化这个模块的类型定义和命名，保持 API 兼容
```

### 一直修到通过 / Autopilot

```text
一直修到测试通过，最多跑 10 轮，session 叫 fix-tests
全自动修复当前构建错误，直到通过或触发停止条件
帮我自动迭代修复 npm test 失败，最多迭代 8 次
不要每轮问我，自动修到验证通过，session 叫 auto-fix
进入 Autopilot，修复所有类型检查错误
```

### 指定迭代预算

```text
帮我快速启动自动迭代，修复登录失败，最多跑 5 轮
完整实现 docs/prd.md，Autopilot 预算 10 轮，普通预算 50 轮
自动修复测试失败，最多迭代 3 次
严格按 docs/order.md 实现，max_iterations 100，autopilot_max_iterations 20
优化查询性能，最多跑 4 轮，超过就停止并汇报
```

### session 管理

```text
列出所有自动迭代任务
查看当前有哪些 auto-iterate session
恢复登录修复任务
恢复 session login-bugfix
切换到 login-verify 这个 session
切换到 PRD 验收任务
继续上次的自动迭代任务
恢复最近的 auto-iterate session
```

### 指定 session 名

```text
帮我快速启动自动迭代，修复登录失败，session 叫 login-bugfix
完整实现 docs/prd.md，session 叫 prd-implement
验收 docs/login.md，不要改代码，session 叫 login-verify
只规划订单模块重构，session 叫 order-plan
优化查询性能，session 叫 query-optimize
```

### 独立 session

```text
帮我快速启动自动迭代，修复登录失败，session 叫 login-bugfix
创建一个独立 session 叫 payment-test
按 docs/payment.md 完整实现，session 叫 payment-implement
```

### 组合场景

```text
帮我快速启动自动迭代，目标是修复登录失败，最多跑 5 轮，session 叫 login-bugfix，不要新增依赖
严格按照 docs/prd.md 完整实现，Autopilot 预算 10 轮，session 叫 prd-impl，不要连接生产数据库
帮我验收 docs/login.md 是否都实现了，不要修改代码，最多跑 3 轮，session 叫 login-check
只规划支付模块重构，不要写代码，session 叫 payment-plan，输出风险和验证策略
优化订单查询性能，保持 API 兼容，最多跑 5 轮，session 叫 order-query-optimize
```

### 最推荐的日常说法

```text
帮我快速启动自动迭代，目标是【这里写目标】，最多跑 5 轮，session 叫【session-name】
完整实现【文档路径】，最多跑 10 轮，session 叫【session-name】
帮我验收【文档路径】，不要修改代码，session 叫【session-name】
只规划【目标】，不要写代码，session 叫【session-name】
优化【目标】，保持行为不变，最多跑 5 轮，session 叫【session-name】
```

注意：如果说的是“完整实现 docs”，Agent 应先判断 `docs` 是文件还是目录。如果是目录，应先找候选需求文档，不能直接把目录传给 `--from`。更稳的说法是“完整实现 docs/prd.md，session 叫 prd-implement”。

## 主流 Agent 使用方式

| Agent | 推荐方式 |
| --- | --- |
| Codex | 使用默认目标或 `fastcar-cli skill install <name> --target codex`，写入通用 `.agents/skills` 目录；每个目录保留 `SKILL.md`。 |
| Claude Code | 使用 `fastcar-cli skill install <name> --target claude`，或复制对应 skill 目录。 |
| Cursor | 使用 `fastcar-cli skill install <name> --target cursor`，必要时把核心规则迁移到 Cursor rules。 |
| Kimi Code | 推荐使用默认目标：`fastcar-cli skill install <name>`；如需写入 Kimi 专用目录，使用 `--target kimi`。 |
| Gemini CLI | 直接读取 `AGENTS.md` 和对应 `SKILL.md`，或复制 skill 目录到团队约定位置。 |

当前 CLI 内置安装目标以 `fastcar-cli skill targets` 输出为准；其他 Agent 可以直接复用本目录的 Markdown 结构。

## 维护清单

新增或修改 skill 时检查：

- `SKILL.md` frontmatter 是否准确。
- README 或 CLI 帮助文本是否需要同步。
- `skills/AGENTS.md` 中的共享规则是否需要补充。
- 示例代码是否保持 Node.js / TypeScript / FastCar API 兼容。
