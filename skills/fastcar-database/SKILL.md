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
import { Table, Field, DBType, PrimaryKey, NotNull, Size, CustomType } from "@fastcar/core/annotation";

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
  @CustomType("json")
  profile: any;

  constructor(...args: any) {
    Object.assign(this, ...args);
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

#### Service 中使用

```typescript
import { Service, Autowired } from "@fastcar/core/annotation";
import { OrderEnum } from "@fastcar/core/db";
import UserMapper from "./UserMapper";
import User from "./User";

@Service
class UserService {
  @Autowired
  private userMapper!: UserMapper;

  // 查询单条
  async getUser(id: number) {
    return this.userMapper.selectOne({ where: { id } });
  }

  // 条件查询
  async queryUsers(name: string) {
    return this.userMapper.select({
      where: {
        name: { value: name },
        createdAt: { ">=": "2024-01-01", "<=": "2024-12-31" },
      },
      orders: { createdAt: OrderEnum.desc },
      limit: 10,
    });
  }

  // 数组 IN 查询
  async queryByIds(ids: number[]) {
    return this.userMapper.select({
      where: { id: { IN: ids } },
    });
  }

  // 新增
  async createUser(name: string) {
    const user = new User({ name, createdAt: new Date() });
    return this.userMapper.saveOne(user);
  }

  // 批量新增
  async createUsers(users: User[]) {
    return this.userMapper.saveList(users);
  }

  // 更新
  async updateName(id: number, name: string) {
    return this.userMapper.update({ where: { id }, row: { name } });
  }

  // 按主键更新
  async updateById(user: User) {
    return this.userMapper.updateByPrimaryKey(user);
  }

  // 删除
  async deleteUser(id: number) {
    return this.userMapper.delete({ where: { id } });
  }

  // 判断存在
  async exists(name: string) {
    return this.userMapper.exist({ name });
  }

  // 统计
  async count() {
    return this.userMapper.count({});
  }

  // 执行原生 SQL
  async executeSql() {
    return this.userMapper.execute("SELECT * FROM users WHERE id = 1");
  }

  // 左连接查询
  async leftJoin() {
    return this.userMapper.selectByCustom({
      join: [
        {
          type: "LEFT",
          table: "orders o",
          on: "o.user_id = t.id",
        },
      ],
      tableAlias: "t",
    });
  }

  // 强制索引
  async forceIndex() {
    return this.userMapper.select({
      forceIndex: ["idx_name"],
      orders: { name: OrderEnum.desc },
      limit: 1,
    });
  }

  // 使用函数
  async formatDate() {
    return this.userMapper.select({
      fields: ['DATE_FORMAT(created_at, "%Y-%m-%d %H:%i:%s") as createdAt'],
    });
  }
}
```

#### 多数据源

在 `application.yml` 中配置多个数据源，Service 中通过指定数据源名称切换。

#### 事务

使用 `@Transactional`（如果框架提供）或手动通过 `SqlSession` 控制事务边界。

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

#### 使用 RedisTemplate

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
