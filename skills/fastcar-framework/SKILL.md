---
name: fastcar-framework
description: FastCar 是一个基于 TypeScript 的 Node.js 企业级应用开发框架，采用 IoC（控制反转）设计思想，提供模块化、可扩展的架构支持。Use when working with FastCar framework for: (1) Creating IoC-based Node.js applications, (2) Using dependency injection with decorators (@Component, @Service, @Autowired), (3) Building web APIs with @fastcar/koa, (4) Database operations with MySQL/MongoDB/Redis, (5) Setting up scheduled tasks or worker pools, (6) Managing application lifecycle and configuration, (7) Selecting and configuring project templates (web, rpc, cos, static, microservices), (8) Writing application.yml for different templates.
---

# FastCar Framework

FastCar 是基于 TypeScript 的 Node.js 企业级应用开发框架，灵感来源于 Spring Boot，采用 IoC（控制反转）设计思想。

## 核心概念

### IoC 容器与装饰器

| 装饰器 | 用途 | 示例 |
|--------|------|------|
| `@Application` | 入口应用类 | `@Application class App {}` |
| `@Component` | 通用组件 | `@Component class UtilService {}` |
| `@Service` | 服务层 | `@Service class UserService {}` |
| `@Controller` | 控制器层 | `@Controller class UserController {}` |
| `@Repository` | 数据访问层 | `@Repository class UserRepository {}` |
| `@Autowired` | 依赖注入 | `@Autowired private userService!: UserService;` |

### 基础应用结构

```typescript
import { FastCarApplication } from "@fastcar/core";
import { Application, Autowired, Component, Service } from "@fastcar/core/annotation";

// 服务层
@Service
class UserService {
  getUsers() {
    return [{ id: 1, name: "Alice" }];
  }
}

// 控制器层
@Controller
class UserController {
  @Autowired
  private userService!: UserService;
  
  getUsers() {
    return this.userService.getUsers();
  }
}

// 应用入口
@Application
class App {
  app!: FastCarApplication;
  
  async start() {
    console.log("应用启动成功!");
  }
}

// 启动
const app = new App();
app.start();
```

## 模块速查

### Web 开发 (@fastcar/koa)

```typescript
import { GET, POST, REQUEST, Body, Param } from "@fastcar/koa/annotation";

@Controller
@REQUEST("/api/users")
class UserController {
  @GET
  async list() {
    return { data: [] };
  }
  
  @GET("/:id")
  async getById(@Param("id") id: string) {
    return { id };
  }
  
  @POST
  async create(@Body user: UserDTO) {
    return { created: true };
  }
}
```

### 数据库 (@fastcar/mysql)

```typescript
import { Repository, Table, Field, PrimaryKey, SqlSession } from "@fastcar/mysql/annotation";

@Table("users")
class User {
  @PrimaryKey
  @Field("id")
  id!: number;
  
  @Field("name")
  name!: string;
}

@Repository
class UserRepository {
  @SqlSession
  private session!: SqlSession;
  
  async findById(id: number) {
    return this.session.findById(User, id);
  }
}
```

### Redis (@fastcar/redis)

```typescript
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

```typescript
import { Scheduled, Cron } from "@fastcar/timer/annotation";

@Component
class TaskService {
  // 间隔执行（毫秒）
  @Scheduled(60000)
  async intervalTask() {
    console.log("每分钟执行");
  }
  
  // Cron 表达式
  @Cron("0 0 * * * *")
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
    // 在 worker 线程中执行
    return data.reduce((a, b) => a + b, 0);
  }
}
```

## 项目模板速查

FastCar CLI 提供 5 种项目模板，分别适用于不同的业务场景。

### 模板选择指南

| 模板 | 适用场景 | 核心依赖 | 关键注解 |
|------|---------|---------|---------|
| web | RESTful API 服务 | @fastcar/koa, @fastcar/server | @EnableKoa |
| static | 静态资源服务器 | @fastcar/koa, @fastcar/server | @EnableKoa + KoaStatic |
| rpc | RPC 微服务通信 | @fastcar/rpc, @fastcar/server | @EnableRPC |
| cos | 对象存储/文件上传/直播转码 | @fastcar/koa, @fastcar/cossdk, @fastcar/server | @EnableKoa |
| microservices | 分布式多服务架构 | @fastcar/koa, @fastcar/rpc, @fastcar/server, @fastcar/timer | @EnableKoa / @EnableRPC（按服务模块） |

### 各模板入口示例

#### Web 模板
```typescript
import { FastCarApplication } from "@fastcar/core";
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

#### Static 模板
```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableKoa, KoaMiddleware } from "@fastcar/koa/annotation";
import { ExceptionGlobalHandler, KoaStatic } from "@fastcar/koa";

@Application
@EnableKoa
@KoaMiddleware(ExceptionGlobalHandler)
@KoaMiddleware(KoaStatic)
class APP {
  app!: any;
}
export default new APP();
```

