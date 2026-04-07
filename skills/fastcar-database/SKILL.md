---
name: fastcar-database
description: FastCar 数据库与缓存开发指南。Use when working with FastCar framework for: (1) MySQL/PostgreSQL/MongoDB operations with @fastcar/mysql, @fastcar/pgsql, @fastcar/mongo, (2) Redis caching with @fastcar/redis, (3) Reverse engineering database tables to models/mappers with @fastcar/mysql-tool, (4) Writing entity models with decorators (@Table, @Field, @PrimaryKey, @Repository), (5) Using MysqlMapper/PgsqlMapper/MongoMapper for CRUD, joins, transactions.
---

# FastCar Database

FastCar 数据库模块提供基于装饰器的 ORM 支持，涵盖 MySQL、PostgreSQL、MongoDB 和 Redis，并支持通过 `mysql-tool` 逆向生成 Model 和 Mapper。

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
import { Table, Field, DBType, PrimaryKey, NotNull, Size } from "@fastcar/core/annotation";

@Table("users")
class User {
  @Field("id")
  @DBType("int")
  @PrimaryKey
  id!: number;

  @Field("name")
  @DBType("varchar")
  @NotNull
  @Size({ maxSize: 50 })
  name!: string;

  @Field("profile")
  @DBType("json")
  profile!: any;

  @Field("created_at")
  @DBType("datetime")
  createdAt!: Date;

  constructor(args?: Partial<User>) {
    if (args) {
      Object.assign(this, args);
    }
  }

  toObject() {
    return {
      id: this.id,
      name: this.name,
      profile: this.profile,
      createdAt: this.createdAt,
    };
  }
}
```

#### 定义 Mapper

```typescript
import { Entity, Repository } from "@fastcar/core/annotation";
import { MysqlMapper } from "@fastcar/mysql";
import User from "./User";

@Entity(User)
@Repository
class UserMapper extends MysqlMapper<User> {}

export default UserMapper;
```

#### MysqlMapper 完整 API 参考

```typescript
import { Service, Autowired } from "@fastcar/core/annotation";
import { OrderEnum, OperatorEnum } from "@fastcar/core/db";
import UserMapper from "./UserMapper";
import User from "./User";

@Service
class UserService {
  @Autowired
  private userMapper!: UserMapper;

  // ==================== 查询方法 ====================

  // 1. select(conditions) - 查询列表
  // 返回: T[] - 实体对象数组
  async getAllUsers() {
    return this.userMapper.select({});
  }

  // 2. selectOne(conditions) - 查询单个
  // 返回: T | null
  async getUserById(id: number) {
    return this.userMapper.selectOne({
      where: { id }
    });
  }

  // 3. selectByPrimaryKey(row) - 根据主键查询
  // 参数: 包含主键字段的对象
  // 返回: T | null
  async getUserByPK(id: number) {
    return this.userMapper.selectByPrimaryKey({ id } as User);
  }

  // 4. count(where) - 统计记录数
  // 返回: number
  async countUsers() {
    return this.userMapper.count({ status: 1 });
  }

  // 5. exist(where) - 判断是否存在
  // 返回: boolean
  async checkUserExists(name: string) {
    return this.userMapper.exist({ name });
  }

  // ==================== 条件查询详解 ====================

  // 简单等于条件
  async queryByStatus(status: number) {
    return this.userMapper.select({
      where: { status }
    });
  }

  // 多条件 AND
  async queryByConditions(name: string, status: number) {
    return this.userMapper.select({
      where: {
        name,
        status,
        delStatus: false
      }
    });
  }

  // 比较运算符
  async queryByAgeRange(minAge: number, maxAge: number) {
    return this.userMapper.select({
      where: {
        age: { [OperatorEnum.gte]: minAge, [OperatorEnum.lte]: maxAge }
      }
    });
  }

  // 支持的运算符:
  // OperatorEnum.eq - 等于 (默认)
  // OperatorEnum.gt / OperatorEnum.gte - 大于 / 大于等于
  // OperatorEnum.lt / OperatorEnum.lte - 小于 / 小于等于
  // OperatorEnum.neq - 不等于
  // OperatorEnum.in - IN 查询 (数组)
  // OperatorEnum.notin - NOT IN 查询
  // OperatorEnum.isNUll - IS NULL
  // OperatorEnum.isNotNull - IS NOT NULL

  // IN 查询
  async queryByIds(ids: number[]) {
    return this.userMapper.select({
      where: { id: { [OperatorEnum.in]: ids } }
    });
  }

  // IS NULL 查询
  async queryDeletedUsers() {
    return this.userMapper.select({
      where: { deletedAt: { [OperatorEnum.isNUll]: true } }
    });
  }

