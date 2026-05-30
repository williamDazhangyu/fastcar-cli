# Changelog

## 2026-05-30

- 同步 CLI 驱动 auto-iterate 默认路径：Router 优先执行 `--check`，Worker 可用时进入 `--run --json-progress`，手动大 prompt 仅作为 fallback。
- 移除对未入库历史文件 `反馈.md`、`优化.md` 的依赖说明，历史约定改由 `references/`、`compatibility/` 和本 changelog 承载。
- 补充 Router / Worker 硬边界、delivery gate 和 validate-state 严格门禁的当前维护口径。

## 2026-05-23

- 同步 Codex goal 模型文档：明确 Codex 运行时 goal 状态、普通 `Goal:` 前缀和 `fastcar-cli auto-iterate --goal` 的边界。
- 更新 OpenAI adapter、自然语言路由、README 和 CLI examples，避免把 CLI 目标参数误称为 Codex goal。

## 2026-05-22

- 新增 `index.md` 作为目录索引入口。
- 新增 `contracts/`、`compatibility/`、`adapters/`、`changelog.md` 作为第三方项目接入层。
- `adapters/` 从单文件配置升级为平台子目录结构，新增 `adapters/index.md` 和 `adapters/openai/index.md`。
- 明确 `SKILL.md` 只保留主协议，目录职责下沉到索引与子目录。
- 旧版反馈与优化内容后续改由结构化目录和 changelog 承载，不作为主索引。
