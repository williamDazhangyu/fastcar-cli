# 快速参考卡

> 一页纸速查，详细说明见 `SKILL.md` 和 `references/`。

## 一句话定位

**有界自动迭代开发协议**：Agent 理解需求 → 实现 → 真实验证 → 修复 → 递归优化 → 交付，全程状态可追踪、可恢复。

---

## 3 种最常见启动场景

### 场景 1：快速修 bug

```bash
fastcar-cli auto-iterate --quick --goal "修复登录失败" --session login-bugfix --yes
```

### 场景 2：全自动实现 PRD

```bash
fastcar-cli auto-iterate --quick --goal "实现用户管理模块" --from docs/prd/user.md --autopilot --yes
```

### 场景 3：只验收不修改

```bash
fastcar-cli auto-iterate --verify --goal "验收 PRD 是否全部实现" --from docs/prd/user.md --yes
```

---

## 核心概念速查

| 概念 | 一句话 | 详见 |
|------|--------|------|
| **RCM**（Requirement Coverage Matrix） | 从需求文档逐条提取的覆盖矩阵，每条需求有独立状态 | `SKILL.md` §需求覆盖矩阵 |
| **Watchdog** | 每轮迭代前后的安全检查，防止无反馈循环、状态漂移、假完成 | `SKILL.md` §看门狗机制 |
| **DoD**（Definition of Done） | 交付门禁视图，从 RCM 派生，逐项对照成功标准 | `SKILL.md` §完成定义 |
| **Phase Gate** | 阶段状态机：explore → req_extract → coding → validation → cleanup → delivery | `references/phase-gates.md` |
| **validation.log** | 每轮校验落盘证据，交付前逐条确认命令真实执行过 | `references/judge-runbook.md` |
| **Skill Capture** | 任务后知识沉淀，将高价值经验写入 `.agents/skills/` | `references/skill-capture.md` |
| **Style Consolidation** | 实现完成后按 skills 规范整理代码，重新验证 | `SKILL.md` §核心流程 |
| **Grill Session** | Agent 主动 interview 用户，9 步确认目标、范围、术语和预算 | `references/grill-session.md` |
| **Domain Glossary** | 项目共享术语表，让 Agent 用领域语言而非通用词汇思考和沟通 | `references/domain-language.md` |
| **Zoom Out** | 从系统高度理解代码，避免只见树木不见森林 | `references/feedback-loop.md` §Zoom Out |
| **Diagnose 六步** | reproduce → minimise → hypothesise → instrument → fix → regression-test | `references/feedback-loop.md` §Diagnose 六步循环 |
| **Triage** | Issue 优先级排序、scope 评估、session 分配 | `references/feedback-loop.md` §Triage |
| **Caveman Mode** | 超压缩通信模式，每轮输出 1-3 行电报风格 | `references/iteration-policy.md` §Caveman Mode |
| **Output Discipline** | 输出纪律契约：谁输出什么、禁止输出什么、违规检测 | `contracts/output-discipline-contract.md` |

---

## 需求状态流转

```
pending → implemented（coder 写入）→ passed（主 Agent 验证通过）
                                   → blocked（需要用户决策/资源）
                                   → not_verified（无法验证）
```

---

## 停止条件速查

| 条件 | 动作 |
|------|------|
| 所有关键需求 `passed` + 验证加固完成 | ✅ 成功交付 |
| 达到迭代预算 | ⏹ 提前停止，输出剩余需求 |
| 连续 `max_no_progress_iterations` 轮无进展 | ⏹ 提前停止，输出无进展原因 |
| 需要用户决策/资源 | ⏹ 进入 `need_decision` 或 `blocked` |
| `delivery_verifiability = not_verifiable` | ⏹ 不得声称完成，输出缺少的验证条件 |
| 用户要求停止 | ⏹ 输出当前状态摘要 |

---

## 预算参数默认值

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `max_iterations` | 100 | 普通模式最大实现轮次 |
| `autopilot_max_iterations` | 20 | Autopilot 模式最大实现轮次 |
| `max_no_progress_iterations` | 5 | 连续无进展上限 |
| `max_changed_files_per_iteration` | 8 | 单轮最大变更文件数 |
| `max_diff_lines_per_iteration` | 800 | 单轮最大 diff 行数 |
| `optimization_iterations` | 12 | 递归优化最大轮次 |
| `minimum_validation_hardening_iterations` | 1（普通）/ 2（strict/Autopilot） | 验证加固最小轮次 |

---

## 目录结构

```
.agent-state/
├── auto-iterate-current.json          # 当前活动 session 指针
└── auto-iterate/
    └── <session>/
        ├── state.json                 # 机器权威状态源
        ├── state.md                   # 人类阅读视图
        └── start-prompt.md            # 启动提示
```

---

## 两条执行路径

| 路径 | 条件 | 谁写代码 | 谁校验 |
|------|------|----------|--------|
| **A（默认）** | `Agent` 工具可用 | coder subagent | 主 Agent |
| **B（LLM-only）** | `--no-run` 或无 `Agent` 工具 | 当前 LLM | 当前 LLM |

---

## 常用命令

```bash
# 列出所有 session
fastcar-cli auto-iterate --list

# 切换 session
fastcar-cli auto-iterate --switch <session>

# 恢复 session
fastcar-cli auto-iterate --resume <session>

# 校验 state
fastcar-cli auto-iterate --validate-state <session>

# 生成交付文档
fastcar-cli auto-iterate --finalize <session>

# 下一轮前检查 focus / watchdog / validation.log
fastcar-cli auto-iterate --next <session>

# 合并本轮 result.json + validation.log
fastcar-cli auto-iterate --merge <session> --round <n>

# 检查测试/技能膨胀
fastcar-cli auto-iterate --check-bloat
```

## 每轮固定循环

```text
--next <session>
→ 派发 coder
→ 主 Agent 运行真实验证并写 validation.log
→ --merge <session> --round <n>
→ 再次 --next <session>
```

`--next` / `--merge` 是辅助命令，不启动旧 `--run` / `--dispatch` Worker 路径。

---

## 领域语言 / Domain Glossary

详细规则见 `references/domain-language.md`。速记：只记录影响需求、验收、状态机、权限、数据生命周期或命名一致性的领域词；不要把文件名、函数名、通用工程词或一次性实现细节写成术语。