  // ==================== 排序和分页 ====================

  // 排序 - 必须使用 OrderEnum
  async getUsersOrdered() {
    return this.userMapper.select({
      where: { status: 1 },
      orders: { createdAt: OrderEnum.desc }  // 正确: 使用 OrderEnum.desc
      // 错误: orders: { createdAt: "DESC" }
    });
  }

  // OrderEnum 定义:
  // OrderEnum.asc = "ASC"
  // OrderEnum.desc = "DESC"

  // 多字段排序
  async getUsersMultiOrder() {
    return this.userMapper.select({
      orders: {
        status: OrderEnum.asc,
        createdAt: OrderEnum.desc
      }
    });
  }

  // 分页
  async getUsersPaged(page: number, pageSize: number) {
    return this.userMapper.select({
      orders: { id: OrderEnum.desc },
      offset: (page - 1) * pageSize,
      limit: pageSize
    });
  }

  // 只取前N条
  async getTopUsers(limit: number) {
    return this.userMapper.select({
      orders: { score: OrderEnum.desc },
      limit
    });
  }

  // ==================== 插入方法 ====================

  // 1. saveOne(row) - 插入单条
  // 返回: number - 插入的主键ID
  async createUser(name: string) {
    const user = new User({ name, createdAt: new Date() });
    const insertId = await this.userMapper.saveOne(user);
    return insertId;
  }

  // 2. saveList(rows) - 批量插入
  // 返回: boolean
  async createUsers(users: User[]) {
    return this.userMapper.saveList(users);
  }

  // 3. saveORUpdate(rows) - 插入或更新 (UPSERT)
  // 主键冲突时更新，否则插入
  // 返回: number - 主键ID
  async saveOrUpdateUser(user: User) {
    return this.userMapper.saveORUpdate(user);
  }

  // ==================== 更新方法 ====================

  // 1. update({ row, where, limit }) - 条件更新
  // 返回: boolean
  async updateUserName(id: number, name: string) {
    return this.userMapper.update({
      where: { id },
      row: { name, updatedAt: new Date() }
    });
  }

  // 2. updateOne({ row, where }) - 更新单条
  // 自动限制 limit: 1
  async updateOneUser(where: any, row: any) {
    return this.userMapper.updateOne({ where, row });
  }

  // 3. updateByPrimaryKey(row) - 根据主键更新
  // 根据实体对象的主键字段更新
  // 返回: boolean
  async updateById(user: User) {
    return this.userMapper.updateByPrimaryKey(user);
  }

  // 更新示例：软删除
  async softDeleteUser(id: number) {
    return this.userMapper.update({
      where: { id },
      row: { delStatus: true, deletedAt: new Date() }
    });
  }

  // ==================== 删除方法 ====================

  // 1. delete({ where, limit }) - 条件删除
  // 返回: boolean
  async deleteUser(id: number) {
    return this.userMapper.delete({
      where: { id }
    });
  }

  // 2. deleteOne(where) - 删除单条
  async deleteOneUser(where: any) {
    return this.userMapper.deleteOne(where);
  }

  // 3. deleteByPrimaryKey(row) - 根据主键删除
  async deleteById(id: number) {
    return this.userMapper.deleteByPrimaryKey({ id } as User);
  }

  // ==================== 高级查询 ====================