#### RPC 模板
```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableRPC } from "@fastcar/rpc/annotation";

@Application
@EnableRPC
class APP {}
export default new APP();
```

#### COS 模板
```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableKoa, KoaMiddleware } from "@fastcar/koa/annotation";
import { ExceptionGlobalHandler, KoaBody, KoaBodyParser, KoaCors } from "@fastcar/koa";

@EnableKoa
@Application
@KoaMiddleware(ExceptionGlobalHandler, KoaBody, KoaBodyParser, KoaCors)
class APP {}
export default new APP();
```

#### Microservices 模板
微服务模板采用多服务架构，包含 `app-node.ts`（子进程启动多服务）和 `app-pm2.ts`（PM2 启动入口）。服务模块分为：
- **center**：服务中心，提供服务注册与发现
- **connector**：连接器服务，处理客户端连接
- **chat**：聊天服务，处理实时消息
- **web**：Web 服务，提供 HTTP 接口
- **base**：基础服务，提供公共功能

各服务模块内部根据职责使用 `@EnableKoa` 或 `@EnableRPC`。

### 项目结构示例

**Web / Static / RPC / COS 模板**
```
template/
├── src/
│   ├── controller/       # 控制器（web/cos）
│   ├── middleware/       # 中间件（web/cos）
│   ├── model/            # 数据模型
│   └── app.ts            # 应用入口
├── resource/
│   └── application.yml   # 配置文件
├── target/               # 编译输出
├── package.json
├── tsconfig.json
└── ecosystem.config.yml
```

**Microservices 模板**
```
template/
├── src/
│   ├── annotation/       # 注解定义
│   ├── common/           # 公共代码
│   ├── middleware/       # 中间件
│   ├── servers/          # 服务目录
│   │   ├── base/         # 基础服务
│   │   ├── center/       # 服务中心
│   │   ├── chat/         # 聊天服务
│   │   ├── connector/    # 连接器服务
│   │   └── web/          # Web 服务
│   ├── types/            # 类型定义
│   ├── utils/            # 工具函数
│   ├── app-node.ts       # 单节点入口（子进程启动）
│   └── app-pm2.ts        # PM2 入口
├── resource/
│   ├── application.yml
│   ├── application-dev.yml
│   └── ecosystem.config.yml
├── test/
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

配置文件放在 `resource/application.yml`。FastCar 支持按 `env` 加载多文件，例如 `application-dev.yml` 会与主配置合并。

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

### 各模板 application.yml 详解

#### Web / Static / COS 通用 Koa 配置

```yaml
application:
  env: "dev"

settings:
  koa:
    server:
      - { port: 8080, host: "0.0.0.0" }
      # HTTPS 示例：
      # - { port: 443, host: "0.0.0.0", protocol: https, ssl: { key: "./ssl/server.key", cert: "./ssl/server.pem" } }
    koaStatic: # 静态资源映射
      { "public": "public" } # 别名: 路径（相对 resource 目录或绝对路径）
    koaBodyParser: # 请求体解析
      enableTypes: ["json", "form", "text"]
      extendTypes: { text: ["text/xml", "application/xml"] }
```

- `settings.koa.server`：服务器监听配置数组。支持 `http`（默认）、`http2`、`https`；启用 HTTPS 时需额外指定 `protocol: https` 和 `ssl.key / ssl.cert`。
- `settings.koa.koaStatic`：静态资源访问映射，格式为 `{ "别名": "路径" }`。
- `settings.koa.koaBodyParser`：Koa Body 解析器配置，`enableTypes` 控制允许的请求体类型，`extendTypes` 可扩展 XML 等特殊类型。

#### RPC 模板配置

```yaml
application:
  name: "fastcar-boot-rpc"

settings:
  rpc:
    list:
      - id: "server-1"
        type: "ws"              # 通信协议：ws / http / grpc / mqtt
        server: { port: 1235 }
        extra: {}
        serviceType: "base"     # 服务类型分类
        secure:
          username: "user"
          password: "123456"
```

- `settings.rpc.list`：RPC 服务端点数组。
  - `id`：节点唯一标识。
  - `type`：通信协议，常见取值 `ws`、`http`、`grpc`、`mqtt`。
  - `server`：监听配置，通常只写 `{ port }`。
  - `extra`：协议扩展参数。
  - `serviceType`：服务类型，用于服务分组或路由。
  - `secure`：安全认证信息，包含 `username` 和 `password`。

#### COS 模板特有配置

```yaml
application:
  env: "prod"

settings:
  hotterSysConfig: true # 启用系统配置热更新监听
```

- `settings.hotterSysConfig`：设为 `true` 时，框架会监听配置变更并自动热更新。

#### Microservices 模板配置

主配置通常只声明环境：

```yaml
application:
  env: "dev"
