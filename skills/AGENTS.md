# FastCar AI Agent 开发规范

本文件会被 `fastcar-cli skill install` 同步到目标 Agent 或项目根目录，用于指导 Codex、Claude Code、Cursor、Kimi Code、Gemini CLI 等主流 AI Agent 编写 FastCar 相关代码。

## 适用范围

- FastCar 框架项目开发。
- FastCar CLI 模板、示例代码、skills 文档维护。
- 基于 `@fastcar/core`、`@fastcar/koa`、`@fastcar/mysql`、`@fastcar/rpc`、`@fastcar/serverless` 等模块的代码生成和重构。

## Agent 工作流程

1. 先确认当前任务属于哪个 skill：框架、数据库、RPC/微服务、Serverless、工具集或 TypeScript 编码规范。
2. 读取对应 `SKILL.md` 后再写代码，不要凭 NestJS、Express、Spring 等其他框架习惯推断 FastCar API。
3. 修改示例、模板或业务代码时，优先保持现有项目结构和包管理器，不要无关格式化整个仓库。
4. 生成代码后检查 import 来源、装饰器写法、数据库查询方式和返回值语义。
5. 如果无法运行测试或示例命令，应在回复中明确说明未验证项。

## 可用 Skills

| Skill | 使用场景 |
| --- | --- |
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

禁止：

```typescript
import { Body, Param, Query } from "@fastcar/koa/annotation";

@GET
async list() {}

@GET("/:id")
async getById(@Param("id") id: string) {}

@POST()
async create(@Body body: ItemDTO) {}
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

## 验证建议

根据项目实际情况选择验证方式：

- TypeScript 项目：优先运行 `npm run build`、`npm run test` 或项目已有 lint 命令。
- FastCar CLI 项目：优先运行 `node bin/cli.js --help`、`node bin/cli.js skill list`。
- 数据库相关代码：确认 SQL 在数据库层分页、聚合和 JOIN；真实连接数据库前先确认配置和权限。
- Serverless 代码：本地调试优先验证 HTTP、定时和事件触发器的输入输出格式。
