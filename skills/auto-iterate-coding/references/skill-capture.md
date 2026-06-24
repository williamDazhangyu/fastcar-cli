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
## Skill Maintenance / 技能维护约束

技能沉淀的目标是积累可复用经验，但无节制的积累会导致 `.agents/skills/` 膨胀，反而增加加载成本、降低信噪比。必须在每次沉淀时执行维护检查。

### 约束规则

1. **先查再写**：沉淀前先搜索 `.agents/skills/` 是否已有覆盖同一场景的技能。已有且不过时 → 直接使用，不新建。已有但过时 → 更新该技能，不新建。

2. **合并同类**：如果新技能与现有技能内容重叠超过 30%，必须合并到现有技能中，不新建文件。合并后更新 `.agents/skills/index.md`。

3. **目录上限**：`.agents/skills/` 下独立技能目录数不超过 10 个。`.agents/skills/` 根下的单文件技能（`<domain>.md`）不超过 5 个。超出时必须先合并或归档。

4. **索引同步**：每次写入或更新技能后，必须同步更新 `.agents/skills/index.md`。如果 index.md 中某个技能已 6 个月未被引用，标记为 `stale` 候选归档。

5. **单次沉淀上限**：一次 session 的 Skill Capture 新增文件不超过 2 个。已有技能更新不计入此上限，但更新后文件大小不能超过原有文件的 1.5 倍。

6. **归档机制**：`archive/` 目录用于存放至少 6 个月未被引用的技能。Agent 不得直接引用 `archive/` 中的技能；引用前必须先确认用户是否需要恢复。

7. **质量门禁**：如果 `.agents/skills/` 中存在文件数超过 15 个或总大小超过 200KB，Agent 必须在进入 delivery 前提示用户："项目技能库偏大（N 文件 / M KB），建议手动整理后继续。" CLI 交付门禁按 session 启动时的 `bloatBaseline` 做增量判断：历史已超标但本次未恶化时只警告，本次新增或加重超标时阻断；`--check-bloat` 始终报告全量状态。
