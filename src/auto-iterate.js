const fs = require("fs");
const path = require("path");
const inquirer = require("inquirer");

const STATE_DIR = ".agent-state";
const SESSION_ROOT_DIR = "auto-iterate";
const CURRENT_FILE = "auto-iterate-current.json";
const SESSION_STATE_FILE = "state.md";
const SESSION_PROMPT_FILE = "start-prompt.md";

const MODE_CONFIGS = {
  strict: {
    label: "严格启动",
    description: "适合复杂任务、生产代码、大范围修改。",
    autopilot: true,
    currentPhase: "strict_start",
    currentTask: "先提取 Requirement Coverage Matrix",
    nextAction: "先提取 Requirement Coverage Matrix，再读取当前代码和验证命令，制定垂直切片计划",
    defaultMaxIterations: 100,
    defaultAutopilotMaxIterations: 20,
  },
  quick: {
    label: "快速启动",
    description: "适合小中型任务，Agent 先从代码库推断流程清单。",
    autopilot: true,
    currentPhase: "quick_start",
    currentTask: "先探索代码库并生成推断版 AI 实现流程清单",
    nextAction: "先探索项目结构、脚本和相关代码，生成推断版成功标准、修改范围、验证命令和 Requirement Coverage Matrix",
    defaultMaxIterations: 100,
    defaultAutopilotMaxIterations: 10,
  },
  diagnose: {
    label: "Diagnose",
    description: "适合困难 bug、性能回归和持续失败信号，先建立反馈闭环再修复。",
    autopilot: true,
    currentPhase: "diagnose_start",
    currentTask: "建立能复现目标问题的 feedback loop",
    nextAction: "先复现并对齐用户描述的问题，建立快速确定的 pass/fail 信号，再列出可证伪假设并逐一验证",
    defaultMaxIterations: 80,
    defaultAutopilotMaxIterations: 12,
  },
  verify: {
    label: "Verify-only",
    description: "只检查/验收现有实现，不主动修改。",
    autopilot: false,
    currentPhase: "verify_only_start",
    currentTask: "提取 Requirement Coverage Matrix 并验证现有实现",
    nextAction: "只读探索代码、测试和文档；运行可用验证命令；除非用户明确允许修复，否则不修改文件",
    defaultMaxIterations: 30,
    defaultAutopilotMaxIterations: 10,
  },
  plan: {
    label: "Plan-only",
    description: "只规划，不写代码。",
    autopilot: false,
    currentPhase: "plan_only_start",
    currentTask: "探索现状并输出实施计划，不修改项目代码",
    nextAction: "只读探索代码、文档和脚本，输出需求拆解、架构理解、任务清单、验证策略和风险",
    defaultMaxIterations: 30,
    defaultAutopilotMaxIterations: 10,
  },
  optimize: {
    label: "Optimization-only",
    description: "只做有边界优化，先建立 baseline，验证后保留。",
    autopilot: false,
    currentPhase: "optimization_only_start",
    currentTask: "建立 baseline 并选择一个低风险优化方向",
    nextAction: "先运行或识别 baseline 验证，再做最小优化；只有验证通过且质量明确提升时才保留",
    defaultMaxIterations: 50,
    defaultAutopilotMaxIterations: 10,
  },
  prototype: {
    label: "Prototype-only",
    description: "正式实现前做一次性原型，澄清状态模型、数据模型、交互逻辑或 UI 方向。",
    autopilot: false,
    currentPhase: "prototype_clarification_start",
    currentTask: "明确原型要回答的问题并选择逻辑原型或 UI 原型",
    nextAction: "先确认原型问题、路径和清理条件，再创建一个明确标记、一个命令可运行、默认不持久化的一次性原型",
    defaultMaxIterations: 30,
    defaultAutopilotMaxIterations: 8,
  },
};

const MODE_CHOICES = [
  {
    name: "严格启动：复杂任务、生产代码、大范围修改",
    value: "strict",
  },
  {
    name: "快速启动：小中型任务，Agent 先推断流程清单",
    value: "quick",
  },
  {
    name: "Diagnose：困难 bug / 性能回归，先建立反馈闭环",
    value: "diagnose",
  },
  {
    name: "Verify-only：只检查/验收，不主动修改",
    value: "verify",
  },
  {
    name: "Plan-only：只规划，不写代码",
    value: "plan",
  },
  {
    name: "Optimization-only：只做有边界优化",
    value: "optimize",
  },
  {
    name: "Prototype-only：一次性原型澄清设计，不按生产实现交付",
    value: "prototype",
  },
];

const MODE_ALIASES = {
  strict: "strict",
  quick: "quick",
  diagnose: "diagnose",
  debug: "diagnose",
  diagnosis: "diagnose",
  verify: "verify",
  "verify-only": "verify",
  plan: "plan",
  "plan-only": "plan",
  optimize: "optimize",
  optimisation: "optimize",
  optimization: "optimize",
  "optimization-only": "optimize",
  prototype: "prototype",
  proto: "prototype",
  "prototype-only": "prototype",
};

const DEFAULT_CONSTRAINTS =
  "不要连接生产数据库\n不要写入密钥、token、密码或连接串\n不要新增依赖，除非先说明原因并等待确认";

const DEFAULT_DELIVERY_FORMAT =
  "最终输出实现总结、关键修改、完整任务清单完成状态、需求覆盖矩阵（Requirement Coverage Matrix）、完成定义（Definition of Done）、Watchdog 状态、交付可验证性、验证证据、未验证项、剩余需求、风险、验收建议，以及本 session state 的最终状态摘要。";

function parseArgs(args = []) {
  const options = {
    from: null,
    mode: null,
    goal: null,
    session: null,
    list: false,
    switchSession: null,
    resumeSession: null,
    maxIterations: null,
    autopilotMaxIterations: null,
    yes: false,
    examples: false,
    query: null,
  };

  args.forEach((arg, index) => {
    if ((arg === "-f" || arg === "--from") && args[index + 1]) {
      options.from = args[index + 1];
      return;
    }

    if (arg.startsWith("--from=")) {
      options.from = arg.slice("--from=".length);
      return;
    }

    if (arg === "--mode" && args[index + 1]) {
      options.mode = normalizeMode(args[index + 1]);
      return;
    }

    if (arg.startsWith("--mode=")) {
      options.mode = normalizeMode(arg.slice("--mode=".length));
      return;
    }

    if (arg === "--goal" && args[index + 1]) {
      options.goal = args[index + 1];
      return;
    }

    if (arg.startsWith("--goal=")) {
      options.goal = arg.slice("--goal=".length);
      return;
    }

    if (arg === "--session" && args[index + 1]) {
      options.session = args[index + 1];
      return;
    }

    if (arg.startsWith("--session=")) {
      options.session = arg.slice("--session=".length);
      return;
    }

    if (arg === "--list") {
      options.list = true;
      return;
    }

    if (arg === "--switch" && args[index + 1]) {
      options.switchSession = args[index + 1];
      return;
    }

    if (arg.startsWith("--switch=")) {
      options.switchSession = arg.slice("--switch=".length);
      return;
    }

    if (arg === "--resume" && args[index + 1]) {
      options.resumeSession = args[index + 1];
      return;
    }

    if (arg.startsWith("--resume=")) {
      options.resumeSession = arg.slice("--resume=".length);
      return;
    }

    if (arg === "--yes" || arg === "-y" || arg === "--non-interactive") {
      options.yes = true;
      return;
    }

    if (arg === "--examples") {
      options.examples = true;
      if (args[index + 1] && !args[index + 1].startsWith("-")) {
        options.query = args[index + 1];
      }
      return;
    }

    if (arg.startsWith("--examples=")) {
      options.examples = true;
      options.query = arg.slice("--examples=".length);
      return;
    }

    if (arg === "--query" && args[index + 1]) {
      options.query = args[index + 1];
      return;
    }

    if (arg.startsWith("--query=")) {
      options.query = arg.slice("--query=".length);
      return;
    }

    if ((arg === "--max-iterations" || arg === "--max") && args[index + 1]) {
      options.maxIterations = formatNumber(args[index + 1], null);
      return;
    }

    if (arg.startsWith("--max-iterations=")) {
      options.maxIterations = formatNumber(arg.slice("--max-iterations=".length), null);
      return;
    }

    if (arg.startsWith("--max=")) {
      options.maxIterations = formatNumber(arg.slice("--max=".length), null);
      return;
    }

    if (
      (arg === "--autopilot-max-iterations" || arg === "--autopilot-max") &&
      args[index + 1]
    ) {
      options.autopilotMaxIterations = formatNumber(args[index + 1], null);
      return;
    }

    if (arg.startsWith("--autopilot-max-iterations=")) {
      options.autopilotMaxIterations = formatNumber(
        arg.slice("--autopilot-max-iterations=".length),
        null,
      );
      return;
    }

    if (arg.startsWith("--autopilot-max=")) {
      options.autopilotMaxIterations = formatNumber(
        arg.slice("--autopilot-max=".length),
        null,
      );
      return;
    }

    if (arg === "--strict") {
      options.mode = "strict";
      return;
    }

    if (arg === "--quick") {
      options.mode = "quick";
      return;
    }

    if (arg === "--diagnose" || arg === "--debug") {
      options.mode = "diagnose";
      return;
    }

    if (arg === "--verify") {
      options.mode = "verify";
      return;
    }

    if (arg === "--plan-only") {
      options.mode = "plan";
      return;
    }

    if (arg === "--optimize" || arg === "--optimise") {
      options.mode = "optimize";
      return;
    }

    if (arg === "--prototype" || arg === "--proto") {
      options.mode = "prototype";
    }
  });

  return options;
}

function normalizeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return MODE_ALIASES[normalized] || null;
}

function getModeConfig(mode) {
  return MODE_CONFIGS[mode] || MODE_CONFIGS.strict;
}

function normalizeLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatList(value, fallback = "未指定") {
  const lines = normalizeLines(value);
  if (lines.length === 0) {
    return fallback;
  }
  return lines.map((line) => `- ${line}`).join("\n");
}

function formatNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function validatePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return true;
  }
  return "请输入大于 0 的整数";
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readChecklistFile(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const stat = await fs.promises.stat(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`清单路径不是文件: ${resolvedPath}`);
  }

  return {
    path: resolvedPath,
    content: await fs.promises.readFile(resolvedPath, "utf8"),
  };
}

function toRelative(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function toRelativeSourcePath(filePath) {
  return toRelative(filePath);
}

function slugifySessionName(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "session";
}

function buildDefaultSessionName(answers) {
  const goalPart = slugifySessionName(answers.goal || "task")
    .split("-")
    .filter(Boolean)
    .slice(0, 6)
    .join("-");
  return slugifySessionName(`${answers.mode || "strict"}-${goalPart || "task"}`);
}

function getStatePaths() {
  const stateDir = path.join(process.cwd(), STATE_DIR);
  const sessionRoot = path.join(stateDir, SESSION_ROOT_DIR);
  return {
    stateDir,
    sessionRoot,
    currentPath: path.join(stateDir, CURRENT_FILE),
  };
}

function getSessionPaths(sessionName) {
  const paths = getStatePaths();
  const session = slugifySessionName(sessionName);
  const sessionDir = path.join(paths.sessionRoot, session);
  return {
    ...paths,
    session,
    sessionDir,
    sessionStatePath: path.join(sessionDir, SESSION_STATE_FILE),
    sessionPromptPath: path.join(sessionDir, SESSION_PROMPT_FILE),
  };
}

async function makeUniqueSessionName(baseName) {
  const base = slugifySessionName(baseName);
  let candidate = base;
  let index = 2;
  while (await pathExists(getSessionPaths(candidate).sessionDir)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function extractStateField(content, pattern, fallback = "unknown") {
  const match = content.match(pattern);
  return match && match[1] ? match[1].trim() : fallback;
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeCurrentFile(sessionPaths, answers) {
  const current = {
    session: sessionPaths.session,
    mode: answers.mode,
    modeLabel: answers.modeLabel,
    status: "in_progress",
    stateFile: toRelative(sessionPaths.sessionStatePath),
    promptFile: toRelative(sessionPaths.sessionPromptPath),
    updatedAt: new Date().toISOString(),
  };

  await fs.promises.writeFile(
    sessionPaths.currentPath,
    `${JSON.stringify(current, null, 2)}\n`,
    "utf8",
  );
  return current;
}

async function getSessionSummaries() {
  const paths = getStatePaths();
  const current = await readJsonFile(paths.currentPath);
  let entries = [];
  try {
    entries = await fs.promises.readdir(paths.sessionRoot, {
      withFileTypes: true,
    });
  } catch {
    return { current, sessions: [] };
  }

  const sessions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sessionPaths = getSessionPaths(entry.name);
    let content = "";
    try {
      content = await fs.promises.readFile(
        sessionPaths.sessionStatePath,
        "utf8",
      );
    } catch {
      // Keep broken sessions visible for cleanup/recovery.
    }

    sessions.push({
      session: entry.name,
      mode: extractStateField(content, /模式：([^\n]+)/),
      phase: extractStateField(content, /当前阶段：([^\n]+)/),
      status: extractStateField(content, /整体完成状态：([^\n]+)/),
      stateFile: toRelative(sessionPaths.sessionStatePath),
      promptFile: toRelative(sessionPaths.sessionPromptPath),
      current: current && current.session === entry.name,
    });
  }

  sessions.sort((a, b) => a.session.localeCompare(b.session));
  return { current, sessions };
}

async function listSessions() {
  const { sessions } = await getSessionSummaries();
  if (sessions.length === 0) {
    console.log("暂无 auto-iterate sessions。");
    return;
  }

  console.log("Session                         Mode                  Current  Status       State");
  sessions.forEach((item) => {
    const session = item.session.padEnd(30, " ");
    const mode = item.mode.padEnd(21, " ");
    const current = (item.current ? "*" : "").padEnd(8, " ");
    const status = item.status.padEnd(12, " ");
    console.log(`${session}${mode}${current}${status}${item.stateFile}`);
  });
}

async function activateSession(sessionName, action = "switch") {
  const sessionPaths = getSessionPaths(sessionName);
  if (!(await pathExists(sessionPaths.sessionStatePath))) {
    console.log(`❌ 未找到 session: ${sessionPaths.session}`);
    console.log(`   期望状态文件: ${toRelative(sessionPaths.sessionStatePath)}`);
    return;
  }

  const stateContent = await fs.promises.readFile(
    sessionPaths.sessionStatePath,
    "utf8",
  );
  const answers = {
    mode: extractStateField(stateContent, /模式：([^/\n]+)/, "unknown"),
    modeLabel: extractStateField(stateContent, /模式：[^/\n]+\/\s*([^\n]+)/, "unknown"),
  };

  await fs.promises.mkdir(sessionPaths.stateDir, { recursive: true });
  await writeCurrentFile(sessionPaths, answers);

  console.log(action === "resume" ? "✅ 已准备恢复 session:" : "✅ 已切换当前 session:");
  console.log(`   Session: ${sessionPaths.session}`);
  console.log(`   模式: ${answers.mode} / ${answers.modeLabel}`);
  console.log(`   状态文件: ${toRelative(sessionPaths.sessionStatePath)}`);
  console.log(`   启动提示: ${toRelative(sessionPaths.sessionPromptPath)}`);
  console.log("\n下一步:");
  console.log(`   将 ${toRelative(sessionPaths.sessionPromptPath)} 的内容发给 Agent`);
}

function withSessionDefaults(answers, sessionPaths) {
  return {
    ...answers,
    session: sessionPaths.session,
    sessionStateFile: toRelative(sessionPaths.sessionStatePath),
    sessionPromptFile: toRelative(sessionPaths.sessionPromptPath),
    currentFile: toRelative(sessionPaths.currentPath),
  };
}

function buildModeInstructions(answers) {
  switch (answers.mode) {
    case "quick":
      return `快速启动模式：
- Agent 先探索代码库并生成“推断版 AI 实现流程清单”。
- 只有以下情况才停止询问用户：成功标准会影响产品行为、修改范围可能跨模块、验证命令缺失且无法推断、需要数据库/密钥/外部服务/新依赖、可能破坏兼容性。
- 在实现前把推断出的成功标准、修改范围、验证命令和 Requirement Coverage Matrix 写入状态。`;
    case "diagnose":
      return `Diagnose 模式：
- 先建立能复现目标问题的 feedback loop；没有可信 pass/fail 信号时停止并请求 artifact 或环境。
- 确认复现的是用户描述的问题，而不是附近的其他失败。
- 连续失败或修改无改善时，列出 3-5 个排序假设；每个假设必须可证伪，每轮只验证一个主要假设。
- 使用唯一前缀标记临时 debug instrumentation，交付前必须清理。
- 修复后重新运行原始复现循环和回归验证。`;
    case "verify":
      return `Verify-only 模式：
- 只检查、评估和验收现有实现，不进入修改循环。
- 除非用户明确允许修复，否则不要修改项目文件。
- 流程：提取 Requirement Coverage Matrix → 阅读代码和测试 → 运行可用验证命令 → 标记 passed / implemented / not_verified / blocked → 输出差距清单和建议修复顺序。`;
    case "plan":
      return `Plan-only 模式：
- 只规划，不写代码，不修改项目文件。
- 输出需求拆解、架构理解、任务清单、验证策略、风险、建议的垂直切片顺序。
- 如果需要实现，先等待用户确认后再进入实现模式。`;
    case "optimize":
      return `Optimization-only 模式：
- 先建立 baseline：当前验证结果、关键 diff、复杂度和已知风险。
- 每轮只选择一个优化方向，做最小修改并重新验证。
- 只有质量明确提升且风险可接受时才保留；无法验证或收益低于风险时停止。`;
    case "prototype":
      return `Prototype-only 模式：
- 先明确原型要回答的一个问题，并选择逻辑原型或 UI 原型。
- 原型必须明确标记为一次性代码，一个命令可运行，默认不连接真实数据库或生产服务。
- 逻辑原型应把可吸收的核心逻辑放在纯 module / reducer / state machine 背后；TUI 外壳是一次性的。
- UI 原型应生成结构差异明显的方案，优先挂在现有页面，通过 variant 切换；生产构建不能暴露切换器。
- 原型结论未被用户确认、吸收并完成生产验证前，不得声称需求完成。`;
    case "strict":
    default:
      return `严格启动模式：
- 按用户提供的完整流程清单执行。
- 先提取 Requirement Coverage Matrix，再探索现有实现、制定垂直切片计划、实现、验证、修复和优化。
- 不要把单个阶段、子任务或最小纵切通过误判为整体完成。`;
  }
}

function withModeDefaults(answers) {
  const mode = answers.mode || "strict";
  const config = getModeConfig(mode);
  const maxIterations = formatNumber(
    answers.maxIterations,
    config.defaultMaxIterations,
  );
  const autopilotMaxIterations = formatNumber(
    answers.autopilotMaxIterations,
    config.defaultAutopilotMaxIterations,
  );

  return {
    ...answers,
    mode,
    modeLabel: config.label,
    modeDescription: config.description,
    autopilot: config.autopilot,
    currentPhase: answers.currentPhase || config.currentPhase,
    currentTask: answers.currentTask || config.currentTask,
    nextAction: answers.nextAction || config.nextAction,
    allowAgentInference: Boolean(answers.allowAgentInference),
    allowModify: answers.allowModify !== false,
    maxIterations,
    autopilotMaxIterations,
    deliveryFormat: answers.deliveryFormat || DEFAULT_DELIVERY_FORMAT,
    modeInstructions: buildModeInstructions({ ...answers, mode }),
  };
}

function buildStateContent(rawAnswers) {
  const answers = withModeDefaults(rawAnswers);
  const sourceChecklist = answers.sourceChecklist
    ? `\n## 来源清单\n来源文件：${answers.sourceChecklistPath}\n\n\`\`\`markdown\n${answers.sourceChecklist}\n\`\`\`\n`
    : "";
  const autopilotText = answers.autopilot ? "true" : "false";
  const remainingImplementationIterations = answers.autopilot
    ? answers.autopilotMaxIterations
    : "按模式需要使用";

  return `# 自动迭代编码状态
${sourceChecklist}

## At-a-Glance / 人类摘要
tl;dr：整体 in_progress；模式：${answers.mode} / ${answers.modeLabel}
进度：implementation 0 / ${answers.autopilot ? answers.autopilotMaxIterations : answers.maxIterations}；optimization 0 / 未开始
需求：passed 0 / not_verified 全部 / blocked 0 / pending REQ-BOOTSTRAP
验证：最近命令 未运行；最近结果 未运行
看门狗：triggered；required_action：run_validation
交付可验证性：unknown
需要用户决策：无
下一步：${answers.nextAction}

## Session / 会话
session：${answers.session || "default"}
状态文件：${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}
启动提示：${answers.sessionPromptFile || ".agent-state/auto-iterate/default/start-prompt.md"}
current 指针：${answers.currentFile || ".agent-state/auto-iterate-current.json"}
恢复优先级：当前消息显式 session > session state > current 指针 > 对话推断
语言规则：输出、状态记录和交付总结必须与用户当前提示语言保持一致；用户使用中文时不要突然切换为英文，除非术语、命令、代码或用户明确要求保留英文

## Mode / 模式
模式：${answers.mode} / ${answers.modeLabel}
模式说明：${answers.modeDescription}
Autopilot：${autopilotText}
允许 Agent 推断流程清单：${answers.allowAgentInference ? "true" : "false"}
允许修改文件：${answers.allowModify ? "true" : "false"}

模式执行规则：
${answers.modeInstructions}

## Task / 任务
用户目标：
${answers.goal || "未指定"}

成功标准：
${formatList(answers.successCriteria)}

非目标：
${formatList(answers.nonGoals)}

允许修改范围：
${answers.allowedScope || "未指定"}

兼容性约束：
${formatList(answers.compatibility)}

## Agent Capability Summary / 能力摘要
读文件/搜索代码：unknown
修改文件：unknown
运行命令：unknown
真实测试：unknown
状态持久化：available
子 Agent/并行：unknown
网络/外部服务：unknown
数据库/密钥：user-confirmed-required
git 状态/diff：unknown
媒体/文档处理：not_needed
降级策略：能力不可用时标记 not_verified 或 blocked，不得伪造验证
阻塞能力：待 Agent 启动后探测

## Budgets / 预算
max_iterations：${answers.maxIterations}
autopilot_max_iterations：${answers.autopilotMaxIterations}
implementation_iterations_used：0
optimization_iterations_used：0
total_cycles：0
remaining_implementation_iterations：${remainingImplementationIterations}
remaining_optimization_iterations：未开始
预算追加记录：无；如果恢复时 remaining_implementation_iterations = 0，必须先请求用户追加预算，历史计数不清零
计数口径：实现迭代 = 修改 + 验证/记录 + 状态更新的闭环；只读探索、reconcile、上下文压缩、向用户提问和纯验证不计入实现迭代

## Recovery / Reconcile / 恢复一致性检查
当前分支：待检查
git 状态/diff 摘要：待检查
状态文件与当前代码是否一致：unknown
上次停止后外部修改：unknown
最近验证是否已重新运行：no
reconcile 结论：启动时先检查

## Current State / 当前状态
当前阶段：${answers.currentPhase}
任务规模：auto
Autopilot：${autopilotText}
完整任务清单：待从成功标准、原始清单和模式规则提取
已完成任务：无
当前任务：${answers.currentTask}
剩余任务：所有需求
整体完成状态：in_progress
最近修改：无
关键文件：未探索
最近验证命令：未运行
最近验证结果：未运行
首个关键失败信号：无
未验证项：全部成功标准尚未验证
需要用户决策：无
反馈闭环：未建立
架构摩擦：none
原型状态：${answers.mode === "prototype" ? "proposed" : "not_needed"}

## Watchdog / 看门狗
enabled：true
check_interval：每轮迭代前后、上下文压缩后、恢复后、最终交付前
light_check：每轮必做，检查 no_progress_count / last_validation_result / state_drift / triggered
full_check：每个 phase、每 3 轮、恢复后和交付前执行完整字段检查
last_progress_iteration：0
last_progress_summary：CLI 已生成初始状态，Agent 尚未开始执行
last_validation_iteration：0
last_validation_command：未运行
last_validation_result：未运行
no_progress_count：0 / 按模式 max_no_progress_iterations
unverified_iteration_count：0
state_drift：none
delivery_verifiability：unknown
triggered：false
trigger_reason：无
required_action：run_validation

## Requirement Coverage Matrix / 需求覆盖矩阵
REQ-BOOTSTRAP：
原文摘要：启动后必须先从用户目标、成功标准、原始清单文档和当前模式提取完整 Requirement Coverage Matrix
类型：验证
状态：pending
相关文件：${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}
验证证据：无
阻塞原因：无
下一步：读取原始清单和当前代码，拆分 REQ-001...REQ-N，并在实现或验证前更新本矩阵

## Definition of Done / 完成定义
RCM 状态摘要：REQ-BOOTSTRAP pending；完整 RCM 尚未提取
派生规则：成功标准状态直接引用 Requirement Coverage Matrix 中对应关键 REQ 的状态和验证证据，不独立重复评估
${normalizeLines(answers.successCriteria)
  .map((line, index) => `成功标准 ${index + 1}：not_verified - ${line}`)
  .join("\n") || "成功标准 1：not_verified - 未指定"}
真实验证：未运行
沙箱验证：未运行
未验证项：全部成功标准尚未验证
Requirement Coverage Matrix 状态：未提取完整矩阵，REQ-BOOTSTRAP pending
交付可验证性：unknown
看门狗状态：triggered - required_action: run_validation
剩余风险：尚未开始执行

## Decisions / 已确认决策
已确认的架构决策：未确认，优先从现有代码和脚手架推断
已确认的产品行为：以本文件成功标准为准；快速模式下先由 Agent 推断并等待必要确认
已确认的接口兼容性：
${formatList(answers.compatibility)}
用户提供的限制：
${formatList(answers.constraints)}

## Hypotheses / 假设
已排除假设：无
排序候选假设：未生成
当前主要假设：可以通过当前 Agent 能力探测、现有项目结构和验证命令推进本模式
下一步最小动作：${answers.nextAction}

## Validation / 验证
已通过验证：无
失败验证：无
未运行验证及原因：尚未开始
沙箱验证：无
不可用能力导致的未验证项：待 Agent 能力探测
最终交付可验证性：unknown
可运行的验证命令：
${formatList(answers.validationCommands)}

## Temporary Artifacts / Cleanup / 临时产物清理
临时 debug 前缀：无
一次性 harness：无
原型文件或路由：${answers.mode === "prototype" ? "待创建并明确标记" : "无"}
待删除 artifacts：无
清理状态：pending

## Context Handoff Summary / 上下文交接摘要
目标：${answers.goal || "未指定"}
成功标准：${normalizeLines(answers.successCriteria).join("；") || "未指定"}
当前状态：${answers.modeLabel} 启动前，等待 Agent 读取状态并开始执行
已完成：CLI 已生成初始状态和启动提示
完整任务清单完成状态：未提取
剩余任务：所有需求
当前失败：无
已验证命令：未运行
已排除假设：无
当前假设：可以先完成 Agent 能力探测和 feedback loop 识别
下一步：${answers.nextAction}
禁止事项：不要伪造验证，不要泄露或写入密钥，不要破坏兼容性约束；Verify-only/Plan-only 未获明确允许不得修改项目文件
Watchdog：enabled，交付前必须从 unknown 更新为 verifiable / partially_verifiable / not_verifiable
剩余预算：实现迭代 ${answers.autopilotMaxIterations} / 普通预算 ${answers.maxIterations}

## Resume Prompt / 恢复提示
下次继续时，请使用 auto-iterate-coding skill。
如果存在本文件，请先读取它作为任务恢复状态。
继续时不要依赖历史对话，只依赖本状态文件、当前代码和真实验证结果。
从“下一步最小动作”继续，并在每轮迭代后更新本文件。
如果 Requirement Coverage Matrix 中仍存在 pending / implemented / not_verified 的关键需求，不要按成功交付输出。
如果 Watchdog triggered 为 true，先处理 required_action；交付可验证性为 not_verifiable 或 unknown 时，不要按成功交付输出。
如果 Temporary Artifacts / Cleanup 中仍有未清理的 debug 日志、harness、原型路由或一次性文件，不要按成功交付输出，除非用户明确要求保留并已标记原因。
`;
}

function buildPromptContent(rawAnswers) {
  const answers = withModeDefaults(rawAnswers);
  const sourceChecklist = answers.sourceChecklist
    ? `\n原始清单文档：\n来源文件：${answers.sourceChecklistPath}\n\n\`\`\`markdown\n${answers.sourceChecklist}\n\`\`\`\n`
    : "";
  const startModeLine = answers.autopilot
    ? "请使用 auto-iterate-coding skill，进入 Autopilot 全自动迭代模式。"
    : "请使用 auto-iterate-coding skill，按当前模式执行有边界的 Agent 工作流。";

  return `# 自动迭代编码启动提示

将下面内容发给 Agent，用于启动本项目的 auto-iterate-coding 流程。

\`\`\`text
请先读取 auto-iterate-coding/SKILL.md，按该 skill 的自然语言命令路由、模式选择、session 恢复、能力降级、停止条件和语言一致性规则执行。
如果本启动提示来自自然语言路由，请确认命令已经包含独立 session；以后每次自然语言路由都必须显式传入 --session <name>。用户未指定 session 时，由 Agent 根据模式和目标生成英文小写、数字和连字符组成的默认 session 名，例如 quick-login-bugfix、diagnose-flaky-e2e、prototype-order-state-machine，不要省略 --session。

${startModeLine}

当前启动模式：${answers.mode} / ${answers.modeLabel}
${answers.modeDescription}

当前 session：${answers.session || "default"}
Session 状态文件：${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}
Session 启动提示：${answers.sessionPromptFile || ".agent-state/auto-iterate/default/start-prompt.md"}

模式执行规则：
${answers.modeInstructions}

上下文与状态管理：
请始终使用与用户当前提示一致的语言输出、记录状态和交付总结；用户使用中文时不要突然切换为英文，除非术语、命令、代码或用户明确要求保留英文。
本 skill 是面向 AI Coding Agent 的自动迭代开发协议，不是独立 CLI 工具，也不依赖特定 Agent 平台。
请先探测当前 Agent 环境可用能力，包括读写文件、运行命令、真实测试、状态持久化、子 Agent/并行、网络、数据库/密钥和 git diff。
如果某项能力不可用，请按降级规则标记 not_verified 或 blocked，不要伪造完成或验证。
请不要依赖历史对话作为唯一上下文。
如果存在 ${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}，请先读取它作为本 session 的恢复状态。
恢复前执行 reconcile 检查：当前分支、git 状态/diff 摘要、状态文件与当前代码是否一致、是否存在上次停止后的外部修改、最近验证能否重新运行。
每完成一轮实现迭代、递归优化、上下文压缩、提前停止或成功交付前，都要优先更新 session 状态文件 ${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}；如果当前环境不能写状态文件，请在对话内维护同等结构的 Iteration State。
请启用并维护 Watchdog 状态；每轮迭代前后、上下文压缩后、恢复后和最终交付前都要检查无进展、验证缺失、状态漂移和交付可验证性，并把 required_action 写回状态文件。
如果 Watchdog 触发 run_validation、reconcile、ask_user 或 stop，必须先处理 required_action，不得绕过；交付可验证性为 not_verifiable 或 unknown 时，不要按成功交付输出。
当上下文变长、完成 3-5 轮迭代、进入新阶段或开始重复尝试时，请输出并使用 Context Handoff Summary 继续。
请维护完整任务清单、已完成任务、当前任务、剩余任务和整体完成状态；剩余任务非空时不得按成功交付停止，只能继续迭代或按提前停止汇报。
修 bug、性能回归或验证失败时，请先建立能复现目标问题的 feedback loop；无法建立时停止并说明尝试过什么、缺少什么 artifact 或环境。
连续失败或修改无改善时，请列出 3-5 个排序假设，并让每轮只验证一个可证伪假设。
新功能和缺陷修复优先使用垂直切片 TDD；一次只写一个外部行为测试或等价验证，再做最小实现。
如果问题需要先澄清状态模型、数据模型、交互逻辑或 UI 方向，可以先做明确标记的一次性原型；原型结论吸收前不得声称需求完成。
如果出现没有正确 test seam、只能测私有实现、局部修改反复触发远处失败或 patch 范围扩散，请标记架构摩擦并请求用户确认，不要擅自升级为大范围重构。

需求覆盖要求：
如果需求来自长文档、PRD、issue 列表或多条清单，请先从原文提取 Requirement Coverage Matrix。
每条需求必须包含 ID、原文摘要、状态、相关文件、验证证据、阻塞原因和下一步。
只要仍存在 pending / implemented / not_verified 的关键需求，就不要按成功交付输出；必须继续迭代，或按提前停止列出剩余需求和原因。
测试通过不等于需求完成，最终完成必须逐项对照原始需求文档。
最终交付前必须清理临时 debug 日志、一次性 harness、原型路由、variant switcher 和未吸收的原型外壳；不能清理时按风险说明。

AI 实现流程清单：
${sourceChecklist}

用户目标：
${answers.goal || "未指定"}

成功标准：
${formatList(answers.successCriteria)}

非目标：
${formatList(answers.nonGoals)}

允许修改范围：
${answers.allowedScope || "未指定"}

需要保持兼容的接口、命令或行为：
${formatList(answers.compatibility)}

可运行的验证命令：
${formatList(answers.validationCommands)}

外部资源、密钥、数据库、网络或沙箱限制：
${formatList(answers.constraints)}

交付格式：
${answers.deliveryFormat}

迭代预算：
max_iterations = ${answers.maxIterations}
autopilot_max_iterations = ${answers.autopilotMaxIterations}

确认后请直接开始执行。中间只汇报关键进展；除非触发停止条件或遇到必须由我决策的问题，否则不要停下来问我。
\`\`\`
`;
}

async function promptMode(defaultMode = "strict") {
  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "请选择 auto-iterate 启动模式:",
      choices: MODE_CHOICES,
      default: defaultMode,
    },
  ]);
  return mode;
}

