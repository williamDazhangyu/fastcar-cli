const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const inquirer = require("inquirer");

const STATE_DIR = ".agent-state";
const SESSION_ROOT_DIR = "auto-iterate";
const CURRENT_FILE = "auto-iterate-current.json";
const SESSION_STATE_JSON_FILE = "state.json";
const SESSION_STATE_FILE = "state.md";
const SESSION_PROMPT_FILE = "start-prompt.md";
const STATE_SCHEMA_VERSION = 1;

const REQUIRED_STATE_SECTIONS = [
  "## At-a-Glance / 人类摘要",
  "## Task / 任务",
  "## Session / 会话",
  "## Mode / 模式",
  "## Agent Capability Summary",
  "## Sub-Agent Dispatch / 子 Agent 调度",
  "## Budgets / 预算",
  "## Recovery / Reconcile / 恢复一致性检查",
  "## Current State / 当前状态",
  "## Watchdog / 看门狗",
  "## Requirement Coverage Matrix / 需求覆盖矩阵",
  "## Definition of Done / 完成定义",
  "## Decisions / 已确认决策",
  "## Hypotheses / 假设",
  "## Validation / 验证",
  "## Temporary Artifacts / Cleanup / 临时产物清理",
  "## Context Handoff Summary / 上下文交接摘要",
  "## Resume Prompt / 恢复提示",
];

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

const DISPATCH_AGENT_CONFIGS = {
  codex: {
    label: "Codex",
    env: "AUTO_ITERATE_CODEX_CMD",
    aliases: ["codex", "codex-cli"],
  },
  claude: {
    label: "Claude Code",
    env: "AUTO_ITERATE_CLAUDE_CMD",
    aliases: ["claude", "claude-code", "claude_code"],
  },
  gemini: {
    label: "Gemini CLI",
    env: "AUTO_ITERATE_GEMINI_CMD",
    aliases: ["gemini", "gemini-cli", "gemini_cli"],
  },
  kimi: {
    label: "Kimi Code",
    env: "AUTO_ITERATE_KIMI_CMD",
    aliases: ["kimi", "kimi-code", "kimi_code"],
  },
  cursor: {
    label: "Cursor",
    env: "AUTO_ITERATE_CURSOR_CMD",
    aliases: ["cursor", "cursor-agent", "cursor_agent"],
  },
  windsurf: {
    label: "Windsurf",
    env: "AUTO_ITERATE_WINDSURF_CMD",
    aliases: ["windsurf", "windsurf-cascade", "cascade"],
  },
  copilot: {
    label: "GitHub Copilot",
    env: "AUTO_ITERATE_COPILOT_CMD",
    aliases: ["copilot", "github-copilot", "github_copilot"],
  },
  jules: {
    label: "Google Jules",
    env: "AUTO_ITERATE_JULES_CMD",
    aliases: ["jules", "google-jules", "google_jules"],
  },
  devin: {
    label: "Devin",
    env: "AUTO_ITERATE_DEVIN_CMD",
    aliases: ["devin"],
  },
  openhands: {
    label: "OpenHands",
    env: "AUTO_ITERATE_OPENHANDS_CMD",
    aliases: ["openhands", "open-hands", "open_hands"],
  },
  replit: {
    label: "Replit Agent",
    env: "AUTO_ITERATE_REPLIT_CMD",
    aliases: ["replit", "replit-agent", "replit_agent"],
  },
};

const DISPATCH_AGENT_ALIAS_MAP = Object.entries(DISPATCH_AGENT_CONFIGS).reduce(
  (aliases, [key, config]) => {
    for (const alias of config.aliases) {
      aliases[alias] = key;
    }
    return aliases;
  },
  {},
);

const OPTIONS_WITH_REQUIRED_VALUE = new Set([
  "-f",
  "--from",
  "--goal",
  "--session",
  "--switch",
  "--resume",
  "--mode",
  "--max-iterations",
  "--autopilot-max-iterations",
  "--agent",
  "--task",
  "--files",
  "--verify-command",
  "--verify-cmd",
  "--timeout",
]);

const OPTIONS_WITH_OPTIONAL_VALUE = new Set([
  "--dispatch",
  "--examples",
  "--validate-state",
]);

function isConsumedOptionValue(args, index) {
  if (index <= 0 || String(args[index] || "").startsWith("-")) {
    return false;
  }

  const previous = String(args[index - 1] || "");
  return OPTIONS_WITH_REQUIRED_VALUE.has(previous) || OPTIONS_WITH_OPTIONAL_VALUE.has(previous);
}

function normalizeGoalText(value) {
  return String(value || "")
    .trim()
    .replace(/^(goal|目标|用户目标)\s*[:：]\s*/i, "")
    .trim();
}

function inferGoalFromPositionals(args) {
  const positionals = args.filter((arg, index) => {
    const value = String(arg || "").trim();
    return value && !value.startsWith("-") && !isConsumedOptionValue(args, index);
  });

  return positionals.length > 0 ? normalizeGoalText(positionals.join(" ")) : null;
}

function parseArgs(args = []) {
  const options = {
    from: null,
    mode: null,
    goal: null,
    session: null,
    list: false,
    switchSession: null,
    resumeSession: null,
    validateState: null,
    strictState: false,
    dispatchSession: null,
    agent: "codex",
    task: null,
    files: null,
    verifyCommand: null,
    timeoutSeconds: 300,
    dryRun: false,
    maxIterations: null,
    autopilotMaxIterations: null,
    yes: false,
    examples: false,
    query: null,
  };

  args.forEach((arg, index) => {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      return;
    }

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

    if (arg === "--validate-state") {
      options.validateState = args[index + 1] && !args[index + 1].startsWith("-")
        ? args[index + 1]
        : "__current__";
      return;
    }

    if (arg.startsWith("--validate-state=")) {
      options.validateState = arg.slice("--validate-state=".length) || "__current__";
      return;
    }

    if (arg === "--dispatch") {
      options.dispatchSession = args[index + 1] && !args[index + 1].startsWith("-")
        ? args[index + 1]
        : "__current__";
      return;
    }

    if (arg.startsWith("--dispatch=")) {
      options.dispatchSession = arg.slice("--dispatch=".length) || "__current__";
      return;
    }

    if (arg === "--agent" && args[index + 1]) {
      options.agent = args[index + 1];
      return;
    }

    if (arg.startsWith("--agent=")) {
      options.agent = arg.slice("--agent=".length);
      return;
    }

    if (arg === "--task" && args[index + 1]) {
      options.task = args[index + 1];
      return;
    }

    if (arg.startsWith("--task=")) {
      options.task = arg.slice("--task=".length);
      return;
    }

    if (arg === "--files" && args[index + 1]) {
      options.files = args[index + 1];
      return;
    }

    if (arg.startsWith("--files=")) {
      options.files = arg.slice("--files=".length);
      return;
    }

    if ((arg === "--verify-command" || arg === "--verify-cmd") && args[index + 1]) {
      options.verifyCommand = args[index + 1];
      return;
    }

    if (arg.startsWith("--verify-command=")) {
      options.verifyCommand = arg.slice("--verify-command=".length);
      return;
    }

    if (arg.startsWith("--verify-cmd=")) {
      options.verifyCommand = arg.slice("--verify-cmd=".length);
      return;
    }

    if (arg === "--timeout" && args[index + 1]) {
      options.timeoutSeconds = formatNumber(args[index + 1], 300);
      return;
    }

    if (arg.startsWith("--timeout=")) {
      options.timeoutSeconds = formatNumber(arg.slice("--timeout=".length), 300);
      return;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      return;
    }

    if (arg === "--strict-state" || arg === "--strict-validate" || arg === "--strict-validation") {
      options.strictState = true;
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

  if (!options.goal) {
    options.goal = inferGoalFromPositionals(args);
  }

  return options;
}

function showAutoIterateHelp() {
  const supportedAgents = Object.keys(DISPATCH_AGENT_CONFIGS).join("|");
  console.log(`Usage: fastcar-cli auto-iterate [options]

Modes:
  --strict | --quick | --diagnose | --verify | --plan-only | --optimize | --prototype

Session:
  --session <name>
  --list
  --switch <name>
  --resume <name>
  --validate-state [session|state.md|state.json]
  --strict-state

Dispatch:
  --dispatch <session> --agent <${supportedAgents}> --task <text> --files <glob[,glob]> [--verify-command <cmd>] [--timeout <seconds>] [--dry-run]

Other:
  --goal <text>
  --from <file>
  --max-iterations <n>
  --autopilot-max-iterations <n>
  --yes
  --examples [keyword]
`);
}

function normalizeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return MODE_ALIASES[normalized] || null;
}

function normalizeDispatchAgent(value) {
  const normalized = String(value || "codex").trim().toLowerCase();
  return DISPATCH_AGENT_ALIAS_MAP[normalized] || null;
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
    sessionStateJsonPath: path.join(sessionDir, SESSION_STATE_JSON_FILE),
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

function extractSection(content, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^${escapedHeading}\\s*\\r?\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`,
    "m",
  );
  const match = content.match(pattern);
  return match && match[1] ? match[1].trimEnd() : "";
}

function extractFirstSection(content, headings) {
  for (const heading of headings) {
    const section = extractSection(content, heading);
    if (section) {
      return section;
    }
  }
  return "";
}

function parseScalar(section, fieldName, fallback = "") {
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*${escapedField}：([^\\r\\n]*)`, "m");
  const match = section.match(pattern);
  return match && match[1] ? match[1].trim() : fallback;
}

function parseSubAgentList(section, fieldName) {
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^${escapedField}：\\s*\\r?\\n([\\s\\S]*?)(?=^${escapedField}_item_template：|^[^\\s].*：|^##\\s|(?![\\s\\S]))`,
    "m",
  );
  const match = section.match(pattern);
  if (!match || !match[1]) {
    const inlineValue = parseScalar(section, fieldName, "");
    return inlineValue && !inlineValue.startsWith("无") ? [{ raw: inlineValue }] : [];
  }

  const block = match[1];
  if (!block.trim() || block.trim().startsWith("无")) {
    return [];
  }

  return block
    .split(/\r?\n(?=\s*-\s+)/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const item = { raw: entry };
      for (const line of entry.split(/\r?\n/)) {
        const normalized = line.replace(/^\s*-\s*/, "").trim();
        const fieldMatch = normalized.match(/^([^：]+)：(.*)$/);
        if (fieldMatch) {
          item[fieldMatch[1].trim()] = fieldMatch[2].trim();
        }
      }
      return item;
    });
}

function splitAssignedFiles(value) {
  return String(value || "")
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !["无", "未分配", "not_run", "N/A"].includes(item));
}

