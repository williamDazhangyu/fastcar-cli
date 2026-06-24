# Changelog

## 2026-06-17

- 新增输出纪律契约：
  - `contracts/output-discipline-contract.md`：定义角色输出规则、中间进展模板、禁止输出清单、违规检测规则。
- 强化输出纪律：
  - `docs/auto-iterate-current-architecture.md`：Coder Prompt 增加"输出纪律（硬性）"章节，Coder 能力边界增加"输出"维度。
  - `SKILL.md`：§可追溯规则增加输出纪律引用；§全自动迭代模式增加中间进展模板引用；§核心流程增加输出纪律检查项。
  - `references/judge-runbook.md`：裁判步骤增加输出纪律检查（步骤 3/5/8/11）。
- 更新索引：
  - `references/index.md`：增加"契约（Contracts）"分区，包含 output-discipline-contract、delivery-gate-contract、session-contract。
  - `references/quick-reference.md`：增加 Output Discipline 速查条目。

- 参考 [mattpocock/skills](https://github.com/mattpocock/skills) 新增 5 个 reference 文档：
  - `references/grill-session.md`：Agent 主动 Grilling 流程，替代被动等待用户提供清单的启动握手。
  - `references/domain-language.md`：项目共享术语表，提取、维护和使用领域语言。（后合并到 `quick-reference.md` §领域语言）
  - `references/zoom-out.md`：系统视角，在 Context Reset Review 和代码探索时从系统高度理解代码。（后合并到 `feedback-loop.md` §Zoom Out）
  - `references/triage.md`：Issue 分流工作流，优先级排序、scope 评估、session 分配。（后合并到 `feedback-loop.md` §Triage）
  - `references/caveman-mode.md`：超压缩通信模式，token 降低 ~75%。（后合并到 `iteration-policy.md` §Caveman Mode）
- 强化已有文档：
  - `references/tdd-vertical-slices.md`：增加 Red-Green-Refactor 命名循环、好测试 vs 坏测试对比、横切 vs 纵切对比表。
  - `references/feedback-loop.md`：增加显式 Diagnose 六步循环（reproduce → minimise → hypothesise → instrument → fix → regression-test）。
- 修改核心文件：
  - `SKILL.md` §启动握手：从"要求用户输入清单"改为"Grill Session"，Agent 主动 interview 用户。
  - `SKILL.md` §模式选择：增加 Triage 行，Diagnose 行增加 Diagnose 六步循环引用。
  - `SKILL.md` §强触发词：增加 Triage 相关触发词。
  - `examples/state-template.md`：增加 `## Domain Glossary` 章节。
  - `references/index.md`：增加 5 个新 reference 的索引条目。
  - `references/quick-reference.md`：增加 5 个新概念的速查条目。

## 2026-06-16

- **文档腐化清理**：`worker.md` 已删除（旧 `--run` Worker pipeline 已废弃，内容被 `judge-runbook.md` 取代）；`orchestrator.md` 合并到 `references/judge-runbook.md` 并删除。
- **旧 CLI Worker 代码移除**：24 个废弃 flag（17 个 pipeline + 7 个 dispatch）从 FLAG_REGISTRY 移除；`--run`/`--dispatch`/`--check` 等不再识别。
- `index.md` 新增"历史/废弃文档"分区，记录 `orchestrator.md`（已合并）。
- `docs/auto-iterate-current-architecture.md` 顶部加阅读导航，指向 `judge-runbook.md`。
- `runtime-bugs-and-timeout-analysis.md` 移至 `docs/archive/`，根目录不再保留。
- `natural-language-routing.md` 更新 dispatch 相关示例为废弃说明。

## 2026-06-03

- 精简旧架构文档层：移除 compatibility、skill adapters、agents 镜像和历史迁移长文档。
- 当前架构统一收敛到 `docs/auto-iterate-current-architecture.md`、`SKILL.md` 和 `references/judge-runbook.md`（`orchestrator.md` 已合并到 `judge-runbook.md`）。
- 子 Agent 说明从自由并发拓扑收敛为主 Agent 直接管理 `Agent(subagent_type="coder")` 的默认路径；旧 `--check` / `--run` Worker pipeline 已废弃。
- `--no-run` 语义收敛为 protocol-only / LLM-only：不启动 subagent，不使用旧 Worker pipeline，由当前 LLM 遵循自动迭代技巧执行。

## 2026-05-30（历史记录，已废弃）

- 当时曾同步 CLI 驱动 auto-iterate 默认路径：Router 优先执行 `--check`，Worker 可用时进入 `--run --json-progress`，手动大 prompt 仅作为 fallback；该路径已在 2026-06-03 架构迁移中废弃。
- 移除对未入库历史文件 `反馈.md`、`优化.md` 的依赖说明，当前约定改由 `references/` 和本 changelog 承载。
- 补充 Router / Worker 硬边界、delivery gate 和 validate-state 严格门禁的当前维护口径。

## 2026-05-23

- 同步 Codex goal 模型文档：明确 Codex 运行时 goal 状态、普通 `Goal:` 前缀和 `fastcar-cli auto-iterate --goal` 的边界。
- 更新 OpenAI adapter、自然语言路由、README 和 CLI examples，避免把 CLI 目标参数误称为 Codex goal。

## 2026-05-22

- 新增 `index.md` 作为目录索引入口。
- 新增 `contracts/` 和 `changelog.md` 作为协议结构层。
- 明确 `SKILL.md` 只保留主协议，目录职责下沉到索引与子目录。
- 旧版反馈与优化内容后续改由结构化目录和 changelog 承载，不作为主索引。
