# Changelog

## 2026-06-03

- 精简旧架构文档层：移除 compatibility、skill adapters、agents 镜像和历史迁移长文档。
- 当前架构统一收敛到 `docs/auto-iterate-current-architecture.md`、`SKILL.md`、`orchestrator.md` 和 `references/judge-runbook.md`。
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
