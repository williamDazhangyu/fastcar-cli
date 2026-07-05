---
name: fastcar-database
description: FastCar 数据库与缓存开发指南。Use when writing or reviewing MySQL, PostgreSQL, MongoDB, Redis, ORM mapper, entity model, transaction, query optimization, or reverse-generation code for FastCar applications.
---

# FastCar Database

FastCar 数据库模块提供基于装饰器的 ORM 支持，涵盖 MySQL、PostgreSQL、MongoDB 和 Redis。

## Agent 使用指南

使用本 skill 时：

- 先遵守 `skills/AGENTS.md` 的共享规则。
- 本 skill 只描述 FastCar 数据库模块和 FastCar 项目默认约束，不要泛化为所有 ORM、SQL 项目或 DBA 规范。
- 适合处理实体模型、Mapper、CRUD、事务、Redis 缓存、逆向生成和 SQL 查询优化。
- 分页、分组、聚合、排序和 JOIN 必须在数据库层完成。
- 排序必须使用 `OrderEnum`，条件运算符必须使用 `OperatorEnum` / `JoinEnum`。
- 状态、类型、模式等离散字段必须使用枚举，不要使用魔法字符串或裸数字。
- `@fastcar/*` 数据库相关模块必须使用 TypeScript 静态 `import`，不要使用 CommonJS `require()`。
- 示例中的 `localhost`、端口、账号和连接参数仅是本地占位；生产配置必须来自环境变量、配置中心或密钥管理系统。

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

事务不是数据库实现的默认第一优先级。多数业务写入优先采用更温和、可恢复的方式处理，例如幂等键、状态机校验、唯一约束、分阶段写入、补偿更新、重试或后台修复任务。

只有在明确存在强一致性需求时才优先使用事务，例如账户余额、库存扣减、跨表写入必须同时成功或失败、或中间状态会被外部系统立即消费。使用事务前应先确认事务边界短、锁范围小、失败路径可观测，并避免把网络调用、文件 IO、LLM 调用等长耗时操作放进事务。

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

`@fastcar/pgsql` 升级后仍应优先使用 ORM `select` / `update` / `updateOne` / `selectByCustom` 等能力。不要为了更新空字符串、少量字段或动态条件而绕过 ORM 改写为自定义 SQL；如遇类型收窄问题，应在 Repository 边界做清晰的类型适配，并保留 ORM 更新语义。

#### PostgreSQL 外键约束规则

FastCar pgsql 项目默认采用 Bytebase 风格的外键策略：不创建数据库物理外键，避免大规模数据、分库分表、微服务拆库和生产迁移中的强耦合、锁表和发布风险。

FastCar pgsql 项目默认禁止在 DDL、迁移脚本或示例代码中生成以下写法；若既有 schema、DBA 规范或外部系统明确要求物理外键，必须先取得项目决策，不要由 Agent 自行引入。

```sql
-- 禁止：建表时声明物理外键
CREATE TABLE orders (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id)
);

-- 禁止：后续迁移补充物理外键
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_user_id
  FOREIGN KEY (user_id) REFERENCES users(id);
```

推荐使用普通关联字段、普通索引和应用层一致性策略：

```sql
-- 推荐：保留关联字段，使用普通索引支撑查询、JOIN 和清理任务
CREATE TABLE orders (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL,
  status varchar(32) NOT NULL,
  created_at timestamp NOT NULL
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
```

替代一致性手段：

- 写入前在 Service 层校验关联对象是否存在。
- 通过唯一约束、状态机、幂等键和软删除规则约束业务流转。
- 使用后台任务定期扫描孤儿数据并做补偿、告警或清理。
- 跨服务或跨库关系只保存业务 ID，不依赖数据库外键做级联删除。
- 删除主数据时显式处理子数据，避免依赖 `ON DELETE CASCADE`。

#### PostgreSQL 枚举字段规则

FastCar pgsql 项目默认不使用 PostgreSQL 原生 `ENUM TYPE`。状态、类型、模式等离散字段应在 TypeScript 侧定义字符串枚举，数据库侧使用 `varchar` / `text` 保存枚举值，保持 schema 易扩展、易回滚、易灰度发布。

