---
name: fastcar-database
description: FastCar 数据库与缓存开发指南。Use when working with FastCar framework for: (1) MySQL/PostgreSQL/MongoDB operations with @fastcar/mysql, @fastcar/pgsql, @fastcar/mongo, (2) Redis caching with @fastcar/redis, (3) Reverse engineering database tables to models/mappers with @fastcar/mysql-tool, (4) Writing entity models with decorators (@Table, @Field, @PrimaryKey, @Repository), (5) Using MysqlMapper/PgsqlMapper/MongoMapper for CRUD, joins, transactions.
---

# FastCar Database

FastCar 数据库模块提供基于装饰器的 ORM 支持，涵盖 MySQL、PostgreSQL、MongoDB 和 Redis。

## 模块速查

### MySQL (@fastcar/mysql)

#### 开启 MySQL

```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableMysql } from "@fastcar/mysql/annotation";

@Application
@EnableMysql
class APP {}
export default new APP();
```

#### 定义实体模型

```typescript
import {
  Table,
  Field,
  DBType,
  PrimaryKey,
  NotNull,
  Size,
} from "@fastcar/core/annotation";

@Table("entities")
class Entity {
  @Field("id")
  @DBType("int")
  @PrimaryKey
  id!: number;

  @Field("name")
  @DBType("varchar")
  @NotNull
  @Size({ maxSize: 50 })
  name!: string;

  @Field("data")
  @DBType("json")
  data!: any;

  @Field("created_at")
  @DBType("datetime")
  createdAt!: Date;

  constructor(args?: Partial<Entity>) {
    if (args) Object.assign(this, args);
  }
}
```

#### 定义 Mapper

```typescript
import { Entity, Repository } from "@fastcar/core/annotation";
import { MysqlMapper } from "@fastcar/mysql";
import Entity from "./Entity";

@Entity(Entity)
@Repository
class EntityMapper extends MysqlMapper<Entity> {}
export default EntityMapper;
```

#### MysqlMapper 核心 API

