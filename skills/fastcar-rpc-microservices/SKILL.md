---
name: fastcar-rpc-microservices
description: FastCar RPC 与微服务开发指南。Use when working with FastCar framework for: (1) Building RPC servers and clients with @fastcar/rpc, (2) Using WebSocket/SocketIO/MQTT/gRPC for service communication, (3) Setting up microservices architecture, (4) Configuring RPC endpoints, authentication, retry policies, (5) Using protobuf with RPC.
---

# FastCar RPC & Microservices

FastCar RPC 模块提供基于多种协议（WS、SocketIO、MQTT、gRPC）的远程调用能力，并支持构建多服务微服务架构。

## RPC 核心概念

### 开启 RPC

```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableRPC } from "@fastcar/rpc/annotation";

@Application
@EnableRPC
class APP {}
export default new APP();
```

### 服务端配置

```typescript
import { Application, ApplicationSetting } from "@fastcar/core/annotation";
import { EnableRPC } from "@fastcar/rpc/annotation";
import { SocketEnum } from "@fastcar/rpc/constant/SocketEnum";

@Application
@EnableRPC
@ApplicationSetting({
  rpc: {
    list: [
      { id: "rpc-1", type: SocketEnum.WS, server: { port: 1238 }, serviceType: "rpc" },
      { id: "rpc-2", type: SocketEnum.SocketIO, server: { port: 1235 }, serviceType: "rpc" },
      { id: "rpc-3", type: SocketEnum.MQTT, server: { port: 1236 }, serviceType: "rpc" },
      { id: "rpc-4", type: SocketEnum.Grpc, server: { port: 1240 }, serviceType: "rpc" },
    ],
  },
})
class APP {}
```

支持的协议类型：
- `SocketEnum.WS`：WebSocket
- `SocketEnum.SocketIO`：Socket.IO
- `SocketEnum.MQTT`：MQTT
- `SocketEnum.Grpc`：gRPC

### 安全认证

```typescript
{
  id: "rpc-auth",
  type: SocketEnum.WS,
  server: { port: 1238 },
  serviceType: "rpc",
  secure: { username: "user", password: "your-password" },
}
```

### RPC 控制器

```typescript
import { Controller } from "@fastcar/core/annotation";
import { RPC, RPCMethod } from "@fastcar/rpc/annotation";

@Controller
@RPC("/hello")
class HelloController {
  @RPCMethod
  async index() {
    return { message: "Hello RPC" };
  }

  @RPCMethod("/detail")
  async detail(data: any) {
    return { data };
  }
}
```

## RPC 客户端

### 基础客户端

```typescript
import { RpcClient } from "@fastcar/rpc";
import { SocketEnum } from "@fastcar/rpc/constant/SocketEnum";
import RpcAsyncService from "@fastcar/rpc/service/RpcAsyncService";

class NotifyHandle implements RpcAsyncService {
  async handleMsg(url: string, data: Object): Promise<void | Object> {
    console.log("收到服务端消息", url, data);
    return { url, data: "来自客户端的应答" };
  }
}

const client = new RpcClient(
  {
    url: "ws://localhost:1238",
    type: SocketEnum.WS,
    secure: { username: "user", password: "your-password" },
  },
  new NotifyHandle()
);

await client.start();
const result = await client.request("/hello");
```

### 断线重连与重试策略

```typescript
const client = new RpcClient(
  {
    url: "mqtt://localhost:1236",
    type: SocketEnum.MQTT,
    retryCount: 3,        // 错误重试次数
    retryInterval: 1000,  // 重试间隔（毫秒）
    timeout: 3000,        // 请求超时（毫秒）
    maxMsgNum: 10000,     // 最大消息并发数
    disconnectInterval: 1000, // 断线重连间隔
  },
  new NotifyHandle()
);
```

### Protobuf 调用

```typescript
import { RpcClient } from "@fastcar/rpc";
import { SocketEnum } from "@fastcar/rpc/constant/SocketEnum";
import { CodeProtocolEnum } from "@fastcar/rpc/types/CodeProtocolEnum";
import { ClientRequestStatic } from "@fastcar/rpc/service/rpc/RequestStatic";

const client = new RpcClient(
  {
    url: "localhost:1240",
    type: SocketEnum.Grpc,
    codeProtocol: CodeProtocolEnum.PROTOBUF,
    ssl: {
      ca: path.join(__dirname, "cert/ca.crt"),
      key: path.join(__dirname, "cert/client.key"),
      cert: path.join(__dirname, "cert/client.crt"),
    },
  },
  new NotifyHandle()
);

client.addProtoBuf({
  root: {
    protoPath: path.join(__dirname, "proto/hello.proto"),
    service: "HelloPBController",
  },
});

await client.start();

const res = await ClientRequestStatic<{ message: string }, { code: number; data: string }>({
  url: "/pbhello",
  data: { message: "来自客户端的pb调用" },
  client,
});
```

## 微服务架构

FastCar 微服务模板将系统拆分为以下服务模块：

| 模块 | 职责 |
|------|------|
| center | 服务中心，提供服务注册与发现 |
| connector | 连接器服务，处理客户端连接（通常标记 `front: true`） |
| message | 消息服务，处理实时消息 |
| web | Web 服务，提供 HTTP 接口 |
| base | 基础服务，提供公共功能 |

### 微服务配置示例

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
              timeout: 0
              connectionLimit: 1
              disconnectInterval: 1000
              retry: { retryCount: 3, retryInterval: 3000, timeout: 30000, maxMsgNum: 10000, increase: true }
    connector:
      token: "your-token-here"
      servers:
        - host: "localhost"
          clusters: 1
          list:
            - front: true
              type: "ws"
              server: { port: 60100 }
    message:
      token: "your-token-here"
      servers:
        - host: "localhost"
          clusters: 1
          list:
            - type: "ws"
              server: { port: 60200 }
    web:
      token: "your-token-here"
      koa:
        koaBodyParser:
          enableTypes: ["json", "form", "text"]
      servers:
        - host: "localhost"
          clusters: 1
          list:
            - type: "http"
              server: { port: 8080 }
            - type: "ws"
              server: { port: 60300 }
```

### 配置项说明

- `token`：服务间通信鉴权令牌
- `clusters`：集群实例数，`serviceId` 和端口号自动递增
- `front: true`：标记为面向客户端的前置节点
- `timeout`：连接超时（毫秒），`0` 表示永不超时
- `connectionLimit`：最大连接数限制
- `disconnectInterval`：断线重连间隔
- `retry`：重试策略（`retryCount`, `retryInterval`, `timeout`, `maxMsgNum`, `increase`）

## 完整模块列表

| 模块 | 安装命令 | 用途 |
|------|----------|------|
| @fastcar/rpc | `npm i @fastcar/rpc @fastcar/server` | RPC 通信 |
| @fastcar/server | `npm i @fastcar/server` | 服务器统一管理 |

## 快速开始

```bash
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