FastCar pgsql 项目默认禁止在 DDL 或迁移脚本中优先生成以下写法；若既有数据库已经使用原生 enum，应先评估迁移兼容性，不要自动改写。

```sql
-- 禁止：默认使用 PostgreSQL 原生枚举类型
CREATE TYPE job_status AS ENUM ('pending', 'running', 'success', 'failed');

CREATE TABLE jobs (
  id bigint PRIMARY KEY,
  status job_status NOT NULL
);
```

推荐写法：

```sql
-- 推荐：数据库保存稳定字符串，业务层用 TypeScript 枚举约束
CREATE TABLE jobs (
  id bigint PRIMARY KEY,
  status varchar(32) NOT NULL,
  type varchar(32) NOT NULL,
  created_at timestamp NOT NULL
);

CREATE INDEX idx_jobs_status ON jobs(status);
```

```typescript
export enum JobStatus {
  pending = "pending",
  running = "running",
  success = "success",
  failed = "failed",
}

const list = await this.mapper.select({
  where: { status: JobStatus.pending },
});
```

枚举字段处理要求：

- TypeScript 侧必须使用字符串枚举，禁止在查询、更新、状态机和 switch 分支中散落魔法字符串。
- PostgreSQL 侧默认使用 `varchar(32)` 或 `varchar(64)`；只有确有超长值时才使用 `text`。
- 高频过滤、排序或统计的枚举字段必须建立普通索引。
- `CHECK (field IN (...))` 只适用于值集合稳定、变更频率低的字段；频繁演进的业务状态不要默认加 `CHECK`。
- 枚举值演进优先新增值，不轻易重命名或删除；废弃旧值时应先兼容读取，再迁移数据，最后清理代码。

#### PostgreSQL 工程化规范

以下规则参考 Bytebase、GitLab Database Guidelines、SQLFluff、Supabase SQL Style Guide 和 PostgreSQL 官方文档，按 FastCar pgsql 项目默认约束落地；如果项目已有更高优先级的 schema 规范、DBA 审核规则或历史迁移约束，以项目内已确认规则为准。

命名规则：

- 表名、字段名、索引名、约束名统一使用小写 `snake_case`，禁止 camelCase、PascalCase 和带空格的 quoted identifier。
- 业务表优先使用复数或明确领域名，避免 `data`、`info`、`temp` 等无语义名称。
- 普通索引命名为 `idx_<table>_<columns>`，唯一索引命名为 `uk_<table>_<columns>`，检查约束命名为 `chk_<table>_<field>`。
- 关联字段使用 `<entity>_id`，即使不创建物理外键，也要让字段语义清晰。

表和字段注释规则：

- 新增业务表必须使用 `COMMENT ON TABLE` 说明表的业务用途。
- 新增字段必须使用 `COMMENT ON COLUMN` 说明字段含义；状态、类型、模式等枚举字段要说明枚举来源或核心取值语义。
- 注释应描述业务语义，不要只重复字段名，例如不要把 `user_id` 注释成“用户ID”，应说明是“下单用户 ID”或“任务创建人 ID”。
- 迁移脚本新增表或字段时，应同时包含对应注释；补字段不补注释视为不完整迁移。
- 注释内容应使用项目主要语言；FastCar 中文项目默认使用中文注释。

推荐示例：

```sql
COMMENT ON TABLE orders IS '订单主表';
COMMENT ON COLUMN orders.user_id IS '下单用户 ID';
COMMENT ON COLUMN orders.status IS '订单状态，对应 TypeScript 枚举 OrderStatus';
COMMENT ON COLUMN orders.request_id IS '创建订单请求 ID，用于幂等和链路排查';
```

主键与约束规则：

- 新表默认使用 `bigint` 主键；需要数据库自增时优先使用 identity，而不是旧式 `serial`。
- 不使用会变化的业务字段作为主键；业务唯一性通过唯一索引或唯一约束表达。
- 必填字段应显式 `NOT NULL`；可空字段必须有明确业务语义，不用 `NULL` 表达空字符串、空数组或默认状态。
- 保留 `PRIMARY KEY`、`UNIQUE`、必要 `NOT NULL` 和稳定字段的 `CHECK`，但外键和原生 enum 按本节 Bytebase 风格规则处理。