function buildNonInteractiveConfig(mode, options = {}, source = null) {
  const config = getModeConfig(mode);
  const goal = options.goal || (source ? "见原始清单文档" : "未指定目标");
  const maxIterations = options.maxIterations || config.defaultMaxIterations;
  const autopilotMaxIterations =
    options.autopilotMaxIterations || config.defaultAutopilotMaxIterations;
  const sourceDefaults = source
    ? {
        sourceChecklist: source.content,
        sourceChecklistPath: toRelativeSourcePath(source.path),
      }
    : {};

  const base = {
    mode,
    goal,
    maxIterations,
    autopilotMaxIterations,
    constraints: DEFAULT_CONSTRAINTS,
    deliveryFormat: DEFAULT_DELIVERY_FORMAT,
    allowAgentInference: mode !== "strict",
    ...sourceDefaults,
  };

  switch (mode) {
    case "quick":
      return withModeDefaults({
        ...base,
        successCriteria:
          "由 Agent 先探索代码库后推断，并在实现前写入需求覆盖矩阵（Requirement Coverage Matrix）",
        nonGoals: "不做与本需求无关的重构、架构迁移或新依赖引入",
        allowedScope:
          "优先限于与目标直接相关的最小文件集合；跨模块修改前停止确认",
        compatibility:
          "保持现有公开 API、CLI 命令、配置、数据格式和测试行为；可能破坏兼容性时停止确认",
        validationCommands:
          "由 Agent 从 package.json、Makefile、scripts、CI 配置和项目约定中识别；缺失时标记 not_verified",
      });
    case "diagnose":
      return withModeDefaults({
        ...base,
        successCriteria:
          "建立可信 feedback loop；复现用户描述的问题；定位可证伪根因；完成最小修复；重新运行原始复现循环和回归验证",
        nonGoals:
          "不在没有复现和验证信号时猜测修复；不保留临时 debug instrumentation；不做无关重构",
        allowedScope:
          "与目标失败信号、复现 harness、回归测试和最小修复直接相关的文件",
        compatibility:
          "保持现有公开 API、CLI 命令、配置、数据格式和测试行为；需要改变行为时停止确认",
        validationCommands:
          "由 Agent 先建立最小复现命令、测试、curl、fixture、trace replay 或 harness；缺失时停止请求 artifact",
        deliveryFormat:
          "最终输出复现方式、排序假设、最终根因、关键修改、回归验证、原始 feedback loop 结果、临时产物清理状态、剩余风险和验收建议。",
      });
    case "verify":
      return withModeDefaults({
        ...base,
        allowModify: false,
        successCriteria: source
          ? "逐项验证原始清单文档是否已由现有实现满足"
          : "逐项验证目标或 PRD 是否已由现有实现满足，并给出证据",
        nonGoals: "不修改项目文件；不把差距修复伪装成验收结果",
        allowedScope: "现有实现、测试、文档和与目标直接相关的文件",
        compatibility: "不得削弱现有测试、接口、配置、数据格式或兼容行为",
        validationCommands: "由 Agent 自动识别；缺失时标记 not_verified",
        deliveryFormat:
          "最终输出需求覆盖矩阵、完成定义、已运行验证、未验证项、差距清单、建议修复顺序、阻塞项和验收结论。",
      });
    case "plan":
      return withModeDefaults({
        ...base,
        allowModify: false,
        successCriteria:
          "输出可执行计划、任务拆分、验证策略、风险和需要用户确认的问题",
        nonGoals: "不写代码，不修改项目文件，不执行破坏性操作",
        allowedScope: "只读探索项目，不修改项目文件",
        compatibility: "保持现有架构、接口、命令和数据格式兼容",
        validationCommands: "只识别验证命令，不运行需要修改环境或外部资源的操作",
        deliveryFormat:
          "最终输出需求拆解、架构理解、关键文件、实施步骤、验证策略、风险、阻塞项和建议下一步。",
      });
    case "optimize":
      return withModeDefaults({
        ...base,
        successCriteria:
          "建立 baseline；完成低风险优化；重新运行验证；证明质量提升且无行为回归",
        nonGoals: "不做无关重构，不追求抽象最优，不改变用户可观察行为",
        allowedScope: "与优化目标直接相关的代码、测试、类型和文档",
        compatibility: "保持现有 API、命令、配置、数据格式和测试行为兼容",
        validationCommands: "npm test\nnpm run build\nnpm run typecheck",
        constraints:
          "不要改变外部可观察行为\n不要新增依赖，除非先说明原因并等待确认\n无法重新运行验证时停止优化",
        deliveryFormat:
          "最终输出 baseline、优化目标、优化前后对比、保留/放弃的优化、运行验证、剩余风险和回退建议。",
      });
    case "prototype":
      return withModeDefaults({
        ...base,
        allowModify: true,
        successCriteria:
          "明确原型要回答的问题；创建一次性逻辑原型或 UI 原型；一个命令可运行；记录结论、清理条件和是否需要吸收为生产实现",
        nonGoals:
          "不把原型直接当生产实现交付；不连接生产数据库或生产写操作；不为原型做大范围抽象",
        allowedScope:
          "明确标记的 prototype 文件、临时路由、轻量脚本、必要的运行命令和原型旁说明",
        compatibility:
          "不得影响生产构建、公开 API、真实数据写入和现有用户路径；UI variant switcher 不得暴露到生产路径",
        validationCommands:
          "一个原型运行命令；必要时补充构建或类型检查；正式实现验证需在吸收原型后另行运行",
        deliveryFormat:
          "最终输出原型问题、选择路径、运行命令、文件位置、观察结论、未确认项、清理/吸收计划和不能声称完成的生产需求。",
      });
    case "strict":
    default:
      return withModeDefaults({
        ...base,
        successCriteria: source ? "以原始清单文档为准" : "由用户目标推断并在实现前确认",
        nonGoals: source ? "以原始清单文档为准" : "未指定",
        allowedScope: source
          ? "以原始清单文档为准；未明确时仅修改与本次需求直接相关的代码、测试、类型和文档"
          : "与本次需求直接相关的代码、测试、类型和文档",
        compatibility: source ? "以原始清单文档为准" : "保持现有公开接口、命令和行为兼容",
        validationCommands: "npm test\nnpm run build\nnpm run typecheck",
      });
  }
}

