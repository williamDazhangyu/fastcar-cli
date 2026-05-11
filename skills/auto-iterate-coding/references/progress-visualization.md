# 进度可视化

用于 `medium` / `large` 任务、用户询问状态、需要 Mermaid 输出或最终交付进度图时。

## 进度记录

维护轻量进度记录，让用户知道当前阶段、循环次数、验证状态和优化方向。

进入新阶段时输出：

```text
当前阶段：第 X/15 步 - 阶段名称
当前目标：
下一步动作：
```

每轮实现迭代后记录：

```text
实现迭代：第 i/max_iterations 轮
本轮目标：
修改方向：
关键修改：
运行的验证：
结果：
下一步：
```

每轮递归优化后记录：

```text
优化迭代：第 j/optimization_iterations 轮
优化方向：
优化前 baseline：
优化后结果：
运行的验证：
是否保留：
保留或放弃原因：
```

分别统计三类计数：

- `implementation_iterations`：实现/修复循环次数。
- `optimization_iterations_used`：递归优化循环次数。
- `total_cycles`：实现迭代次数 + 优化迭代次数。

不要等到最终交付再倒推进度。长任务中，每完成一个阶段或一轮迭代都给用户简短更新。

## Mermaid 进度图

Mermaid 是推荐的可视化增强，不是硬性前提。长任务和最终交付可以包含 Mermaid 图；`small` 任务可只用纯文本，除非用户要求 Mermaid。

如果当前 Agent、终端、平台或最终载体不适合渲染 Mermaid，必须提供等价的纯文本树，不要因为无法渲染 Mermaid 而省略阶段、计数、验证状态或停止原因。

图中必须展示：

- 功能节点：需求、架构、脚手架、实现、测试、优化、交付。
- 当前阶段或最终停止节点。
- 实现迭代次数。
- 递归优化方向和轮次。
- 验证状态：真实测试、沙箱验证或未验证。
- 提前停止时的停止原因。

## 流程总览模板

```mermaid
flowchart TD
  R["1 需求规格"] --> A["2 架构确认"]
  A --> S["3 脚手架/模板"]
  S --> I["4 实现迭代<br/>implementation_iterations: i"]
  I --> T["5 真实验证<br/>test/build/lint/typecheck"]
  T -->|失败| I
  T -->|通过| O["6 递归优化<br/>optimization_iterations_used: j"]
  O --> T
  O --> D["7 最终交付<br/>total_cycles: i + j"]
```

## 功能节点关系图

当任务涉及多个功能节点、module 或优化方向时，除了流程图，还应提供功能节点关系图。

```mermaid
flowchart LR
  需求规格 ---|强相关| 架构确认
  架构确认 ---|中相关| 脚手架
  实现迭代 ---|核心闭环| 真实验证
  真实验证 ---|优化入口| 递归优化
  递归优化 ---|交付依据| 最终交付
```

## 优化关系图模板

```mermaid
flowchart LR
  B["baseline"] --> C1["优化 1: 方向<br/>保留/放弃"]
  C1 --> C2["优化 2: 方向<br/>保留/放弃"]
  C2 --> C3["优化 N: 方向<br/>保留/放弃"]
  C3 --> F["final"]
```

如果当前输出环境不适合 Mermaid，提供等价的纯文本树，但不要省略计数和优化方向。

## 纯文本降级模板

```text
进度树
1. 需求规格：passed / in_progress / blocked
2. 架构确认：passed / not_needed / blocked
3. 脚手架/模板：passed / not_needed / blocked
4. 实现迭代：i / max
   当前失败信号：
   最近修改：
5. 真实验证：passed / failed / not_verified / blocked
   命令：
   结果：
6. 递归优化：j / max
   当前优化方向：
   保留/放弃：
7. 交付：success / limited_success / stopped
   交付可验证性：
   停止原因：
```