```typescript
import { Service, Autowired } from "@fastcar/core/annotation";
import { OrderEnum, OperatorEnum } from "@fastcar/core/db";
import EntityMapper from "./EntityMapper";
import Entity from "./Entity";

@Service
class EntityService {
  @Autowired
  private mapper!: EntityMapper;

  // ===== 查询方法 =====

  // 查询列表
  async list() {
    return this.mapper.select({});
  }

  // 查询单个
  async getOne(id: number) {
    return this.mapper.selectOne({ where: { id } });
  }

  // 根据主键查询
  async getByPK(id: number) {
    return this.mapper.selectByPrimaryKey({ id } as Entity);
  }

  // 统计记录数
  async count() {
    return this.mapper.count({ status: 1 });
  }

  // 判断是否存在
  async exists(name: string) {
    return this.mapper.exist({ name });
  }

  // ===== 条件查询 =====

  // 简单等于条件
  async queryByStatus(status: number) {
    return this.mapper.select({ where: { status } });
  }

  // 多条件 AND
  async queryByConditions(name: string, status: number) {
    return this.mapper.select({
      where: { name, status, delStatus: false },
    });
  }

  // 比较运算符
  async queryByRange(min: number, max: number) {
    return this.mapper.select({
      where: { value: { [OperatorEnum.gte]: min, [OperatorEnum.lte]: max } },
    });
  }

  // IN 查询
  async queryByIds(ids: number[]) {
    return this.mapper.select({
      where: { id: { [OperatorEnum.in]: ids } },
    });
  }

  // IS NULL 查询
  async queryDeleted() {
    return this.mapper.select({
      where: { deletedAt: { [OperatorEnum.isNUll]: true } },
    });
  }

  // ===== AND 条件查询 =====

  // 方式1：默认多字段自动 AND
  async queryByMultipleConditions(name: string, status: number) {
    return this.mapper.select({
      where: { name, status, delStatus: false },
      // 生成 SQL: WHERE name = ? AND status = ? AND del_status = ?
    });
  }

  // 方式2：同一字段多条件 AND
  async queryByAgeRange(min: number, max: number) {
    return this.mapper.select({
      where: {
        age: { [OperatorEnum.gte]: min, [OperatorEnum.lte]: max },
        // 生成 SQL: WHERE age >= ? AND age <= ?
      },
    });
  }

  // ===== OR 条件查询 =====

  // 方式1：对象形式（推荐）- 不同字段 OR
  async queryByNameOrEmail(keyword: string) {
    return this.mapper.select({
      where: {
        [JoinEnum.or]: {
          name: keyword,
          email: keyword,
        },
        // 生成 SQL: WHERE name = ? OR email = ?
      },
    });
  }

  // 方式2：数组形式 - 复杂条件 OR
  async queryComplexOr() {
    return this.mapper.select({
      where: {
        [JoinEnum.or]: [
          { status: 1, type: "A" },
          { status: 2, type: "B" },
        ],
        // 生成 SQL: WHERE (status = 1 AND type = 'A') OR (status = 2 AND type = 'B')
      },
    });
  }

  // ===== AND 与 OR 组合 =====

  async queryComplex(department: string, status: number, keyword: string) {
    return this.mapper.select({
      where: {
        department,
        [JoinEnum.or]: {
          name: { [OperatorEnum.like]: `%${keyword}%` },
          email: { [OperatorEnum.like]: `%${keyword}%` },
        },
        status,
        // 生成 SQL: WHERE department = ? AND (name LIKE ? OR email LIKE ?) AND status = ?
      },
    });
  }

  // ===== 排序和分页 =====

  async getOrdered() {
    return this.mapper.select({
      where: { status: 1 },
      orders: { createdAt: OrderEnum.desc },
    });
  }

  async getPaged(page: number, pageSize: number) {
    return this.mapper.select({
      orders: { id: OrderEnum.desc },
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
  }

  // ===== 插入方法 =====

  // 插入单条
  async create(name: string) {
    const entity = new Entity({ name, createdAt: new Date() });
    return this.mapper.saveOne(entity);
  }

  // 批量插入
  async createBatch(list: Entity[]) {
    return this.mapper.saveList(list);
  }

  // 插入或更新
  async saveOrUpdate(entity: Entity) {
    return this.mapper.saveORUpdate(entity);
  }

  // ===== 更新方法 =====

  // 条件更新
  async updateName(id: number, name: string) {
    return this.mapper.update({
      where: { id },
      row: { name, updatedAt: new Date() },
    });
  }

  // 更新单条
  async updateOne(where: any, row: any) {
    return this.mapper.updateOne({ where, row });
  }

  // 根据主键更新
  async updateById(entity: Entity) {
    return this.mapper.updateByPrimaryKey(entity);
  }

  // 软删除
  async softDelete(id: number) {
    return this.mapper.update({
      where: { id },
      row: { delStatus: true, deletedAt: new Date() },
    });
  }

  // ===== 删除方法 =====

  async deleteById(id: number) {
    return this.mapper.delete({ where: { id } });
  }

  async deleteOne(where: any) {
    return this.mapper.deleteOne(where);
  }

  // ===== 高级查询 =====

  // selectByCustom 支持 JOIN、分组、聚合
  async advancedQuery() {
    // 指定字段 + 泛型类型
    const results = await this.mapper.selectByCustom<{
      id: number;
      name: string;
      relatedName: string;
    }>({
      tableAlias: "t",
      fields: ["t.id", "t.name", "r.name as relatedName"],
      join: [
        {
          type: "LEFT",
          table: "related_table r",
          on: "r.entity_id = t.id",
        },
      ],
      where: { "t.status": 1 },
      camelcaseStyle: true,
    });

    // 聚合查询
    const stats = await this.mapper.selectByCustom({
      fields: [
        "status",
        "COUNT(*) as totalCount",
        "MAX(created_at) as lastCreated",
      ],
      groups: ["status"],
      orders: { totalCount: OrderEnum.desc },
    });

    return { results, stats };
  }

  // 自定义 SQL
  async customQuery() {
    return this.mapper.query(
      "SELECT * FROM entities WHERE status = ? AND created_at > ?",
      [1, "2024-01-01"],
    );
  }
}
```