```

详细集群配置放在 `application-dev.yml`：

```yaml
settings:
  hotterSysConfig: true # 监听系统配置变更

  microservices:
    center: # 服务中心
      token: "nW0tT4bZ6qM7mF7wD2rT2pR9dT7gK3hZ"
      servers:
        - host: "localhost"
          clusters: 1 # 实例数，serviceId 和端口号自动递增
          list:
            - type: "ws"
              server: { port: 60000 }
              timeout: 0 # 0 表示永不超时
              connectionLimit: 1
              disconnectInterval: 1000 # 断线重连间隔（毫秒）
              retry:
                retryCount: 3
                retryInterval: 3000
                timeout: 30000
                maxMsgNum: 10000
                increase: true

    connector: # 连接器服务
      token: "x3TGsWC9uloZu235LA07eAiJ61nQ1A5f"
      servers:
        - host: "localhost"
          clusters: 1
          list:
            - front: true # 标记为面向客户端的前置节点
              type: "ws"
              server: { port: 60100 }

    chat: # 聊天服务
      token: "go0kbkNM3wQ4e2Vgo0kbkNM3wQ4e2V"
      servers:
        - host: "localhost"
          clusters: 1
          list:
            - type: "ws"
              server: { port: 60200 }

    web: # Web 服务
      token: "go0kbkNM3wQ4e2Vgo0kbkNM3wQ4e2V"
      koa:
        koaBodyParser:
          enableTypes: ["json", "form", "text"]
          extendTypes: { text: ["text/xml", "application/xml"] }
      servers:
        - host: "localhost"
          clusters: 1
          list:
            - type: "http"
              server: { port: 8080 }
            - type: "ws"
              server: { port: 60300 }
```

- `settings.microservices.<服务名>`：定义各微服务模块的集群配置。
  - `token`：服务间通信鉴权令牌，防止非法节点接入。
  - `servers`：服务器集群列表。
    - `host`：主机地址。
    - `clusters`：集群实例数量。若大于 1，框架会自动递增 `serviceId` 和端口号生成多个实例。
    - `list`：该集群对外暴露的协议端点列表。
      - `type`：协议类型，如 `ws`、`http`。
      - `server`：端口配置 `{ port }`。
      - `front: true`：仅 connector 等前置服务需要，表示该节点直接面向客户端。
      - `timeout`：连接超时时间（毫秒），`0` 表示永不超时。
      - `connectionLimit`：最大连接数限制。
      - `disconnectInterval`：断线后重连间隔（毫秒）。
      - `retry`：消息重试策略。
        - `retryCount`：最大重试次数。
        - `retryInterval`：重试间隔。
        - `timeout`：重试总超时。
        - `maxMsgNum`：消息队列最大长度。
        - `increase`：是否递增重试间隔。

## 生命周期钩子

```typescript
import { ApplicationStart, ApplicationStop, ApplicationInit } from "@fastcar/core/annotation";

@Component
class LifecycleService {
  // 应用启动时执行
  @ApplicationStart
  async onStart() {
    console.log("应用启动");
  }
  
  // 应用停止前执行
  @ApplicationStop
  async onStop() {
    console.log("应用停止");
  }
  
  // 初始化（配合 @ApplicationRunner）
  @ApplicationInit
  async init() {
    console.log("初始化完成");
  }
}
```

## 表单验证

```typescript
import { ValidForm, NotNull, Size, Rule } from "@fastcar/core/annotation";

class UserDTO {
  @NotNull
  name!: string;
  
  @Size({ minSize: 1, maxSize: 150 })
  age!: number;
}

@Controller
class UserController {
  @ValidForm
  createUser(@Rule() @NotNull user: UserDTO) {
    // 参数自动校验
    return this.userService.create(user);
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

# Static 项目
mkdir my-static-app && cd my-static-app
fastcar-cli init static
npm install
npm run debug

# RPC 项目
mkdir my-rpc-app && cd my-rpc-app
fastcar-cli init rpc
npm install
npm run debug

# COS 项目
mkdir my-cos-app && cd my-cos-app
fastcar-cli init cos
npm install
npm run debug

# Microservices 项目
mkdir my-ms-app && cd my-ms-app
fastcar-cli init microservices
npm install
npm run start-node   # 单节点模式（子进程启动全部服务）
# 或
npm run start-pm2    # PM2 模式
```

### 手动创建项目

```bash
# 1. 创建项目
mkdir my-fastcar-app && cd my-fastcar-app
npm init -y

# 2. 安装依赖
npm i @fastcar/core @fastcar/koa @fastcar/server
npm i -D typescript ts-node @types/node

# 3. 初始化 TypeScript
npx tsc --init

# 4. 启用装饰器（tsconfig.json）
# "experimentalDecorators": true
# "emitDecoratorMetadata": true

# 5. 创建入口文件和配置文件，开始开发
```

## 参考资源

- 详细 API 文档：[references/api-reference.md](references/api-reference.md)
- 项目模板：[assets/project-template/](assets/project-template/)
