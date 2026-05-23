# FastCar AI Agent 开发规范

本文件会被 `fastcar-cli skill install` 同步到目标 Agent 或项目根目录，用于指导 Codex、Claude Code、Cursor、Kimi Code、Gemini CLI 等主流 AI Agent 编写 FastCar 相关代码。

## 适用范围

- FastCar 框架项目开发。
- FastCar CLI 模板、示例代码、skills 文档维护。
- 基于 `@fastcar/core`、`@fastcar/koa`、`@fastcar/mysql`、`@fastcar/rpc`、`@fastcar/serverless` 等模块的代码生成和重构。

## Agent 工作流程

1. 先确认当前任务属于哪个 skill：自动迭代、框架、数据库、RPC/微服务、Serverless、工具集或 TypeScript 编码规范。
2. 当用户用大白话要求启动、恢复、切换、检查、规划或优化自动迭代任务时，先读取 `auto-iterate-coding`，将自然语言意图映射为 `fastcar-cli auto-iterate` 命令；用户不需要记住 CLI 参数。
3. 读取对应 `SKILL.md` 后再写代码，不要凭 NestJS、Express、Spring 等其他框架习惯推断 FastCar API。
4. 修改示例、模板或业务代码时，优先保持现有项目结构和包管理器，不要无关格式化整个仓库。
5. 生成代码后检查 import 来源、装饰器写法、数据库查询方式和返回值语义。
6. 如果无法运行测试或示例命令，应在回复中明确说明未验证项。

## 自动迭代 Skill 强触发词

如果用户消息包含以下意图或词语，优先使用 `auto-iterate-coding`，并先读取 `skills/auto-iterate-coding/SKILL.md`：

- 自动迭代、auto-iterate、全自动开发、Autopilot。
- 完整实现、完整做完、全部实现、端到端实现、把需求都做完。
- 根据文档实现、按文档实现、实现这个文档、实现 docs、实现 docs 文档。
- 实现 PRD、根据 PRD 实现、按 PRD 实现、按 issue 实现、把文档里的需求都做完。
- 快速启动、开一个自动迭代任务、帮我自动推进。
- 一直修到通过、一直修到测试通过、不要停直到完成。
- 检查是否完成、帮我验收、验收 PRD、验证这个 PRD 是否都实现了。
- 诊断问题、debug、复现 bug、性能回归、flaky 测试、先建立反馈闭环。
- 原型、prototype、先试一下、验证状态机、验证数据模型、试几个 UI 方案。
- 只规划、先规划不要写代码、Plan-only。
- 优化模块、优化性能、提升可维护性但别改行为。
- 恢复任务、切换 session、列出自动迭代任务、resume session、switch session、list session。

用户不需要记住 `fastcar-cli auto-iterate` 参数。Agent 应按 `auto-iterate-coding` 的自然语言命令路由规则，将用户意图映射为对应命令；只有缺少会影响安全、兼容性或外部资源的关键信息时才追问。

## Import 规则

- `@fastcar/*` 相关模块必须使用 TypeScript 静态 `import`。
- 不要对 `@fastcar/core`、`@fastcar/koa`、`@fastcar/pgsql`、`@fastcar/pgboss` 等使用 CommonJS `require()`。
- 示例、模板和业务代码都必须给出明确 import 来源，避免让 Agent 猜测 API 来源。

正确写法：

```typescript
import { FastCarApplication } from "@fastcar/core";
import { Application } from "@fastcar/core/annotation";
import { EnableKoa } from "@fastcar/koa/annotation";
import { PgsqlMapper } from "@fastcar/pgsql";
```

禁止：

```typescript
const { Application } = require("@fastcar/core/annotation");
const { PgsqlMapper } = require("@fastcar/pgsql");
```

## 可用 Skills

| Skill | 使用场景 |
| --- | --- |
| `auto-iterate-coding` | 面向 AI Coding Agent 的有界自动迭代开发协议，用于实现、验证、修复、优化和跨会话恢复。 |
| `fastcar-framework` | IoC、依赖注入、Koa Web、配置、生命周期、项目模板。 |
| `fastcar-database` | MySQL、PostgreSQL、MongoDB、Redis、ORM、事务、逆向生成。 |
| `fastcar-rpc-microservices` | RPC 服务端/客户端、协议配置、微服务架构。 |
| `fastcar-serverless` | 阿里云 FC、腾讯云 SCF、AWS Lambda、本地 Serverless 调试。 |
| `fastcar-toolkit` | 缓存、定时任务、时间轮、workerpool、文件监听、COS SDK。 |
| `typescript-coding-style` | TypeScript 类型、枚举、命名、可维护性规则。 |

## FastCar Koa Controller 规则

核心原则：FastCar 没有 `@Body`、`@Param`、`@Query` 装饰器。

正确写法：