  // selectByCustom 完整参数说明
  // selectByCustom 支持更灵活的查询配置，包括 JOIN、分组、聚合、子查询等
  async selectByCustomExamples() {
    // 基础参数结构
    interface SelectByCustomParams {
      // 指定查询字段，默认为实体所有字段
      fields?: string[];
      // 查询条件，与 select 相同
      where?: Record<string, any>;
      // 排序，与 select 相同，使用 OrderEnum
      orders?: Record<string, OrderEnum>;
      // 分页偏移量
      offset?: number;
      // 分页大小
      limit?: number;
      // 表别名，用于 JOIN 查询
      tableAlias?: string;
      // JOIN 配置数组
      join?: Array<{
        type: "LEFT" | "RIGHT" | "INNER" | "OUTER";
        table: string;  // 表名，可带别名如 "orders o"
        on: string;     // 连接条件，如 "o.user_id = t.id"
      }>;
      // 分组字段
      groups?: string[];
      // 分组后的过滤条件（HAVING）
      having?: Record<string, any>;
      // 强制使用索引
      forceIndex?: string[];
      // 去重
      distinct?: boolean;
      // 子查询或 UNION
      union?: Array<{ query: string; all?: boolean }>;
    }

    // 1. 指定查询字段
    async selectFields() {
      return this.userMapper.selectByCustom({
        fields: ["id", "name", "email", "created_at"],
        where: { status: 1 }
      });
    }

    // 2. 使用聚合函数和分组
    async groupByExample() {
      return this.userMapper.selectByCustom({
        fields: [
          "status",
          "COUNT(*) as totalCount",
          "MAX(created_at) as lastCreated",
          "MIN(created_at) as firstCreated",
          "AVG(age) as avgAge"
        ],
        groups: ["status"],
        orders: { totalCount: OrderEnum.desc }
      });
    }

    // 3. 多表 JOIN 查询
    async multiJoinQuery() {
      return this.userMapper.selectByCustom({
        tableAlias: "u",
        fields: [
          "u.id",
          "u.name",
          "o.id as orderId",
          "o.amount",
          "p.name as productName"
        ],
        join: [
          {
            type: "LEFT",
            table: "orders o",
            on: "o.user_id = u.id"
          },
          {
            type: "LEFT",
            table: "products p",
            on: "p.id = o.product_id"
          }
        ],
        where: {
          "u.status": 1,
          "o.created_at": { [OperatorEnum.gte]: "2024-01-01" }
        },
        orders: { "o.created_at": OrderEnum.desc },
        limit: 100
      });
    }

    // 4. INNER JOIN（只返回有匹配的记录）
    async innerJoinQuery() {
      return this.userMapper.selectByCustom({
        tableAlias: "u",
        fields: ["u.id", "u.name", "COUNT(o.id) as orderCount"],
        join: [
          {
            type: "INNER",
            table: "orders o",
            on: "o.user_id = u.id"
          }
        ],
        groups: ["u.id", "u.name"],
        having: { orderCount: { [OperatorEnum.gte]: 5 } }
      });
    }

    // 5. 使用数据库函数
    async useDbFunctions() {
      return this.userMapper.selectByCustom({
        fields: [
          "id",
          "name",
          'DATE_FORMAT(created_at, "%Y-%m-%d") as createdDate',
          'CONCAT(first_name, " ", last_name) as fullName',
          "YEAR(birth_date) as birthYear"
        ],
        where: { status: 1 }
      });
    }

    // 6. 去重查询
    async distinctQuery() {
      return this.userMapper.selectByCustom({
        distinct: true,
        fields: ["city", "province"],
        where: { status: 1 }
      });
    }

    // 7. 强制索引
    async forceIndexQuery() {
      return this.userMapper.selectByCustom({
        forceIndex: ["idx_status_created"],
        where: { status: 1 },
        orders: { created_at: OrderEnum.desc }
      });
    }

    // 8. 复杂条件 + 分页
    async complexQueryWithPaging() {
      return this.userMapper.selectByCustom({
        tableAlias: "u",
        fields: ["u.*", "d.department_name"],
        join: [
          {
            type: "LEFT",
            table: "departments d",
            on: "d.id = u.department_id"
          }
        ],
        where: {
          "u.status": 1,
          "u.age": { [OperatorEnum.gte]: 18, [OperatorEnum.lte]: 60 },
          "u.name": { [OperatorEnum.like]: "%张%" }
        },
        orders: {
          "u.created_at": OrderEnum.desc,
          "u.id": OrderEnum.asc
        },
        offset: 0,
        limit: 20
      });
    }
  }

  // 自定义 SQL 查询
  // query(sql, args) - 执行查询 SQL
  async customQuery() {
    return this.userMapper.query(
      "SELECT * FROM users WHERE status = ? AND created_at > ?",
      [1, "2024-01-01"]
    );
  }

  // execute(sql, args) - 执行任意 SQL
  async customExecute() {
    return this.userMapper.execute(
      "UPDATE users SET login_count = login_count + 1 WHERE id = ?",
      [1]
    );
  }
}
```

#### 常用查询条件速查表

```typescript
import { OperatorEnum } from "@fastcar/core/db";

// 等于 (默认)
{ where: { status: 1 } }

// 不等于
{ where: { status: { [OperatorEnum.neq]: 1 } } }

// 大于 / 大于等于
{ where: { age: { [OperatorEnum.gt]: 18 } } }
{ where: { age: { [OperatorEnum.gte]: 18 } } }

// 小于 / 小于等于
{ where: { age: { [OperatorEnum.lt]: 60 } } }
{ where: { age: { [OperatorEnum.lte]: 60 } } }

// 范围查询
{ where: { age: { [OperatorEnum.gte]: 18, [OperatorEnum.lte]: 60 } } }

// IN 查询
{ where: { id: { [OperatorEnum.in]: [1, 2, 3] } } }

// NOT IN 查询
{ where: { id: { [OperatorEnum.notin]: [1, 2, 3] } } }

// IS NULL
{ where: { deletedAt: { [OperatorEnum.isNUll]: true } } }