#### 常用查询条件速查表

```typescript
import { OperatorEnum, OrderEnum } from "@fastcar/core/db";

// 等于 (默认)
{ where: { status: 1 } }

// 不等于
{ where: { status: { [OperatorEnum.neq]: 1 } } }

// 大于 / 大于等于 / 小于 / 小于等于
{ where: { age: { [OperatorEnum.gt]: 18 } } }
{ where: { age: { [OperatorEnum.gte]: 18, [OperatorEnum.lte]: 60 } } }

// IN / NOT IN
{ where: { id: { [OperatorEnum.in]: [1, 2, 3] } } }
{ where: { id: { [OperatorEnum.notin]: [1, 2, 3] } } }

// IS NULL / IS NOT NULL
{ where: { deletedAt: { [OperatorEnum.isNUll]: true } } }
{ where: { deletedAt: { [OperatorEnum.isNotNull]: true } } }

// AND（默认，多字段自动 AND）
{ where: { name: "A", status: 1 } }

// OR（对象形式 - 推荐，不同字段）
{ where: { [JoinEnum.or]: { name: "A", email: "A" } } }

// OR（数组形式，复杂条件）
{ where: { [JoinEnum.or]: [{ status: 1 }, { status: 2 }] } }

// AND + OR 组合
{ where: { status: 1, [JoinEnum.or]: { type: 1, category: 2 } } }

// 排序
{ orders: { createdAt: OrderEnum.desc } }

// 分页
{ offset: 0, limit: 10 }
```

#### 事务处理

```typescript
import { SqlSession } from "@fastcar/core/annotation";
import { MysqlDataSourceManager } from "@fastcar/mysql";

@Service
class BizService {
  @Autowired
  private dsm!: MysqlDataSourceManager;

  @Autowired
  private mapperA!: MapperA;

  @Autowired
  private mapperB!: MapperB;

  async transactionExample(dataA: any, dataB: any) {
    const sessionId = await this.dsm.beginTransaction();

    try {
      await this.mapperA.saveOne(dataA, undefined, sessionId);
      await this.mapperB.update(
        {
          where: { id: dataB.id },
          row: { status: dataB.status },
        },
        undefined,
        sessionId,
      );

      await this.dsm.commit(sessionId);
      return true;
    } catch (error) {
      await this.dsm.rollback(sessionId);
      throw error;
    }
  }
}
```

### PostgreSQL (@fastcar/pgsql)

```typescript
import { EnablePgsql } from "@fastcar/pgsql/annotation";
import { PgsqlMapper } from "@fastcar/pgsql";

@Application
@EnablePgsql
class APP {}

@Entity(Entity)
@Repository
class EntityMapper extends PgsqlMapper<Entity> {}
```

用法与 `MysqlMapper` 基本一致。

### MongoDB (@fastcar/mongo)

```typescript
import { EnableMongo } from "@fastcar/mongo/annotation";
import { MongoMapper } from "@fastcar/mongo";

@Application
@EnableMongo
class APP {}

@Entity(Entity)
@Repository
class EntityMapper extends MongoMapper<Entity> {}
```

### Redis (@fastcar/redis)

```typescript
import { EnableRedis } from "@fastcar/redis/annotation";
import { RedisClient } from "@fastcar/redis/annotation";

@Application
@EnableRedis
class APP {}

@Service
class CacheService {
  @RedisClient
  private redis!: RedisClient;

  async set(key: string, value: string, ttl?: number) {
    await this.redis.set(key, value, ttl);
  }

  async get(key: string) {
    return this.redis.get(key);
  }

  async del(key: string) {
    await this.redis.del(key);
  }

  // Hash 操作
  async hset(key: string, field: string, value: string) {
    await this.redis.hset(key, field, value);
  }

  async hget(key: string, field: string) {
    return this.redis.hget(key, field);
  }

  // List 操作
  async lpush(key: string, value: string) {
    await this.redis.lpush(key, value);
  }

  async rpop(key: string) {
    return this.redis.rpop(key);
  }
}
```

