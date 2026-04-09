---
name: fastcar-framework
description: FastCar 是一个基于 TypeScript 的 Node.js 企业级应用开发框架，采用 IoC（控制反转）设计思想。Use when working with FastCar framework for: (1) Creating IoC-based Node.js applications, (2) Using dependency injection with decorators (@Component, @Service, @Autowired), (3) Building web APIs with @fastcar/koa, (4) Database operations with MySQL/MongoDB/Redis, (5) Setting up scheduled tasks or worker pools, (6) Managing application lifecycle and configuration.
---

# FastCar Framework

FastCar 是基于 TypeScript 的 Node.js 企业级应用开发框架，采用 IoC（控制反转）设计思想。

## 核心概念

### IoC 容器与装饰器

| 装饰器 | 用途 | 示例 |
|--------|------|------|
| `@Application` | 入口应用类 | `@Application class App {}` |
| `@Component` | 通用组件 | `@Component class UtilService {}` |
| `@Service` | 服务层 | `@Service class BizService {}` |
| `@Controller` | 控制器层 | `@Controller class ApiController {}` |
| `@Repository` | 数据访问层 | `@Repository class DataRepository {}` |
| `@Autowired` | 依赖注入 | `@Autowired private service!: BizService;` |

### 基础应用结构

```typescript
import { FastCarApplication } from "@fastcar/core";
import { Application, Autowired, Component, Service, Controller } from "@fastcar/core/annotation";

@Service
class BizService {
  getData() {
    return [{ id: 1, name: "示例" }];
  }
}

@Controller
class ApiController {
  @Autowired
  private service!: BizService;
  
  getData() {
    return this.service.getData();
  }
}

@Application
class App {
  app!: FastCarApplication;
  
  async start() {
    console.log("应用启动成功!");
  }
}

const app = new App();
app.start();
```

## 模块速查

### Web 开发 (@fastcar/koa)

**路由装饰器使用方式：**

```typescript
import { GET, POST, REQUEST } from "@fastcar/koa/annotation";

@Controller
@REQUEST("/api/items")
class ItemController {
  // GET 请求 - 无路径参数时必须有括号
  @GET()
  async list() {
    return { data: [] };
  }
  
  // GET 请求 - 有路径参数
  @GET("/:id")
  async getById(id: string) {
    return { id };
  }
  
  // POST 请求
  @POST()
  async create(body: ItemDTO) {
    return { created: true };
  }
}
```

**⚠️ 重要：FastCar 没有 `@Body`, `@Param`, `@Query` 装饰器**

- 请求参数直接作为方法参数传入
- GET 请求参数通过方法参数直接获取
- POST 请求体通过 `body` 参数获取
- 路径参数通过方法参数直接获取

### 数据库 (@fastcar/mysql)

**实体定义：**

```typescript
import { Table, Field, DBType, PrimaryKey, NotNull, Size } from "@fastcar/core/annotation";

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
}
```

**Mapper 定义：**

```typescript
import { Entity, Repository } from "@fastcar/core/annotation";
import { MysqlMapper } from "@fastcar/mysql";

@Entity(Entity)
@Repository
class EntityMapper extends MysqlMapper<Entity> {}
export default EntityMapper;
```

**Service 中使用：**

```typescript
import { Service, Autowired } from "@fastcar/core/annotation";
import { OrderEnum } from "@fastcar/core/db";
import EntityMapper from "./EntityMapper";

@Service
class EntityService {
  @Autowired
  private mapper!: EntityMapper;

  async getList() {
    return this.mapper.select({
      where: { status: 1 },
      orders: { createTime: OrderEnum.desc },
      limit: 10
    });
  }

  async getOne(id: number) {
    return this.mapper.selectOne({ where: { id } });
  }

  async create(data: Entity) {
    return this.mapper.saveOne(data);
  }

  async update(id: number, data: Partial<Entity>) {
    return this.mapper.update({ where: { id }, row: data });
  }

  async delete(id: number) {
    return this.mapper.delete({ where: { id } });
  }
}
```

### 表单验证 (@fastcar/core)

```typescript
import { ValidForm, NotNull, Size, Rule } from "@fastcar/core/annotation";

class ItemDTO {
  @NotNull
  name!: string;
  
  @Size({ minSize: 1, maxSize: 150 })
  value!: number;
}

@Controller
@REQUEST("/api/items")
class ItemController {
  @GET()
  async list(page: number = 1, pageSize: number = 10) {
    return { page, pageSize, data: [] };
  }

  @ValidForm
  @POST()
  async create(@Rule() body: ItemDTO) {
    const { name, value } = body;
    return this.service.create({ name, value });
  }
}
```

**表单验证规则：**

