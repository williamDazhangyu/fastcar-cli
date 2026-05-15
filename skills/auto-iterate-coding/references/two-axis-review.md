# 两轴评审

用于 Verify-only、PRD 验收、交付前复核、Review since X 和自动迭代结束前的独立检查。

核心原则：把“代码是否符合项目规范”和“实现是否符合需求规格”拆成两个独立判断，不要混在一个结论里。

## 评审轴

### Standards：规范符合度

检查实现是否遵守当前项目已经写明的规范。

优先读取：

- `AGENTS.md`、`CLAUDE.md`、`CONTRIBUTING.md`、`README.md`。
- `skills/AGENTS.md` 和当前任务相关的 `SKILL.md`。
- `docs/adr/`、`STYLE.md`、`STANDARDS.md`、`STYLEGUIDE.md`。
- `.editorconfig`、`eslint.config.*`、`biome.json`、`prettier.config.*`、`tsconfig.json`。

只报告有明确依据的问题。需要说明：

- 违反了哪条规范。
- 影响哪个文件、接口、行为或测试。
- 是硬性违规，还是需要人工判断的风格取舍。

不要重复报告工具已经稳定覆盖的问题，例如纯格式化、普通 lint 规则和 TypeScript 常规类型错误；这些应交给真实命令验证。

### Spec：需求符合度

检查实现是否忠实满足用户目标、PRD、issue、设计文档或本轮自动迭代 state 中的成功标准。

优先读取：

- 用户显式提供的 PRD、issue、文档路径或需求清单。
- `.agent-state/auto-iterate/<session>/state.json` 中的目标、Runbook、MVP、成功标准、非目标和 decisions。
- commit message、分支名、变更说明中引用的 issue 或文档。
- 如果没有明确规格，先报告 `no spec available`，不要凭感觉扩大范围。

重点报告：

- 需求要求但实现缺失或只完成一部分的内容。
- 实现新增了规格没有要求的行为、依赖、权限、外部资源或破坏性副作用。
- 看起来已实现但语义不对、边界不完整或与非目标冲突的内容。
- 需求本身仍不明确，导致无法验收的关键决策。

## 对比范围

如果用户指定固定点，例如 commit、branch、tag、`main` 或 `HEAD~5`，使用三点 diff：

```bash
git diff <fixed-point>...HEAD
git log <fixed-point>..HEAD --oneline
```

如果没有指定固定点，按当前自动迭代 session 的已修改文件、state 中的 current 指针和实际验证结果评审。不要为了评审擅自重置、切换分支或清理工作区。

## 并行与降级

如果子 Agent 可用，可以把 Standards 和 Spec 作为两个隔离任务并行执行，避免两个轴互相污染判断。

如果子 Agent 不可用，也必须在同一 Agent 内分两段完成，并保持输出分离：

```text
## Standards
<规范符合度发现>

## Spec
<需求符合度发现>
```

不要合并排序两个轴的发现。最终只补一行摘要：每个轴的发现数量，以及最严重的单个问题。

## 结论规则

- Standards 通过不代表 Spec 通过。
- Spec 通过不代表 Standards 通过。
- 如果没有 spec，只能说明 Spec 轴无法评审，不能把它算作通过。
- 如果没有真实验证证据，只能说“实现看起来满足/不满足”，不能说“已通过验收”。
- 如果发现范围外行为，优先标为 scope creep，让用户决定是否保留。