## 数据库逆向生成 (@fastcar/mysql-tool)

```bash
# 生成配置文件
fastcar-cli reverse:init

# 执行逆向生成
fastcar-cli reverse
```

配置文件示例：

```json
{
  "tables": ["table1", "table2"],
  "modelDir": "D:/project/src/model",
  "mapperDir": "D:/project/src/mapper",
  "dbConfig": {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "password",
    "database": "test_db"
  }
}
```

## application.yml 数据库配置

```yaml
application:
  env: dev

mysql:
  host: localhost
  port: 3306
  database: mydb
  username: root
  password: password
  connectionLimit: 10

pgsql:
  host: localhost
  port: 5432
  database: mydb
  username: postgres
  password: password

mongo:
  host: localhost
  port: 27017
  database: mydb

redis:
  host: localhost
  port: 6379
  password: ""
  db: 0
```

## 完整模块列表

| 模块                | 安装命令                    | 用途           |
| ------------------- | --------------------------- | -------------- |
| @fastcar/mysql      | `npm i @fastcar/mysql`      | MySQL ORM      |
| @fastcar/pgsql      | `npm i @fastcar/pgsql`      | PostgreSQL ORM |
| @fastcar/mongo      | `npm i @fastcar/mongo`      | MongoDB        |
| @fastcar/redis      | `npm i @fastcar/redis`      | Redis 缓存     |
| @fastcar/mysql-tool | `npm i @fastcar/mysql-tool` | 逆向生成工具   |

## 快速开始

```bash
# 1. 安装依赖
npm i @fastcar/core @fastcar/mysql @fastcar/redis

# 2. 配置 application.yml

# 3. 创建 Model、Mapper、Service

# 4. 启动应用
npm run debug
```

## 注意事项

1. **排序必须使用 OrderEnum**：`orders: { createdAt: OrderEnum.desc }`，不能使用字符串 `"DESC"`
2. **主键查询**：`selectByPrimaryKey` 和 `updateByPrimaryKey` 需要传入包含主键字段的对象
3. **批量插入**：`saveList` 会自动分批处理（每批1000条）
4. **软删除**：建议使用 `update` 方法更新 `delStatus` 字段，而不是物理删除

## 数据库查询最佳实践

### ⚠️ 分页查询 - 必须使用数据库层分页

**核心原则**：分页必须在数据库层完成，严禁全表查询后在内存中切片。

```typescript
// ✅ 正确：使用 SQL LIMIT/OFFSET 分页（数据库层完成分页）
const list = await this.mapper.select({
  where: { status: 1 },
  orders: { id: OrderEnum.desc },
  offset: (page - 1) * pageSize,
  limit: pageSize,  // 只取需要的记录
});

// ✅ 正确：使用游标/滚动分页（适合大数据量）
const list = await this.mapper.select({
  where: { 
    id: { [OperatorEnum.lt]: lastId }  // 基于上一页最后ID
  },
  orders: { id: OrderEnum.desc },
  limit: pageSize,
});

// ❌ 错误：全表查询后在内存中切片（数据量大时会导致 OOM）
const allData = await this.mapper.select({ where: { status: 1 } });  // 可能百万级数据
const pageData = allData.slice((page - 1) * pageSize, page * pageSize);  // 内存中切片
```

**为什么重要**：
- 全表查询会将所有数据加载到 Node.js 内存，数据量大时会导致内存溢出（OOM）
- 网络传输大量无用数据，严重影响性能
- 数据库层分页只返回需要的记录，内存占用固定

---

### ⚠️ 分组聚合 - 必须使用数据库层 GROUP BY

**核心原则**：分组统计必须在数据库层完成，严禁全表查询后在 JS 中分组。

