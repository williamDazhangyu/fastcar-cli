# Triage：Issue 分流工作流

用于在自动迭代启动前，对 issue 列表进行优先级排序、scope 评估和 session 分配。让 Agent 帮助用户决定"先做什么、谁来做、做多大"。

## 定位

当用户提供多个 issue、需求或 bug 报告时，Agent 不应直接全部丢进 Autopilot。Triage 是自动迭代的前置步骤：先评估每个 issue 的优先级、复杂度和依赖关系，再决定哪些进入自动迭代、哪些需要人工处理、哪些可以关闭。

## Triage 状态机

每个 issue 经过 Triage 后，进入以下状态之一：

```text
                    ┌─────────────┐
                    │  untriaged  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌──────────┐
        │ accepted │  │ deferred│  │ rejected │
        └────┬─────┘  └─────────┘  └──────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
┌───────┐ ┌──────┐ ┌──────────┐
│ small │ │medium│ │  large   │
│ 1 轮  │ │5-10轮│ │ 10-50 轮 │
└───┬───┘ └──┬───┘ └────┬─────┘
    │        │           │
    ▼        ▼           ▼
 session  session    session
```

## Triage 维度

每个 issue 从以下维度评估：

### 1. 优先级

```text
P0 - 阻塞：影响核心功能，必须立即处理。
P1 - 高：重要功能或严重 bug，本周内处理。
P2 - 中：一般功能或优化，本月内处理。
P3 - 低：锦上添花，有资源时处理。
P4 - 待定：信息不足，需要更多上下文。
```

### 2. 复杂度

```text
small：单文件修改，1 轮内可完成。
medium：多文件修改，涉及 1-2 个模块，5-10 轮。
large：跨模块或跨服务，涉及数据库/外部服务，10-50 轮。
unknown：信息不足，无法判断。
```

### 3. 依赖关系

```text
blocked_by：依赖哪个 issue 先完成。
blocks：阻塞哪个 issue。
related_to：与哪个 issue 相关但不依赖。
```

### 4. 验证可行性

```text
verifiable：有可用的验证命令。
partially_verifiable：部分可验证，部分需要人工。
not_verifiable：当前环境无法验证。
```

## Triage 流程

```text
1. 读取所有 issue 标题和描述。
2. 对每个 issue 评估优先级、复杂度、依赖、验证可行性。
3. 排序：P0 > P1 > P2 > P3 > P4；同优先级按依赖关系排序。
4. 输出 Triage 结果表。
5. 询问用户确认。
6. 为每个 accepted + small/medium 的 issue 建议 session 名。
7. 用户确认后，按顺序启动自动迭代。
```

## Triage 输出格式

```text
## Triage 结果

| # | Issue | 优先级 | 复杂度 | 依赖 | 验证 | 建议 |
|---|-------|--------|--------|------|------|------|
| 1 | 登录失败 | P0 | small | 无 | verifiable | 立即启动 session=login-bugfix |
| 2 | 分页偏移 | P1 | small | 无 | verifiable | 等 #1 完成后启动 |
| 3 | 用户管理 | P1 | large | 无 | partially | 需要数据库权限，先确认 |
| 4 | 性能优化 | P2 | medium | 无 | verifiable | 本月内处理 |
| 5 | 导出 CSV | P3 | medium | 无 | verifiable | 有资源时处理 |
| 6 | 旧版兼容 | P4 | unknown | 无 | unknown | 信息不足，需补充 |

## 建议执行顺序

1. session=login-bugfix（P0，small）
2. session=pagination-offset（P1，small）
3. session=user-management（P1，large）— 需先确认数据库权限
4. session=perf-optimize（P2，medium）
5. session=csv-export（P3，medium）
6. issue-6 需补充信息后再 triage
```

## 与自动迭代的衔接

Triage 完成后，按顺序启动自动迭代：

```text
1. 选择第一个 accepted issue。
2. 进入 Grill Session（或快速启动）。
3. 执行自动迭代。
4. 交付或提前停止。
5. 更新 Triage 状态（标记为 done）。
6. 选择下一个 issue。
```

## 与模式选择的关系

Triage 中评估的复杂度直接影响模式选择：

| 复杂度 | 推荐模式 | 预算 |
|--------|---------|------|
| small | quick / diagnose | 1-5 轮 |
| medium | medium + Autopilot | 5-10 轮 |
| large | large + Autopilot | 10-50 轮 |
| unknown | 先 explore，再 triage | 1-3 轮探索 |

## 降级规则

- 如果 Agent 无法读取 issue tracker（如 GitHub Issues），用户可直接提供 issue 列表。
- 如果只有 1 个 issue，跳过 Triage 直接进入 Grill Session。
- 如果用户明确说"全部实现"，Triage 只排序不筛选，但仍需按依赖顺序执行。