| 装饰器 | 用途 | 示例 |
|--------|------|------|
| `@ValidForm` | 开启方法参数校验 | 放在方法上 |
| `@Rule()` | 标记校验对象 | 放在 DTO 参数前 |
| `@NotNull` | 参数不能为空 | 放在 DTO 字段上 |
| `@Size({min, max})` | 大小限制 | 放在 DTO 字段上 |

### Redis (@fastcar/redis)

```typescript
import { Service, Autowired } from "@fastcar/core/annotation";
import { RedisClient } from "@fastcar/redis/annotation";

@Service
class CacheService {
  @RedisClient
  private redis!: RedisClient;
  
  async get(key: string) {
    return this.redis.get(key);
  }
  
  async set(key: string, value: string, ttl?: number) {
    await this.redis.set(key, value, ttl);
  }
}
```

### 定时任务 (@fastcar/timer)

> **推荐使用 `@fastcar/timer/scheduling2` 模块**

```typescript
import { ScheduledInterval, ScheduledCron } from "@fastcar/timer/scheduling2";

@Component
class TaskService {
  // 间隔执行（毫秒）
  @ScheduledInterval({ fixedRate: 60000 })
  async intervalTask() {
    console.log("每分钟执行");
  }
  
  // Cron 表达式
  @ScheduledCron("0 0 * * * *")
  async hourlyTask() {
    console.log("每小时执行");
  }
}
```

### 工作线程池 (@fastcar/workerpool)

```typescript
import { WorkerPool, WorkerTask } from "@fastcar/workerpool/annotation";

@Component
class ComputeService {
  @WorkerPool({ minWorkers: 2, maxWorkers: 4 })
  private pool!: WorkerPool;
  
  @WorkerTask
  heavyComputation(data: number[]): number {
    return data.reduce((a, b) => a + b, 0);
  }
}
```

## 项目模板速查

FastCar CLI 提供 5 种项目模板：

| 模板 | 适用场景 | 核心依赖 | 关键注解 |
|------|---------|---------|---------|
| web | RESTful API 服务 | @fastcar/koa, @fastcar/server | @EnableKoa |
| static | 静态资源服务器 | @fastcar/koa, @fastcar/server | @EnableKoa + KoaStatic |
| rpc | RPC 微服务通信 | @fastcar/rpc, @fastcar/server | @EnableRPC |
| cos | 对象存储/文件上传 | @fastcar/koa, @fastcar/cossdk, @fastcar/server | @EnableKoa |
| microservices | 分布式多服务架构 | @fastcar/koa, @fastcar/rpc, @fastcar/server, @fastcar/timer | @EnableKoa / @EnableRPC |

### 各模板入口示例

**Web 模板**
```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableKoa, KoaMiddleware } from "@fastcar/koa/annotation";
import { ExceptionGlobalHandler, KoaBodyParser } from "@fastcar/koa";

@Application
@EnableKoa
@KoaMiddleware(ExceptionGlobalHandler)
@KoaMiddleware(KoaBodyParser)
class APP {
  app!: FastCarApplication;
}
export default new APP();
```

**RPC 模板**
```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableRPC } from "@fastcar/rpc/annotation";

@Application
@EnableRPC
class APP {}
export default new APP();
```

**Microservices 模板**
微服务模板包含多服务架构：center（服务中心）、connector（连接器）、message（消息服务）、web（Web服务）、base（基础服务）。

### 项目结构示例

```
template/
├── src/
│   ├── controller/       # 控制器（web/cos）
│   ├── dto/              # DTO 类（表单验证）
│   ├── service/          # 服务层
│   ├── model/            # 数据模型
│   └── app.ts            # 应用入口
├── resource/
│   └── application.yml   # 配置文件
├── package.json
└── tsconfig.json
```

### 模板依赖安装

```bash
# Web / Static
npm i @fastcar/core @fastcar/koa @fastcar/server

# RPC
npm i @fastcar/core @fastcar/rpc @fastcar/server

# COS
npm i @fastcar/core @fastcar/koa @fastcar/cossdk @fastcar/server

# Microservices
npm i @fastcar/core @fastcar/koa @fastcar/rpc @fastcar/server @fastcar/timer
```

## 配置管理

配置文件放在 `resource/application.yml`。支持按 `env` 加载多文件，例如 `application-dev.yml` 会与主配置合并。

### 基础配置示例

```yaml
application:
  name: my-app
  version: 1.0.0
  env: dev

mysql:
  host: localhost
  port: 3306
  database: mydb
  username: root
  password: password

redis:
  host: localhost
  port: 6379
```

使用配置：

