# Advanced Patterns — 进阶模式

> GREEN 后/交付前的进阶模式：安全重构、原型澄清、两轴复核。按需读取对应小节。

---

## Refactor Candidates（重构候选）

用于 GREEN 后识别安全重构机会、deep module 机会和不应继续自动修补的区域。

### 候选清单

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

### 小步重构

每一步都要让代码库保持可工作：

```text
1. 保持行为不变
2. 做最小结构调整
3. 运行相关真实验证
4. 保留或回退
5. 再进入下一步
```

不要在 RED 时重构。不要把重构和新行为混在同一轮，除非那是到达 GREEN 所必需的最小 seam 修正。

### 用户决策边界

以下情况需要用户确认：

- 修改 public interface。
- 改变数据模型、迁移、权限或兼容性。
- 删除或合并 module。
- 引入新 seam、adapter、依赖或运行时层级。
- 与现有架构决策或 ADR 冲突。

未确认前，只提出候选和收益/风险，不直接实施大范围重构。

---

## Prototype Clarification（原型澄清）

用于在正式实现前，用一次性原型回答"不确定的设计问题"。原型不是半成品实现；它只服务一个问题，问题回答后必须删除、吸收或转正。

### 何时使用

优先考虑原型的场景：

- 业务状态机、数据模型或边界流程在纸面上难以判断。
- 用户想先"跑一下""感受一下""试几个方案"。
- UI 方向不明确，多个信息架构或交互模型都可能成立。
- 正式实现前存在高成本产品决策，且可以用小原型降低不确定性。

不要用原型替代真实实现、测试、迁移或生产错误处理。

### 路径选择

```text
问题是逻辑/状态/数据模型是否成立 -> 逻辑原型
问题是页面/流程/交互长什么样 -> UI 原型
问题不明确且无法联系用户 -> 按周边代码默认选择，并在原型顶部写明假设
```

### 逻辑原型规则

- 把要回答的问题写在文件顶部或原型旁的说明中。
- 使用宿主项目已有语言和任务运行器，不为原型引入新运行时。
- 真正有价值的逻辑放在纯 module / reducer / state machine / 函数组背后；终端交互外壳是一次性的。
- 默认使用内存状态，不连接真实数据库；除非问题本身就是持久化。
- 每次操作后显示完整相关状态，让用户能观察状态变化。
- 提供一个命令运行，例如项目已有的 `npm run <name>`、`pnpm <name>`、`python <path>` 或等价命令。

### UI 原型规则

- 默认生成 3 个结构差异明显的方案，最多 5 个；不要只改颜色、间距或文案。
- 优先挂在现有页面或流程中，通过 `?variant=` 切换，并保留真实数据获取、路由参数和鉴权上下文。
- 只有没有自然宿主时，才创建明确标记的一次性 prototype 路由。
- 切换器必须明显是原型工具，并在生产构建中隐藏或保证不会被合入生产路径。
- 原型只做只读交互；需要 mutation 时使用 stub 或沙箱。

### 清理和吸收

原型完成使命后，只保留答案：

- 如果某个方案胜出，把原因写入状态、issue、ADR、commit message 或原型旁的 `NOTES.md`。
- 删除失败方案、variant switcher、一次性 TUI 外壳和临时路由。
- 如果原型逻辑被验证有效，把纯逻辑 module 按生产质量吸收：补测试、错误处理、命名、导出和文档。
- 如果用户尚未给结论，不要声称原型已完成需求；把正式实现标为 `blocked` 或 `not_verified`。

### 禁令

- 不要把原型直接当生产代码交付。
- 不要为原型添加大范围测试、抽象或错误处理。
- 不要让原型连接生产数据库、生产服务或真实写操作。
- 不要把未清理的原型 artifacts 留在成功交付中。

---

## Two-Axis Review（两轴评审）

用于 Verify-only、PRD 验收、交付前复核、Review since X 和自动迭代结束前的独立检查。

核心原则：把"代码是否符合项目规范"和"实现是否符合需求规格"拆成两个独立判断，不要混在一个结论里。

### Standards：规范符合度

检查实现是否遵守当前项目已经写明的规范。

优先读取：

- `AGENTS.md`、`CLAUDE.md`、`CONTRIBUTING.md`、`README.md`。
- `skills/AGENTS.md` 和当前任务相关的 `SKILL.md`。
- `docs/adr/`、`STYLE.md`、`STANDARDS.md`、`STYLEGUIDE.md`。
- `.editorconfig`、`eslint.config.*`、`biome.json`、`prettier.config.*`、`tsconfig.json`。

只报告有明确依据的问题。需要说明：违反了哪条规范、影响哪个文件/接口/行为/测试、是硬性违规还是需要人工判断的风格取舍。

不要重复报告工具已经稳定覆盖的问题，例如纯格式化、普通 lint 规则和 TypeScript 常规类型错误；这些应交给真实命令验证。

### Spec：需求符合度

检查实现是否忠实满足用户目标、PRD、issue、设计文档或本轮自动迭代 state 中的成功标准。

优先读取：

- 用户显式提供的 PRD、issue、文档路径或需求清单。
- `.agent-state/auto-iterate/<session>/state.json` 中的目标、Runbook、MVP、成功标准、非目标和 decisions。
- commit message、分支名、变更说明中引用的 issue 或文档。
- 如果没有明确规格，先报告 `no spec available`，不要凭感觉扩大范围。

重点报告：需求要求但实现缺失的内容、实现新增了规格没有要求的行为/依赖/权限/副作用、看起来已实现但语义不对/边界不完整/与非目标冲突的内容、需求本身仍不明确导致无法验收的关键决策。

### 对比范围

如果用户指定固定点（commit/branch/tag/`main`/`HEAD~5`），使用三点 diff：

```bash
git diff <fixed-point>...HEAD
git log <fixed-point>..HEAD --oneline
```

如果没有指定固定点，按当前自动迭代 session 的已修改文件、state 中的 current 指针和实际验证结果评审。不要为了评审擅自重置、切换分支或清理工作区。

### 并行与降级

如果子 Agent 可用，可以把 Standards 和 Spec 作为两个隔离任务并行执行，避免两个轴互相污染判断。

如果子 Agent 不可用，也必须在同一 Agent 内分两段完成，并保持输出分离：

```text
## Standards
<规范符合度发现>

## Spec
<需求符合度发现>
```

不要合并排序两个轴的发现。最终只补一行摘要：每个轴的发现数量，以及最严重的单个问题。

### 结论规则

- Standards 通过不代表 Spec 通过。
- Spec 通过不代表 Standards 通过。
- 如果没有 spec，只能说明 Spec 轴无法评审，不能把它算作通过。
- 如果没有真实验证证据，只能说"实现看起来满足/不满足"，不能说"已通过验收"。
- 如果发现范围外行为，优先标为 scope creep，让用户决定是否保留。
