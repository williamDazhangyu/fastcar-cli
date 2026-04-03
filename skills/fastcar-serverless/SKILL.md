---
name: fastcar-serverless
description: FastCar Serverless 开发指南。Use when working with FastCar framework for: (1) Building serverless functions for Aliyun FC, Tencent SCF, or AWS Lambda, (2) Using @ServerlessApp, @Handler, @HttpTrigger, @TimerTrigger, @EventTrigger decorators, (3) Local development and debugging of serverless applications, (4) Integrating Koa middleware in serverless environments.
---

# FastCar Serverless

FastCar Serverless 框架支持将 FastCar 应用部署到阿里云函数计算（FC）、腾讯云云函数（SCF）和 AWS Lambda，同时提供本地开发调试能力。

## 核心装饰器

### @ServerlessApp

定义 Serverless 应用入口，可显式声明依赖组件和初始化逻辑。

```typescript
import { ServerlessApp, Service, Handler, HttpTrigger, TimerTrigger, EventTrigger } from "@fastcar/serverless";

@Service
class OrderService {
  async createOrder(data: any) {
    return { orderId: Date.now(), ...data };
  }
}

@ServerlessApp({
  name: "order-service",
  version: "1.0.0",
  components: [OrderService],
  init: async (app) => {
    console.log("Order service initializing...");
  },
})
class OrderApp {
  @HttpTrigger({ path: "/orders", method: "POST" })
  @Handler()
  async createOrder(event: any, context: any) {
    const orderService = (this as any).app.getFastCarApp().getComponentByName("OrderService") as OrderService;
    const order = await orderService.createOrder(event.body);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: { success: true, data: order },
    };
  }

  @HttpTrigger({ path: "/orders/:id", method: "GET" })
  @Handler()
  async getOrder(event: any, context: any) {
    return {
      statusCode: 200,
      body: { orderId: event.params?.id },
    };
  }

  @TimerTrigger({ cron: "0 0 * * * *" })
  @Handler()
  async hourlyReport(event: any, context: any) {
    console.log(`[${context.requestId}] Generating hourly report`);
    return { success: true };
  }

  @EventTrigger({ eventSource: "oss" })
  @Handler()
  async handleFileUpload(event: any, context: any) {
    console.log(`[${context.requestId}] Processing file upload event`);
    return { success: true };
  }
}

const orderApp = new OrderApp();
```

### 触发器类型

| 装饰器 | 用途 | 示例 |
|--------|------|------|
| `@HttpTrigger` | HTTP API 触发 | `@HttpTrigger({ path: "/api", method: "GET" })` |
| `@TimerTrigger` | 定时触发 | `@TimerTrigger({ cron: "0 0 * * * *" })` |
| `@EventTrigger` | 事件触发（OSS/COS 上传等） | `@EventTrigger({ eventSource: "oss" })` |
| `@Handler` | 标记处理方法 | `@Handler()` |

## 本地开发调试

使用 `ServerlessApplication` + `startLocalDev` 在本地启动开发服务器：

```typescript
import {
  ServerlessApplication,
  ServerlessContext,
  HttpTrigger,
  Handler,
  Service,
  Controller,
  Autowired,
  LoggerMiddleware,
  CorsMiddleware,
  ErrorMiddleware,
} from "@fastcar/serverless";
import { startLocalDev } from "@fastcar/serverless/local";

@Service
class UserService {
  private users = [
    { id: "1", name: "张三" },
    { id: "2", name: "李四" },
  ];
  findAll() { return this.users; }
  findById(id: string) { return this.users.find(u => u.id === id); }
  create(user: any) {
    const newUser = { id: String(Date.now()), ...user };
    this.users.push(newUser);
    return newUser;
  }
}

@Controller
class UserController {
  @Autowired
  private userService!: UserService;

  @HttpTrigger({ path: "/users", method: "GET" })
  @Handler()
  async listUsers(ctx: ServerlessContext) {
    ctx.json({ code: 0, data: this.userService.findAll(), requestId: ctx.requestId });
  }

  @HttpTrigger({ path: "/users/:id", method: "GET" })
  @Handler()
  async getUser(ctx: ServerlessContext) {
    const user = this.userService.findById(ctx.params.id);
    if (!user) ctx.throw(404, "User not found");
    ctx.json({ code: 0, data: user });
  }

  @HttpTrigger({ path: "/users", method: "POST" })
  @Handler()
  async createUser(ctx: ServerlessContext) {
    const user = this.userService.create(ctx.bodyData);
    ctx.status = 201;
    ctx.json({ code: 0, data: user });
  }
}

async function main() {
  const app = new ServerlessApplication();
  app.register(UserController, UserService);
  app.use(ErrorMiddleware({ includeStack: true }));
  app.use(LoggerMiddleware({ logQuery: true }));
  app.use(CorsMiddleware({ origin: "*" }));

  await startLocalDev(app, {
    port: 3000,
    host: "127.0.0.1",
    onStart: () => {
      console.log("Serverless local dev server running at http://127.0.0.1:3000");
    },
  });
}

main().catch(console.error);
```

## 云平台适配器

### 阿里云 FC

```typescript
import { createFCAdapter } from "@fastcar/serverless";
export const handler = createFCAdapter((orderApp as any).app);
```

### 腾讯云 SCF

```typescript
import { createSCFAdapter } from "@fastcar/serverless";
export const main_handler = createSCFAdapter((orderApp as any).app);
```

### AWS Lambda

```typescript
import { createLambdaAdapter } from "@fastcar/serverless";
export const handler = createLambdaAdapter((orderApp as any).app);
```

## 常用中间件

```typescript
import { LoggerMiddleware, CorsMiddleware, ErrorMiddleware } from "@fastcar/serverless";

app.use(ErrorMiddleware({ includeStack: true }));
app.use(LoggerMiddleware({ logQuery: true }));
app.use(CorsMiddleware({ origin: "*" }));
```

## 完整模块列表

| 模块 | 安装命令 | 用途 |
|------|----------|------|
| @fastcar/serverless | `npm i @fastcar/serverless` | Serverless 框架 |

## 快速开始

```bash
# 安装依赖
npm i @fastcar/core @fastcar/serverless

# 本地开发
npx ts-node serverless-app.ts
```
