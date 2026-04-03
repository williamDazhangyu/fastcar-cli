# FastCar API 参考

## @fastcar/core

### 核心装饰器

#### @Application
标记应用入口类。

```typescript
@Application
class App {
  app!: FastCarApplication;
}
```

#### @Component / @Service / @Controller / @Repository
标记可注入组件。

```typescript
@Component    // 通用组件
@Service      // 服务层
@Controller   // 控制器
@Repository  // 数据访问层
```

#### @Autowired
依赖注入。

```typescript
@Autowired
private service!: MyService;

// 指定名称注入
@Autowired
@BeanName("UserService")
private userService!: UserService;

// 别名注入
@AliasInjection("cache")
private cacheService!: CacheService;
```

#### @Configure
配置类映射。

```typescript
@Configure("database.yml")
class DatabaseConfig {
  host!: string;
  port!: number;
}
```

#### @Value
获取配置值。

```typescript
@Value("server.port")
port!: number;

@Value("app.name", "default-name")  // 带默认值
appName!: string;
```

### 生命周期装饰器

```typescript
@ApplicationStart(order?)    // 启动时执行，order 越小优先级越高
@ApplicationStop(order?)     // 停止前执行
@ApplicationInit(order?)     // 初始化方法
@ApplicationDestory(order?)  // 销毁方法
```

### 验证装饰器

```typescript
@ValidForm                    // 开启方法参数校验
@Rule(rules?)                 // 校验规则配置
@NotNull                      // 参数不能为空
@Size({minSize?, maxSize?})   // 大小限制
@Type(type)                   // 指定参数类型
@DefaultVal(val)              // 设置默认值
@ValidCustom(fn, msg?)        // 自定义校验
```

---

## @fastcar/koa

### 路由装饰器

```typescript
@Get(path?)       // GET 请求
@Post(path?)      // POST 请求
@Put(path?)       // PUT 请求
@Delete(path?)    // DELETE 请求
@Patch(path?)     // PATCH 请求
@RequestMapping(path)  // 通用路由
```

### 参数装饰器

```typescript
@Param(name)      // URL 参数 /:id
@Query(name?)     // 查询参数 ?key=value
@Body             // 请求体
@Header(name?)    // 请求头
@Ctx              // Koa Context
@Request          // 请求对象
@Response         // 响应对象
```

### 示例

```typescript
@Controller
@RequestMapping("/api/users")
class UserController {
  @Get
  async list(@Query("page") page: number = 1) {
    return { page, data: [] };
  }

  @Get("/:id")
  async get(@Param("id") id: string) {
    return { id };
  }

  @Post
  async create(@Body user: UserDTO) {
    return { created: user };
  }
}
```

---

## @fastcar/mysql

### 实体装饰器

```typescript
@Table(name)          // 映射表名
@Field(name)          // 映射字段
@PrimaryKey           // 主键标记
@IsSerial             // 自增字段
@DBType(type)         // 数据库类型
@DS(name)             // 指定数据源
```

### Repository 装饰器

```typescript
@Repository
class UserRepository {
  @SqlSession
  private session!: SqlSession;

  // 基础 CRUD
  async findById(id: number) {
    return this.session.findById(User, id);
  }

  async findAll() {
    return this.session.findAll(User);
  }

  async save(entity: User) {
    return this.session.save(User, entity);
  }

  async update(entity: User) {
    return this.session.update(User, entity);
  }

  async deleteById(id: number) {
    return this.session.deleteById(User, id);
  }

  // 自定义查询
  async findByName(name: string) {
    return this.session.query(`SELECT * FROM users WHERE name = ?`, [name]);
  }
}
```

### 事务

```typescript
@Transactional
try {
  await userRepository.save(user);
  await orderRepository.save(order);
} catch (e) {
  // 自动回滚
}
```

---

## @fastcar/redis

### 装饰器

```typescript
@RedisClient     // 注入 Redis 客户端
```

### 使用示例

```typescript
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

  async del(key: string) {
    await this.redis.del(key);
  }

  async expire(key: string, seconds: number) {
    await this.redis.expire(key, seconds);
  }
}
```

---

## @fastcar/timer

### 装饰器

```typescript
@Scheduled(interval)   // 间隔执行（毫秒）
@Cron(expression)      // Cron 表达式
```

### Cron 表达式

```typescript
// 格式: 秒 分 时 日 月 周
@Cron("0 */5 * * * *")     // 每 5 分钟
@Cron("0 0 * * * *")       // 每小时
@Cron("0 0 0 * * *")       // 每天 0 点
@Cron("0 0 9 * * MON")     // 每周一 9 点
```

---

## @fastcar/workerpool

### 装饰器

```typescript
@WorkerPool(options)    // 工作线程池
@WorkerTask             // 标记为 Worker 任务
```

### 使用示例

```typescript
@Component
class ComputeService {
  @WorkerPool({ minWorkers: 2, maxWorkers: 4 })
  private pool!: WorkerPool;

  @WorkerTask
  fibonacci(n: number): number {
    if (n < 2) return n;
    return this.fibonacci(n - 1) + this.fibonacci(n - 2);
  }

  async compute(data: number[]) {
    return this.pool.execute(this.fibonacci, data);
  }
}
```

---

## 工具类

### DateUtil

```typescript
DateUtil.toDateTime();           // "2024-03-10 15:30:45"
DateUtil.toDay();                // "2024-03-10"
DateUtil.toHms();                // "15:30:45"
DateUtil.toDateTimeMS();         // "2024-03-10 15:30:45.123"
DateUtil.toCutDown(3665);        // "1:1:5" (倒计时)
DateUtil.getTimeStr(3600000);    // "1.00h"
DateUtil.getDateTime("2024-03-10");  // 时间戳
```

### CryptoUtil

```typescript
CryptoUtil.aesEncode(key, iv, data);           // AES 加密
CryptoUtil.aesDecode(key, iv, encrypted);      // AES 解密
CryptoUtil.shaEncode(key, data);               // SHA HMAC
CryptoUtil.gcmEncrypt(password, message);      // AES-GCM 加密
CryptoUtil.gcmDecrypt(password, encrypted);    // AES-GCM 解密
CryptoUtil.sha256Encode(password);             // SHA256 + Salt
CryptoUtil.sha256Very(password, salt, hash);   // 验证
CryptoUtil.getHashStr(16);                     // 生成随机字符串
```

### FileUtil

```typescript
FileUtil.getFilePathList("./src");             // 递归获取文件列表
FileUtil.getSuffix("/path/file.ts");           // "ts"
FileUtil.getFileName("/path/file.ts");         // "file"
FileUtil.getResource("./config.yml");          // 加载配置文件
FileUtil.formatBytes(1024 * 1024);             // "1.00(M)"
```

### TypeUtil

```typescript
TypeUtil.isFunction(fn);        // 是否为函数
TypeUtil.isClass(cls);          // 是否为类
TypeUtil.isPromise(p);          // 是否为 Promise
TypeUtil.isArray(arr);          // 是否为数组
TypeUtil.isDate(d);             // 是否为日期
TypeUtil.isTSORJS(path);        // 是否为 TS/JS 文件
```

### ValidationUtil

```typescript
ValidationUtil.isNotNull(val);           // 非空检查
ValidationUtil.isNumber(val);            // 数字检查
ValidationUtil.isNotMinSize(val, min);   // 最小值/长度检查
ValidationUtil.checkType(val, type);     // 类型检查
```

### MixTool

```typescript
MixTool.mix(A, B);                    // 混合多个类
MixTool.copyProperties(target, src);  // 复制属性
MixTool.assign(target, src);          // 对象赋值
```
