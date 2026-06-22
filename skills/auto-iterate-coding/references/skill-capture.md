# Skill Capture — 技能沉淀参考

> 参照 Matt Pocock 的 `write-a-skill` 技能理念：每次任务交付后，将高价值经验沉淀为可复用的技能点。

## 定位

Skill Capture 是 auto-iterate 的任务后知识归档步骤。目标是在本项目 `.agents/skills` 中沉淀高价值技能点，避免同类问题反复重新探索。

## 触发时机

每次任务交付、提前停止或阶段性验收后，Agent 必须执行 Skill Capture。

## 什么算"高价值技能点"

### ✅ 正例 — 应该沉淀

| 类型 | 示例 |
|------|------|
| **真实失败信号和可复现 feedback loop** | "FastCar Controller 中 `@GET('/:id')` 的第一个参数是路由参数对象，不是单个 id 字符串" |
| **调试路径和排查顺序** | "pgsql 连接超时 → 先检查 `app.config.pgsql` 配置 → 再检查 PostgreSQL 服务状态 → 最后检查防火墙" |
| **验证策略和最小可证伪命令** | "验证 FastCar RPC 调用：`curl -X POST localhost:7001/rpc/ServiceName/method -d '{}'`" |
| **FastCar API 具体约束** | "`@fastcar/koa` 没有 `@Body`/`@Param`/`@Query` 装饰器；POST body 作为第一个参数传入" |
| **可复用脚手架/模板** | "FastCar 项目最小启动模板：`@Application` + `@EnableKoa` + `@Controller`" |
| **已证明有风险的反模式** | "不要全表查询后在 JS 内存中 `.slice()` 分页——必须在数据库层用 `offset`/`limit`" |
| **停止条件和需要用户确认的决策边界** | "数据库 schema 变更需要用户确认；Agent 不得自动执行 migration" |

### ❌ 反例 — 不应沉淀

| 类型 | 为什么不沉淀 |
|------|-------------|
| 密钥、token、密码、连接串 | 安全风险 |
| 一次性日志、完整报错堆栈 | 无复用价值 |
| 大段源码 | 应引用文件路径，不复制代码 |
| 只对本次任务有效的流水账 | 如"修改了 src/foo.ts 第 42 行" |
| 通用编程知识 | 如"TypeScript 中使用 `const` 优于 `let`"（应在 typescript-coding-style 中） |
| 未经验证的推断 | 必须标记 `not_verified` |

## 写入规则

1. 优先更新或创建 `.agents/skills/<skill-name>/SKILL.md`
2. 技能点较短且尚未成体系时，先放入 `.agents/skills/<domain>.md`，后续再拆成独立 skill
3. 必须同步维护 `.agents/skills/index.md`，至少记录：
   - skill 名称
   - 适用场景
   - 关键词
   - 文件路径
   - 最近来源任务
4. 每条技能点应包含：触发场景、可靠做法、验证方式、常见误区
5. 如果来自推断而非验证，必须标记 `not_verified`

## 与 `fastcar-cli skill install` 的关系

`skillCapture` 写入的是**项目级**技能（`.agents/skills/`），与 `fastcar-cli skill install` 管理的**全局**技能（`~/.agents/skills/`）是互补关系：

| 维度 | 项目级 Skill Capture | 全局 skill install |
|------|---------------------|-------------------|
| 位置 | `.agents/skills/` | `~/.agents/skills/` |
| 来源 | 自动迭代任务自动沉淀 | 用户手动安装 |
| 内容 | 项目特有的经验、反模式、feedback loop | 通用框架/SDK 约束 |
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
| fastcar-controller-pattern | 编写 FastCar Controller | controller, decorator, koa | .agents/skills/fastcar-controller-pattern/SKILL.md | login-bugfix |
| pgsql-query-optimization | pgsql 查询性能问题 | pgsql, query, offset, limit | .agents/skills/pgsql-query-optimization.md | order-list |
```