async function promptStrictConfig(options = {}) {
  const config = getModeConfig("strict");
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "goal",
      message: "用户目标:",
      default: options.goal,
      validate: (value) => Boolean(value && value.trim()) || "请输入用户目标",
    },
    {
      type: "editor",
      name: "successCriteria",
      message: "成功标准（每行一条）:",
      validate: (value) =>
        normalizeLines(value).length > 0 || "请至少输入一条成功标准",
    },
    {
      type: "editor",
      name: "nonGoals",
      message: "非目标（每行一条，可留空）:",
    },
    {
      type: "input",
      name: "allowedScope",
      message: "允许修改范围:",
      default: "与本次需求直接相关的代码、测试、类型和文档",
    },
    {
      type: "editor",
      name: "compatibility",
      message: "需要保持兼容的接口、命令或行为（每行一条，可留空）:",
    },
    {
      type: "editor",
      name: "validationCommands",
      message: "可运行的验证命令（每行一条）:",
      default: "npm test\nnpm run build\nnpm run typecheck",
    },
    {
      type: "editor",
      name: "constraints",
      message: "外部资源、密钥、数据库、网络或沙箱限制（每行一条，可留空）:",
      default: DEFAULT_CONSTRAINTS,
    },
    {
      type: "input",
      name: "deliveryFormat",
      message: "交付格式:",
      default: DEFAULT_DELIVERY_FORMAT,
    },
    {
      type: "input",
      name: "maxIterations",
      message: "max_iterations:",
      default: String(options.maxIterations || config.defaultMaxIterations),
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, config.defaultMaxIterations),
    },
    {
      type: "input",
      name: "autopilotMaxIterations",
      message: "autopilot_max_iterations:",
      default: String(
        options.autopilotMaxIterations || config.defaultAutopilotMaxIterations,
      ),
      validate: validatePositiveInteger,
      filter: (value) =>
        formatNumber(value, config.defaultAutopilotMaxIterations),
    },
  ]);

  return withModeDefaults({ ...answers, mode: "strict" });
}

