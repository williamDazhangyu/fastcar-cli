# --finalize 交付文档输出样例

> 展示 `fastcar-cli auto-iterate --finalize <session>` 生成的文档格式。

## 触发

```bash
fastcar-cli auto-iterate --finalize login-bugfix
```

## 输出目录

```
.agent-state/auto-iterate/login-bugfix/docs/
├── api.md
├── changelog.md
├── architecture.md
└── implementation.md
```

---

## api.md 样例

```markdown
# API 变更 — login-bugfix

> 由 fastcar-cli auto-iterate --finalize 生成
> session: login-bugfix
> 生成时间: 2026-06-16

## 变更摘要

修复登录密码校验路径，错误密码和正确密码行为均恢复。

## 接口变更

### POST /api/auth/login

**请求体**（无变更）：
```json
{
  "username": "string",
  "password": "string"
}
```

**响应**（无变更）：
```json
{
  "token": "string",
  "expiresIn": 3600
}
```

**错误响应**（行为修正）：
- 401 Unauthorized：密码错误时返回（此前可能返回 500）
- 400 Bad Request：缺少必填字段

## 兼容性

- API 请求/响应格式完全兼容
- 客户端无需修改
```

---

## changelog.md 样例

```markdown
# 变更记录 — login-bugfix

## 2026-06-16

### 修复
- 修复登录密码校验使用错误比较运算符（`=` vs `===`）导致始终返回 false
- 修复密码为空时未正确返回 400 Bad Request

### 测试
- 新增 `test/auth.login.test.ts`：覆盖正确密码、错误密码、空密码三个场景
```

---

## architecture.md 样例

```markdown
# 架构说明 — login-bugfix

## 涉及模块

| 模块 | 文件 | 变更 |
|------|------|------|
| 认证服务 | `src/services/auth.ts` | 修复密码比较逻辑 |
| 认证控制器 | `src/controllers/auth.ts` | 无变更 |
| 认证测试 | `test/auth.login.test.ts` | 新增 |

## 数据流

```
POST /api/auth/login
  → AuthController.login(body)
    → AuthService.authenticate(username, password)
      → 查询用户 → 比较密码哈希 → 返回 token
```

## 未修改

- Token 生成逻辑
- 用户查询逻辑
- 会话管理
```

---

## implementation.md 样例

```markdown
# 实现说明 — login-bugfix

## 核心修改

### 1. 修复密码比较逻辑

**文件**：`src/services/auth.ts`

**修改前**：
```typescript
if (inputPassword = storedHash) {  // 赋值运算符
  return generateToken(user);
}
```

**修改后**：
```typescript
const isValid = await bcrypt.compare(inputPassword, user.passwordHash);
if (isValid) {
  return generateToken(user);
}
```

### 2. 新增测试覆盖

**文件**：`test/auth.login.test.ts`

覆盖三个场景：
- 正确密码 → 返回 token
- 错误密码 → 401 Unauthorized
- 空密码 → 400 Bad Request

## 验证结果

| 命令 | 结果 |
|------|------|
| `npm test -- auth.login` | passed |
| `npm test` | passed |
| `npm run typecheck` | passed |
| `npm run build` | passed |
```