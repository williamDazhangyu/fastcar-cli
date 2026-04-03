---
name: fastcar-toolkit
description: FastCar 工具集开发指南。Use when working with FastCar framework for: (1) In-memory caching with @fastcar/cache, (2) Scheduled tasks and cron jobs with @fastcar/timer, (3) Delayed tasks with HashedWheelTimer from @fastcar/timewheel, (4) CPU-intensive operations with @fastcar/workerpool, (5) File watching with @fastcar/watchfile, (6) Object storage operations with @fastcar/cossdk.
---

# FastCar Toolkit

FastCar Toolkit 汇总了框架提供的各类工具模块，包括缓存、定时任务、时间轮、工作线程池、文件监听和对象存储 SDK。

## 缓存 (@fastcar/cache)

### 开启缓存

```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableCache } from "@fastcar/cache";

@Application
@EnableCache
class APP {}
export default new APP();
```

### 使用 CacheApplication

```typescript
import { Service, Autowired } from "@fastcar/core/annotation";
import { CacheApplication } from "@fastcar/cache";

@Service
class UserCacheService {
  @Autowired
  private cache!: CacheApplication;

  setUser(id: string, user: any) {
    // ttl 单位秒，0 为不过期
    this.cache.set("userStore", id, user, { ttl: 60 });
  }

  getUser(id: string) {
    return this.cache.get("userStore", id);
  }

  hasUser(id: string) {
    return this.cache.has("userStore", id);
  }

  deleteUser(id: string) {
    return this.cache.delete("userStore", id);
  }

  getTTL(id: string) {
    return this.cache.getTTL("userStore", id);
  }

  getAllUsers() {
    return this.cache.getDictionary("userStore");
  }
}
```

### 持久化缓存配置

通过 `@CacheMapping` 配置缓存节点，支持文件持久化或数据库持久化：

```typescript
import { CacheMapping } from "@fastcar/cache";
import { FSClient } from "@fastcar/cache";

@CacheMapping([
  {
    store: "fileStore",
    dbClient: new FSClient("./cache-data"),
    syncTimer: 5, // 每 5 秒同步一次
    ttl: 0,
  },
])
class CacheConfig {}
```

## 定时任务 (@fastcar/timer)

### 开启定时任务

```typescript
import { Application } from "@fastcar/core/annotation";
import { EnableScheduling } from "@fastcar/timer";

@Application
@EnableScheduling
class APP {}
```

### 间隔任务

```typescript
import { ScheduledInterval } from "@fastcar/timer";
import { Component } from "@fastcar/core/annotation";

@Component
class HeartbeatTask {
  @ScheduledInterval({ fixedRate: 5000 })
  async beat() {
    console.log("心跳检测", new Date().toISOString());
  }
}
```

### Cron 任务

```typescript
import { ScheduledCron } from "@fastcar/timer";
import { Component } from "@fastcar/core/annotation";

@Component
class ReportTask {
  @ScheduledCron("0 0 * * * *")
  async hourly() {
    console.log("每小时执行一次报表任务");
  }
}
```

## 时间轮 (@fastcar/timewheel)

适用于需要大量延时任务的场景（如订单超时取消、消息延时投递）。

```typescript
import { HashedWheelTimer } from "@fastcar/timewheel";

const timer = new HashedWheelTimer<string>({
  tickDuration: 100, // 每个槽位 100ms
  wheelSize: 512,    // 时间轮大小 512
  slotMaxSize: 100,  // 每次 tick 最大处理数量
});

// 添加一个 5 秒后触发的任务
timer.addId("order-123", 5000);

// 配合心跳循环处理
setInterval(() => {
  const ids = timer.tick();
  if (ids) {
    ids.forEach(id => {
      console.log("任务到期", id);
    });
  }
}, 100);

// 取消任务
timer.removeId("order-123", slotId);
```

## 工作线程池 (@fastcar/workerpool)

将 CPU 密集型操作卸载到 worker 线程执行，避免阻塞主线程。

```typescript
import { WorkerPool, TaskType, TaskSyncType } from "@fastcar/workerpool";

const pool = new WorkerPool({
  minWorkers: 2,
  maxWorkers: 4,
});

// 执行同步任务
const result = await pool.exec("heavyComputation", [1, 2, 3, 4, 5]);
```

在 FastCar 应用中通常通过 `@fastcar/core` 的 `@WorkerPool` / `@WorkerTask` 注解使用（参考 fastcar-framework skill）。

## 文件监听 (@fastcar/watchfile)

动态监听文件或目录变更。

```typescript
import { Watch, WatchSingleton } from "@fastcar/watchfile";

const watcher = Watch({
  pollInterval: 1000, // 轮询间隔 1 秒
  notifyTime: 300,    // 通知防抖 300ms
});

// 或使用单例
const singleWatcher = WatchSingleton({
  pollInterval: 1000,
  notifyTime: 300,
});
```

## COS SDK (@fastcar/cossdk)

对象存储客户端，支持文件上传、下载、权限管理、重定向等。

### 初始化

```typescript
import { COSSDK, getSign } from "@fastcar/cossdk";

const account = {
  appid: "your-appid",
  serectkey: "your-secret",
};

const sign = getSign(
  {
    appid: account.appid,
    expireTime: Math.floor((Date.now() + 5 * 60 * 1000) / 1000),
    dir_path: "/", // 授权路径
    mode: 7, // 1可读 2可写 4可查
  },
  account.serectkey
);

const cos = new COSSDK({
  domain: "http://localhost",
  sign,
});
```

### 常用操作

```typescript
// 生成/初始化账号信息
await cos.genAccountInfo();
await cos.initAccount();

// 上传文件
const blob = new Blob(["hello world"], { type: "text/plain" });
const file = new File([blob], "client.txt");
await cos.uploadfile("/test/text.txt", file);

// 下载文件
const res = await cos.getFile("/test/hello/test.txt");
console.log(res.data);

// 带鉴权下载
await cos.getFile("/test.txt", true);

// 删除文件
await cos.deleteFile("/hello.txt");

// 查询文件列表
const list = await cos.queryFilelist("/test");

// 创建文件夹
await cos.createDir("/new-folder", "public");

// 设置权限
await cos.setPermissions({ filename: "/test/b.txt", permission: "public" });
await cos.getPermissions({ filename: "/test/b.txt" });
await cos.delPermissions({ filename: "/test/b.txt" });

// 重命名
await cos.rename("/test/old.txt", "/test/new.txt");

// 设置重定向
await cos.setRedirect({ redirectUrl: "/test/hello.txt", flag: false, bucket: "test" });

// 查询重定向
await cos.getRedirect();
await cos.queryRedirect({ bucketUrl: "http://xxx" });
```

## 完整模块列表

| 模块 | 安装命令 | 用途 |
|------|----------|------|
| @fastcar/cache | `npm i @fastcar/cache` | 应用内缓存 |
| @fastcar/timer | `npm i @fastcar/timer` | 定时任务 |
| @fastcar/timewheel | `npm i @fastcar/timewheel` | 时间轮延时任务 |
| @fastcar/workerpool | `npm i @fastcar/workerpool` | 工作线程池 |
| @fastcar/watchfile | `npm i @fastcar/watchfile` | 文件监听 |
| @fastcar/cossdk | `npm i @fastcar/cossdk` | 对象存储 SDK |

## 快速开始

```bash
# 安装所需工具包
npm i @fastcar/cache @fastcar/timer @fastcar/timewheel @fastcar/workerpool
npm i @fastcar/watchfile @fastcar/cossdk
```