```typescript
// ✅ 正确：使用 SQL GROUP BY 分组（数据库层聚合）
const stats = await this.mapper.selectByCustom({
  fields: [
    "status",
    "COUNT(*) as count",
    "SUM(amount) as totalAmount",
    "MAX(created_at) as latestTime",
  ],
  groups: ["status"],  // 数据库层分组
  orders: { count: OrderEnum.desc },
});

// ✅ 正确：使用 JOIN + GROUP BY 关联聚合
const userOrderStats = await this.mapper.selectByCustom({
  fields: [
    "u.id",
    "u.name",
    "COUNT(o.id) as orderCount",
    "SUM(o.amount) as totalAmount",
  ],
  join: [{
    type: "LEFT",
    table: "orders o",
    on: "o.user_id = u.id",
  }],
  groups: ["u.id", "u.name"],  // 数据库层分组聚合
});

// ❌ 错误：全表查询后在 JS 中分组（数据量大时会导致 OOM）
const allRecords = await this.mapper.select({});  // 加载所有数据
const grouped = allRecords.reduce((acc, item) => {
  if (!acc[item.status]) acc[item.status] = { count: 0, total: 0 };
  acc[item.status].count++;
  acc[item.status].total += item.amount;
  return acc;
}, {});  // 内存中分组，大数据量时性能极差
```

**为什么重要**：
- 数据库专为聚合计算优化，性能远高于 JS 遍历
- 减少网络传输（只返回聚合结果，而非原始数据）
- 避免 JS 单线程处理大量数据的性能瓶颈
- 防止内存溢出风险

---

## 编码规范

### 1. 实体对象创建规范

```typescript
// ✅ 正确：使用 key-value 形式创建对象
const entity = new Entity({
  name: "示例",
  status: 1,
  createTime: new Date(),
});

// ❌ 错误：逐行赋值创建对象
const entity = new Entity();
entity.name = "示例";
entity.status = 1;
```

### 2. 分页查询规范

```typescript
// ✅ 正确：使用 SQL limit/offset 分页
const total = await this.mapper.count(where);
const list = await this.mapper.select({
  where: where,
  orders: { createTime: OrderEnum.desc },
  offset: (page - 1) * pageSize,
  limit: pageSize,
});

// ❌ 错误：先全表查询再用 JS slice 分页
const list = await this.mapper.select({ where });
const pageData = list.slice((page - 1) * pageSize, page * pageSize);
```

### 3. 查询条件规范

```typescript
import { OperatorEnum } from "@fastcar/core/db";

// ✅ 正确：使用 OperatorEnum
const list = await this.mapper.select({
  where: {
    age: { [OperatorEnum.gte]: 18, [OperatorEnum.lte]: 60 },
    status: { [OperatorEnum.in]: [1, 2, 3] },
  },
});
```

### 4. 接口返回规范

```typescript
// ✅ 正确：返回空数据
if (records.length === 0) {
  return Result.ok({ list: [], total: 0 });
}

// ❌ 错误：返回模拟数据
if (records.length === 0) {
  return Result.ok({ list: [{ name: "模拟数据1" }] });
}
```

### 5. 更新操作规范

```typescript
// ✅ 正确：更新少于3个字段时使用 update/updateOne
await this.mapper.updateOne({
  where: { id },
  row: { lastLoginTime: new Date() },
});

// ❌ 错误：为了更新1-2个字段而查询整个实体对象
const entity = await this.mapper.selectByPrimaryKey({ id });
entity.lastLoginTime = new Date();
await this.mapper.updateByPrimaryKey(entity);
```

### 6. 复杂查询优化

```typescript
// ✅ 正确：使用 selectByCustom + JOIN 一条 SQL 完成
interface QueryResult {
    id: number;
    name: string;
    relatedName: string;
}

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

// ❌ 错误：多次查询 + 内存组装（N+1 问题）
const list = await this.mapper.select({});
for (const item of list) {
    const related = await this.relatedMapper.selectOne({ ... });
    // 内存组装...
}
```
