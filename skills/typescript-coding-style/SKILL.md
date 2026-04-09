---
name: typescript-coding-style
description: TypeScript 编码规范与最佳实践。Use when writing TypeScript code for: (1) Defining reusable type aliases for complex intersection types, (2) Using enums instead of string literals for status fields, (3) Naming conventions for types and interfaces, (4) Code organization and maintainability tips.
---

# TypeScript 编码规范

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
