# Skill Capture - 技能沉淀参考

> 参照 Matt Pocock 的 `write-a-skill` 技能理念：每次任务交付后，将高价值经验沉淀为可复用的技能点。

## 定位

Skill Capture 是 auto-iterate 的任务后知识归档步骤。目标是在本项目 `.agents/skills` 中沉淀可迁移、可验证、能减少未来探索成本的技能点，避免同类问题反复从零开始。

Skill Capture 不等同于任务总结、变更日志或完整复盘。它只记录未来 Agent 在相似任务中需要提前知道的做法、边界、验证路径和反模式。

## 触发时机

每次任务交付、提前停止或阶段性验收后，Agent 必须执行 Skill Capture。

## 高价值判定

一条技能点必须同时满足：

1. **可复用**：未来同类任务会再次用到，而不是只描述本次改了哪个文件。
2. **可行动**：能指导 Agent 下一次怎么做、先查什么、如何验证或避免什么。
3. **可验证**：来自真实命令、测试、失败信号、用户确认或可复现操作；推断必须标记 `not_verified`。
4. **有边界**：说明适用场景和不适用场景，避免被过度泛化。
5. **高信噪比**：内容比模型通用常识更具体，值得占用上下文。

### 提炼评分卡

沉淀前按 0-2 分快速评估候选。总分低于 7 分时默认跳过；如果某项为 0 分但仍要保留，必须写明原因或标记 `not_verified`。

| 维度 | 0 分 | 1 分 | 2 分 |
|------|------|------|------|
| 复用性 | 只对本次文件或临时环境有效 | 同项目可能复用 | 跨任务或跨模块稳定复用 |
| 行动性 | 只是描述结果 | 给出大致方向 | 明确下一步、顺序或命令 |
| 验证证据 | 无证据 | 有人工判断或间接证据 | 有命令、测试、失败信号或用户确认 |
| 边界清晰度 | 不知道何时适用 | 有大致场景 | 明确适用和不适用条件 |
| 上下文成本 | 需要长日志/长源码支撑 | 中等长度 | 短小、可独立理解 |

### 应该沉淀

| 类型 | 一般性示例 |
|------|------------|
| 真实失败信号和 feedback loop | "登录接口返回 401 时，先用最小 `curl` 验证 Authorization header 格式，再检查 token 来源和过期时间。" |
| 调试路径和排查顺序 | "数据库连接超时先确认连接串来源和端口连通性，再检查服务状态，最后排查防火墙或网络策略。" |
| 验证策略和最小可证伪命令 | "CLI 变更至少运行 `node bin/cli.js --help`，并断言 exit code、关键 stdout 和错误路径。" |
| API 或 SDK 具体约束 | "第三方接口的分页游标只在响应 body 中返回，不能从 Link header 推断下一页。" |
| 可复用脚手架或模板 | "新增命令行子命令时，复用现有 args parser、help 文案和 smoke test 结构。" |
| 已证明有风险的反模式 | "不要全表查询后在内存中分页、聚合或排序；应在数据库层使用 limit、offset、group/order 条件。" |
| 边界、反例、回归测试设计 | "修复空状态 UI 后，补充 loading、empty、error 和 populated 四种状态的断言。" |
| 停止条件和用户决策边界 | "涉及数据迁移、权限策略、付费逻辑或外部服务真实写入时，必须先请求用户确认。" |

### 不应沉淀

| 类型 | 为什么不沉淀 |
|------|--------------|
| 密钥、token、密码、连接串 | 安全风险，必须清洗或完全排除 |
| 一次性日志、完整报错堆栈 | 体积大且复用价值低，只保留错误类型和首个关键失败信号 |
| 大段源码 | 应引用文件路径、接口名或模式，不复制实现 |
| 本次流水账 | 如"修改了 src/foo.ts 第 42 行"，不能指导未来任务 |
| 模型通用常识 | 如"使用清晰变量名"、"运行测试很重要"，不值得沉淀 |
| 没有证据的猜测 | 必须标记 `not_verified`，且只有对后续排查有帮助时才保留 |
| 过窄的项目偶然性 | 如临时 mock 数据、一次性文件名、当天环境异常 |

