---
name: fastcar-serverless
description: FastCar Serverless 开发指南。Use when building or modifying FastCar serverless functions for Aliyun FC, Tencent SCF, AWS Lambda, HTTP triggers, timer triggers, event triggers, local debugging, or platform adapters.
---

# FastCar Serverless

FastCar Serverless 框架支持将 FastCar 应用部署到阿里云函数计算（FC）、腾讯云云函数（SCF）和 AWS Lambda，同时提供本地开发调试能力。

## Agent 使用指南

使用本 skill 时：

- 先遵守 `skills/AGENTS.md` 的共享规则。
- 本 skill 只描述 FastCar Serverless 项目/API 约束，不要泛化到其他 Serverless 框架或云平台 SDK。
- 适合处理 `@ServerlessApp`、`@Handler`、`@HttpTrigger`、`@TimerTrigger`、`@EventTrigger`、本地调试和云平台适配器。
- HTTP、定时和事件触发器的入参结构不同，生成代码时必须明确事件来源。
- 不要在示例之外硬编码云平台密钥、区域、账号或生产 URL。
- 返回值应符合目标平台适配器要求，HTTP 场景要明确 `statusCode`、`headers` 和 `body`。

## 核心装饰器

### @ServerlessApp

定义 Serverless 应用入口，可显式声明依赖组件和初始化逻辑。

```typescript
import { ServerlessApp, Service, Handler, HttpTrigger, TimerTrigger, EventTrigger } from "@fastcar/serverless";

@Service
class BizService {
  async process(data: any) {
    return { id: Date.now(), ...data };
  }
}

@ServerlessApp({
  name: "example-service",
  version: "1.0.0",
  components: [BizService],
  init: async (app) => {
    console.log("Service initializing...");
  },
})
class ExampleApp {
  @HttpTrigger({ path: "/items", method: "POST" })
  @Handler()
  async createItem(event: any, context: any) {
    const service = (this as any).app.getFastCarApp().getComponentByName("BizService") as BizService;
    const result = await service.process(event.body);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: { success: true, data: result },
    };
  }

  @HttpTrigger({ path: "/items/:id", method: "GET" })
  @Handler()
  async getItem(event: any, context: any) {
    return {
      statusCode: 200,
      body: { id: event.params?.id },
    };
  }

  @TimerTrigger({ cron: "0 0 * * * *" })
  @Handler()
  async hourlyTask(event: any, context: any) {
    console.log(`[${context.requestId}] Running scheduled task`);
    return { success: true };
  }

  @EventTrigger({ eventSource: "oss" })
  @Handler()
  async handleEvent(event: any, context: any) {
    console.log(`[${context.requestId}] Processing event`);
    return { success: true };
  }
}

const app = new ExampleApp();
```

### 触发器类型

| 装饰器 | 用途 | 示例 |
|--------|------|------|
| `@HttpTrigger` | HTTP API 触发 | `@HttpTrigger({ path: "/api", method: "GET" })` |
| `@TimerTrigger` | 定时触发 | `@TimerTrigger({ cron: "0 0 * * * *" })` |
| `@EventTrigger` | 事件触发（OSS/COS 上传等） | `@EventTrigger({ eventSource: "oss" })` |
| `@Handler` | 标记处理方法 | `@Handler()` |

## 本地开发调试

本节内存数据仅用于演示本地触发器、路由和中间件行为；生产代码必须接入真实数据源或明确返回真实空数组、空对象或 `null`，不要为了展示效果注入模拟数据。

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
class DataService {
  private data = [
    { id: "1", name: "示例1" },
    { id: "2", name: "示例2" },
  ];
  findAll() { return this.data; }
  findById(id: string) { return this.data.find(d => d.id === id); }
  create(item: any) {
    const newItem = { id: String(Date.now()), ...item };
    this.data.push(newItem);
    return newItem;
  }
}

@Controller
class ApiController {
  @Autowired
  private service!: DataService;

  @HttpTrigger({ path: "/items", method: "GET" })
  @Handler()
  async list(ctx: ServerlessContext) {
    ctx.json({ code: 0, data: this.service.findAll(), requestId: ctx.requestId });
  }

  @HttpTrigger({ path: "/items/:id", method: "GET" })
  @Handler()
  async getOne(ctx: ServerlessContext) {
    const item = this.service.findById(ctx.params.id);
    if (!item) ctx.throw(404, "Not found");
    ctx.json({ code: 0, data: item });
  }

  @HttpTrigger({ path: "/items", method: "POST" })
  @Handler()
  async create(ctx: ServerlessContext) {
    const item = this.service.create(ctx.bodyData);
    ctx.status = 201;
    ctx.json({ code: 0, data: item });
  }
}

async function main() {
  const app = new ServerlessApplication();
  app.register(ApiController, DataService);
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
export const handler = createFCAdapter((app as any).app);
```

### 腾讯云 SCF

```typescript
import { createSCFAdapter } from "@fastcar/serverless";
export const main_handler = createSCFAdapter((app as any).app);
```

### AWS Lambda

```typescript
import { createLambdaAdapter } from "@fastcar/serverless";
export const handler = createLambdaAdapter((app as any).app);
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