function expectedSubAgentTypesForPhase(currentPhase) {
  switch (currentPhase) {
    case "explore":
    case "req_extract":
      return ["explore"];
    case "verify":
      return ["background"];
    case "implement":
      return ["coder"];
    default:
      return [];
  }
}

function missingSubAgentFields(agent, requiredFields) {
  return requiredFields.filter((field) => {
    const value = agent[field];
    return !value || value === "无" || value === "未开始" || value === "未完成";
  });
}

function addIssue(issues, severity, message) {
  issues.push({ severity, message });
}

function addError(issues, message) {
  addIssue(issues, "error", message);
}

function addWarning(issues, message) {
  addIssue(issues, "warning", message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requirePlainObject(issues, value, label) {
  if (!isPlainObject(value)) {
    addError(issues, `${label} 必须是对象`);
    return false;
  }
  return true;
}

function requireArray(issues, value, label) {
  if (!Array.isArray(value)) {
    addError(issues, `${label} 必须是数组`);
    return false;
  }
  return true;
}

function requireNonEmptyString(issues, value, label) {
  if (typeof value !== "string" || !value) {
    addError(issues, `${label} 必须是非空字符串`);
    return false;
  }
  return true;
}

function requireBoolean(issues, value, label) {
  if (typeof value !== "boolean") {
    addError(issues, `${label} 必须是 boolean`);
    return false;
  }
  return true;
}

function requireNonNegativeInteger(issues, value, label) {
  if (!Number.isInteger(value) || value < 0) {
    addError(issues, `${label} 必须是非负整数`);
    return false;
  }
  return true;
}

function requireEnumValue(issues, value, allowedValues, label) {
  if (!allowedValues.includes(value)) {
    addError(issues, `${label}=${value || "missing"} 不是合法值`);
    return false;
  }
  return true;
}

function requireFields(issues, source, fieldNames, labelPrefix, validator) {
  fieldNames.forEach((fieldName) => {
    validator(issues, source ? source[fieldName] : undefined, `${labelPrefix}.${fieldName}`);
  });
}

function requireNonNegativeIntegerFields(issues, source, fieldNames, labelPrefix) {
  requireFields(issues, source, fieldNames, labelPrefix, requireNonNegativeInteger);
}

function requireBooleanFields(issues, source, fieldNames, labelPrefix) {
  requireFields(issues, source, fieldNames, labelPrefix, requireBoolean);
}

function requireNonEmptyStringFields(issues, source, fieldNames, labelPrefix) {
  requireFields(issues, source, fieldNames, labelPrefix, requireNonEmptyString);
}

function addPathMismatchError(issues, label, actualPath, expectedPath) {
  addError(issues, `${label}=${actualPath || "missing"}，未指向 ${expectedPath}`);
}

function requireNormalizedPath(issues, actualPath, expectedPath, label) {
  if (normalizeRelativePathForCompare(actualPath) !== expectedPath) {
    addPathMismatchError(issues, label, actualPath, expectedPath);
    return false;
  }
  return true;
}

function validateBudgetRelationships(issues, budgets, labelPrefix) {
  if (budgets.minimumImplementationIterations !== null &&
    (!Number.isInteger(budgets.minimumImplementationIterations) || budgets.minimumImplementationIterations < 1)) {
    addError(issues, `${labelPrefix}.minimumImplementationIterations 必须为 null 或正整数`);
  }
  if (Number.isInteger(budgets.totalCycles) &&
    Number.isInteger(budgets.implementationIterationsUsed) &&
    Number.isInteger(budgets.optimizationIterationsUsed) &&
    budgets.totalCycles !== budgets.implementationIterationsUsed + budgets.optimizationIterationsUsed) {
    addError(issues, `${labelPrefix}.totalCycles=${budgets.totalCycles}，但 implementationIterationsUsed + optimizationIterationsUsed=${budgets.implementationIterationsUsed + budgets.optimizationIterationsUsed}`);
  }
  if (Number.isInteger(budgets.minimumImplementationIterations) &&
    Number.isInteger(budgets.maxIterations) &&
    budgets.minimumImplementationIterations > budgets.maxIterations) {
    addError(issues, `${labelPrefix}.minimumImplementationIterations=${budgets.minimumImplementationIterations} 大于 maxIterations=${budgets.maxIterations}`);
  }
}

function countJsonRequirementStates(requirements) {
  const counts = {
    passed: 0,
    pending: 0,
    implemented: 0,
    notVerified: 0,
    blocked: 0,
  };
  requirements.forEach((item) => {
    if (item.status === "passed") {
      counts.passed += 1;
    } else if (item.status === "pending") {
      counts.pending += 1;
    } else if (item.status === "implemented") {
      counts.implemented += 1;
    } else if (item.status === "not_verified") {
      counts.notVerified += 1;
    } else if (item.status === "blocked") {
      counts.blocked += 1;
    }
  });
  return counts;
}

function hasOpenRequirementCounts(counts) {
  return counts.pending > 0 ||
    counts.implemented > 0 ||
    counts.notVerified > 0 ||
    counts.blocked > 0;
}

function compareCurrentPointerToExpected(issues, current, expectedSession, expectedStatePath, expectedPromptPath, stateFileInState, promptFileInState) {
  const currentStateFile = normalizeRelativePathForCompare(current.stateFile);
  const currentPromptFile = normalizeRelativePathForCompare(current.promptFile);
  if (currentStateFile !== expectedStatePath) {
    addError(issues, `auto-iterate-current.json.stateFile=${current.stateFile}，未指向 ${expectedStatePath}`);
  }
  if (currentPromptFile !== expectedPromptPath) {
    addError(issues, `auto-iterate-current.json.promptFile=${current.promptFile}，未指向 ${expectedPromptPath}`);
  }
  if (stateFileInState && currentStateFile !== normalizeRelativePathForCompare(stateFileInState)) {
    addError(issues, `auto-iterate-current.json.stateFile=${current.stateFile}，与 Session.状态文件=${stateFileInState} 不一致`);
  }
  if (promptFileInState && currentPromptFile !== normalizeRelativePathForCompare(promptFileInState)) {
    addError(issues, `auto-iterate-current.json.promptFile=${current.promptFile}，与 Session.启动提示=${promptFileInState} 不一致`);
  }
  if (current.session !== expectedSession) {
    addError(issues, `current.session=${current.session || "unknown"} 与 state.md session=${expectedSession} 不一致`);
  }
}

async function resolveStateFileForValidation(target) {
  const paths = getStatePaths();
  if (!target || target === "__current__") {
    const current = await readJsonFile(paths.currentPath);
    if (!current || !current.stateFile) {
      throw new Error("未找到 current 指针，请传入 --validate-state <session|state.md>");
    }
    return {
      stateFile: path.resolve(process.cwd(), current.stateFile),
      stateJsonFile: current.stateJsonFile
        ? path.resolve(process.cwd(), current.stateJsonFile)
        : path.resolve(process.cwd(), current.stateFile).replace(/state\.md$/, "state.json"),
      current,
      currentPath: paths.currentPath,
      session: current.session || "unknown",
      targetType: "current",
    };
  }

  if (target.endsWith(".md") || target.endsWith(".json") || target.includes("/") || target.includes("\\")) {
    const resolved = path.resolve(process.cwd(), target);
    const stateFile = target.endsWith(".json")
      ? resolved.replace(/state\.json$/, "state.md")
      : resolved;
    const stateJsonFile = target.endsWith(".json")
      ? resolved
      : resolved.replace(/state\.md$/, "state.json");
    return {
      stateFile,
      stateJsonFile,
      current: await readJsonFile(paths.currentPath),
      currentPath: paths.currentPath,
      session: null,
      targetType: "path",
    };
  }

  const sessionPaths = getSessionPaths(target);
  if (!(await pathExists(sessionPaths.sessionStatePath))) {
    throw new Error(`未找到 session state: ${sessionPaths.session} (${toRelative(sessionPaths.sessionStatePath)})`);
  }
  return {
    stateFile: sessionPaths.sessionStatePath,
    stateJsonFile: sessionPaths.sessionStateJsonPath,
    current: await readJsonFile(paths.currentPath),
    currentPath: paths.currentPath,
    session: sessionPaths.session,
    targetType: "session",
  };
}

function validateSubAgentDispatchState(content) {
  const issues = [];
  const dispatch = extractSection(content, "## Sub-Agent Dispatch / 子 Agent 调度");
  const decisions = extractSection(content, "## Decisions / 已确认决策") ||
    extractSection(content, "## Decisions");
  const rcm = extractSection(content, "## Requirement Coverage Matrix / 需求覆盖矩阵") ||
    extractSection(content, "## Requirement Coverage Matrix");

  if (!dispatch) {
    return {
      issues: [
        {
          severity: "error",
          message: "缺少 ## Sub-Agent Dispatch / 子 Agent 调度 章节",
        },
      ],
    };
  }

  const currentPhase = parseScalar(dispatch, "current_phase", "unknown");
  const enabled = parseScalar(dispatch, "enabled", "unknown");
  const lastMergeResult = parseScalar(dispatch, "last_merge_result", "unknown");
  const failedCount = Number.parseInt(parseScalar(dispatch, "failed_count", "0"), 10) || 0;
  const completedCount = Number.parseInt(parseScalar(dispatch, "completed_count", "0"), 10) || 0;
  const dispatchedCount = Number.parseInt(parseScalar(dispatch, "dispatched_count", "0"), 10) || 0;
  const maxFailed = Number.parseInt(parseScalar(dispatch, "max_failed_sub_agents", "2"), 10) || 2;
  const active = parseSubAgentList(dispatch, "active_sub_agents");
  const history = parseSubAgentList(dispatch, "sub_agent_history");
  const parallelWriteAllowed = parseScalar(decisions, "parallel_write_allowed", "false");
  const ownership = parseScalar(decisions, "coder_file_ownership", "");
  const enabledValue = String(enabled).trim();
  const enabledIsTrue = enabledValue.startsWith("true");
  const expectedTypes = expectedSubAgentTypesForPhase(currentPhase);

  if (enabledIsTrue && currentPhase === "idle" && active.length > 0) {
    addError(issues, "current_phase=idle 时 active_sub_agents 必须为空");
  }

  if (!enabledIsTrue && active.length > 0) {
    addError(issues, "enabled 非 true 时不得存在 active_sub_agents");
  }

  if (active.length > 0 && currentPhase === "idle") {
    addError(issues, "active_sub_agents 非空时不得处于 idle，也不得开始新 dispatch");
  }

  const coderFileOwners = new Map();
  for (const agent of active) {
    const type = agent.type || "";
    const status = agent.status || "";
    const mergeStatus = agent.merge_status || "";
    const agentId = agent.id || agent.raw;
    const missingFields = missingSubAgentFields(agent, ["id", "type", "task", "files_assigned", "status", "merge_status"]);

    if (missingFields.length > 0) {
      addError(issues, `子 Agent ${agentId} 缺少必要字段: ${missingFields.join(", ")}`);
    }

    if (expectedTypes.length > 0 && type && !expectedTypes.includes(type)) {
      addError(issues, `current_phase=${currentPhase} 与子 Agent ${agentId} type=${type} 不一致`);
    }

    if ((status === "completed" || status === "failed") && mergeStatus === "pending") {
      addWarning(issues, `子 Agent ${agentId} 已结束但 merge_status 仍为 pending，进入下一轮前必须 merged 或 skipped`);
    }

    if (type === "coder") {
      const files = splitAssignedFiles(agent.files_assigned);
      if (files.length === 0) {
        addError(issues, `coder 子 Agent ${agentId} 缺少 files_assigned 白名单`);
      }

      for (const file of files) {
        if (coderFileOwners.has(file)) {
          addError(issues, `coder files_assigned 冲突: ${file} 同时分配给 ${coderFileOwners.get(file)} 和 ${agentId}`);
        } else {
          coderFileOwners.set(file, agentId);
        }
      }
    }
  }

  const hasActiveCoder = active.some((agent) => agent.type === "coder");
  if (hasActiveCoder) {
    if (!String(parallelWriteAllowed).includes("true")) {
      addError(issues, "存在 active coder 子 Agent，但 Decisions.parallel_write_allowed 未确认为 true");
    }
    if (!ownership || ownership === "未分配") {
      addError(issues, "存在 active coder 子 Agent，但 coder_file_ownership 未记录 ownership");
    }
  }

  if (failedCount >= maxFailed && hasActiveCoder) {
    addError(issues, "failed_count 已达到 max_failed_sub_agents，后续不得继续 dispatch coder 子 Agent");
  }

  const allAgents = [...active, ...history];
  const observedCompletedCount = allAgents.filter((agent) => agent.status === "completed" || agent.merge_result === "success").length;
  const observedFailedCount = allAgents.filter((agent) => agent.status === "failed" || agent.merge_result === "skipped").length;
  if (dispatchedCount > 0 && dispatchedCount < allAgents.length) {
    addWarning(issues, "dispatched_count 小于 active_sub_agents + sub_agent_history 条目数，请确认计数已更新");
  }
  if (completedCount < observedCompletedCount) {
    addWarning(issues, "completed_count 小于已完成/成功合并的子 Agent 条目数，请确认计数已更新");
  }
  if (failedCount < observedFailedCount) {
    addWarning(issues, "failed_count 小于失败/跳过的子 Agent 条目数，请确认计数已更新");
  }

  if (/partial|failed/.test(lastMergeResult) && /状态：passed/.test(rcm)) {
    addWarning(issues, "last_merge_result 为 partial/failed 时发现 RCM passed，请确认没有错误推进需求状态");
  }

  if (active.some((agent) => /merged|skipped/.test(agent.merge_status || ""))) {
    addWarning(issues, "active_sub_agents 中存在已 merged/skipped 条目，merge 后应移入 sub_agent_history");
  }

  if (history.some((agent) => !agent.agent_id && !agent.id)) {
    addWarning(issues, "sub_agent_history 中存在缺少 agent_id 的记录，恢复审计可能不完整");
  }

  return { issues };
}

function stateHeadingExists(content, heading) {
  const baseHeading = heading.split(" / ")[0];
  const escapedHeading = baseHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedHeading}(?:\\s*/.*)?\\s*$`, "m");
  return pattern.test(content);
}

function parseStateNumber(section, fieldName, fallback = 0) {
  const value = parseScalar(section, fieldName, "");
  const match = String(value).match(/-?\d+/);
  if (!match) {
    return fallback;
  }
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseStateBoolean(section, fieldName, fallback = false) {
  const value = parseScalar(section, fieldName, String(fallback));
  if (String(value).trim().startsWith("true")) {
    return true;
  }
  if (String(value).trim().startsWith("false")) {
    return false;
  }
  return fallback;
}

function parseStateList(section, fieldName) {
  const value = parseScalar(section, fieldName, "");
  return String(value)
    .split(/[、,，/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFileList(value) {
  return String(value || "")
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getIsoTimestamp() {
  return new Date().toISOString();
}

function makeAgentId(agent, session) {
  const stamp = getIsoTimestamp()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  return slugifySessionName(`${agent || "agent"}-${session || "session"}-${stamp}`);
}

function selectVerifyCommand(stateJson, fallback) {
  if (fallback) {
    return fallback;
  }
  const commands = stateJson && stateJson.validation && Array.isArray(stateJson.validation.commands)
    ? stateJson.validation.commands
    : [];
  return commands.find(Boolean) || "未指定";
}

function getDispatchDir(sessionPaths) {
  return path.join(sessionPaths.sessionDir, "dispatch");
}

function getDispatchWorktreeDir(sessionPaths, agentId) {
  return path.join(sessionPaths.sessionDir, "worktrees", agentId);
}

function runGit(args, options = {}) {
  const cwd = options.cwd || process.cwd();
  const safeDirectory = path.resolve(cwd).replace(/\\/g, "/");
  return spawnSync("git", ["-c", `safe.directory=${safeDirectory}`, ...args], {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    shell: false,
  });
}

async function createDispatchWorktree(sessionPaths, agentId) {
  const repoCheck = runGit(["rev-parse", "--is-inside-work-tree"]);
  if (repoCheck.status !== 0 || String(repoCheck.stdout).trim() !== "true") {
    throw new Error("当前目录不是 git worktree，不能执行隔离 worker；请使用 --dry-run 或在 git 仓库中运行");
  }

  const worktreeDir = getDispatchWorktreeDir(sessionPaths, agentId);
  await fs.promises.mkdir(path.dirname(worktreeDir), { recursive: true });
  if (await pathExists(worktreeDir)) {
    throw new Error(`dispatch worktree 已存在: ${toRelative(worktreeDir)}`);
  }

  const addResult = runGit(["worktree", "add", "--detach", worktreeDir, "HEAD"]);
  if (addResult.status !== 0) {
    throw new Error(`创建 git worktree 失败: ${addResult.stderr || addResult.stdout}`);
  }
  return worktreeDir;
}

function buildWorkerPrompt(options) {
  const files = options.files.join(", ");
  return `# auto-iterate worker task

你的角色：父 Agent 委派的 coder 子任务执行者，非独立 session。

Session：${options.session}
父协议：auto-iterate-coding
Agent：${options.agent}
任务：${options.task}
允许修改文件：${files}
验证命令：${options.verifyCommand}
超时：${options.timeoutSeconds} 秒

必须遵守：
- 只完成本子任务，不判断整体项目是否完成。
- 只能修改“允许修改文件”中的文件；不确定时先停止并在 blocked_reason 中说明。
- 禁止读取或写入 .agent-state/ 下任何文件，包括 state.json、state.md、start-prompt.md、auto-iterate-current.json。
- 不得写入密钥、token、密码或连接串。
- 不得执行破坏性 git 命令。
- 不得新增依赖，除非任务明确要求且父 Agent 已允许。
- 修改后运行验证命令；无法运行时说明原因，不得伪造验证。

请严格按以下 Sub-Agent Result Schema 输出：

agent_id：${options.agentId}
type：coder
status：completed / failed / blocked
files_changed：
validation：
risks：
blocked_reason：
handoff：
`;
}

function formatActiveSubAgentsBlock(agents) {
  if (!agents || agents.length === 0) {
    return "无";
  }

  return [
    "",
    ...agents.flatMap((agent) => [
      `  - id：${agent.id}`,
      `    type：${agent.type}`,
      `    task：${agent.task}`,
      `    files_assigned：${agent.filesAssigned.join(",")}`,
      `    status：${agent.status}`,
      `    failure_reason：${agent.failureReason}`,
      `    started_at：${agent.startedAt || "未开始"}`,
      `    completed_at：${agent.completedAt || "未开始"}`,
      `    result_summary：${agent.resultSummary}`,
      `    merge_status：${agent.mergeStatus}`,
    ]),
  ].join("\n");
}

function replaceSection(content, heading, nextHeadingPattern, replacementBody) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(${escapedHeading}\\s*\\r?\\n)([\\s\\S]*?)(?=${nextHeadingPattern})`,
    "m",
  );
  if (!pattern.test(content)) {
    return content;
  }
  return content.replace(pattern, `$1${replacementBody.trimEnd()}\n\n`);
}