## 提炼方法

1. 从 RCM、验证命令、失败日志摘要、决策记录和交付证据中找候选，不从私有思考链中提取。
2. 用评分卡筛选候选；低分候选跳过或合并到已有技能，不新建文件。
3. 将候选改写为"Trigger / Signal -> Do -> Verify -> Avoid -> Boundary -> Source Evidence"。
4. 删除只对本次 session 有效的细节，保留可迁移的接口约束、命令模式、验证策略和决策边界。
5. 如果证据不足但可能有价值，写明 `not_verified`，不要伪装成已验证规则。

## 推荐内容模板

每条沉淀内容优先压缩成以下结构：

| 字段 | 内容要求 |
|------|----------|
| `Trigger / Signal` | 什么失败信号、任务类型、文件模式或用户请求会触发这个技能 |
| `Do` | 可靠做法、排查顺序、最小实现路径或固定命令 |
| `Verify` | 最小可证伪命令、测试、断言、人工验收步骤或不可验证原因 |
| `Avoid` | 已证明有风险的反模式、误判、无效尝试或安全边界 |
| `Boundary` | 适用条件、不适用条件、需要用户确认的决策点 |
| `Source Evidence` | session、REQ、验证命令、决策记录或文件路径；不要复制大段内容 |

生成或维护 `SKILL.md` 时，不要复制完整 PRD、diff、日志、源码或私有推理链；只保留必要摘要并引用路径、URL、session 或 REQ 编号。

## 完成条件

Skill Capture 只有同时满足以下条件才算完成：

1. 已搜索 `.agents/skills/`，确认没有可直接复用或应更新的现有技能。
2. 已用评分卡筛掉低价值候选，或记录 `skipped_no_high_value` 原因。
3. 已把保留候选整理为 Trigger / Do / Verify / Avoid / Boundary / Source Evidence 结构。
4. 已清洗密钥、token、客户数据、长日志、完整报错堆栈和大段源码。
5. 已同步 `.agents/skills/index.md`，并记录本次 `capturedFiles`。
6. 未为了沉淀技能扩大本次功能修改范围，且技能沉淀不替代真实验证。

## 可借鉴仓库和资料

这些来源只用于提炼方法和结构，不直接复制内容到项目：