// IS NOT NULL
{ where: { deletedAt: { [OperatorEnum.isNotNull]: true } } }

// 多条件 AND (默认)
{ where: { status: 1, delStatus: false } }

// 排序 (必须使用 OrderEnum)
import { OrderEnum } from "@fastcar/core/db";
{ orders: { createdAt: OrderEnum.desc } }
{ orders: { createdAt: OrderEnum.asc } }

// 分页
{ offset: 0, limit: 10 }
```

#### 事务处理

```typescript
import { SqlSession } from "@fastcar/core/annotation";
import { MysqlDataSourceManager } from "@fastcar/mysql";

@Service
class OrderService {
  @Autowired
  private dsm!: MysqlDataSourceManager;

  @Autowired
  private orderMapper!: OrderMapper;

  @Autowired
  private inventoryMapper!: InventoryMapper;

  async createOrderWithTransaction(order: Order, inventoryUpdate: any) {
    const sessionId = await this.dsm.beginTransaction();
    
    try {
      // 插入订单
      await this.orderMapper.saveOne(order, undefined, sessionId);
      
      // 更新库存
      await this.inventoryMapper.update({
        where: { id: inventoryUpdate.id },
        row: { quantity: inventoryUpdate.quantity }
      }, undefined, sessionId);
      
      // 提交事务
      await this.dsm.commit(sessionId);
      
      return true;
    } catch (error) {
      // 回滚事务
      await this.dsm.rollback(sessionId);
      throw error;
    }
  }
}
```

### PostgreSQL (@fastcar/pgsql)

#### 开启 PostgreSQL

```typescript
import { Application } from "@fastcar/core/annotation";
import { EnablePgsql } from "@fastcar/pgsql/annotation";

@Application
@EnablePgsql
class APP {}
export default new APP();
```

#### 定义 Mapper

```typescript
import { Entity, Repository } from "@fastcar/core/annotation";
import { PgsqlMapper } from "@fastcar/pgsql";
import User from "./User";

@Entity(User)
@Repository
class UserMapper extends PgsqlMapper<User> {}

export default UserMapper;
```

用法与 `MysqlMapper` 基本一致，支持相同的查询条件和 CRUD 操作。

### MongoDB (@fastcar/mongo)

#### 开启 MongoDB

```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableMongo } from "@fastcar/mongo/annotation";

@Application
@EnableMongo
class APP {}
export default new APP();
```

#### 定义 Mapper

```typescript
import { Entity, Repository } from "@fastcar/core/annotation";
import { MongoMapper } from "@fastcar/mongo";
import User from "./User";

@Entity(User)
@Repository
class UserMapper extends MongoMapper<User> {}

export default UserMapper;
```

### Redis (@fastcar/redis)

#### 开启 Redis

```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableRedis } from "@fastcar/redis/annotation";

@Application
@EnableRedis
class APP {}
export default new APP();
```

#### 使用 RedisClient

```typescript
import { Service, Autowired } from "@fastcar/core/annotation";
import { RedisClient } from "@fastcar/redis/annotation";

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

  async expire(key: string, seconds: number) {
    await this.redis.expire(key, seconds);
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

### 生成配置文件

```bash
fastcar-cli reverse:init
```

### 配置文件示例

```json
{
  "tables": ["users", "orders"],
  "modelDir": "D:/project/src/model",
  "mapperDir": "D:/project/src/mapper",
  "dbConfig": {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "password",
    "database": "test_db"
  },
  "style": {
    "tabWidth": 4,
    "printWidth": 200,
    "trailingComma": "es5",
    "useTabs": true,
    "parser": "typescript",
    "endOfLine": "crlf"
  },
  "ignoreCamelcase": false
}
```

### 执行逆向生成

```bash
fastcar-cli reverse
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
  # 连接池配置
  connectionLimit: 10
  # 是否使用预处理语句
  useServerPrepStmts: true

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

| 模块 | 安装命令 | 用途 |
|------|----------|------|
| @fastcar/mysql | `npm i @fastcar/mysql` | MySQL ORM |
| @fastcar/pgsql | `npm i @fastcar/pgsql` | PostgreSQL ORM |
| @fastcar/mongo | `npm i @fastcar/mongo` | MongoDB |
| @fastcar/redis | `npm i @fastcar/redis` | Redis 缓存 |
| @fastcar/mysql-tool | `npm i @fastcar/mysql-tool` | 逆向生成工具 |

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
3. **时间范围查询**：使用 `OperatorEnum.gte` 和 `OperatorEnum.lte` 运算符
4. **批量插入**：`saveList` 会自动分批处理（每批1000条）
5. **软删除**：建议使用 `update` 方法更新 `delStatus` 字段，而不是物理删除
