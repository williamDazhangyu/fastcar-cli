# 无 CLI Fallback 端到端案例

> 场景：一个非 FastCar 项目想使用 auto-iterate 协议，但未安装 `fastcar-cli`。

## 背景

项目：`my-app`（一个 TypeScript + Express 项目）
目标：修复用户注册时邮箱验证链接过期的问题
环境：有 Kimi Code CLI（可读写文件、运行 shell、访问 git），但没有 `fastcar-cli`

## 执行流程

### Step 1：手动选择模式

```
用户：帮我修复注册邮箱验证链接过期的问题
Agent：检测到 auto-iterate 触发词，但当前环境无 fastcar-cli。
       进入无 CLI fallback 模式。
       模式选择：quick（目标明确，修改范围小）
       session 名：email-verify-expiry
```

### Step 2：生成 session 状态

Agent 手动创建以下文件：

**`.agent-state/auto-iterate/email-verify-expiry/state.json`**（精简版）：
```json
{
  "schemaVersion": 1,
  "task": {
    "goal": "修复注册邮箱验证链接过期问题",
    "successCriteria": ["验证链接在有效期内可正常使用", "过期链接返回明确错误提示"],
    "nonGoals": ["不修改邮件发送服务", "不改变用户表结构"],
    "allowedScope": "src/services/email-verification.ts, src/routes/register.ts, test/",
    "compatibility": ["API 响应格式不变", "数据库 schema 不变"]
  },
  "session": { "name": "email-verify-expiry" },
  "mode": { "name": "quick", "autopilot": false },
  "budgets": { "maxIterations": 5, "implementationIterationsUsed": 0, "remainingImplementationIterations": 5 },
  "currentState": { "overallStatus": "in_progress" },
  "watchdog": { "triggered": false, "requiredAction": "none", "deliveryVerifiability": "unknown" },
  "requirements": [
    { "id": "REQ-1", "summary": "验证链接包含过期时间戳", "status": "pending" },
    { "id": "REQ-2", "summary": "过期链接返回 410 Gone", "status": "pending" },
    { "id": "REQ-3", "summary": "有效期内链接正常验证", "status": "pending" }
  ]
}
```

### Step 3：能力探测

```
Agent Capability Summary
读文件/搜索代码：available
修改文件：available
运行命令：available（npm test, npm run build）
真实测试：available（jest）
状态持久化：available（可写 .agent-state/）
子 Agent：unavailable（无 Agent 工具）
网络/外部服务：not_needed
git 状态/diff：available
降级策略：单 Agent 串行执行，不使用 subagent
```

### Step 4：探索 + 建立反馈闭环

```bash
# Agent 探索现有代码
grep -r "verification" src/
grep -r "expir" src/

# 发现关键文件：src/services/email-verification.ts
# 当前逻辑：验证链接不检查过期时间
```

复现命令：
```bash
npm test -- --testPathPattern=email-verification
```

### Step 5：实现迭代

**Iteration 1**（实现 REQ-1）：
- 修改 `src/services/email-verification.ts`：在生成验证链接时添加 `expiresAt` 时间戳
- 修改 `src/services/email-verification.ts`：在验证时检查 `expiresAt`
- 运行 `npm test -- --testPathPattern=email-verification` → 2 个新测试通过
- 更新 RCM：REQ-1 → `implemented`

**Iteration 2**（验证 REQ-1 + 实现 REQ-2）：
- 运行 `npm test` → 全部通过
- 更新 RCM：REQ-1 → `passed`
- 修改 `src/routes/register.ts`：过期链接返回 410
- 运行 `npm test -- --testPathPattern=register` → 通过
- 更新 RCM：REQ-2 → `implemented`

**Iteration 3**（验证 REQ-2 + 实现 REQ-3）：
- 运行 `npm test` → 全部通过
- 更新 RCM：REQ-2 → `passed`
- 已有测试覆盖有效期内验证（REQ-3 已有测试）
- 运行 `npm test -- --testPathPattern=email-verification` → 通过
- 更新 RCM：REQ-3 → `passed`

### Step 6：交付

```text
auto-iterate 交付报告（无 CLI fallback）
session：email-verify-expiry
模式：quick
实现迭代：3 轮
验证命令：npm test（全部通过），npm run build（通过）
需求覆盖：REQ-1 passed, REQ-2 passed, REQ-3 passed
交付可验证性：verifiable
修改文件：src/services/email-verification.ts, src/routes/register.ts, test/email-verification.test.ts
状态持久化：available（.agent-state/auto-iterate/email-verify-expiry/state.json 已更新）
Skill Capture：无高价值技能点（skipped_no_high_value：标准 JWT 过期处理，无 FastCar 特有约束）
```

## 与有 CLI 路径的差异

| 维度 | 有 CLI | 无 CLI fallback |
|------|--------|-----------------|
| state 创建 | `fastcar-cli auto-iterate --quick --yes` | 手动创建 state.json |
| session 管理 | `--list` / `--switch` / `--resume` | 手动维护 current 指针 |
| 交付文档 | `--finalize` 自动生成 | 手动输出交付报告 |
| 状态校验 | `--validate-state` | 手动检查必填字段 |