审计字段规则：

- 业务主表默认包含 `created_at`、`updated_at`；只追加不更新的日志、事件、流水表可以只保留 `created_at`。
- 需要软删除的表使用 `deleted_at` 或项目既有 `del_status`，不要混用多套删除语义；查询默认排除已删除数据。
- 需要追踪操作者时使用 `created_by`、`updated_by`、`deleted_by`，字段值保存业务用户 ID 或系统 actor ID，不保存展示名。
- 需要链路排查或幂等定位时保留 `request_id`、`trace_id` 或业务幂等键，并为高频查询字段建立索引。
- 审计时间由 Service 层或数据库默认值统一写入，禁止在多处业务代码随意拼接字符串时间。

推荐基础字段示例：

```sql
CREATE TABLE orders (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL,
  status varchar(32) NOT NULL,
  created_at timestamp NOT NULL,
  updated_at timestamp NOT NULL,
  deleted_at timestamp NULL,
  created_by bigint NULL,
  updated_by bigint NULL,
  request_id varchar(64) NULL
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_request_id ON orders(request_id);

COMMENT ON TABLE orders IS '订单主表';
COMMENT ON COLUMN orders.user_id IS '下单用户 ID';
COMMENT ON COLUMN orders.status IS '订单状态，对应 TypeScript 枚举 OrderStatus';
COMMENT ON COLUMN orders.created_at IS '创建时间';
COMMENT ON COLUMN orders.updated_at IS '最后更新时间';
COMMENT ON COLUMN orders.deleted_at IS '软删除时间，NULL 表示未删除';
COMMENT ON COLUMN orders.request_id IS '创建订单请求 ID，用于幂等和链路排查';
```

索引规则：

- 高频过滤、排序、JOIN、唯一性校验字段必须有匹配索引；不要为低选择性字段盲目建单列索引。
- 避免重复索引和前缀被覆盖的冗余索引，例如已有 `(user_id, status)` 时，不要无理由再建同用途 `(user_id)`。
- 生产大表新增索引应使用 `CREATE INDEX CONCURRENTLY`，避免长时间阻塞读写。
- 删除索引前必须确认没有查询、约束或后台任务依赖，避免发布后慢查询。

安全迁移规则：

- 大表加字段、改类型、加 `NOT NULL`、加唯一约束、回填历史数据必须分阶段执行，不要放进一次大事务。
- 新增字段默认先允许为空，应用双写或兼容读取后分批回填，再根据需要补 `NOT NULL` 或约束。
- 大批量更新、删除和回填必须按主键或时间窗口分批执行，避免长事务、膨胀和锁等待。
- 生产迁移脚本应设置合理的 `lock_timeout` / `statement_timeout`，失败后可重试，不依赖人工修库。
- 避免直接重命名表、列或枚举值；优先新增新字段、双写、迁移数据、切读、删除旧字段的兼容流程。

查询与数据类型规则：

- 业务查询禁止 `SELECT *`；只查询需要字段，复杂关联优先用 `selectByCustom` 明确 `fields`。
- 列表接口必须有分页或明确 limit；聚合、分组、排序和 JOIN 必须在数据库层完成。
- 金额、费率、数量等精确值使用 `numeric` / `decimal`，不要使用浮点类型保存精确业务数据。
- 时间字段统一按项目约定使用 `timestamp` 或 `timestamptz`，并明确时区处理策略；不要混用字符串时间。
- `json` / `jsonb` 只用于扩展属性、第三方原始载荷或低频查询配置，不替代核心关系字段和可索引列。

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

`@fastcar/redis` 基于 `redis@5`，当前导出 `RedisTemplate`、`RedisDataSource`、`RedisDataSourceManager`，并通过 `@fastcar/redis/annotation` 导出 `EnableRedis`。不要使用不存在的 `RedisClient` / `@RedisClient`。

#### 启用 Redis

```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableRedis } from "@fastcar/redis/annotation";

@Application
@EnableRedis
class APP {}
export default new APP();
```

#### 声明 RedisTemplate

业务代码应继承 `RedisTemplate` 并注册为 FastCar 组件；需要绑定默认数据源时使用 `@DS("default")`。