```typescript
import { Controller } from "@fastcar/core/annotation";
import { GET, POST, REQUEST } from "@fastcar/koa/annotation";
import { Context } from "koa";

@Controller
@REQUEST("/api/items")
class ItemController {
  @GET("/:id")
  async getById(id: string, ctx?: Context) {
    return { id };
  }

  @POST()
  async create(body: ItemDTO, ctx?: Context) {
    return { created: true };
  }
}
```

必须遵守：

- 第一个参数是请求数据对象：POST 的 `body`、GET 的 `query` 或路由参数。
- 第二个参数是可选的 Koa 上下文：`ctx?: Context`。
- `Context` 必须从 `koa` 导入。
- 路由装饰器必须写成函数调用：`@GET()`、`@POST()`、`@REQUEST("/api")`。
- 表单验证使用方法级 `@ValidForm` 和 DTO 参数上的 `@Rule()`。
- `@Rule()` 会按 DTO 规则校验并格式化参数，Controller 中直接传递该参数，不要再调用 `DTO.from(body).toInput()`。

禁止：

```typescript
import { Body, Param, Query } from "@fastcar/koa/annotation";

@GET
async list() {}

@GET("/:id")
async getById(@Param("id") id: string) {}

@POST()
async create(@Body body: ItemDTO) {}

@ValidForm
@POST()
async create(@Rule() body: ItemDTO) {
  return this.service.create(ItemDTO.from(body).toInput());
}
```

## 数据库查询规则

分页、聚合、分组和关联查询必须在数据库层完成，不能先全表查询再在 JS 内存中处理。

正确写法：

```typescript
const list = await this.mapper.select({
  where: { status: JobStatus.running },
  orders: { id: OrderEnum.desc },
  offset: (page - 1) * pageSize,
  limit: pageSize,
});

const stats = await this.mapper.selectByCustom({
  fields: ["status", "COUNT(*) as count", "SUM(amount) as totalAmount"],
  groups: ["status"],
});
```

禁止：

- 全表查询后用 `.slice()` 分页。
- 全表查询后用 `.reduce()` 分组统计。
- N+1 循环查询后在内存中组装关联数据。
- 用字符串 `"DESC"` / `"ASC"` 代替 `OrderEnum`。

## 数据库一致性处理规则

事务不是数据库实现的默认第一优先级。多数业务写入优先采用更温和、可恢复的方式处理，例如幂等键、状态机校验、唯一约束、分阶段写入、补偿更新、重试或后台修复任务。

只有在明确存在强一致性需求时才优先使用事务，例如账户余额、库存扣减、跨表写入必须同时成功或失败、或中间状态会被外部系统立即消费。使用事务前应先确认事务边界短、锁范围小、失败路径可观测，并避免把网络调用、文件 IO、LLM 调用等长耗时操作放进事务。

## 实体、枚举和更新规则

实体创建必须使用构造函数对象形式：

```typescript
const entity = new Entity({
  name: "示例",
  status: JobStatus.pending,
  createdAt: new Date(),
});
```

状态、类型、模式等离散字段必须使用枚举：

```typescript
export enum JobStatus {
  pending = "pending",
  running = "running",
  completed = "completed",
}
```

其他规则：

- 更新 1 到 2 个字段时，直接使用 `updateOne` / `update`，不要先查询完整实体再保存。
- `selectByPrimaryKey` 和 `updateByPrimaryKey` 必须传入包含主键字段的对象。
- `saveList` 会自动分批处理，每批 1000 条。
- 接口无数据时返回真实空数组、空对象或 `null`，不要为了展示效果注入模拟数据。

## TypeScript 代码规则

- 复杂交叉类型在 2 处及以上使用时，提取为 `type` 或 `interface`。
- 类型、接口、枚举使用 PascalCase。
- 状态字段优先使用字符串枚举，避免裸数字和魔法字符串。
- 示例代码必须给出关键 import，避免让 Agent 猜测模块来源。
- 面向用户或前端展示的错误消息、提示文案和多语言映射不要硬编码在 Controller、Service 或 Middleware 中；应放在 `resource/` 下的配置、词条或数据文件中，代码只负责读取、校验和兜底。
- 这类业务文案、prompt 模板、词条和多语言映射优先使用独立 `.yml` 文件，例如 `resource/error-messages.yml`、`resource/conversation-guardrail-texts.yml`，并通过 `@Configure("xxx.yml")` 配置类注入；不要把大段业务文案塞进 `application.yml` / `application-*.yml`。`application*.yml` 只放应用启动参数、数据源、端口、provider/model ID、阈值等运行配置。

## 验证建议

根据项目实际情况选择验证方式：

- TypeScript 项目：优先运行 `npm run build`、`npm run test` 或项目已有 lint 命令。
- FastCar CLI 项目：优先运行 `node bin/cli.js --help`、`node bin/cli.js skill list`。
- 数据库相关代码：确认 SQL 在数据库层分页、聚合和 JOIN；真实连接数据库前先确认配置和权限。
- Serverless 代码：本地调试优先验证 HTTP、定时和事件触发器的输入输出格式。