async function promptQuickConfig(options = {}) {
  const config = getModeConfig("quick");
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "goal",
      message: "简短目标 / 需求描述:",
      default: options.goal,
      validate: (value) => Boolean(value && value.trim()) || "请输入目标或需求描述",
    },
    {
      type: "confirm",
      name: "allowAgentInference",
      message: "是否允许 Agent 先从代码库推断成功标准、修改范围和验证命令?",
      default: true,
    },
    {
      type: "editor",
      name: "constraints",
      message: "外部资源、密钥、数据库、网络、新依赖或沙箱限制（每行一条，可留空）:",
      default: DEFAULT_CONSTRAINTS,
    },
    {
      type: "input",
      name: "maxIterations",
      message: "max_iterations:",
      default: String(options.maxIterations || config.defaultMaxIterations),
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, config.defaultMaxIterations),
    },
    {
      type: "input",
      name: "autopilotMaxIterations",
      message: "autopilot_max_iterations:",
      default: String(
        options.autopilotMaxIterations || config.defaultAutopilotMaxIterations,
      ),
      validate: validatePositiveInteger,
      filter: (value) =>
        formatNumber(value, config.defaultAutopilotMaxIterations),
    },
  ]);

  return withModeDefaults({
    ...answers,
    mode: "quick",
    successCriteria:
      "由 Agent 先探索代码库后推断，并在实现前写入需求覆盖矩阵（Requirement Coverage Matrix）",
    nonGoals: "不做与本需求无关的重构、架构迁移或新依赖引入",
    allowedScope:
      "优先限于与目标直接相关的最小文件集合；跨模块修改前停止确认",
    compatibility:
      "保持现有公开 API、CLI 命令、配置、数据格式和测试行为；可能破坏兼容性时停止确认",
    validationCommands:
      "由 Agent 从 package.json、Makefile、scripts、CI 配置和项目约定中识别；缺失时标记 not_verified",
    deliveryFormat: DEFAULT_DELIVERY_FORMAT,
  });
}