```typescript
import { DS, Repository } from "@fastcar/core/annotation";
import { RedisTemplate } from "@fastcar/redis";

@Repository
@DS("default")
export default class AppRedisTemplate extends RedisTemplate {}
```

#### 业务注入与基础使用

```typescript
import { Autowired, Service } from "@fastcar/core/annotation";
import AppRedisTemplate from "../redis/AppRedisTemplate";

@Service
class CacheService {
  @Autowired
  private redisTemplate!: AppRedisTemplate;

  async set(key: string, value: string, ttl?: number) {
    if (ttl) {
      await this.redisTemplate.setEx(key, value, ttl);
      return;
    }
    await this.redisTemplate.set(key, value);
  }

  async get(key: string) {
    return this.redisTemplate.get(key);
  }

  async del(key: string) {
    await this.redisTemplate.delKey(key);
  }

  // Hash 操作
  async hSet(key: string, field: string, value: string) {
    await this.redisTemplate.hSet(key, field, value);
  }

  async hGet(key: string, field: string) {
    return this.redisTemplate.hGet(key, field);
  }

  // List 操作
  async lPush(key: string, value: string) {
    await this.redisTemplate.lPush(key, [value]);
  }

  async rPop(key: string) {
    return this.redisTemplate.rPop(key);
  }
}
```

#### RedisTemplate 核心 API

```typescript
// String / Cache
await redisTemplate.set("cache:name", "fastcar");
await redisTemplate.setEx("token:1", { id: 1 }, 3600);
await redisTemplate.setJson("user:1", { id: 1, name: "Tom" }, 3600);
const user = await redisTemplate.getJson<{ id: number; name: string }>("user:1");
const locked = await redisTemplate.setNx("lock:job", "1", 30);
await redisTemplate.mSet({ "profile:1": { id: 1 }, "profile:2": { id: 2 } });
const profiles = await redisTemplate.mGet(["profile:1", "profile:2"]);
const views = await redisTemplate.incr("article:1:views");

// Key / TTL
await redisTemplate.exists("user:1");
await redisTemplate.expire("user:1", 600);
await redisTemplate.ttl("user:1");
await redisTemplate.delKey("user:1");
await redisTemplate.del(["user:1", "user:2"]);
await redisTemplate.scan("user:*", 100);
await redisTemplate.delKeys("temp:*");

// Hash / List / Set / ZSet
await redisTemplate.hSet("user:1:info", "name", "Tom");
await redisTemplate.hGetAll("user:1:info");
await redisTemplate.lPush("queue:email", ["job-1"]);
await redisTemplate.rPop("queue:email");
await redisTemplate.sAdd("article:1:tags", ["redis", "cache"]);
await redisTemplate.sMembers("article:1:tags");
await redisTemplate.zAdd("rank:score", 100, "user:1");
await redisTemplate.zRangeWithScores("rank:score", 0, -1);

// Pipeline / Transaction / PubSub / Lua / Raw Command
await redisTemplate.pipeline([["SET", "pipeline:key", "ok"], ["GET", "pipeline:key"]]);
await redisTemplate.transaction([["SET", "tx:key", "ok"], ["INCR", "tx:count"]]);
const unsubscribe = await redisTemplate.subscribe("notice", (message, channel) => {
  console.log(channel, message);
});
await redisTemplate.publish("notice", { type: "created", id: 1 });
await unsubscribe();
await redisTemplate.eval("return redis.call('GET', KEYS[1]) or ARGV[1]", ["missing:key"], ["default"]);
await redisTemplate.rawCommand<string>(["PING"]);
```

所有 `RedisTemplate` 方法最后一个参数都可以传入 `source?: string` 指定数据源，例如 `await redisTemplate.get("user:1", "cache")`。生产环境按模式遍历 key 时优先使用 `scan` / `delKeys`，不要直接对大 key 空间使用 `keys`。

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

settings:
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
    - { source: "default", host: "localhost", port: 6379 }
    - source: "cache"
      socket:
        host: "localhost"
        port: 6379
```

Redis 配置由 `@fastcar/redis` 从 `settings.redis` 读取，格式是数据源数组，每项必须包含 `source`。本地 Redis 无密码时不要配置 `password`；需要密码时可在数据源项中加入 `password`。

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
