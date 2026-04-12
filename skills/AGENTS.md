# FastCar 项目 AI 开发规范

本文件用于指导 AI agent 在 FastCar 项目中进行开发。当你读取或修改本项目中的文件时，请遵循以下规范，避免常见错误。

---

## 1. @fastcar/koa Controller 传参规范

**核心原则：FastCar 没有 `@Body`、`@Param`、`@Query` 装饰器。**

- **第一个参数**：请求数据对象（POST 的 `body`、GET 的 `query` / `params`）。
- **第二个参数**：Koa 上下文 `ctx: Context`，**可选，可省略**。
- `Context` 必须从 `koa` 导入：`import { Context } from "koa";`。
- 表单验证时，`@ValidForm` 放在**方法**上，`@Rule()` 放在**第一个** DTO 参数前。

### ✅ 正确示例

```typescript
import { GET, POST, REQUEST } from "@fastcar/koa/annotation";
import { Context } from "koa";

@Controller
@REQUEST("/api/items")
class ItemController {
  @GET("/:id")
  async getById(id: string, ctx: Context) {
    return { id };
  }

  @POST()
  async create(body: ItemDTO, ctx: Context) {
    return { created: true };
  }

  @ValidForm
  @POST("/login")
  async login(@Rule() body: LoginDTO, ctx: Context) {
    // body: 校验后的请求体
    // ctx: 可选的 Koa 上下文
  }
}
```

### ❌ 常见错误

- 从 `@fastcar/koa` 导入 `Context`。
- 将 `ctx` 放在第一个参数位置。
- 使用 `@Body`、`@Param`、`@Query` 等不存在的装饰器。
- 忘记 `ctx` 是可选的。

---

## 2. 禁止使用 `@Body`、`@Param`、`@Query` 装饰器

FastCar **没有** `@Body`、`@Param`、`@Query` 这些装饰器。请求参数直接通过方法参数传入，不要套用 NestJS / Express 的习惯。

```typescript
// ❌ 错误
import { Body, Param, Query } from "@fastcar/koa/annotation";

@GET("/:id")
async getById(@Param("id") id: string) { }

@POST()
async create(@Body body: ItemDTO) { }
```

---

## 3. 路由装饰器必须带括号

路由装饰器**必须**以函数调用的形式使用，不能省略括号。

```typescript
// ❌ 错误
@GET
async list() { }

// ✅ 正确
@GET()
async list() { }
```

---

## 4. 数据库查询必须在数据库层完成

### 分页查询

**严禁**先全表查询再在 JS 内存中用 `.slice()` 分页。

```typescript
// ✅ 正确：使用 SQL limit/offset
const list = await this.mapper.select({
  where: { status: 1 },
  orders: { id: OrderEnum.desc },
  offset: (page - 1) * pageSize,
  limit: pageSize,
});

// ❌ 错误：全表查询后内存切片
const all = await this.mapper.select({ where: { status: 1 } });
const pageData = all.slice((page - 1) * pageSize, page * pageSize);
```

### 分组聚合

**严禁**先全表查询再在 JS 中用 `.reduce()` 分组统计。

```typescript
// ✅ 正确：使用 SQL GROUP BY
const stats = await this.mapper.selectByCustom({
  fields: ["status", "COUNT(*) as count", "SUM(amount) as totalAmount"],
  groups: ["status"],
});

// ❌ 错误：全表查询后 JS 分组
const all = await this.mapper.select({});
const grouped = all.reduce((acc, item) => { /* ... */ }, {});
```

### 复杂关联查询

**严禁**用 N+1 循环查询再在内存中组装数据。

```typescript
// ✅ 正确：使用 selectByCustom + JOIN 一条 SQL 完成
const results = await this.mapper.selectByCustom<QueryResult>({
  tableAlias: "t",
  fields: ["t.id", "t.name", "r.name as relatedName"],
  join: [{
    type: "INNER",
    table: "related_table r",
    on: "r.entity_id = t.id",
  }],
  where: { "t.status": 1 },
  camelcaseStyle: true,
});

// ❌ 错误：N+1 循环查询
const list = await this.mapper.select({});
for (const item of list) {
  const related = await this.relatedMapper.selectOne({ ... });
}
```

---

## 5. 实体 / 模型规范

### 创建实体

**必须**通过构造函数的对象形式创建实体，禁止逐行赋值。

```typescript
// ✅ 正确
const entity = new Entity({
  name: "示例",
  status: 1,
  createdAt: new Date(),
});

// ❌ 错误
const entity = new Entity();
entity.name = "示例";
entity.status = 1;
```

### 排序

排序**必须**使用 `OrderEnum`，禁止使用字符串。

```typescript
import { OrderEnum } from "@fastcar/core/db";

// ✅ 正确
await this.mapper.select({
  orders: { createdAt: OrderEnum.desc },
});

// ❌ 错误
await this.mapper.select({
  orders: { createdAt: "DESC" },
});
```

### 状态字段必须使用枚举

状态、类型等离散取值字段**必须**使用 `enum`，禁止使用裸数字或魔法字符串。

```typescript
// ✅ 正确
export enum JobStatus {
  pending = "pending",
  running = "running",
  completed = "completed",
}

await this.mapper.updateOne({
  where: { id },
  row: { status: JobStatus.running },
});

// ❌ 错误
await this.mapper.updateOne({
  where: { id },
  row: { status: 1 },
});
```

### 更新少量字段

当更新字段少于 3 个时，**直接**使用 `updateOne` / `update`，禁止先查出整行再修改。

```typescript
// ✅ 正确
await this.mapper.updateOne({
  where: { id },
  row: { lastLoginTime: new Date() },
});

// ❌ 错误
const entity = await this.mapper.selectByPrimaryKey({ id });
entity.lastLoginTime = new Date();
await this.mapper.updateByPrimaryKey(entity);
```

---

## 6. 接口返回规范

**必须**如实返回空数据，禁止为了"美观"而注入模拟数据。

```typescript
// ✅ 正确
if (records.length === 0) {
  return Result.ok({ list: [], total: 0 });
}

// ❌ 错误
if (records.length === 0) {
  return Result.ok({ list: [{ name: "模拟数据1" }] });
}
```

---

## 7. 主键操作规范

- `selectByPrimaryKey` 和 `updateByPrimaryKey` 需要传入**包含主键字段的对象**。
- 批量插入 `saveList` 会自动分批处理（每批 1000 条）。