async function promptVerifyConfig(options = {}) {
  const config = getModeConfig("verify");
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "goal",
      message: "要检查/验收的目标、PRD 或实现说明:",
      default: options.goal,
      validate: (value) => Boolean(value && value.trim()) || "请输入要检查的目标或说明",
    },
    {
      type: "confirm",
      name: "allowModify",
      message: "是否允许 Agent 在发现问题后直接修复?（默认否，仅输出差距清单）",
      default: false,
    },
    {
      type: "input",
      name: "allowedScope",
      message: "验收范围 / 关注文件（可留空）:",
      default: "现有实现、测试、文档和与目标直接相关的文件",
    },
    {
      type: "editor",
      name: "validationCommands",
      message: "可运行的验证命令（每行一条；可留空让 Agent 自动识别）:",
      default: "由 Agent 自动识别；缺失时标记 not_verified",
    },
    {
      type: "editor",
      name: "constraints",
      message: "外部资源、密钥、数据库、网络或沙箱限制（每行一条，可留空）:",
      default: DEFAULT_CONSTRAINTS,
    },
    {
      type: "input",
      name: "maxIterations",
      message: "max_iterations:",
      default: String(options.maxIterations || config.defaultMaxIterations),
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, config.defaultMaxIterations),
    },
    {
      type: "input",
      name: "autopilotMaxIterations",
      message: "autopilot_max_iterations:",
      default: String(
        options.autopilotMaxIterations || config.defaultAutopilotMaxIterations,
      ),
      validate: validatePositiveInteger,
      filter: (value) =>
        formatNumber(value, config.defaultAutopilotMaxIterations),
    },
  ]);

  return withModeDefaults({
    ...answers,
    mode: "verify",
    allowAgentInference: true,
    successCriteria:
      "逐项验证目标或 PRD 是否已由现有实现满足，并给出证据",
    nonGoals: answers.allowModify
      ? "不做与验收目标无关的修改"
      : "不修改项目文件；不把差距修复伪装成验收结果",
    compatibility:
      "不得削弱现有测试、接口、配置、数据格式或兼容行为",
    deliveryFormat:
      "最终输出需求覆盖矩阵、完成定义、已运行验证、未验证项、差距清单、建议修复顺序、阻塞项和验收结论。",
  });
}

async function promptDiagnoseConfig(options = {}) {
  const config = getModeConfig("diagnose");
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "goal",
      message: "要诊断的 bug、失败信号或性能回归:",
      default: options.goal,
      validate: (value) => Boolean(value && value.trim()) || "请输入要诊断的问题",
    },
    {
      type: "editor",
      name: "validationCommands",
      message: "已知复现命令 / 测试 / curl / trace / harness（每行一条；可留空让 Agent 建立）:",
      default:
        "由 Agent 先建立可信 feedback loop；没有复现信号时停止请求 artifact 或环境",
    },
    {
      type: "input",
      name: "allowedScope",
      message: "允许修改范围:",
      default: "与复现、回归测试、诊断 instrumentation 和最小修复直接相关的文件",
    },
    {
      type: "editor",
      name: "constraints",
      message: "外部资源、日志、trace、数据库、网络或沙箱限制（每行一条，可留空）:",
      default: DEFAULT_CONSTRAINTS,
    },
    {
      type: "input",
      name: "maxIterations",
      message: "max_iterations:",
      default: String(options.maxIterations || config.defaultMaxIterations),
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, config.defaultMaxIterations),
    },
    {
      type: "input",
      name: "autopilotMaxIterations",
      message: "autopilot_max_iterations:",
      default: String(
        options.autopilotMaxIterations || config.defaultAutopilotMaxIterations,
      ),
      validate: validatePositiveInteger,
      filter: (value) =>
        formatNumber(value, config.defaultAutopilotMaxIterations),
    },
  ]);

  return withModeDefaults({
    ...answers,
    mode: "diagnose",
    allowAgentInference: true,
    successCriteria:
      "建立可信 feedback loop；复现用户描述的问题；定位可证伪根因；完成最小修复；重新运行原始复现循环和回归验证",
    nonGoals:
      "不在没有复现和验证信号时猜测修复；不保留临时 debug instrumentation；不做无关重构",
    compatibility:
      "保持现有公开 API、CLI 命令、配置、数据格式和测试行为；需要改变行为时停止确认",
    deliveryFormat:
      "最终输出复现方式、排序假设、最终根因、关键修改、回归验证、原始 feedback loop 结果、临时产物清理状态、剩余风险和验收建议。",
  });
}

async function promptPlanConfig(options = {}) {
  const config = getModeConfig("plan");
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "goal",
      message: "要规划的目标或需求:",
      default: options.goal,
      validate: (value) => Boolean(value && value.trim()) || "请输入要规划的目标",
    },
    {
      type: "input",
      name: "allowedScope",
      message: "规划范围（可留空）:",
      default: "只读探索项目，不修改项目文件",
    },
    {
      type: "input",
      name: "constraints",
      message: "限制、非目标或需要注意的兼容性约束（可留空；多条可用分号分隔）:",
    },
    {
      type: "input",
      name: "maxIterations",
      message: "max_iterations:",
      default: String(options.maxIterations || config.defaultMaxIterations),
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, config.defaultMaxIterations),
    },
    {
      type: "input",
      name: "autopilotMaxIterations",
      message: "autopilot_max_iterations:",
      default: String(
        options.autopilotMaxIterations || config.defaultAutopilotMaxIterations,
      ),
      validate: validatePositiveInteger,
      filter: (value) =>
        formatNumber(value, config.defaultAutopilotMaxIterations),
    },
  ]);

  return withModeDefaults({
    ...answers,
    mode: "plan",
    allowAgentInference: true,
    allowModify: false,
    successCriteria:
      "输出可执行计划、任务拆分、验证策略、风险和需要用户确认的问题",
    nonGoals: "不写代码，不修改项目文件，不执行破坏性操作",
    compatibility: answers.constraints,
    validationCommands: "只识别验证命令，不运行需要修改环境或外部资源的操作",
    deliveryFormat:
      "最终输出需求拆解、架构理解、关键文件、实施步骤、验证策略、风险、阻塞项和建议下一步。",
  });
}