function updateStateMarkdownForDispatch(content, dispatch) {
  const dispatchBody = `enabled：true
current_phase：${dispatch.phase}
active_sub_agents：${dispatch.activeBlock}
active_sub_agents_item_template：
  - id：<agent_id>
    type：explore / coder / background
    task：
    files_assigned：
    status：planned / running / completed / failed / blocked
    failure_reason：
    started_at：
    completed_at：
    result_summary：
    merge_status：pending / merged / skipped
sub_agent_history：${dispatch.historyBlock}
sub_agent_history_item_template：
  - round：1
    agent_id：<agent_id>
    type：explore / coder / background
    task_summary：
    merge_result：success / partial / skipped
    files_changed：
    validation_result：
    failure_reason：
dispatched_count：${dispatch.dispatchedCount}
completed_count：${dispatch.completedCount}
failed_count：${dispatch.failedCount}
last_dispatch_round：${dispatch.lastDispatchRound}
last_merge_result：${dispatch.lastMergeResult}
max_sub_agent_rounds：3
sub_agent_timeout_seconds：${dispatch.timeoutSeconds}
max_failed_sub_agents：2
token_budget_hint：未设置
concurrency_limit：3`;

  return replaceSection(
    content,
    "## Sub-Agent Dispatch / 子 Agent 调度",
    "^## Budgets / 预算",
    dispatchBody,
  );
}

function updateDecisionsMarkdownForDispatch(content, dispatch) {
  return content
    .replace(
      /parallel_write_allowed：.*$/m,
      `parallel_write_allowed：true`,
    )
    .replace(
      /parallel_write_confirmation：.*$/m,
      `parallel_write_confirmation：isolation worktree dispatch by parent Agent`,
    )
    .replace(
      /coder_file_ownership：.*$/m,
      `coder_file_ownership：${dispatch.activeSubAgents[0].id}=${dispatch.activeSubAgents[0].filesAssigned.join(",")}`,
    )
    .replace(
      /fallback_strategy：.*$/m,
      "fallback_strategy：worktree 不可用、worker 失败或 Quality Gate 不通过时转父 Agent 串行执行",
    );
}

