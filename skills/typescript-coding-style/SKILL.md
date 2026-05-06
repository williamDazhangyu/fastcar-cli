---
name: typescript-coding-style
description: TypeScript 编码规范与最佳实践。Use when writing or reviewing TypeScript types, interfaces, enums, reusable aliases, status fields, naming conventions, async waiting, polling loops, timers, cancellation, maintainability, or FastCar example code.
---

# TypeScript 编码规范

## Agent 使用指南

使用本 skill 时：

- 先遵守 `skills/AGENTS.md` 的共享规则。
- 适合处理 TypeScript 类型设计、枚举、命名、复杂类型复用和示例代码可维护性。
- 复杂交叉类型在 2 处及以上使用时，应提取类型别名或接口。
- 状态、类型、模式等离散字段优先使用字符串枚举。
- 异步等待类代码避免裸写 `while + sleep` 轮询，优先表达为“等待事件、超时、取消、异常”的组合。
- 不要为了减少代码行数牺牲类型可读性。

## 1. 复用复杂类型别名

### 问题场景
当同一个交叉类型在多处使用时，直接重复书写会导致代码冗余、维护困难和可读性差。

### 反例
```typescript
// ❌ 重复书写复杂的交叉类型
private async getData(): Promise<(Detail & { related: Related })[]> {
    const result: (Detail & { related: Related })[] = [];
}

private groupById(
    items: (Detail & { related: Related })[]
): Map<string, (Detail & { related: Related })[]> {
}
```

### 正例
```typescript
// ✅ 定义类型别名，一处定义多处使用
type DetailWithRelated = Detail & { related: Related };

// 或者使用 interface
interface DetailWithRelated extends Detail {
    related: Related;
}

// 使用
private async getData(): Promise<DetailWithRelated[]> {
    const result: DetailWithRelated[] = [];
}

private groupById(items: DetailWithRelated[]): Map<string, DetailWithRelated[]> {
}
```

### 规范建议
1. **当交叉类型在 2 处及以上使用时**，应提取为类型别名或接口
2. **命名规范**：使用 `With` 连接，如 `DetailWithRelated`
3. **文档注释**：为复杂类型添加 JSDoc 说明其用途

---

## 2. 使用枚举代替字符串字面量

### 问题场景
状态字段使用字符串字面量会导致拼写错误、IDE 无法自动补全、重构困难和类型安全性差。

### 反例
```typescript
// ❌ 使用字符串字面量
const result = await this.mapper.select({
    where: { status: "pending" }
});

await this.mapper.updateOne({
    where: { id },
    row: { status: "running" }
});

switch (detail.status) {
    case "success":
        break;
    case "failed":
        break;
}
```

### 正例
```typescript
// ✅ 定义枚举
export enum JobStatus {
    pending = "pending",   // 待执行
    running = "running",   // 执行中
    success = "success",   // 成功
    failed = "failed",     // 失败
}

// 使用枚举
const result = await this.mapper.select({
    where: { status: JobStatus.pending }
});

await this.mapper.updateOne({
    where: { id },
    row: { status: JobStatus.running }
});

switch (detail.status) {
    case JobStatus.success:
        break;
    case JobStatus.failed:
        break;
}
```

### 规范建议
1. **状态字段优先使用枚举**：任何表示状态的字段都应该使用枚举
2. **枚举命名**：使用 PascalCase，如 `JobStatus`、`ItemType`
3. **枚举值**：字符串枚举推荐，便于调试和序列化
4. **注释说明**：为每个枚举值添加 JSDoc 注释

### 完整示例
```typescript
// types/Enums.ts
export enum JobStatus {
    pending = "pending",
    running = "running",
    success = "success",
    failed = "failed",
}

export enum ItemType {
    typeA = "typeA",
    typeB = "typeB",
    typeC = "typeC",
}

export enum ExecuteMode {
    now = "now",
    schedule = "schedule",
}

// 使用
import { JobStatus, ItemType } from "@/types/Enums";

class Service {
    async create(type: ItemType) {
        const item = new Record({
            itemType: type,
            status: JobStatus.pending,
            executeMode: ExecuteMode.now,
        });
    }
}
```

---

## 3. 避免裸写 while + sleep 式异步等待

### 问题场景
当代码需要等待任务完成、事件到达、SSE 输出、队列状态变化或外部资源就绪时，直接使用 `while` 循环配合 `setTimeout` sleep 会让取消、超时、异常处理和资源释放变得分散。

### 反例
```typescript
// ❌ 手写轮询等待，关闭、超时和异常语义不集中
while (!closed && Date.now() < deadline) {
    const events = await this.generationService.listTaskEvents(actor, body.id, cursor);

    for (const event of events) {
        this.writeSseEvent(ctx, event);
        cursor = event.id;
    }

    if (events.some((event) => event.type === "task.succeeded" || event.type === "task.failed")) {
        break;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
}
```

### 正例：封装可取消的等待原语
```typescript
const terminalTypes = new Set<TaskEventType>([
    TaskEventType.succeeded,
    TaskEventType.failed,
]);

const timeout = setTimeout(() => {
    controller.abort(new Error("Task event stream timeout"));
}, timeoutMs);

try {
    for await (const event of this.generationService.watchTaskEvents(actor, body.id, {
        cursor,
        signal: controller.signal,
    })) {
        this.writeSseEvent(ctx, event);
        cursor = event.id;

        if (terminalTypes.has(event.type)) {
            break;
        }
    }
} finally {
    clearTimeout(timeout);
}
```

### 次优但可接受：把轮询隐藏在等待函数里
```typescript
const event = await this.generationService.waitTaskEvent(actor, body.id, cursor, {
    signal: controller.signal,
    timeoutMs: 500,
});

if (event) {
    this.writeSseEvent(ctx, event);
    cursor = event.id;
}
```

### 规范建议
1. **业务层表达意图**：优先写成 `watchTaskEvents`、`waitTaskEvent`、`waitUntilReady`，不要在业务层暴露 `while + sleep`
2. **等待必须可取消**：异步等待函数应支持 `AbortSignal`，并在连接关闭、请求取消或任务终止时释放资源
3. **超时集中管理**：使用 `setTimeout`、`AbortController` 或统一超时工具表达 deadline，避免循环里反复 `Date.now()`
4. **异常路径明确**：等待失败应抛出领域错误或写出错误事件，不要让异常隐式穿透到框架默认处理
5. **终止条件类型化**：任务成功、失败、取消等终态优先使用枚举或常量集合，不要在多处散落字符串字面量
6. **轮询留在基础设施层**：如果底层只能轮询，把轮询封装在 service/helper 内部；调用方只消费事件或等待结果