async function promptPrototypeConfig(options = {}) {
  const config = getModeConfig("prototype");
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "goal",
      message: "原型要回答的问题:",
      default: options.goal,
      validate: (value) => Boolean(value && value.trim()) || "请输入原型要回答的问题",
    },
    {
      type: "list",
      name: "prototypeKind",
      message: "原型类型:",
      choices: [
        { name: "逻辑原型：状态机 / 数据模型 / 业务流程", value: "logic" },
        { name: "UI 原型：页面 / 交互 / 信息架构方案", value: "ui" },
        { name: "由 Agent 根据代码上下文判断", value: "auto" },
      ],
      default: "auto",
    },
    {
      type: "input",
      name: "allowedScope",
      message: "允许创建原型的位置或范围:",
      default: "靠近被验证模块或页面的明确 prototype 文件 / 临时路由 / 轻量脚本",
    },
    {
      type: "editor",
      name: "constraints",
      message: "原型限制、数据限制或清理要求（每行一条，可留空）:",
      default:
        "默认不连接真实数据库或生产服务\n原型必须明确标记为一次性代码\n完成后删除、吸收或记录清理条件",
    },
    {
      type: "input",
      name: "maxIterations",
      message: "max_iterations:",
      default: String(options.maxIterations || config.defaultMaxIterations),
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, config.defaultMaxIterations),
    },
    {
      type: "input",
      name: "autopilotMaxIterations",
      message: "autopilot_max_iterations:",
      default: String(
        options.autopilotMaxIterations || config.defaultAutopilotMaxIterations,
      ),
      validate: validatePositiveInteger,
      filter: (value) =>
        formatNumber(value, config.defaultAutopilotMaxIterations),
    },
  ]);

  return withModeDefaults({
    ...answers,
    mode: "prototype",
    allowAgentInference: true,
    successCriteria: `创建 ${answers.prototypeKind} 原型；一个命令可运行；回答原型问题；记录结论、清理条件和是否需要吸收为生产实现`,
    nonGoals:
      "不把原型直接当生产实现交付；不连接生产数据库或生产写操作；不为原型做大范围抽象",
    compatibility:
      "不得影响生产构建、公开 API、真实数据写入和现有用户路径；UI variant switcher 不得暴露到生产路径",
    validationCommands:
      "一个原型运行命令；必要时补充构建或类型检查；正式实现验证需在吸收原型后另行运行",
    deliveryFormat:
      "最终输出原型问题、选择路径、运行命令、文件位置、观察结论、未确认项、清理/吸收计划和不能声称完成的生产需求。",
  });
}

async function promptOptimizeConfig(options = {}) {
  const config = getModeConfig("optimize");
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "goal",
      message: "要优化的目标、模块或问题:",
      default: options.goal,
      validate: (value) => Boolean(value && value.trim()) || "请输入优化目标",
    },
    {
      type: "input",
      name: "allowedScope",
      message: "允许优化范围:",
      default: "与优化目标直接相关的代码、测试、类型和文档",
    },
    {
      type: "editor",
      name: "validationCommands",
      message: "baseline / 回归验证命令（每行一条）:",
      default: "npm test\nnpm run build\nnpm run typecheck",
    },
    {
      type: "editor",
      name: "constraints",
      message: "优化限制、风险边界或非目标（每行一条，可留空）:",
      default:
        "不要改变外部可观察行为\n不要新增依赖，除非先说明原因并等待确认\n无法重新运行验证时停止优化",
    },
    {
      type: "input",
      name: "maxIterations",
      message: "max_iterations:",
      default: String(options.maxIterations || config.defaultMaxIterations),
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, config.defaultMaxIterations),
    },
    {
      type: "input",
      name: "autopilotMaxIterations",
      message: "autopilot_max_iterations:",
      default: String(
        options.autopilotMaxIterations || config.defaultAutopilotMaxIterations,
      ),
      validate: validatePositiveInteger,
      filter: (value) =>
        formatNumber(value, config.defaultAutopilotMaxIterations),
    },
  ]);

  return withModeDefaults({
    ...answers,
    mode: "optimize",
    allowAgentInference: true,
    successCriteria:
      "建立 baseline；完成低风险优化；重新运行验证；证明质量提升且无行为回归",
    nonGoals: "不做无关重构，不追求抽象最优，不改变用户可观察行为",
    compatibility: "保持现有 API、命令、配置、数据格式和测试行为兼容",
    deliveryFormat:
      "最终输出 baseline、优化目标、优化前后对比、保留/放弃的优化、运行验证、剩余风险和回退建议。",
  });
}

async function promptAutoIterateConfig(mode, options = {}) {
  switch (mode) {
    case "quick":
      return promptQuickConfig(options);
    case "diagnose":
      return promptDiagnoseConfig(options);
    case "verify":
      return promptVerifyConfig(options);
    case "plan":
      return promptPlanConfig(options);
    case "optimize":
      return promptOptimizeConfig(options);
    case "prototype":
      return promptPrototypeConfig(options);
    case "strict":
    default:
      return promptStrictConfig(options);
  }
}

async function promptAutoIterateConfigFromFile(source, mode, options = {}) {
  const config = getModeConfig(mode);
  const prompts = [
    {
      type: "input",
      name: "goal",
      message: mode === "verify" ? "验收目标摘要（原始文档会完整保留）:" : "用户目标摘要（用于状态索引，原始清单会完整保留）:",
      default: options.goal || "见原始清单文档",
    },
    {
      type: "editor",
      name: "successCriteria",
      message: "成功标准摘要（每行一条；可从清单中提炼，原始清单会完整保留）:",
      default: mode === "verify"
        ? "逐项验证原始清单文档是否已由现有实现满足"
        : "以原始清单文档为准",
    },
    {
      type: "input",
      name: "allowedScope",
      message: mode === "verify" ? "验收范围 / 关注文件:" : "允许修改范围:",
      default: mode === "verify"
        ? "现有实现、测试、文档和与原始清单直接相关的文件"
        : "以原始清单文档为准；未明确时仅修改与本次需求直接相关的代码、测试、类型和文档",
    },
    {
      type: "editor",
      name: "validationCommands",
      message: "可运行的验证命令（每行一条）:",
      default: mode === "verify"
        ? "由 Agent 自动识别；缺失时标记 not_verified"
        : "npm test\nnpm run build\nnpm run typecheck",
    },
    {
      type: "editor",
      name: "constraints",
      message: "外部资源、密钥、数据库、网络或沙箱限制（每行一条，可留空）:",
      default: DEFAULT_CONSTRAINTS,
    },
  ];

  if (mode === "verify") {
    prompts.splice(3, 0, {
      type: "confirm",
      name: "allowModify",
      message: "是否允许 Agent 在发现问题后直接修复?（默认否，仅输出差距清单）",
      default: false,
    });
  }

  if (mode === "prototype") {
    prompts.splice(3, 0, {
      type: "list",
      name: "prototypeKind",
      message: "原型类型:",
      choices: [
        { name: "逻辑原型：状态机 / 数据模型 / 业务流程", value: "logic" },
        { name: "UI 原型：页面 / 交互 / 信息架构方案", value: "ui" },
        { name: "由 Agent 根据原始文档和代码上下文判断", value: "auto" },
      ],
      default: "auto",
    });
  }

  prompts.push(
    {
      type: "input",
      name: "deliveryFormat",
      message: "交付格式:",
      default: DEFAULT_DELIVERY_FORMAT,
    },
    {
      type: "input",
      name: "maxIterations",
      message: "max_iterations:",
      default: String(options.maxIterations || config.defaultMaxIterations),
      validate: validatePositiveInteger,
      filter: (value) => formatNumber(value, config.defaultMaxIterations),
    },
    {
      type: "input",
      name: "autopilotMaxIterations",
      message: "autopilot_max_iterations:",
      default: String(
        options.autopilotMaxIterations || config.defaultAutopilotMaxIterations,
      ),
      validate: validatePositiveInteger,
      filter: (value) =>
        formatNumber(value, config.defaultAutopilotMaxIterations),
    },
  );

  const answers = await inquirer.prompt(prompts);

  const allowModify = mode === "verify" ? answers.allowModify : mode !== "plan";

  return withModeDefaults({
    ...answers,
    mode,
    allowAgentInference: mode !== "strict",
    allowModify,
    nonGoals: mode === "verify"
      ? "不修改项目文件；不把差距修复伪装成验收结果"
      : mode === "plan"
        ? "不写代码，不修改项目文件，不执行破坏性操作"
        : mode === "prototype"
          ? "不把原型直接当生产实现交付；不连接生产数据库或生产写操作；不为原型做大范围抽象"
          : "以原始清单文档为准",
    compatibility: "以原始清单文档为准",
    sourceChecklist: source.content,
    sourceChecklistPath: toRelativeSourcePath(source.path),
  });
}