function updateStateJsonForDispatch(stateJson, dispatch) {
  const now = getIsoTimestamp();
  const next = {
    ...stateJson,
    updatedAt: now,
    subAgentDispatch: {
      enabled: true,
      currentPhase: dispatch.phase,
      activeSubAgents: dispatch.activeSubAgents,
      subAgentHistory: dispatch.subAgentHistory,
      dispatchedCount: dispatch.dispatchedCount,
      completedCount: dispatch.completedCount,
      failedCount: dispatch.failedCount,
      lastDispatchRound: dispatch.lastDispatchRound,
      lastMergeResult: dispatch.lastMergeResult,
      maxSubAgentRounds: 3,
      subAgentTimeoutSeconds: dispatch.timeoutSeconds,
      maxFailedSubAgents: 2,
      concurrencyLimit: 3,
    },
  };

  next.currentState = {
    ...(next.currentState || {}),
    currentPhase: "dispatch_ready",
    currentTask: `委派 ${dispatch.agent} worker 执行: ${dispatch.task}`,
    nextAction: dispatch.dryRun
      ? "检查生成的 worker prompt；确认后可去掉 --dry-run 执行外部 Agent"
      : "等待 worker 完成并执行 Quality Gate",
    overallStatus: "in_progress",
  };

  next.watchdog = {
    ...(next.watchdog || {}),
    enabled: true,
    stateDrift: "none",
    triggered: false,
    requiredAction: "continue",
  };

  next.decisions = {
    ...(next.decisions || {}),
    parallelWriteAllowed: true,
    parallelWriteConfirmation: "isolation worktree dispatch by parent Agent",
    coderFileOwnership: `${dispatch.activeSubAgents[0].id}=${dispatch.activeSubAgents[0].filesAssigned.join(",")}`,
    fallbackStrategy: "worktree 不可用、worker 失败或 Quality Gate 不通过时转父 Agent 串行执行",
  };

  return next;
}

function hasUnmergedActiveSubAgents(stateJson) {
  const active = stateJson &&
    stateJson.subAgentDispatch &&
    Array.isArray(stateJson.subAgentDispatch.activeSubAgents)
    ? stateJson.subAgentDispatch.activeSubAgents
    : [];
  return active.some((agent) => agent && agent.mergeStatus !== "merged" && agent.mergeStatus !== "skipped");
}