```typescript
import { Configure, Value } from "@fastcar/core/annotation";

@Configure
class AppConfig {
  @Value("server.port")
  port!: number;

  @Value("mysql.host")
  dbHost!: string;
}
```

### Web 模板 application.yml

```yaml
application:
  env: "dev"

settings:
  koa:
    server:
      - { port: 8080, host: "0.0.0.0" }
    koaStatic:
      { "public": "public" }
    koaBodyParser:
      enableTypes: ["json", "form", "text"]
```

### RPC 模板配置

```yaml
application:
  name: "fastcar-boot-rpc"

settings:
  rpc:
    list:
      - id: "server-1"
        type: "ws"
        server: { port: 1235 }
        serviceType: "base"
        secure:
          username: "user"
          password: "password"
```

### Microservices 模板配置

```yaml
settings:
  microservices:
    center:
      token: "your-token-here"
      servers:
        - host: "localhost"
          clusters: 1
          list:
            - type: "ws"
              server: { port: 60000 }
    connector:
      token: "your-token-here"
      servers:
        - host: "localhost"
          clusters: 1
          list:
            - front: true
              type: "ws"
              server: { port: 60100 }
```

## 生命周期钩子

```typescript
import { ApplicationStart, ApplicationStop, ApplicationInit } from "@fastcar/core/annotation";

@Component
class LifecycleService {
  @ApplicationStart
  async onStart() {
    console.log("应用启动");
  }
  
  @ApplicationStop
  async onStop() {
    console.log("应用停止");
  }
  
  @ApplicationInit
  async init() {
    console.log("初始化完成");
  }
}
```

## 工具类

```typescript
import { DateUtil, CryptoUtil, FileUtil, TypeUtil } from "@fastcar/core/utils";

// 日期时间
DateUtil.toDateTime(); // "2024-03-10 15:30:45"
DateUtil.toDay();      // "2024-03-10"

// 加密
CryptoUtil.aesEncode(key, iv, "data");
CryptoUtil.sha256Encode("password");

// 文件操作
FileUtil.getFilePathList("./src");
FileUtil.getResource("./config.yml");

// 类型判断
TypeUtil.isFunction(() => {});  // true
TypeUtil.isClass(MyClass);       // true
```

## 完整模块列表

| 模块 | 安装命令 | 用途 |
|------|----------|------|
| @fastcar/core | `npm i @fastcar/core` | IoC 容器、配置管理 |
| @fastcar/koa | `npm i @fastcar/koa @fastcar/server` | Web 开发 |
| @fastcar/mysql | `npm i @fastcar/mysql` | MySQL 数据库 |
| @fastcar/pgsql | `npm i @fastcar/pgsql` | PostgreSQL |
| @fastcar/mongo | `npm i @fastcar/mongo` | MongoDB |
| @fastcar/redis | `npm i @fastcar/redis` | Redis 缓存 |
| @fastcar/cache | `npm i @fastcar/cache` | 缓存组件 |
| @fastcar/timer | `npm i @fastcar/timer` | 定时任务 |
| @fastcar/timewheel | `npm i @fastcar/timewheel` | 时间轮延时任务 |
| @fastcar/workerpool | `npm i @fastcar/workerpool` | 工作线程池 |
| @fastcar/rpc | `npm i @fastcar/rpc` | RPC 通信 |
| @fastcar/serverless | `npm i @fastcar/serverless` | Serverless 支持 |
| @fastcar/cos-sdk | `npm i @fastcar/cos-sdk` | 对象存储 |

## 快速开始新项目

### 使用 CLI 创建项目（推荐）

```bash
# Web 项目
mkdir my-web-app && cd my-web-app
fastcar-cli init web
npm install
npm run debug

# RPC 项目
mkdir my-rpc-app && cd my-rpc-app
fastcar-cli init rpc
npm install
npm run debug

# Microservices 项目
mkdir my-ms-app && cd my-ms-app
fastcar-cli init microservices
npm install
npm run start-node
```

## 常见错误与注意事项

### 1. 路由装饰器必须有括号

❌ **错误：**
```typescript
@GET
async list() { }
```

✅ **正确：**
```typescript
@GET()
async list() { }
```

### 2. 不要使用不存在的装饰器

❌ **错误：**
```typescript
import { Body, Param, Query } from "@fastcar/koa/annotation";

@GET("/:id")
async getById(@Param("id") id: string) { }
```

✅ **正确：**
```typescript
@GET("/:id")
async getById(id: string) { }
```

### 3. 表单验证使用 @ValidForm + @Rule

❌ **错误：**
```typescript
@POST()
async create(@Body body: ItemDTO) { }
```

✅ **正确：**
```typescript
@ValidForm
@POST()
async create(@Rule() body: ItemDTO) { }
```
