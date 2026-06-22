# 领域语言与共享术语表

用于在自动迭代启动时提取、维护和使用项目共享术语表，让 Agent 用领域语言而不是冗长描述来思考和沟通。

## 为什么需要共享语言

当 Agent 被丢进项目时，它默认用通用词汇描述项目概念：

```
BEFORE（无共享语言）：
"There's a problem when a lesson inside a section of a course is made 'real'
(i.e. given a spot in the file system)"

AFTER（有共享语言）：
"There's a problem with the materialization cascade"
```

共享语言的好处：

- **变量、函数、文件命名一致**：Agent 使用统一术语，不会同一概念在不同文件用不同名字。
- **代码库更易导航**：Agent 搜索时用术语能精准定位，而不是猜测多种叫法。
- **减少 token 消耗**：Agent 思考和输出时用 1 个词而不是 20 个词，省 token 也省时间。
- **跨 session 一致性**：恢复 session 时 Agent 能快速理解项目语言，不需要重新摸索。

## 何时提取

以下时机必须提取或确认领域术语：

1. **启动握手时**：从项目 `AGENTS.md`、`README.md`、`docs/`、`CONTEXT.md` 中提取已有术语，或向用户确认核心概念。
2. **Grill Session 时**：用户描述需求时，Agent 应主动识别术语并确认定义。
3. **探索代码库时**：发现目录名、文件名、类名、函数名中反复出现的领域词汇，提取并记录。
4. **实现过程中**：发现新术语或术语歧义时，先确认再记录，不要用不同词汇描述同一概念。

## 如何提取

### 从项目文档提取

优先读取以下文件，提取其中反复出现的领域名词：

- `AGENTS.md`、`README.md`、`CONTEXT.md`
- `docs/adr/` 中的架构决策记录
- `skills/AGENTS.md` 和当前任务相关的 `SKILL.md`
- 项目 `package.json` 中的 `description` 字段

### 从代码库提取

扫描目录结构、核心模块名、主要 class/interface/enum 名称：

- 顶层目录名（如 `src/order/`、`src/payment/`）
- 核心 entity/model 名称
- 状态枚举值
- 反复出现的业务概念

### 向用户确认

对以下情况必须向用户确认：

- 同一概念在代码中出现了多种叫法。
- 术语的含义和直觉不符。
- 术语涉及产品决策或业务规则。
- 术语的定义会影响实现范围。

## 术语表格式

每个术语条目至少包含：

```text
| 术语 | 英文 | 定义 | 来源 | 备注 |
|------|------|------|------|------|
| 物化 | materialization | 将课程章节从逻辑结构写入文件系统的过程 | docs/adr/003.md | 触发时机见 adr |
| 纵切 | vertical slice | 从 Controller → Service → Model → 测试一条龙打通 | AGENTS.md | 区别于横切（按层） |
```

术语表应写入 `state.json` 的 `domainGlossary` 字段，并渲染到 `state.md` 的 `## Domain Glossary` 章节。

## 使用规则

Agent 在以下场景必须使用术语表中的词汇：

- 编写 commit message 和 PR 描述。
- 命名变量、函数、文件、目录。
- 描述需求、失败信号和验证结果。
- 输出交付总结和风险说明。

禁止：

- 用通用词汇替代术语表中的精确术语。
- 同一概念在同一 session 内使用不同叫法。
- 在术语表中引入只在单次对话中使用的临时词汇。

## 维护规则

- 每次 Grill Session 或启动握手时，检查术语表是否需要更新。
- 新术语出现时，先确认定义，再写入术语表，然后才在代码中使用。
- 术语表是活的文档：如果发现术语定义不准确，先更新术语表，再同步更新受影响的代码。
- 交付前，确认术语表与实际代码命名一致。

## 与 RCM 的关系

- 术语表是"怎么说"，RCM 是"做什么"。
- RCM 引用术语表中的术语来描述需求。
- 当 RCM 中出现新概念时，检查是否需要加入术语表。

## 与 Grill Session 的关系

Grill Session 是提取术语的最佳时机。Agent 在追问用户时，同步识别术语并写入术语表。详见 `grill-session.md`。