async function initDispatch(options) {
  const target = options.dispatchSession || "__current__";
  const requestedAgent = String(options.agent || "codex").trim();
  const agent = normalizeDispatchAgent(requestedAgent);
  if (!agent) {
    console.log(`❌ 暂不支持 agent: ${requestedAgent}`);
    console.log(`   支持的 agent: ${Object.keys(DISPATCH_AGENT_CONFIGS).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const agentConfig = DISPATCH_AGENT_CONFIGS[agent];
  const commandTemplate = process.env[agentConfig.env];

  const stateInfo = await resolveStateFileForValidation(target);
  const session = stateInfo.session || (stateInfo.current && stateInfo.current.session);
  if (!session || session === "unknown") {
    console.log("❌ 无法确定 dispatch session，请传入 --dispatch <session>");
    process.exitCode = 1;
    return;
  }

  const sessionPaths = getSessionPaths(session);
  const stateJson = await readJsonFile(sessionPaths.sessionStateJsonPath);
  if (!stateJson) {
    console.log(`❌ 缺少或无法解析 state.json: ${toRelative(sessionPaths.sessionStateJsonPath)}`);
    process.exitCode = 1;
    return;
  }
  if (hasUnmergedActiveSubAgents(stateJson)) {
    console.log("❌ 当前 session 存在未合并的 active_sub_agents，不能开始新的 dispatch。");
    console.log("   请先由父 Agent 执行 Quality Gate，将结果 merged/skipped 后移入 sub_agent_history，或进入 reconcile。");
    process.exitCode = 1;
    return;
  }

  const files = parseFileList(options.files);
  if (files.length === 0) {
    console.log("❌ dispatch 需要显式 --files <glob[,glob]> 白名单");
    process.exitCode = 1;
    return;
  }

  const task = options.task || "未指定子任务";
  const agentId = makeAgentId(agent, session);
  const verifyCommand = selectVerifyCommand(stateJson, options.verifyCommand);
  const timeoutSeconds = options.timeoutSeconds || 300;
  const dispatchDir = getDispatchDir(sessionPaths);
  await fs.promises.mkdir(dispatchDir, { recursive: true });
  const promptPath = path.join(dispatchDir, `${agentId}.prompt.md`);
  const resultPath = path.join(dispatchDir, `${agentId}.result.md`);
  if (!options.dryRun && !commandTemplate) {
    console.log(`❌ 未设置 ${agentConfig.env}，无法启动 ${agentConfig.label} worker。`);
    console.log(`   可先手动执行 ${agentConfig.label}，并把结果写入: ${toRelative(resultPath)}`);
    process.exitCode = 1;
    return;
  }

  let worktreeDir = null;
  if (!options.dryRun) {
    try {
      worktreeDir = await createDispatchWorktree(sessionPaths, agentId);
    } catch (error) {
      console.log(`❌ ${error.message}`);
      process.exitCode = 1;
      return;
    }
  }
  const workerPrompt = buildWorkerPrompt({
    agent,
    agentId,
    session,
    task,
    files,
    verifyCommand,
    timeoutSeconds,
  });
  await fs.promises.writeFile(promptPath, workerPrompt, "utf8");

  const startedAt = options.dryRun ? null : getIsoTimestamp();
  const activeAgent = {
    id: agentId,
    type: "coder",
    task,
    filesAssigned: files,
    status: options.dryRun ? "planned" : "running",
    failureReason: "无",
    startedAt,
    completedAt: null,
    resultSummary: `prompt=${toRelative(promptPath)}${worktreeDir ? `; worktree=${toRelative(worktreeDir)}` : ""}`,
    mergeStatus: "pending",
    promptFile: toRelative(promptPath),
    resultFile: toRelative(resultPath),
    worktreeDir: worktreeDir ? toRelative(worktreeDir) : null,
  };
  const historyText = extractSection(
    await fs.promises.readFile(sessionPaths.sessionStatePath, "utf8"),
    "## Sub-Agent Dispatch / 子 Agent 调度",
  );
  const existingHistory = parseScalar(historyText, "sub_agent_history", "无");
  const stateMarkdown = await fs.promises.readFile(sessionPaths.sessionStatePath, "utf8");
  const dispatchState = {
    agent,
    task,
    phase: "implement",
    activeBlock: formatActiveSubAgentsBlock([activeAgent]),
    historyBlock: existingHistory || "无",
    activeSubAgents: [activeAgent],
    subAgentHistory: [],
    dispatchedCount: 1,
    completedCount: 0,
    failedCount: 0,
    lastDispatchRound: 1,
    lastMergeResult: "pending",
    timeoutSeconds,
    dryRun: options.dryRun,
  };

  await writeJsonFileAtomic(
    sessionPaths.sessionStateJsonPath,
    updateStateJsonForDispatch(stateJson, dispatchState),
  );
  await fs.promises.writeFile(
    sessionPaths.sessionStatePath,
    updateDecisionsMarkdownForDispatch(
      updateStateMarkdownForDispatch(stateMarkdown, dispatchState),
      dispatchState,
    ),
    "utf8",
  );

  console.log(`✅ 已准备 ${agentConfig.label} worker dispatch`);
  console.log(`Session: ${session}`);
  console.log(`Agent: ${agent} / ${agentConfig.label}`);
  console.log(`Agent ID: ${agentId}`);
  console.log(`Prompt: ${toRelative(promptPath)}`);
  console.log(`Result: ${toRelative(resultPath)}`);
  if (worktreeDir) {
    console.log(`Worktree: ${toRelative(worktreeDir)}`);
  }

  if (options.dryRun) {
    console.log(`Dry run: 未启动外部 ${agentConfig.label}。`);
    console.log(`下一步: 检查 prompt 后，去掉 --dry-run 并配置 ${agentConfig.env} 执行。`);
    return;
  }

  const command = commandTemplate
    .replace(/\{prompt\}/g, promptPath)
    .replace(/\{result\}/g, resultPath)
    .replace(/\{session\}/g, session)
    .replace(/\{agentId\}/g, agentId);
  const result = spawnSync(command, {
    cwd: worktreeDir,
    encoding: "utf8",
    shell: true,
    timeout: timeoutSeconds * 1000,
  });
  let existingAgentResult = "";
  if (await pathExists(resultPath)) {
    existingAgentResult = await fs.promises.readFile(resultPath, "utf8");
  }
  await fs.promises.writeFile(
    resultPath,
    [
      existingAgentResult ? "agent_result：" : "",
      existingAgentResult || "",
      existingAgentResult ? "command_audit：" : "",
      `command：${command}`,
      `exit_code：${result.status}`,
      `signal：${result.signal || "none"}`,
      `error：${result.error ? result.error.message : "none"}`,
      "stdout：",
      result.stdout || "",
      "stderr：",
      result.stderr || "",
    ].join("\n"),
    "utf8",
  );
  const commandFailed = result.status !== 0;
  const finishedStatus = commandFailed ? "failed" : "completed";
  const finishedAgent = {
    ...activeAgent,
    status: finishedStatus,
    failureReason: finishedStatus === "failed"
      ? `exit_code=${result.status || "error"}${result.error ? `; error=${result.error.message}` : ""}`
      : "无",
    completedAt: getIsoTimestamp(),
    resultSummary: `${activeAgent.resultSummary}; result=${toRelative(resultPath)}; exit_code=${result.status}; error=${result.error ? result.error.message : "none"}`,
  };
  const finishedDispatchState = {
    ...dispatchState,
    activeBlock: formatActiveSubAgentsBlock([finishedAgent]),
    activeSubAgents: [finishedAgent],
    completedCount: finishedStatus === "completed" ? 1 : 0,
    failedCount: finishedStatus === "failed" ? 1 : 0,
  };
  const afterRunStateJson = await readJsonFile(sessionPaths.sessionStateJsonPath);
  const afterRunStateMarkdown = await fs.promises.readFile(sessionPaths.sessionStatePath, "utf8");
  await writeJsonFileAtomic(
    sessionPaths.sessionStateJsonPath,
    updateStateJsonForDispatch(afterRunStateJson || stateJson, finishedDispatchState),
  );
  await fs.promises.writeFile(
    sessionPaths.sessionStatePath,
    updateDecisionsMarkdownForDispatch(
      updateStateMarkdownForDispatch(afterRunStateMarkdown, finishedDispatchState),
      finishedDispatchState,
    ),
    "utf8",
  );
  console.log(`${agentConfig.label} exit code: ${result.status}`);
  console.log(`Result: ${toRelative(resultPath)}`);
  if (commandFailed) {
    process.exitCode = result.status || 1;
  }
}

function normalizeRelativePathForCompare(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function isPendingCleanupValue(value) {
  return /pending|待|未|需要|todo/i.test(String(value || ""));
}

function countRequirementStates(rcm) {
  const counts = {
    passed: 0,
    pending: 0,
    implemented: 0,
    notVerified: 0,
    blocked: 0,
  };
  for (const match of rcm.matchAll(/^状态：([^\r\n]+)/gm)) {
    const value = match[1].trim();
    if (value.startsWith("passed")) {
      counts.passed += 1;
    } else if (value.startsWith("pending")) {
      counts.pending += 1;
    } else if (value.startsWith("implemented")) {
      counts.implemented += 1;
    } else if (value.startsWith("not_verified")) {
      counts.notVerified += 1;
    } else if (value.startsWith("blocked")) {
      counts.blocked += 1;
    }
  }
  return counts;
}

async function validateSessionStateBaseline(content, stateInfo) {
  const issues = [];
  for (const section of REQUIRED_STATE_SECTIONS) {
    if (!stateHeadingExists(content, section)) {
      addError(issues, `缺少必要章节: ${section}`);
    }
  }

  const stateFile = stateInfo.stateFile;
  const sessionSection = extractFirstSection(content, [
    "## Session / 会话",
    "## Session",
  ]);
  const session = parseScalar(sessionSection, "session", "");
  const stateFileInState = parseScalar(sessionSection, "状态文件", "");
  const promptFileInState = parseScalar(sessionSection, "启动提示", "");
  const currentFileInState = parseScalar(sessionSection, "current 指针", "");
  const expectedSession = session || stateInfo.session;
  const expectedStatePath = expectedSession
    ? `.agent-state/auto-iterate/${expectedSession}/state.md`
    : normalizeRelativePathForCompare(toRelative(stateFile));
  const expectedPromptPath = expectedSession
    ? `.agent-state/auto-iterate/${expectedSession}/start-prompt.md`
    : normalizeRelativePathForCompare(promptFileInState);
  const promptPath = promptFileInState
    ? path.resolve(process.cwd(), promptFileInState)
    : expectedSession
      ? getSessionPaths(expectedSession).sessionPromptPath
      : null;
  const currentPromptPath = stateInfo.current && stateInfo.current.promptFile
    ? path.resolve(process.cwd(), stateInfo.current.promptFile)
    : null;

  if (!session) {
    addError(issues, "Session 章节缺少 session 字段");
  }

  if (stateInfo.targetType === "session" && session && stateInfo.session !== session) {
    addError(issues, `命令指定 session=${stateInfo.session}，但 state.md 中 session=${session}`);
  }

  if (stateFileInState && normalizeRelativePathForCompare(stateFileInState) !== normalizeRelativePathForCompare(toRelative(stateFile))) {
    addWarning(issues, `Session.状态文件=${stateFileInState} 与实际文件 ${toRelative(stateFile)} 不一致`);
  }

  if (stateFileInState && expectedSession && normalizeRelativePathForCompare(stateFileInState) !== expectedStatePath) {
    addWarning(issues, `Session.状态文件 未指向标准 session 路径 ${expectedStatePath}`);
  }

  if (!promptPath || !(await pathExists(promptPath))) {
    addError(issues, `缺少 start-prompt.md: ${promptFileInState || expectedPromptPath || "unknown"}`);
  }
  if (currentPromptPath && !(await pathExists(currentPromptPath))) {
    addError(issues, `auto-iterate-current.json.promptFile 指向的文件不存在: ${stateInfo.current.promptFile}`);
  }

  if (!currentFileInState || normalizeRelativePathForCompare(currentFileInState) !== ".agent-state/auto-iterate-current.json") {
    addWarning(issues, "Session.current 指针未记录为 .agent-state/auto-iterate-current.json");
  }

  if (!stateInfo.current || !stateInfo.current.stateFile) {
    addWarning(issues, "缺少 auto-iterate-current.json 或 current.stateFile，无法确认当前活动 session");
  } else if (expectedSession && stateInfo.current.session === expectedSession) {
    compareCurrentPointerToExpected(issues, stateInfo.current, expectedSession, expectedStatePath, expectedPromptPath, stateFileInState, promptFileInState);
  } else if (stateInfo.targetType === "current" && expectedSession && stateInfo.current.session !== expectedSession) {
    addError(issues, `current.session=${stateInfo.current.session || "unknown"} 与 state.md session=${expectedSession} 不一致`);
  } else if (stateInfo.targetType === "session" && expectedSession && stateInfo.current.session !== expectedSession) {
    addWarning(issues, `当前活动 session 是 ${stateInfo.current.session || "unknown"}，本次校验的是 ${expectedSession}`);
  }

  const budgets = extractFirstSection(content, ["## Budgets / 预算", "## Budgets"]);
  const implementationUsed = parseStateNumber(budgets, "implementation_iterations_used", 0);
  const optimizationUsed = parseStateNumber(budgets, "optimization_iterations_used", 0);
  const totalCycles = parseStateNumber(budgets, "total_cycles", 0);
  const remainingImplementation = parseStateNumber(budgets, "remaining_implementation_iterations", 0);
  const maxIterations = parseStateNumber(budgets, "max_iterations", 0);
  const validationHardeningUsed = parseStateNumber(budgets, "validation_hardening_iterations_used", 0);
  const minimumValidationHardening = parseStateNumber(budgets, "minimum_validation_hardening_iterations", 0);
  const minimumIterationsValue = parseScalar(budgets, "minimum_implementation_iterations", "未启用");
  const minimumIterations = /^\d+/.test(minimumIterationsValue)
    ? parseStateNumber(budgets, "minimum_implementation_iterations", 0)
    : null;

  if (totalCycles !== implementationUsed + optimizationUsed) {
    addError(issues, `total_cycles=${totalCycles}，但 implementation_iterations_used + optimization_iterations_used=${implementationUsed + optimizationUsed}`);
  }

  if (remainingImplementation === 0) {
    addWarning(issues, "remaining_implementation_iterations = 0，恢复后必须先请求用户追加预算，不得继续修改");
  }

  if (minimumIterations !== null) {
    if (maxIterations > 0 && minimumIterations > maxIterations) {
      addError(issues, `minimum_implementation_iterations=${minimumIterations} 大于 max_iterations=${maxIterations}`);
    }
    if (implementationUsed < minimumIterations) {
      addWarning(issues, `implementation_iterations_used=${implementationUsed} 尚未达到 minimum_implementation_iterations=${minimumIterations}`);
    }
  }

  const watchdog = extractFirstSection(content, ["## Watchdog / 看门狗", "## Watchdog"]);
  const watchdogTriggered = parseStateBoolean(watchdog, "triggered", false);
  const requiredAction = parseScalar(watchdog, "required_action", "");
  const deliveryVerifiability = parseScalar(watchdog, "delivery_verifiability", "");
  const stateDrift = parseScalar(watchdog, "state_drift", "");
  const watchdogLastValidationResult = parseScalar(watchdog, "last_validation_result", "");
  if (watchdogTriggered) {
    addError(issues, `Watchdog.triggered=true，必须先处理 required_action=${requiredAction || "unknown"}`);
  }
  if (/suspected|confirmed/.test(stateDrift)) {
    addError(issues, `Watchdog.state_drift=${stateDrift}，必须先进入 reconcile`);
  }
  if (/not_verifiable|unknown/.test(deliveryVerifiability)) {
    addWarning(issues, `Watchdog.delivery_verifiability=${deliveryVerifiability}，交付前不得声称完整完成`);
  }

  const rcm = extractFirstSection(content, [
    "## Requirement Coverage Matrix / 需求覆盖矩阵",
    "## Requirement Coverage Matrix",
  ]);
  const dod = extractFirstSection(content, [
    "## Definition of Done / 完成定义",
    "## Definition of Done",
  ]);
  const requirementCounts = countRequirementStates(rcm);
  const hasOpenRequirements = requirementCounts.pending > 0 ||
    requirementCounts.implemented > 0 ||
    requirementCounts.notVerified > 0 ||
    requirementCounts.blocked > 0;
  const hasPassedRequirements = requirementCounts.passed > 0;
  const dodVerifiability = parseScalar(dod, "交付可验证性", "");
  const dodWatchdogState = parseScalar(dod, "看门狗状态", "");
  if (hasOpenRequirements && /交付可验证性：verifiable/.test(dod)) {
    addError(issues, "RCM 仍存在 pending/implemented/not_verified/blocked，但 DoD 标记为 verifiable");
  }
  if (hasOpenRequirements && deliveryVerifiability === "verifiable") {
    addError(issues, "RCM 仍存在 pending/implemented/not_verified/blocked，但 Watchdog.delivery_verifiability=verifiable");
  }
  if (hasPassedRequirements && /未运行|failed|失败/.test(watchdogLastValidationResult)) {
    addWarning(issues, "RCM 已存在 passed 需求，但 Watchdog.last_validation_result 未显示最近验证通过");
  }
  if (requirementCounts.blocked > 0 && /看门狗状态：clear/.test(dod)) {
    addWarning(issues, "RCM 存在 blocked 需求，但 DoD 看门狗状态仍为 clear");
  }
  if (/not_verifiable|unknown/.test(dodVerifiability)) {
    addWarning(issues, `DoD.交付可验证性=${dodVerifiability}，交付前不得声称完整完成`);
  }
  if (/triggered/.test(dodWatchdogState)) {
    addError(issues, "DoD.看门狗状态=triggered，必须先处理停止/恢复动作");
  }

  const freshEyesRequired = parseStateBoolean(watchdog, "fresh_eyes_required", false);
  const allPassedNoOpen = !hasOpenRequirements && hasPassedRequirements;
  const validationHardeningStatus = parseScalar(watchdog, "validation_hardening_status", "");
  const validationHardeningDimensions = parseStateList(watchdog, "validation_hardening_dimensions_done");
  const requiredValidationDimensions = ["boundary", "negative", "regression"];
  const validationHardeningFinished = /passed|blocked|not_available|user_accepted_limited/.test(validationHardeningStatus);
  if (allPassedNoOpen && remainingImplementation > 0 && !freshEyesRequired && !validationHardeningFinished) {
    addError(issues, `所有 REQ passed 且 remaining_implementation_iterations=${remainingImplementation} > 0，但 Watchdog.fresh_eyes_required != true；交付前必须设为 true 并执行 context_compress_and_review`);
  }
  if (freshEyesRequired && requiredAction !== "context_compress_and_review") {
    addError(issues, `Watchdog.fresh_eyes_required=true，但 required_action=${requiredAction || "unknown"} 不是 context_compress_and_review`);
  }
  if (freshEyesRequired && !watchdogTriggered) {
    addError(issues, "Watchdog.fresh_eyes_required=true 时，Watchdog.triggered 必须为 true，确保先处理 context_compress_and_review");
  }
  if (allPassedNoOpen && !freshEyesRequired) {
    if (minimumValidationHardening > 0 && validationHardeningUsed < minimumValidationHardening) {
      addError(issues, `所有 REQ passed 后必须完成验证加固：validation_hardening_iterations_used=${validationHardeningUsed} 小于 minimum_validation_hardening_iterations=${minimumValidationHardening}`);
    }
    const missingDimensions = requiredValidationDimensions.filter((dimension) => !validationHardeningDimensions.includes(dimension));
    if (missingDimensions.length > 0 && !/blocked|not_available|user_accepted_limited/.test(validationHardeningStatus)) {
      addError(issues, `验证加固缺少维度 ${missingDimensions.join(", ")}；必须补充边界/反例/回归验证，或把 validation_hardening_status 标记为 blocked/not_available/user_accepted_limited 并说明原因`);
    }
  }

  const newTestCount = parseStateNumber(watchdog, "new_test_count", -1);
  const passedReqs = requirementCounts.passed;
  if (newTestCount >= 0 && passedReqs > newTestCount && remainingImplementation > 0) {
    addWarning(issues, `RCM 有 ${passedReqs} 条 passed 需求，但 Watchdog.new_test_count=${newTestCount}；建议 narrow_scope 补测试或记录不写原因`);
  }

  const validation = extractFirstSection(content, ["## Validation / 验证", "## Validation"]);
  const validationVerifiability = parseScalar(validation, "最终交付可验证性", "");
  const passedValidation = parseScalar(validation, "已通过验证", "");
  if (deliveryVerifiability && validationVerifiability && validationVerifiability !== "unknown" && deliveryVerifiability !== validationVerifiability) {
    addWarning(issues, `Watchdog.delivery_verifiability=${deliveryVerifiability} 与 Validation.最终交付可验证性=${validationVerifiability} 不一致`);
  }
  if (hasPassedRequirements && (!passedValidation || passedValidation === "无")) {
    addWarning(issues, "RCM 已存在 passed 需求，但 Validation.已通过验证 未记录证据");
  }

  const cleanup = extractFirstSection(content, [
    "## Temporary Artifacts / Cleanup / 临时产物清理",
    "## Temporary Artifacts / Cleanup",
  ]);
  const cleanupStatus = parseScalar(cleanup, "清理状态", "");
  const artifactsToDelete = parseScalar(cleanup, "待删除 artifacts", "");
  if (isPendingCleanupValue(cleanupStatus) && !/无|not_needed|已确认保留/.test(artifactsToDelete)) {
    addWarning(issues, `Temporary Artifacts / Cleanup 清理状态=${cleanupStatus}，交付前需清理或记录保留理由`);
  }

  return { issues };
}

async function validateState(target, options = {}) {
  let stateInfo;
  try {
    stateInfo = await resolveStateFileForValidation(target);
  } catch (error) {
    console.log(`❌ ${error.message}`);
    return;
  }

  let content;
  try {
    content = await fs.promises.readFile(stateInfo.stateFile, "utf8");
  } catch {
    console.log(`❌ 无法读取 state 文件: ${stateInfo.stateFile}`);
    return;
  }

  const stateJsonRead = await readJsonFileWithError(stateInfo.stateJsonFile);
  const stateJson = stateJsonRead.data;
  const stateJsonExists = await pathExists(stateInfo.stateJsonFile);
  const missingStateJsonAllowed = options.allowMissingStateJson && !stateJsonExists;
  const stateJsonIssues = stateJson
    ? validateStateJsonModel(stateJson, { session: stateInfo.session })
    : [{
        severity: options.strict && !missingStateJsonAllowed ? "error" : "warning",
        message: stateJsonExists
          ? `无法解析机器权威 state.json: ${toRelative(stateInfo.stateJsonFile)} (${stateJsonRead.error.message})`
          : missingStateJsonAllowed
            ? `缺少机器权威 state.json: ${toRelative(stateInfo.stateJsonFile)}；按旧 state.md-only session 降级恢复`
            : `缺少机器权威 state.json: ${toRelative(stateInfo.stateJsonFile)}`,
      }];
  const sessionValidation = await validateSessionStateBaseline(content, stateInfo);
  const subAgentValidation = validateSubAgentDispatchState(content);
  const issues = [...stateJsonIssues, ...sessionValidation.issues, ...subAgentValidation.issues];
  if (options.strict) {
    issues.forEach((issue) => {
      if (issue.severity === "warning" &&
        !issue.message.includes("当前活动 session 是") &&
        !issue.message.includes("按旧 state.md-only session 降级恢复") &&
        !issue.message.includes("delivery_verifiability=unknown") &&
        !issue.message.includes("DoD.交付可验证性=unknown")) {
        issue.severity = "error";
        issue.message = `strict: ${issue.message}`;
      }
    });
  }
  console.log(`State: ${toRelative(stateInfo.stateFile)}`);
  console.log(`State JSON: ${toRelative(stateInfo.stateJsonFile)}`);
  if (issues.length === 0) {
    console.log("✅ state.json 强约束校验通过");
    console.log("✅ auto-iterate session state 校验通过");
    console.log("✅ sub-agent state 校验通过");
    return { ok: true, degraded: false };
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  console.log(hasError ? "❌ auto-iterate session state 校验发现错误:" : "⚠️ auto-iterate session state 校验发现警告:");
  if (stateJsonIssues.length === 0) {
    console.log("✅ state.json 强约束校验通过");
  } else {
    const hasStateJsonError = stateJsonIssues.some((issue) => issue.severity === "error");
    console.log(hasStateJsonError ? "❌ state.json 强约束校验发现错误:" : "⚠️ state.json 强约束校验发现警告:");
  }
  if (subAgentValidation.issues.length === 0) {
    console.log("✅ sub-agent state 校验通过");
  } else {
    const hasSubAgentError = subAgentValidation.issues.some((issue) => issue.severity === "error");
    console.log(hasSubAgentError ? "❌ sub-agent state 校验发现错误:" : "⚠️ sub-agent state 校验发现警告:");
  }
  issues.forEach((issue) => {
    const prefix = issue.severity === "error" ? "ERROR" : "WARN";
    console.log(`- ${prefix}: ${issue.message}`);
  });
  console.log(
    hasError
      ? "下一步: 先修正 state.json / state.md 中的 session 指针、预算/看门狗或 Sub-Agent Dispatch / Decisions，再重新运行 --validate-state。"
      : "下一步: 建议在下一轮 dispatch、迭代或交付前同步这些 session 状态字段。",
  );
  if (hasError) {
    process.exitCode = 1;
  }
  return {
    ok: !hasError,
    degraded: stateJsonIssues.some((issue) => issue.message.includes("按旧 state.md-only session 降级恢复")),
  };
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function readJsonFileWithError(filePath) {
  try {
    return {
      data: JSON.parse(await fs.promises.readFile(filePath, "utf8")),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error,
    };
  }
}

async function writeJsonFileAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  await fs.promises.writeFile(
    tmpPath,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8",
  );
  await fs.promises.rename(tmpPath, filePath);
}

function validateStateJsonModel(state, expected = {}) {
  const issues = [];
  const enumValues = {
    requirementStatus: ["pending", "implemented", "passed", "blocked", "not_verified"],
    deliveryVerifiability: ["verifiable", "partially_verifiable", "not_verifiable", "unknown"],
    requiredAction: ["continue", "narrow_scope", "run_validation", "reconcile", "ask_user", "stop", "context_compress_and_review"],
    cleanupStatus: ["pending", "completed", "blocked"],
  };

  if (!requirePlainObject(issues, state, "state.json")) {
    return issues;
  }
  if (state.schemaVersion !== STATE_SCHEMA_VERSION) {
    addError(issues, `state.json.schemaVersion=${state.schemaVersion || "missing"}，期望 ${STATE_SCHEMA_VERSION}`);
  }

  const requiredObjects = ["task", "session", "mode", "budgets", "currentState", "watchdog", "decisions", "validation", "cleanup"];
  requiredObjects.forEach((key) => {
    requirePlainObject(issues, state[key], `state.json.${key}`);
  });
  requireArray(issues, state.requirements, "state.json.requirements");

  const session = state.session || {};
  requireNonEmptyStringFields(issues, session, ["session", "stateJsonFile", "stateFile", "promptFile", "currentFile"], "state.json.session");
  if (expected.session && session.session !== expected.session) {
    addError(issues, `state.json.session.session=${session.session || "missing"}，期望 ${expected.session}`);
  }
  if (session.session) {
    const expectedStateJson = `.agent-state/auto-iterate/${session.session}/state.json`;
    const expectedStateMd = `.agent-state/auto-iterate/${session.session}/state.md`;
    const expectedPrompt = `.agent-state/auto-iterate/${session.session}/start-prompt.md`;
    requireNormalizedPath(issues, session.stateJsonFile, expectedStateJson, "state.json.session.stateJsonFile");
    requireNormalizedPath(issues, session.stateFile, expectedStateMd, "state.json.session.stateFile");
    requireNormalizedPath(issues, session.promptFile, expectedPrompt, "state.json.session.promptFile");
  }

  const mode = state.mode || {};
  if (!mode.mode || !MODE_CONFIGS[mode.mode]) {
    addError(issues, `state.json.mode.mode=${mode.mode || "missing"} 不是有效模式`);
  }
  requireBooleanFields(issues, mode, ["autopilot", "allowAgentInference", "allowModify"], "state.json.mode");

  const budgets = state.budgets || {};
  requireNonNegativeIntegerFields(issues, budgets, [
    "maxIterations",
    "autopilotMaxIterations",
    "implementationIterationsUsed",
    "validationHardeningIterationsUsed",
    "minimumValidationHardeningIterations",
    "optimizationIterationsUsed",
    "totalCycles",
    "remainingImplementationIterations",
    "remainingValidationHardeningIterations",
  ], "state.json.budgets");
  validateBudgetRelationships(issues, budgets, "state.json.budgets");

  const watchdog = state.watchdog || {};
  requireEnumValue(issues, watchdog.deliveryVerifiability, enumValues.deliveryVerifiability, "state.json.watchdog.deliveryVerifiability");
  requireEnumValue(issues, watchdog.requiredAction, enumValues.requiredAction, "state.json.watchdog.requiredAction");
  requireBooleanFields(issues, watchdog, ["enabled", "triggered", "freshEyesRequired"], "state.json.watchdog");

  const requirements = Array.isArray(state.requirements) ? state.requirements : [];
  const requirementCounts = countJsonRequirementStates(requirements);
  requirements.forEach((item, index) => {
    if (!requirePlainObject(issues, item, `state.json.requirements[${index}]`)) {
      return;
    }
    requireNonEmptyStringFields(issues, item, ["id", "summary", "type", "status", "evidence", "blockedReason", "nextStep"], `state.json.requirements[${index}]`);
    requireEnumValue(issues, item.status, enumValues.requirementStatus, `state.json.requirements[${index}].status`);
    requireArray(issues, item.relatedFiles, `state.json.requirements[${index}].relatedFiles`);
  });
  if (hasOpenRequirementCounts(requirementCounts) && watchdog.deliveryVerifiability === "verifiable") {
    addError(issues, "state.json.requirements 仍有开放项，但 watchdog.deliveryVerifiability=verifiable");
  }

  const validation = state.validation || {};
  requireEnumValue(issues, validation.finalVerifiability, enumValues.deliveryVerifiability, "state.json.validation.finalVerifiability");
  requireArray(issues, validation.commands, "state.json.validation.commands");
  const cleanup = state.cleanup || {};
  requireEnumValue(issues, cleanup.status, enumValues.cleanupStatus, "state.json.cleanup.status");

  return issues;
}

async function writeCurrentFile(sessionPaths, answers) {
  const current = {
    session: sessionPaths.session,
    mode: answers.mode,
    modeLabel: answers.modeLabel,
    status: "in_progress",
    stateJsonFile: toRelative(sessionPaths.sessionStateJsonPath),
    stateFile: toRelative(sessionPaths.sessionStatePath),
    promptFile: toRelative(sessionPaths.sessionPromptPath),
    updatedAt: new Date().toISOString(),
  };

  await writeJsonFileAtomic(sessionPaths.currentPath, current);
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
      stateJsonFile: toRelative(sessionPaths.sessionStateJsonPath),
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
  if (action === "resume") {
    const previousExitCode = process.exitCode;
    process.exitCode = 0;
    const validationResult = await validateState(sessionPaths.session, {
      strict: true,
      allowMissingStateJson: true,
    });
    if (!validationResult || !validationResult.ok) {
      console.log("❌ resume 已被 strict state 门禁阻止。请先修正 state.json/state.md 后再恢复。");
      process.exitCode = 1;
      return;
    }
    process.exitCode = previousExitCode;
    if (validationResult.degraded) {
      console.log("⚠️  当前 session 缺少 state.json，已按旧 state.md-only session 降级恢复；建议恢复后生成 state.json。");
    }
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
    sessionStateJsonFile: toRelative(sessionPaths.sessionStateJsonPath),
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
- 所有关键 REQ passed 后，必须进入 validation_hardening 交付前验证加固：至少 2 轮，覆盖 boundary / negative / regression；发现问题就新增或重开 REQ，无法验证则标记 blocked / not_available。
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

function buildStateModel(rawAnswers) {
  const answers = withModeDefaults(rawAnswers);
  const remainingImplementationIterations = answers.autopilot
    ? answers.autopilotMaxIterations
    : answers.maxIterations;
  const minimumValidationHardeningIterations = answers.mode === "strict" ? 2 : 1;

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    generatedFileNotice: "state.json is the machine-authoritative auto-iterate state; state.md is generated for human reading.",
    task: {
      goal: answers.goal || "未指定",
      successCriteria: normalizeLines(answers.successCriteria),
      nonGoals: normalizeLines(answers.nonGoals),
      allowedScope: answers.allowedScope || "未指定",
      compatibility: normalizeLines(answers.compatibility),
    },
    session: {
      session: answers.session || "default",
      stateJsonFile: answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json",
      stateFile: answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md",
      promptFile: answers.sessionPromptFile || ".agent-state/auto-iterate/default/start-prompt.md",
      currentFile: answers.currentFile || ".agent-state/auto-iterate-current.json",
    },
    mode: {
      mode: answers.mode,
      label: answers.modeLabel,
      description: answers.modeDescription,
      autopilot: answers.autopilot,
      allowAgentInference: Boolean(answers.allowAgentInference),
      allowModify: answers.allowModify !== false,
      instructions: answers.modeInstructions,
    },
    budgets: {
      maxIterations: answers.maxIterations,
      autopilotMaxIterations: answers.autopilotMaxIterations,
      minimumImplementationIterations: null,
      implementationIterationsUsed: 0,
      validationHardeningIterationsUsed: 0,
      minimumValidationHardeningIterations,
      optimizationIterationsUsed: 0,
      totalCycles: 0,
      remainingImplementationIterations,
      remainingValidationHardeningIterations: minimumValidationHardeningIterations,
      remainingOptimizationIterations: null,
    },
    currentState: {
      currentPhase: answers.currentPhase,
      currentTask: answers.currentTask,
      nextAction: answers.nextAction,
      overallStatus: "in_progress",
      recentChanges: "无",
      keyFiles: "未探索",
      lastValidationCommand: "未运行",
      lastValidationResult: "未运行",
    },
    watchdog: {
      enabled: true,
      stateDrift: "none",
      deliveryVerifiability: "unknown",
      triggered: false,
      requiredAction: "continue",
      freshEyesRequired: false,
      validationHardeningStatus: "pending",
      validationHardeningDimensionsDone: [],
      newTestCount: 0,
    },
    requirements: [
      {
        id: "REQ-BOOTSTRAP",
        summary: "启动后必须先从用户目标、成功标准、原始清单文档和当前模式提取完整 Requirement Coverage Matrix",
        type: "验证",
        status: "pending",
        relatedFiles: [answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"],
        evidence: "无",
        blockedReason: "无",
        nextStep: "读取原始清单和当前代码，拆分 REQ-001...REQ-N，并在实现或验证前更新本矩阵",
      },
    ],
    decisions: {
      compatibility: normalizeLines(answers.compatibility),
      constraints: normalizeLines(answers.constraints),
      parallelWriteAllowed: false,
      parallelWriteConfirmation: "未确认；同 worktree 下不得并发 coder 写入",
      coderFileOwnership: "未分配",
      fallbackStrategy: "能力不足、无隔离或用户未确认时串行执行",
    },
    validation: {
      passed: [],
      failed: [],
      notRunReason: "尚未开始",
      finalVerifiability: "unknown",
      commands: normalizeLines(answers.validationCommands),
    },
    cleanup: {
      status: "pending",
      artifactsToDelete: "无",
      prototypeFiles: answers.mode === "prototype" ? "待创建并明确标记" : "无",
    },
    sourceChecklist: answers.sourceChecklist
      ? {
          path: answers.sourceChecklistPath,
          content: answers.sourceChecklist,
        }
      : null,
    deliveryFormat: answers.deliveryFormat || DEFAULT_DELIVERY_FORMAT,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
    : answers.maxIterations;

  return `# 自动迭代编码状态

> GENERATED FILE, DO NOT EDIT. 机器权威状态为 ${answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json"}；本 Markdown 仅用于人类阅读和 legacy 兼容。
${sourceChecklist}

## At-a-Glance / 人类摘要
tl;dr：整体 in_progress；模式：${answers.mode} / ${answers.modeLabel}
激活状态：active；这不是普通对话内多轮工作节奏，必须按 auto-iterate session 持久化流程执行
进度：implementation 0 / ${answers.autopilot ? answers.autopilotMaxIterations : answers.maxIterations}；optimization 0 / 未开始
需求：passed 0 / not_verified 全部 / blocked 0 / pending REQ-BOOTSTRAP
验证：最近命令 未运行；最近结果 未运行
看门狗：clear；required_action：continue
交付可验证性：unknown
需要用户决策：无
下一步：${answers.nextAction}

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

## Session / 会话
session：${answers.session || "default"}
状态文件：${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}
启动提示：${answers.sessionPromptFile || ".agent-state/auto-iterate/default/start-prompt.md"}
current 指针：${answers.currentFile || ".agent-state/auto-iterate-current.json"}
激活声明：Agent 开始执行前必须在对话中明确声明“auto-iterate 已激活”，并列出 mode、session、state 文件、current 指针和下一步最小动作
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

## Agent Capability Summary / 能力摘要
读文件/搜索代码：unknown
修改文件：unknown
运行命令：unknown
真实测试：unknown
状态持久化：available
子 Agent/并行：unknown
  并行探索（explore）：unknown
  后台任务（background）：unknown
  并行实现（coder）：unknown
网络/外部服务：unknown
数据库/密钥：user-confirmed-required
git 状态/diff：unknown
媒体/文档处理：not_needed
降级策略：能力不可用时标记 not_verified 或 blocked，不得伪造验证
阻塞能力：待 Agent 启动后探测

## Sub-Agent Dispatch / 子 Agent 调度
enabled：false（待 Agent 能力探测后决定）
current_phase：idle
active_sub_agents：无
active_sub_agents_item_template：
  - id：<agent_id>
    type：explore / coder / background
    task：
    files_assigned：
    status：planned / running / completed / failed / blocked
    failure_reason：
    started_at：
    completed_at：
    result_summary：
    merge_status：pending / merged / skipped
sub_agent_history：无（待首轮 dispatch 后追加；字段模板：round / agent_id / type / task_summary / merge_result / files_changed / validation_result / failure_reason）
sub_agent_history_item_template：
  - round：1
    agent_id：<agent_id>
    type：explore / coder / background
    task_summary：
    merge_result：success / partial / skipped
    files_changed：
    validation_result：
    failure_reason：
dispatched_count：0
completed_count：0
failed_count：0
last_dispatch_round：0
last_merge_result：N/A
max_sub_agent_rounds：3
sub_agent_timeout_seconds：300
max_failed_sub_agents：2
token_budget_hint：未设置
concurrency_limit：3

## Budgets / 预算
max_iterations：${answers.maxIterations}
autopilot_max_iterations：${answers.autopilotMaxIterations}
minimum_implementation_iterations：未启用
minimum_iteration_policy：最少/至少 N 轮是下限检查点，不是上限或仅执行 N 轮；达到下限后仍按 RCM、Watchdog、验证结果和剩余预算继续或停止
implementation_iterations_used：0
validation_hardening_iterations_used：0
minimum_validation_hardening_iterations：${answers.mode === "strict" ? "2" : "1"}
optimization_iterations_used：0
total_cycles：0
remaining_implementation_iterations：${remainingImplementationIterations}
remaining_validation_hardening_iterations：${answers.mode === "strict" ? "2" : "1"}
remaining_optimization_iterations：未开始
预算追加记录：无；如果恢复时 remaining_implementation_iterations = 0，必须先请求用户追加预算，历史计数不清零
计数口径：实现迭代 = 修改 + 验证/记录 + 状态更新的闭环；验证加固迭代 = 所有关键 REQ passed 后主动寻找遗漏的边界/反例/回归验证；只读探索、reconcile、上下文压缩、向用户提问和纯重复验证不计入实现迭代

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
light_check：每轮必做，检查 no_progress_count / last_validation_result / state_drift / triggered / fresh_eyes_required / new_test_count
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
required_action：continue
fresh_eyes_required：false
new_test_count：0
new_test_target：所有 passed REQ 至少各有 1 个本轮新增的行为测试或等价验证命令；未补测试的 REQ 必须在已知限制中记录原因
validation_hardening_status：pending
validation_hardening_dimensions_done：无
validation_hardening_required：boundary / negative / regression；有 UI、权限、并发、数据迁移或外部服务时追加对应维度
validation_hardening_cost_policy：优先局部最小可证伪验证；重型 e2e / 全量 CI 只在相关风险、影响面较大或最终交付门禁时运行
heavy_validation_deferred：无

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
验证加固：pending
交付可验证性：unknown
看门狗状态：clear
剩余风险：尚未开始执行

## Decisions / 已确认决策
已确认的架构决策：未确认，优先从现有代码和脚手架推断
已确认的产品行为：以本文件成功标准为准；快速模式下先由 Agent 推断并等待必要确认
已确认的接口兼容性：
${formatList(answers.compatibility)}
用户提供的限制：
${formatList(answers.constraints)}
并发决策：
  parallel_write_allowed：false
  parallel_write_confirmation：未确认；同 worktree 下不得并发 coder 写入
  coder_file_ownership：未分配
  fallback_strategy：能力不足、无隔离或用户未确认时串行执行

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
如果 Watchdog.fresh_eyes_required 为 true，必须先设置 triggered=true、required_action=context_compress_and_review，并完成上下文压缩与新鲜视角复查后再继续或交付。
如果所有关键 REQ 已 passed，必须先完成 validation_hardening：至少达到 minimum_validation_hardening_iterations，并覆盖 boundary / negative / regression 维度；无法执行时标记 blocked 或 not_available，不得静默跳过。
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
Session 机器状态：${answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json"}
Session 状态视图：${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}
Session 启动提示：${answers.sessionPromptFile || ".agent-state/auto-iterate/default/start-prompt.md"}
Current 指针：${answers.currentFile || ".agent-state/auto-iterate-current.json"}

Auto-iterate 激活声明：
开始执行前，请先在对话中用 1-3 行明确声明本任务已经进入 auto-iterate-coding 激活态，并列出 mode、session、state.json、state.md、current 指针和下一步最小动作。
如果不能读取或写入 session state.json、state.md、start-prompt 或 current 指针，必须把状态持久化标记为 degraded / not_available，并说明原因；不得把普通对话内多轮修改称为完整 auto-iterate session。
后续每轮进展摘要和最终交付都必须引用当前 session，避免把“多轮迭代开发”误判为未激活持久化任务。

模式执行规则：
${answers.modeInstructions}

上下文与状态管理：
请始终使用与用户当前提示一致的语言输出、记录状态和交付总结；用户使用中文时不要突然切换为英文，除非术语、命令、代码或用户明确要求保留英文。
本 skill 是面向 AI Coding Agent 的自动迭代开发协议，不是独立 CLI 工具，也不依赖特定 Agent 平台。
请先探测当前 Agent 环境可用能力，包括读写文件、运行命令、真实测试、状态持久化、子 Agent/并行、网络、数据库/密钥和 git diff。
如果某项能力不可用，请按降级规则标记 not_verified 或 blocked，不要伪造完成或验证。
如果子 Agent/并行为 available，请先读取 references/sub-agent-concurrency.md，并按“启用门禁与平台适配”“调度流程”和 Sub-Agent Result Schema 维护 Sub-Agent Dispatch；state 字段结构以 examples/state-template.md 为唯一来源，不得自行添加协议旧字段。
sub-agent 是 Agent 工具执行自动迭代时的协议增强，不是 fastcar-cli 内置运行时；小任务、单文件修改、ownership 不清晰或验证副作用不明时默认串行执行。
启用任何 coder/background 并发前，请同步维护 Decisions 中的并发决策：parallel_write_allowed、parallel_write_confirmation、coder_file_ownership 和 fallback_strategy；未声明共享文件 owner 或验证副作用时不得并发执行。
每轮并发 dispatch 前必须建立轻量 baseline，例如 git status、已有 diff 摘要或关键文件 mtime；merge 后必须由父 Agent 执行 Quality Gate，先更新 state.json 中的 active_sub_agents、sub_agent_history、Watchdog、Budgets 和 RCM，再刷新 state.md 生成视图。检测到 state.json 或 state.md 在子 Agent 运行期间被外部修改时，先进入 reconcile，不得继续 dispatch。
默认并发上限：explore 最多 4，需求提取和 background verify 最多 3，coder 默认最多 2；quick 模式默认只启用 explore/background 并发，只有文件 ownership、用户确认、baseline 和 Quality Gate 均明确时才允许 coder 并发。
请不要依赖历史对话作为唯一上下文。
如果存在 ${answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json"}，请先读取它作为本 session 的机器权威恢复状态；缺少 state.json 的旧 session 才降级读取 ${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"}。
恢复前执行 reconcile 检查：当前分支、git 状态/diff 摘要、状态文件与当前代码是否一致、是否存在上次停止后的外部修改、最近验证能否重新运行。
每完成一轮实现迭代、递归优化、上下文压缩、提前停止或成功交付前，都要优先更新 session 机器状态文件 ${answers.sessionStateJsonFile || ".agent-state/auto-iterate/default/state.json"}，再刷新 ${answers.sessionStateFile || ".agent-state/auto-iterate/default/state.md"} 生成视图；如果当前环境不能写状态文件，请在对话内维护同等结构的 Iteration State。
请启用并维护 Watchdog 状态；每轮迭代前后、上下文压缩后、恢复后和最终交付前都要检查无进展、验证缺失、状态漂移和交付可验证性，并把 required_action 写回 state.json 后刷新 state.md。
如果 Watchdog 触发 run_validation、reconcile、ask_user、context_compress_and_review 或 stop，必须先处理 required_action，不得绕过；交付可验证性为 not_verifiable 或 unknown 时，不要按成功交付输出。
当 Watchdog.fresh_eyes_required = true 时：所有 REQ 已 passed 但仍有剩余实现预算。请执行上下文压缩，输出 Context Handoff Summary，清空对话中的实现细节。以"新接手项目的开发者"视角重新审视全部代码和 RCM。发现遗漏 → 创建新 REQ，重置 fresh_eyes_required = false，继续迭代。无遗漏 → fresh_eyes_required = false，继续优化或交付。
当所有关键 REQ passed 且 fresh_eyes_required 已处理后，必须进入 validation_hardening 交付前验证加固。验证加固不消耗实现迭代预算；每轮选择一个攻击式验证维度（boundary、negative、regression，必要时追加 compatibility、concurrency、permission、data、ui），优先用局部最小可证伪验证补充真实测试或等价验证命令。重型 e2e / 全量 CI 不得每轮机械重复，只有相关风险、影响面较大或最终交付门禁需要时运行；如因耗时延后，记录 heavy_validation_deferred、原因和用户可复现命令。发现问题时新增或重开 REQ 并回到实现；无新发现时更新 validation_hardening_iterations_used、validation_hardening_dimensions_done 和验证证据。未达到 minimum_validation_hardening_iterations 或缺少必需维度时，不得按成功交付输出。
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
    keywords: ["quick", "快速", "启动", "修复", "开发", "goal", "auto-iterate goal"],
    examples: [
      "帮我快速启动自动迭代，修复登录失败问题，session 叫 login-bugfix",
      "让 auto-iterate goal 处理：修复登录失败问题，session 叫 login-bugfix",
      "启动 auto-iterate goal：修复支付回调重复处理问题，session 叫 payment-callback-fix",
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
    title: "Codex worker / dispatch 派发",
    keywords: ["codex", "goal", "worker", "dispatch", "派发", "子 Agent"],
    examples: [
      "说明：这里的 Codex goal 是用户口语，按 Codex worker / dispatch 处理，不表示已启用 Codex 客户端 Goal 模式",
      "让 Codex goal 处理 login-bugfix 的 REQ-001，只能改 src/auth.js 和 test/auth.test.js，验证命令 npm test，先 dry-run",
      "让 Codex goal 接手当前自动迭代任务的 REQ-002，文件白名单是 src/auto-iterate.js 和 test/auto-iterate-doc-reliability.test.js，先生成 worker prompt 不实际执行",
      "派发给 Codex worker：session 是 dispatch-codex，任务是补充 resume 降级测试，只允许改 test/auto-iterate-doc-reliability.test.js，跑 npm test",
      "确认 prompt 后，让本地 Codex 真实执行这个 worker",
      "先生成 Codex worker prompt，不启动外部 Agent，确认后再配置 AUTO_ITERATE_CODEX_CMD 执行",
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
    console.log("可尝试关键词：快速、文档、验收、诊断、原型、规划、优化、测试、Codex、worker、dispatch、session、预算");
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

  if (options.help) {
    showAutoIterateHelp();
    return;
  }

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

  if (options.validateState) {
    await validateState(options.validateState, { strict: options.strictState });
    return;
  }

  if (options.dispatchSession) {
    await initDispatch(options);
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
  const stateModel = buildStateModel(answers);
  const stateModelIssues = validateStateJsonModel(stateModel, {
    session: sessionPaths.session,
  });
  if (stateModelIssues.some((issue) => issue.severity === "error")) {
    console.log("❌ 生成 state.json 失败，结构化状态未通过校验:");
    stateModelIssues.forEach((issue) => {
      console.log(`- ${issue.severity.toUpperCase()}: ${issue.message}`);
    });
    process.exitCode = 1;
    return;
  }
  const promptContent = buildPromptContent(answers);
  await writeJsonFileAtomic(sessionPaths.sessionStateJsonPath, stateModel);
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
