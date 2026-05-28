// @ts-check

const { validateRoutableCommand } = require("./flags");

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} stdout
 * @returns {Record<string, unknown>[]}
 */
function parseNdjson(stdout) {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function shellQuote(value) {
  const text = String(value || "");
  if (/^[a-zA-Z0-9_./:-]+$/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '\\"')}"`;
}

/**
 * @param {unknown} input
 * @returns {import("./types").AutoIterateMode | string}
 */
function inferMode(input) {
  const text = String(input || "");
  if (/优化|性能|重构/.test(text)) {
    return "optimize";
  }
  if (/诊断|复现|debug|调试|失败|一直修|修到通过/.test(text)) {
    return "diagnose";
  }
  if (/原型|试试看|快速验证/.test(text)) {
    return "prototype";
  }
  return /全部|完整|端到端|PRD|prd|文档|docs/.test(text) ? "strict" : "quick";
}

/**
 * @param {unknown} input
 * @param {string} mode
 * @returns {string}
 */
function inferSession(input, mode) {
  const text = String(input || "");
  const explicit = text.match(/session\s*(?:叫|=|:)?\s*([a-zA-Z0-9_-]+)/i);
  if (explicit) {
    return explicit[1];
  }
  const suffix = mode === "diagnose" ? "diagnose" :
    mode === "optimize" ? "optimize" :
      mode === "prototype" ? "prototype" : "autopilot";
  return `${mode}-${suffix}`;
}

/**
 * @param {unknown} input
 * @returns {string | null}
 */
function extractFromPath(input) {
  const match = String(input || "").match(/(?:docs|\.\/docs|[a-zA-Z]:\\[^\s"'，。]+)[^\s"'，。]*(?:\.md|\.markdown|\.txt)/i);
  return match ? match[0].replace(/\\/g, "/") : null;
}

/**
 * @param {unknown} input
 * @param {import("./types").RouterRunOptions} [options]
 * @returns {string[]}
 */
function buildRunArgs(input, options = {}) {
  const mode = options.mode || inferMode(input);
  const session = options.session || inferSession(input, mode);
  const fromPath = options.from || extractFromPath(input);
  const args = ["auto-iterate", "--run", "--autopilot", "--json-progress", "--session", session];
  if (mode === "diagnose") {
    args.push("--diagnose");
  } else if (mode === "optimize") {
    args.push("--optimize");
  } else if (mode === "prototype") {
    args.push("--prototype");
  } else if (mode === "strict") {
    args.push("--strict");
  } else {
    args.push("--quick");
  }
  if (fromPath) {
    args.push("--from", fromPath);
  } else {
    args.push("--goal", options.goal || String(input || ""));
  }
  if (options.validateCmd) {
    args.push("--validate-cmd", options.validateCmd);
  }
  if (options.scope) {
    args.push("--scope", options.scope);
  }
  return args;
}

/**
 * @param {unknown} input
 * @param {Record<string, unknown> | null | undefined} checkEvent
 * @param {import("./types").RouterPlanOptions} [options]
 * @returns {import("./types").RouterPlan}
 */
function buildRouterPlan(input, checkEvent, options = {}) {
  const eventRecord = asRecord(checkEvent);
  const workers = asArray(eventRecord.workers_available);
  const commands = [["fastcar-cli", "auto-iterate", "--check", "--json-progress"]];
  if (workers.length === 0) {
    const fallbackArgs = ["auto-iterate", options.noRunMode || "--quick", "--goal", options.goal || String(input || ""), "--session", options.session || inferSession(input, "quick"), "--yes"];
    commands.push(["fastcar-cli", ...fallbackArgs]);
    const routeValidation = validateRoutableCommand(commands[1]);
    return {
      mode: "fallback",
      commands,
      userMessage: "本机未安装 Worker CLI，本次由我在当前会话里代跑 CLI fallback。",
      requiresUserShell: false,
      routeValidation,
    };
  }
  commands.push(["fastcar-cli", ...buildRunArgs(input, options)]);
  const routeValidation = validateRoutableCommand(commands[1]);
  return {
    mode: "run",
    commands,
    userMessage: "我会先检查 Worker 环境，然后启动 CLI 驱动的自动迭代并持续转述进度。",
    requiresUserShell: false,
    routeValidation,
  };
}

/**
 * @param {string[]} command
 * @returns {string}
 */
function formatCommand(command) {
  return command.map(shellQuote).join(" ");
}

/**
 * @param {Record<string, unknown> | null | undefined} event
 * @returns {string}
 */
function summarizeProgress(event) {
  if (!event || !event.event) {
    return "";
  }
  const focus = asRecord(event.focus);
  const blockingReasons = asArray(event.blocking_reasons).map(String);
  switch (event.event) {
    case "session_started":
      return `已启动 ${event.mode} 模式，session 为 ${event.session}，Worker 为 ${event.agent || "unknown"}。`;
    case "iteration_start":
      return `第 ${event.iter} 轮开始，当前 focus 是 ${focus.summary ? String(focus.summary) : "未命名任务"}。`;
    case "validation_done":
      return `第 ${event.iter} 轮验证 ${event.status}，命令：${event.command || "not_run"}。`;
    case "state_merged":
      return `第 ${event.iter} 轮状态已合并。`;
    case "delivery_gate":
      return event.ready ? "交付门禁已满足。" : `交付门禁未满足：${blockingReasons.join(", ") || "unknown"}。`;
    case "pipeline_stopped":
      return `Pipeline 已停止，原因：${event.reason}。`;
    case "error":
      return `Pipeline 出错：${event.reason}${event.detail ? `，${event.detail}` : ""}。`;
    default:
      return "";
  }
}

/**
 * @param {Record<string, unknown>} event
 * @param {string} answer
 * @returns {string[]}
 */
function buildResumeCommandFromDecision(event, answer) {
  return [
    "fastcar-cli",
    "auto-iterate",
    "--resume",
    typeof event.session === "string" && event.session ? event.session : "<session>",
    "--run",
    "--autopilot",
    "--answer",
    answer,
    "--json-progress",
  ];
}

/**
 * @param {number} exitCode
 * @param {Record<string, unknown>[]} events
 * @param {string} [answer]
 * @returns {{ question: unknown; options: unknown[]; command: string[] } | null}
 */
function handleNeedDecision(exitCode, events, answer) {
  const decision = events.find((event) => event.event === "need_decision");
  if (exitCode !== 42 || !decision) {
    return null;
  }
  return {
    question: decision.question,
    options: asArray(decision.options),
    command: buildResumeCommandFromDecision(decision, answer || "<id>"),
  };
}

/**
 * @param {Record<string, unknown>} listEvent
 * @returns {string[] | null}
 */
function buildResumeFromList(listEvent) {
  const sessions = asArray(listEvent && listEvent.sessions).map(asRecord);
  const current = sessions.find((item) => item.current) || sessions[0];
  if (!current || typeof current.session !== "string" || !current.session) {
    return null;
  }
  return ["fastcar-cli", "auto-iterate", "--resume", current.session, "--run", "--autopilot", "--json-progress"];
}

/**
 * @param {unknown} text
 * @returns {boolean}
 */
function containsForbiddenManualInstruction(text) {
  return /请你然后运行|请复制下面 prompt|请手动运行|你自己运行\s+(?:npm|fastcar-cli|node)/i.test(String(text || ""));
}

module.exports = {
  buildResumeFromList,
  buildRouterPlan,
  containsForbiddenManualInstruction,
  formatCommand,
  handleNeedDecision,
  parseNdjson,
  summarizeProgress,
};