const NATURAL_LANGUAGE_EXAMPLES = [
  {
    title: "快速启动开发任务",
    keywords: ["quick", "快速", "启动", "修复", "开发"],
    examples: [
      "帮我快速启动自动迭代，修复登录失败问题，session 叫 login-bugfix",
      "快速开始修复用户登录失败，最多跑 5 轮，session 叫 login-fix",
      "开一个自动迭代任务，实现用户登录功能，session 叫 user-login",
      "帮我自动推进这个问题：订单列表分页错误，最多迭代 8 次",
      "启动快速自动迭代，目标是修复支付回调重复处理问题",
    ],
  },
  {
    title: "严格按文档完整实现",
    keywords: ["strict", "严格", "文档", "PRD", "完整实现", "docs"],
    examples: [
      "完整实现 docs/prd.md 里的所有需求，session 叫 prd-implement",
      "严格按照 docs/ai-checklist.md 实现，不要遗漏任何需求，最多跑 10 轮",
      "根据 docs/login.md 全部实现登录模块，session 叫 login-prd",
      "按这个 PRD 完整做完：docs/payment-prd.md",
      "把 docs/order.md 文档里的需求都做完，使用严格启动模式",
    ],
  },
  {
    title: "Verify-only：只检查/验收，不修改代码",
    keywords: ["verify", "验收", "检查", "验证", "不修改", "PRD"],
    examples: [
      "帮我验收 docs/prd.md 是否都实现了，不要修改代码，session 叫 prd-check",
      "检查当前实现是否满足 docs/login.md，不能改代码",
      "验证这个 PRD 是否已经完成：docs/payment-prd.md",
      "只检查订单模块是否满足需求，不要修复，最多跑 3 轮",
      "帮我做一次 Verify-only，检查登录功能是否完整实现",
    ],
  },
  {
    title: "Diagnose：困难 bug / 性能回归",
    keywords: ["diagnose", "debug", "诊断", "调试", "复现", "性能回归", "bug"],
    examples: [
      "帮我诊断这个登录偶发失败问题，先建立复现闭环，session 叫 login-diagnose",
      "Diagnose 当前 npm test 失败，最多跑 8 轮，session 叫 test-diagnose",
      "调试订单导出性能回归，先建立 baseline 和可重复验证",
      "帮我 debug 支付回调重复处理问题，不要猜修复，先复现",
      "诊断这个 flaky e2e，尽量提高复现率并列出假设",
    ],
  },
  {
    title: "Plan-only：只规划，不写代码",
    keywords: ["plan", "规划", "计划", "不要写代码", "不修改"],
    examples: [
      "只帮我规划订单模块重构，不要写代码",
      "先规划实现用户权限系统，不要修改任何文件",
      "帮我制定支付模块改造计划，先不要实现",
      "Plan-only：分析如何实现消息通知功能",
      "只输出实现计划、风险和验证策略，不进入编码",
    ],
  },
  {
    title: "Prototype-only：一次性原型澄清",
    keywords: ["prototype", "proto", "原型", "试一下", "状态机", "UI 方案", "交互"],
    examples: [
      "先做一个逻辑原型验证订单状态机，不要直接实现生产代码",
      "Prototype：给设置页做 3 个 UI 方案，通过 variant 切换",
      "帮我做一次性原型，验证这个数据模型是否能表达退款流程",
      "先让我玩一下这个交互流程原型，结论确认后再实现",
      "做一个 UI 原型比较仪表盘的几种信息架构，不能影响生产构建",
    ],
  },
  {
    title: "Optimization-only：优化但保持行为不变",
    keywords: ["optimize", "优化", "重构", "性能", "可维护性"],
    examples: [
      "优化登录模块代码结构，但不要改变外部行为",
      "优化订单查询性能，先建立 baseline，最多跑 5 轮",
      "提升支付模块可维护性，不要新增依赖",
      "帮我做一次 Optimization-only，目标是减少重复代码",
      "优化这个模块的类型定义和命名，保持 API 兼容",
    ],
  },
  {
    title: "一直修到通过 / Autopilot",
    keywords: ["autopilot", "一直", "通过", "测试", "全自动"],
    examples: [
      "一直修到测试通过，最多跑 10 轮，session 叫 fix-tests",
      "全自动修复当前构建错误，直到通过或触发停止条件",
      "帮我自动迭代修复 npm test 失败，最多迭代 8 次",
      "不要每轮问我，自动修到验证通过，session 叫 auto-fix",
      "进入 Autopilot，修复所有类型检查错误",
    ],
  },
  {
    title: "session 管理",
    keywords: ["session", "会话", "恢复", "切换", "列出", "list", "resume", "switch"],
    examples: [
      "列出所有自动迭代任务",
      "查看当前有哪些 auto-iterate session",
      "恢复登录修复任务",
      "恢复 session login-bugfix",
      "切换到 login-verify 这个 session",
      "继续上次的自动迭代任务",
    ],
  },
  {
    title: "组合场景",
    keywords: ["组合", "预算", "最多", "依赖", "数据库"],
    examples: [
      "帮我快速启动自动迭代，目标是修复登录失败，最多跑 5 轮，session 叫 login-bugfix，不要新增依赖",
      "严格按照 docs/prd.md 完整实现，Autopilot 预算 10 轮，session 叫 prd-impl，不要连接生产数据库",
      "帮我验收 docs/login.md 是否都实现了，不要修改代码，最多跑 3 轮，session 叫 login-check",
      "只规划支付模块重构，不要写代码，session 叫 payment-plan，输出风险和验证策略",
      "优化订单查询性能，保持 API 兼容，最多跑 5 轮，session 叫 order-query-optimize",
    ],
  },
];

function showNaturalLanguageExamples(query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const sections = normalizedQuery
    ? NATURAL_LANGUAGE_EXAMPLES.filter((section) => {
        const haystack = [
          section.title,
          ...section.keywords,
          ...section.examples,
        ]
          .join("\n")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : NATURAL_LANGUAGE_EXAMPLES;

  if (sections.length === 0) {
    console.log(`未找到匹配的自然语言场景: ${query}`);
    console.log("可尝试关键词：快速、文档、验收、诊断、原型、规划、优化、测试、session、预算");
    return;
  }

  console.log("# auto-iterate 自然语言触发示例\n");
  console.log("把下面任意一句发给 Agent，Agent 应自动路由到 fastcar-cli auto-iterate ... --yes。\n");
  console.log("自然语言路由必须每次生成独立 session：用户已指定时使用该 session；用户未指定时，由 Agent 根据模式和目标生成英文小写、数字和连字符组成的默认 session，并在命令中显式追加 --session <name>。\n");
  sections.forEach((section) => {
    console.log(`## ${section.title}\n`);
    section.examples.forEach((example) => {
      console.log(example);
    });
    console.log("");
  });
}

async function resolveMode(options) {
  if (options.mode) {
    return options.mode;
  }

  if (options.from) {
    return "strict";
  }

  return promptMode("strict");
}

async function initAutoIterate(args = []) {
  const options = parseArgs(args);

  if (options.examples) {
    showNaturalLanguageExamples(options.query);
    return;
  }

  if (options.list) {
    await listSessions();
    return;
  }

  if (options.switchSession) {
    await activateSession(options.switchSession, "switch");
    return;
  }

  if (options.resumeSession) {
    await activateSession(options.resumeSession, "resume");
    return;
  }

  console.log("🚀 初始化 auto-iterate-coding 启动文件");
  console.log("可选择严格启动、快速启动、Diagnose、Verify-only、Plan-only、Optimization-only 或 Prototype-only。");
  console.log("也可以使用: fastcar-cli auto-iterate --from <清单文档路径>\n");

  const mode = await resolveMode(options);
  if (!mode || !MODE_CONFIGS[mode]) {
    console.log("❌ 无效启动模式，请使用 strict / quick / diagnose / verify / plan / optimize / prototype");
    return;
  }

  const source = options.from ? await readChecklistFile(options.from) : null;
  const rawAnswers = options.yes
    ? buildNonInteractiveConfig(mode, options, source)
    : source
      ? await promptAutoIterateConfigFromFile(source, mode, options)
      : await promptAutoIterateConfig(mode, options);
  const sessionName = options.session
    ? slugifySessionName(options.session)
    : await makeUniqueSessionName(buildDefaultSessionName(rawAnswers));
  const sessionPaths = getSessionPaths(sessionName);
  const answers = withSessionDefaults(rawAnswers, sessionPaths);

  if (await pathExists(sessionPaths.sessionDir)) {
    if (options.yes) {
      console.log(`❌ session 已存在，非交互模式不会覆盖: ${sessionPaths.session}`);
      console.log("   请换一个 --session，或先使用 --resume / --switch。");
      return;
    }

    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: `检测到已存在的 auto-iterate session "${sessionPaths.session}"，是否覆盖?`,
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log("已取消生成，未修改现有 session。");
      return;
    }
  }

  await fs.promises.mkdir(sessionPaths.sessionDir, { recursive: true });
  await fs.promises.mkdir(sessionPaths.stateDir, { recursive: true });
  const promptContent = buildPromptContent(answers);
  await fs.promises.writeFile(
    sessionPaths.sessionStatePath,
    buildStateContent(answers),
    "utf8",
  );
  await fs.promises.writeFile(
    sessionPaths.sessionPromptPath,
    promptContent,
    "utf8",
  );
  await writeCurrentFile(sessionPaths, answers);

  console.log(promptContent);
}

module.exports = {
  initAutoIterate,
};
