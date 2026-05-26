# fastcar-cli auto-iterate 运行时 Bug 与超时机制设计缺陷报告

> 生成时间：2026-05-26  
> 基于代码静态分析（src/auto-iterate.js, src/pipeline/*.js, src/adapters/*.js）  
> 现有 125 个测试全部通过，以下问题均未被现有测试覆盖。

---

## 一、运行时 Bug 汇总（按严重程度排序）

### 🔴 严重：数据丢失或 Pipeline 崩溃

#### 1. `--isolate` 模式下 Worker 创建的新文件会永久丢失

- **代码位置**：`src/pipeline/runPipeline.js` → `applyIsolatedWorktreeDiff()`
- **问题**：`git diff --binary HEAD` 只包含已跟踪文件的变更。如果 Worker 在隔离 worktree 中创建了**全新文件（untracked）**，diff 不会包含它们，`git apply` 无法将其合并回主工作区，随后 worktree 被 `cleanupIsolatedWorktree()` 删除，新文件永久丢失。
- **影响**：使用 `--isolate` 时，任何包含生成新源码文件的迭代都可能丢失产出。
- **修复建议**：在 `applyIsolatedWorktreeDiff` 中补充处理 untracked 文件，例如：
  ```js
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], worktreePath);
  // 将 untracked 文件复制回 projectRoot
  ```

#### 2. `mergeState.js` 过滤掉 validation 命令历史对象

- **代码位置**：`src/pipeline/mergeState.js` → `mergeIterationIntoState()`
- **问题**：合并 `validation.commands` 时使用了 `.filter((item) => typeof item !== "object")`，这把之前轮次以对象形式写入的验证命令（包含 `command`、`exitCode`、`elapsedMs` 等字段）全部过滤掉，导致历史验证记录丢失。
- **影响**：跨轮次追踪验证历史不可靠，state.json 中只保留字符串命令和最新一轮的对象。
- **修复建议**：改为 `typeof item === "string" || (item && typeof item.command === "string")`，保留合法的对象命令。

#### 3. Adapter 内部异常直接崩溃 Pipeline，无 `worker_failed` 事件

- **代码位置**：`src/pipeline/runPipeline.js` → for 循环中的 `runWorkerWithProgress()`
- **问题**：`adapter.run()` 若同步抛异常（如 `adapters/kimi.js` 或 `codex.js` 中 `fs.readFileSync(options.promptPath)` 在文件不存在时抛出），会直接抛出到 `runPipeline` 外部，被 `initAutoIterate` 的 `catch` 捕获为 `pipeline_start_failed`。但此时 pipeline 已经在运行中，错误类型与 worker 非零退出的 `worker_failed` 不一致，且**没有 emit 任何 progress 事件**。
- **影响**：监控/自动化脚本无法通过 NDJSON 进度区分是配置错误还是 worker 失败。
- **修复建议**：在 `runWorkerWithProgress` 的 `try` 块外层包裹 `try/catch`，将异常转换为 `{ status: 1, error }` 并 emit `worker_failed`。

#### 4. `applyDecisionAnswer` 在无 pending decision 时创建非法 state

- **代码位置**：`src/auto-iterate.js` → `applyDecisionAnswer()`
- **问题**：如果用户在 state 没有 pending `decisionRequest` 时传入 `--answer`（例如误操作或脚本调用），函数会创建一个只有 `status: "approved"` 和 `answer` 的不完整对象。后续 `validateStateJsonModel()` 检查 `topic`、`background` 等必填字段时**必然失败**，导致 resume 死循环。
- **影响**：resume 操作可能陷入无法恢复的 schema 验证失败。
- **修复建议**：在函数开头检查 `stateJson.decisionRequest && stateJson.decisionRequest.status === "pending"`，否则 warn 并直接返回。

---

### 🟡 中等：预算/语义错误或并发隐患

#### 5. 所有模式都消耗 `implementationIterationsUsed`

- **代码位置**：`src/pipeline/mergeState.js` → `mergeIterationIntoState()`
- **问题**：每一轮迭代（包括 `plan`、`verify`、`baseline`、`hardening`）都会增加 `implementationIterationsUsed`，这意味着 plan/verify 等非实现轮次错误消耗了**实现预算**。
- **影响**：预算统计失真，可能提前触发 `budget_exhausted`。
- **修复建议**：根据当前 mode 决定增加 `implementationIterationsUsed` 还是 `optimizationIterationsUsed` 或其他计数器。

#### 6. `writeJsonFileAtomic` 临时文件竞争

- **代码位置**：`src/auto-iterate.js` → `writeJsonFileAtomic()`
- **问题**：使用固定后缀 `${filePath}.tmp`。如果两个进程同时写入同一个 `state.json`（例如 CLI 和外部脚本），会竞争同一个 `.tmp` 文件，虽然最终 `rename` 是原子的，但 `writeFile` 阶段可能互相覆盖。
- **影响**：极端并发场景下 state.json 可能损坏。
- **修复建议**：使用含随机后缀的临时文件名，如 `${filePath}.${Date.now()}.${Math.random()}.tmp`。

#### 7. `refreshStateMarkdownView` 非原子读写

- **代码位置**：`src/pipeline/runPipeline.js` → `refreshStateMarkdownView()`
- **问题**：读取 `state.md` → 正则替换 → `writeFile` 回写，三步之间如果发生进程切换或被其他实例修改，更新会丢失。
- **影响**：多 CLI 实例并发时（如同时 resume 和 read），state.md 内容可能回退到旧版本。
- **修复建议**：使用原子写（如调用 `writeJsonFileAtomic` 的同类机制）或文件锁。

#### 8. `parseValidationCommands` 误过滤合法命令

- **代码位置**：`src/pipeline/runPipeline.js` → `parseValidationCommands()`
- **问题**：过滤正则 `!/由 Agent|缺失|not_run|未指定|一个原型运行命令/i.test(item)` 会错误过滤掉包含这些子字符串的**合法命令**，例如：
  - `npm test -- --grep 'not_run'`
  - `node scripts/由Agent生成的测试.js`
- **影响**：用户配置的验证命令被静默丢弃，验证阶段空转。
- **修复建议**：改为仅过滤完全匹配特定占位符字符串的命令，而非子字符串匹配。

#### 9. `adapters/kimi.js` / `codex.js` 未处理 prompt 文件不存在

- **代码位置**：`src/adapters/kimi.js` → `buildKimiPrompt()`、`src/adapters/codex.js` → `buildCodexWorkerPrompt()`
- **问题**：直接使用 `fs.readFileSync(options.promptPath, "utf8")`，如果 `promptPath` 指向的文件在创建后被意外删除，会直接抛出未捕获异常，触发 Bug #3 的崩溃路径。
- **影响**：文件系统竞争或手动清理后 pipeline 崩溃。
- **修复建议**：使用 `try/catch` 包裹，返回更友好的错误。

#### 10. `replaceSection` 的 heading 正则未转义

- **代码位置**：`src/auto-iterate.js` → `replaceSection()`
- **问题**：`new RegExp("^(" + nextHeadingPattern + ")", "m")` 未对 `nextHeadingPattern` 进行正则转义。如果 heading 包含 `.`、`*`、`(`、`)` 等特殊字符，会导致 RegExp 编译失败或匹配错误。
- **影响**：包含特殊字符的 session 名或 heading 会导致 `updateStateMarkdownForDispatch` 等操作失败。
- **修复建议**：对 `nextHeadingPattern` 使用 `escapeRegExp` 函数转义。

---

### 🟢 轻微：边界 case 或行为不一致

#### 11. `countJsonRequirementStates` 忽略 "unknown" 状态

- **代码位置**：`src/pipeline/shouldStop.js` → `countJsonRequirementStates()`
- **问题**：仅统计 `pending`、`implemented`、`not_verified`、`passed`、`blocked`，如果 requirement status 是 `"unknown"` 或其他非法值，会被视为**已关闭**，可能错误触发 `deliveryReady`。
- **修复建议**：增加 `unknown` 计数，或在 `validateStateJsonModel` 中拒绝非法 status。

#### 12. `runValidationCommands` 超时不可配置

- **代码位置**：`src/pipeline/runPipeline.js` → `runValidationCommands()`
- **问题**：超时硬编码为 `timeout: 10 * 60 * 1000`（600 秒），而 Worker 超时可通过 `--step-timeout` 配置。
- **修复建议**：增加 `--validation-timeout` CLI 参数并透传。

#### 13. `runShellCommandAsync` 超时后子进程孤儿风险

- **代码位置**：`src/adapters/commandResolver.js` → `runShellCommandAsync()`
- **问题**：超时触发 `finish` 并 resolve Promise，但 `killProcessTree` 是异步的；如果 kill 失败或子进程忽略信号，子进程可能继续在后台运行并竞争 stdout 或文件句柄。
- **修复建议**：在 `finish` 后增加 `await` 或确认 kill 完成的机制，或改为同步 `spawnSync` 配合 `tree-kill`。

#### 14. `getSessionPaths` 大小写敏感导致 Linux 上找不到 session

- **代码位置**：`src/auto-iterate.js` → `getSessionPaths()` / `getSessionSummaries()`
- **问题**：`slugifySessionName` 会强制转小写。如果用户手动创建了含大写的目录名（如 `"MySession"`），`getSessionPaths("MySession")` 会生成 `.../my-session`，在 Linux 上指向不存在的路径。
- **修复建议**：在 `getSessionSummaries` 中直接使用 `fs.readdir` 返回的实际目录名查找，或在创建时强制统一大小写。

#### 15. `normalizeArray` 不过滤数组内 falsy 元素

- **代码位置**：`src/pipeline/mergeState.js` → `normalizeArray()`
- **问题**：`normalizeArray([null, undefined, "note"])` 返回原数组，后续 `map(String)` 会产生 `"null"` 和 `"undefined"` 字符串，污染 `notes`。
- **修复建议**：在 `normalizeArray` 或调用处增加 `.filter(Boolean)`。

#### 16. `parseArgs` 中 `--prototype` 分支缺少 `return`

- **代码位置**：`src/auto-iterate.js` → `parseArgs()`
- **问题**：处理 `--prototype` / `--proto` 后没有 `return`，在特定参数顺序下可能意外覆盖已解析的值。
- **修复建议**：明确使用 `return` 或重构为 `for` 循环。

---

## 二、Worker 超时机制设计缺陷深度分析

### 2.1 当前超时机制的全链路

```
runPipeline()
  └── runWorkerWithProgress(adapter, options, progressOptions)
        ├── setInterval(heartbeat, 15s)     ← 仅 emit NDJSON，不参与超时判断
        └── await adapter.run({ timeoutMs: 300_000 })
              ├── Kimi:   runNativeCommand (crossSpawn.sync)   ← 阻塞线程
              ├── Codex:  runNativeCommandAsync (crossSpawn async + setTimeout)
              └── 其他:   runShellCommandAsync (crossSpawn async + setTimeout)
```

### 2.2 设计缺陷清单

| 缺陷 | 严重程度 | 说明 |
|------|---------|------|
| **纯时间盒，无活跃检测** | 🔴 高 | 有 stdout 输出也该杀，不区分“卡死”和“慢” |
| **Kimi sync 阻塞 heartbeat** | 🔴 高 | 300 秒零 progress 事件，外部以为死锁 |
| **detached 进程树泄漏** | 🟡 中 | Codex 超时后子进程可能杀不干净 |
| **resolve 先于 kill 的 race** | 🟡 中 | 超时返回后子进程仍在写文件 |
| **无动态/分级超时** | 🟡 中 | 不改参数无法应对不同复杂度任务 |
| **验证超时 > Worker 超时** | 🟡 中 | 逻辑颠倒，worker 更缺时间 |
| **无优雅退出窗口** | 🟢 低 | 直接 SIGTERM，不给保存机会 |
| **timeoutMs=0 禁用超时** | 🟢 低 | 无法通过 CLI 显式禁用（`stepTimeoutSeconds \|\| 300`） |

### 2.3 为什么“子 Worker 这么容易超时”

1. **时间太紧**：复杂任务 5 分钟根本不够，且多数用户不知道 `--step-timeout`
2. **不感知活跃度**：Worker 可能在正常生成代码，只是因为 LLM API 慢或 sandbox 启动慢，就被 kill
3. **Kimi 用户雪上加霜**：sync spawn 导致 300 秒零心跳，用户看到的不是“在跑”而是“卡死然后失败”
4. **Codex 用户**：detached 进程导致超时后 Codex 可能还在后台跑，下一轮迭代启动时可能有两个 Codex 实例竞争文件
5. **验证抢时间**：Worker 超时后如果 result.json 写了一半，验证阶段可能读到损坏 JSON

### 2.4 修复建议

#### 高优先级：活跃检测超时（Activity-based Timeout）

引入“**N 秒无输出才超时**”，替代纯 wall-clock：

```js
let lastActivityAt = Date.now();
child.stdout.on("data", () => { lastActivityAt = Date.now(); });
child.stderr.on("data", () => { lastActivityAt = Date.now(); });

const inactivityTimer = setInterval(() => {
  if (Date.now() - lastActivityAt > INACTIVITY_TIMEOUT_MS) {
    // 只有真的卡死了才杀
  }
}, 5000);
```

**策略建议**：
- **总时间上限**：放宽到 600 秒（和验证一致），或根据 focus 动态调整
- **无输出超时**：120 秒无 stdout/stderr 才认为卡死
- 两者同时生效，先触发者执行

#### 高优先级：Kimi Adapter 改为异步

```js
// adapters/kimi.js
return runNativeCommandAsync("kimi", args, { ... });
```

确保 heartbeat 能正常 emit，避免 300 秒零事件。

#### 中优先级：超时前预警（Graceful Shutdown）

在超时前 30 秒发送一个信号（如写入 `timeout-warning` 文件），让 Worker 有机会保存当前进度到 result.json。

#### 中优先级：动态超时调整

根据以下因子在 `runPipeline` 中计算 `effectiveTimeoutMs`：

```js
const baseTimeout = options.stepTimeoutSeconds || 300;
const complexityMultiplier = focus.includes("refactor") ? 2 : 1;
const retryBackoff = state.watchdog?.noProgressStreak > 0 ? 1.5 : 1;
const effectiveTimeoutMs = baseTimeout * complexityMultiplier * retryBackoff * 1000;
```

#### 中优先级：修复 Race Condition

将 `finish()` 和 `killProcessTree` 的顺序调换，或等待 `close` 事件后再 resolve。

#### 低优先级：CLI 暴露更多超时参数

```bash
fastcar-cli auto-iterate --run \
  --step-timeout 600 \
  --inactivity-timeout 120 \
  --validation-timeout 300
```

---

## 三、修复优先级总览

| 优先级 | 问题 | 涉及文件 |
|--------|------|---------|
| P0 | `--isolate` 新文件丢失 | `src/pipeline/runPipeline.js` |
| P0 | 活跃检测超时机制 | `src/adapters/commandResolver.js` |
| P0 | Kimi sync 改 async | `src/adapters/kimi.js` |
| P1 | validation 历史对象丢失 | `src/pipeline/mergeState.js` |
| P1 | Adapter 异常无 worker_failed 事件 | `src/pipeline/runPipeline.js` |
| P1 | applyDecisionAnswer 非法 state | `src/auto-iterate.js` |
| P1 | 所有模式消耗 implementation 预算 | `src/pipeline/mergeState.js` |
| P1 | 超时 resolve 先于 kill 的 race | `src/adapters/commandResolver.js` |
| P2 | 临时文件竞争 | `src/auto-iterate.js` |
| P2 | refreshStateMarkdownView 非原子 | `src/pipeline/runPipeline.js` |
| P2 | parseValidationCommands 误过滤 | `src/pipeline/runPipeline.js` |
| P2 | 验证超时不可配置 | `src/pipeline/runPipeline.js` |
| P2 | replaceSection 正则未转义 | `src/auto-iterate.js` |
| P3 | 其余边界 case | 多个文件 |

---

*本报告由代码静态分析生成，未涉及运行时动态探测。建议在实际修复后补充对应回归测试。*

---

## 四、Worker 超时机制改进方案

> 设计时间：2026-05-26  
> 基于 2.1 现有超时链路分析，提出双层超时 + 活跃检测 + 优雅退出方案。

### 4.1 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                   runWorkerWithProgress                  │
│                                                         │
│  ┌──────────────────┐    ┌───────────────────────────┐  │
│  │  Wall-Clock 总上限 │    │  活跃检测（Inactivity）    │  │
│  │  (default: 600s)  │    │  (default: 120s 无输出)   │  │
│  │  可配置 / 动态调整  │    │  任意 stdout/stderr 重置  │  │
│  └──────┬───────────┘    └───────────┬───────────────┘  │
│         │                            │                  │
│         └──────────┬─────────────────┘                  │
│                    ▼                                    │
│           ┌────────────────┐                            │
│           │  哪个先触发就杀  │                            │
│           └───────┬────────┘                            │
│                   ▼                                     │
│   ┌──────────────────────────────────────┐              │
│   │  阶段 1: 预警（剩余 30s / 无输出 90s） │              │
│   │  → 向 Worker 工作目录写入              │              │
│   │    .agent-state/timeout-warning       │              │
│   │  → emit NDJSON: worker_timeout_warn   │              │
│   └──────────────┬───────────────────────┘              │
│                  ▼                                      │
│   ┌──────────────────────────────────────┐              │
│   │  阶段 2: Graceful Kill               │              │
│   │  → SIGTERM（等 5s）                   │              │
│   │  → await killProcessTree 完成         │              │
│   │  → 检查 result.json 完整性再 resolve  │              │
│   └──────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

### 4.2 核心实现要点

#### 4.2.1 `runNativeCommandAsync` 改造（`src/adapters/commandResolver.js`）

引入三个关键参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `wallTimeoutMs` | 600_000 (600s) | wall-clock 总时间上限 |
| `inactivityTimeoutMs` | 120_000 (120s) | 无 stdout/stderr 活动上限 |
| `warnBeforeMs` | 30_000 (30s) | 提前预警窗口 |

核心逻辑变更：

- 用 `setInterval(5000)` 统一轮询 wall-clock 和 inactivity 两个条件，先触发者执行
- `finish()` 先于 kill 调用改为 **kill 完成后再 resolve**，消除 race condition
- kill 策略改为 **SIGTERM → 等待 5s → SIGKILL**，给子进程保存部分结果的机会
- 同步写入 `timeout-warning` 文件，Worker Agent 可主动检测并保存中间产物

伪代码流程：

```js
function runNativeCommandAsync(command, args, options) {
  let lastActivityAt = Date.now();

  const inactivityTimer = setInterval(() => {
    const idleMs = Date.now() - lastActivityAt;
    const remainingWallMs = wallTimeoutMs - (Date.now() - startedAt);

    // 预警
    if (!warned && (idleMs > inactivityTimeoutMs - warnBeforeMs || remainingWallMs < warnBeforeMs)) {
      warned = true;
      fs.writeFileSync(warningFilePath, JSON.stringify({ stage: "timeout_imminent", ... }));
      emitProgress({ event: "worker_timeout_warning", ... });
    }

    // 无输出超时 → gracefulKill → finish
    if (idleMs >= inactivityTimeoutMs) { inactiveTimedOut = true; finish(...); gracefulKill(); return; }

    // Wall-clock 超时 → gracefulKill → finish
    if (Date.now() - startedAt >= wallTimeoutMs) { wallTimedOut = true; finish(...); gracefulKill(); return; }
  }, 5000);

  async function gracefulKill() {
    try { process.kill(child.pid, "SIGTERM"); } catch {}
    await new Promise(r => setTimeout(r, 5000));
    await new Promise(r => treeKill(child.pid, "SIGKILL", r));
  }

  // stdout/stderr 事件重置活跃时间
  child.stdout.on("data", () => { lastActivityAt = Date.now(); });
  child.stderr.on("data", () => { lastActivityAt = Date.now(); });
}
```

#### 4.2.2 Kimi Adapter 改为异步（`src/adapters/kimi.js`）

当前 Kimi 使用 `crossSpawn.sync` 阻塞 Node 事件循环，导致 heartbeat 定时器 300s 内完全无法触发。

```diff
- return runNativeCommand("kimi", args, { ... });
+ return runNativeCommandAsync("kimi", args, { ... });
```

#### 4.2.3 Pipeline 层动态超时计算（`src/pipeline/runPipeline.js`）

```js
function computeEffectiveTimeouts(state, options) {
  const baseWall = options.stepTimeoutSeconds || 300;
  const baseInactivity = options.inactivityTimeoutSeconds || 120;

  // 复杂度系数：refactor/migrate 给 2x，implement/build 给 1.5x
  const focus = state.currentState?.currentTask || "";
  let complexityMultiplier = 1;
  if (/(refactor|migrate)/i.test(focus)) complexityMultiplier = 2;
  else if (/(implement|build)/i.test(focus)) complexityMultiplier = 1.5;

  // 重试退避：连续 fail 时每次多给 25%，最多翻倍
  const noProgressStreak = state.watchdog?.noProgressStreak || 0;
  const retryBackoff = 1 + Math.min(noProgressStreak, 3) * 0.25;

  // plan 模式减半
  const modeMultiplier = state.mode?.mode === "plan" ? 0.5 : 1;

  return {
    wallTimeoutMs: baseWall * complexityMultiplier * retryBackoff * modeMultiplier * 1000,
    inactivityTimeoutMs: baseInactivity * 1000,
    warnBeforeMs: 30_000,
  };
}
```

#### 4.2.4 `runWorkerWithProgress` 异常捕获（修复 Bug #3）

```js
async function runWorkerWithProgress(adapter, adapterOptions, progressOptions) {
  // ... heartbeat 定时器 ...

  try {
    const worker = await adapter.run({
      ...adapterOptions,
      wallTimeoutMs: progressOptions.wallTimeoutMs,
      inactivityTimeoutMs: progressOptions.inactivityTimeoutMs,
      warnBeforeMs: progressOptions.warnBeforeMs,
    });
    return { ...worker, progressDurationMs: Date.now() - startedAt, progressHeartbeats: heartbeatCount };
  } catch (error) {
    // Bug #3 修复：捕获 adapter 内部同步异常，统一为 worker 失败
    return {
      status: 1, error: error.message, stdout: "", stderr: "",
      timedOut: false, progressDurationMs: Date.now() - startedAt, progressHeartbeats: heartbeatCount,
    };
  } finally {
    clearInterval(timer);
  }
}
```

### 4.3 改造前后对比

| 维度 | 当前 | 改进后 |
|------|------|--------|
| Wall-clock 总上限 | 300s 固定 | 600s 默认，可配，动态调整 |
| 活跃检测 | 无 | 120s 无 stdout/stderr 触发 |
| 预警机制 | 无 | 提前 30s 写 `timeout-warning` 文件 + emit NDJSON |
| 优雅退出 | SIGTERM 即结束 | SIGTERM → 5s 等待 → SIGKILL |
| Race Condition | finish 先于 kill | await kill 完成后再 resolve |
| Kimi 心跳 | sync 阻塞 300s 零事件 | 改为 async，heartbeat 正常工作 |
| 动态复杂度 | 固定值 | 根据 focus/mode/retry 动态调整 |
| Adapter 异常 | 直接崩溃无 events | catch 后统一返回 worker_failed |

### 4.4 设计决策说明

1. **为什么选"stdout/stderr 活跃检测"而非"CPU 监控"？**  
   跨平台（Windows/macOS/Linux）实现 `/proc/<pid>/stat` 的 `utime+stime` 监控复杂度高。LLM Worker 的主要耗时在 API 调用和文件操作——两者都会产生输出，stdout/stderr 活跃检测是最低成本的跨平台方案，且在实践中足够可靠。

2. **为什么 wall-clock 放宽到 600s？**  
   与 `runValidationCommands` 的硬编码 600s 对齐，避免"验证比 Worker 有更多时间"的不合理倒挂。动态因子可在此基础上继续放宽。

3. **为什么 SIGTERM 后等 5s？**  
   给 Worker Agent (Codex/Kimi CLI) 保存部分结果到 `result.json` 的机会，避免完全白跑。同时写入 `timeout-warning` 文件作为信号。

4. **为什么 `--inactivity-timeout` 要独立于 `--step-timeout`？**  
   两者解决不同问题：wall-clock 防止任务失控，inactivity 防止 Worker 卡死。一个 LLM API 调用可能响应慢但正常（需要 wall-clock 长一点），但 2 分钟没有任何输出几乎可以确定是进程僵死。

### 4.5 CLI 参数设计

```bash
fastcar-cli auto-iterate --run \
  --step-timeout 600          # wall-clock 总上限（秒），默认 300
  --inactivity-timeout 120    # 无输出超时（秒），默认 120
  --validation-timeout 300    # 验证超时（秒），默认 600
```

用户不需要记住所有参数——默认值覆盖 90% 场景，只有复杂任务才需调整。

### 4.6 修改清单（按顺序）

| 序号 | 文件 | 变更内容 |
|------|------|---------|
| 1 | `src/adapters/commandResolver.js` | `runNativeCommandAsync` 增加双层超时（wall + inactivity）、预警文件、优雅 kill、race condition 修复 |
| 2 | `src/adapters/kimi.js` | `runNativeCommand` → `runNativeCommandAsync` |
| 3 | `src/pipeline/runPipeline.js` | 新增 `computeEffectiveTimeouts`；`runWorkerWithProgress` 透传参数 + try/catch 异常捕获；`runPipeline` 调用处传入动态超时 |
| 4 | `test/` | 增加超时场景回归测试：sync 异常无崩溃、inactivity 触发、wall-clock 触发、预警文件写入 |

---

*本报告由代码静态分析生成，未涉及运行时动态探测。建议在实际修复后补充对应回归测试。*