| 来源 | 可借鉴点 | 使用边界 |
|------|----------|----------|
| [`anthropics/skills`](https://github.com/anthropics/skills) | 官方 skills 组织方式、`SKILL.md` + resources/scripts 的自包含结构 | 只借鉴结构，不假定所有示例都适合本项目 |
| [`mattpocock/skills`](https://github.com/mattpocock/skills) | predictability、completion criterion、progressive disclosure、pruning、failure modes 等写作方法 | 只抽象方法，不复制具体技能正文 |
| [`mattpocock/skills` handoff skill](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md) | 不重复已有 artifacts、引用路径/URL、脱敏和交接摘要技巧 | 只用于总结和证据引用规则 |
| [Claude Code Skills 文档](https://code.claude.com/docs/en/skills) | 触发描述、支持文件、精简 `SKILL.md`、项目/个人技能位置、evals/benchmark 思路 | 作为通用技能设计参考，不引入平台私有依赖 |
| [`agents.md`](https://agents.md/) 和 [GitHub Blog AGENTS.md 经验](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/) | commands early、具体 stack、真实示例、边界、测试/结构/风格/git 工作流分类 | 只用于 agent instruction 总结技巧 |
| [`NVIDIA/skills`](https://github.com/NVIDIA/skills) | catalog、产品仓库维护源、技能索引和来源追踪思路 | 只借鉴索引和来源追踪方式 |
| [`awesome-agent-skills`](https://github.com/VoltAgent/awesome-agent-skills) / [`awesome-claude-skills`](https://github.com/ComposioHQ/awesome-claude-skills) 类合集 | 发现分类和命名灵感 | 不作为权威规则来源，必须人工审查质量、安全和许可证 |

## 写入规则

1. 优先更新或创建 `.agents/skills/<skill-name>/SKILL.md`。
2. 技能点较短且尚未成体系时，先放入 `.agents/skills/<domain>.md`，后续再拆成独立 skill。
3. 必须同步维护 `.agents/skills/index.md`，至少记录 skill 名称、适用场景、关键词、文件路径和最近来源任务。
4. 每条技能点应包含 Trigger / Signal、Do、Verify、Avoid、Boundary、Source Evidence。
5. 如果来自推断而非验证，必须标记 `not_verified`。

## 与 `fastcar-cli skill install` 的关系

`skillCapture` 写入的是**项目级**技能（`.agents/skills/`），与 `fastcar-cli skill install` 管理的**全局**技能（`~/.agents/skills/`）是互补关系：

| 维度 | 项目级 Skill Capture | 全局 skill install |
|------|---------------------|-------------------|
| 位置 | `.agents/skills/` | `~/.agents/skills/` |
| 来源 | 自动迭代任务自动沉淀 | 用户手动安装 |
| 内容 | 项目特有的经验、反模式、feedback loop | 通用框架、SDK、工具或组织规范 |
| 生命周期 | 随项目演进 | 跨项目复用 |

## 状态值

| 状态 | 含义 |
|------|------|
| `pending` | 尚未执行（交付前必须完成） |
| `captured` | 已沉淀，记录 `capturedFiles` |
| `skipped_no_high_value` | 本轮无高价值技能点，记录 `skippedReasons` |
| `not_available` | 当前环境不能写 `.agents/skills` |
| `blocked` | 需要用户确认或权限 |

## .agents/skills/index.md 格式契约

```markdown
# Skills Index

## auto-iterate 沉淀的技能

| 名称 | 场景 | 关键词 | 路径 | 来源任务 |
|------|------|--------|------|----------|
| api-auth-debugging | API 认证失败排查 | api, auth, curl, token | .agents/skills/api-auth-debugging/SKILL.md | login-bugfix |
| cli-smoke-validation | CLI 变更 smoke 验证 | cli, --help, exit code | .agents/skills/cli-smoke-validation.md | command-refactor |
```

## Skill Maintenance / 技能维护约束

技能沉淀的目标是积累可复用经验，但无节制的积累会导致 `.agents/skills/` 膨胀，反而增加加载成本、降低信噪比。必须在每次沉淀时执行维护检查。

### 约束规则

1. **先查再写**：沉淀前先搜索 `.agents/skills/` 是否已有覆盖同一场景的技能。已有且不过时 -> 直接使用，不新建。已有但过时 -> 更新该技能，不新建。

2. **合并同类**：如果新技能与现有技能内容重叠超过 30%，必须合并到现有技能中，不新建文件。合并后更新 `.agents/skills/index.md`。

3. **目录上限**：`.agents/skills/` 下独立技能目录数不超过 10 个。`.agents/skills/` 根下的单文件技能（`<domain>.md`）不超过 5 个。超出时必须先合并或归档。

4. **索引同步**：每次写入或更新技能后，必须同步更新 `.agents/skills/index.md`。如果 index.md 中某个技能已 6 个月未被引用，标记为 `stale` 候选归档。

5. **单次沉淀上限**：一次 session 的 Skill Capture 新增文件不超过 2 个。已有技能更新不计入此上限，但更新后文件大小不能超过原有文件的 1.5 倍。

6. **归档机制**：`archive/` 目录用于存放至少 6 个月未被引用的技能。Agent 不得直接引用 `archive/` 中的技能；引用前必须先确认用户是否需要恢复。

7. **质量门禁**：如果 `.agents/skills/` 中存在文件数超过 15 个或总大小超过 200KB，Agent 必须在进入 delivery 前提示用户："项目技能库偏大（N 文件 / M KB），建议手动整理后继续。" CLI 交付门禁按 session 启动时的 `bloatBaseline` 做增量判断：历史已超标但本次未恶化时只警告，本次新增或加重超标时阻断；`--check-bloat` 始终报告全量诊断报告。
