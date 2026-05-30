import { validateRoutableCommand } from "./flags";
import type {
  AutoIterateMode,
  RouterPlan,
  RouterPlanOptions,
  RouterRunOptions,
} from "./types";
import { asArray, asRecord } from "./valueUtils";

interface NeedDecisionResume {
  question: unknown;
  options: unknown[];
  command: string[];
}

/**
 * @param {unknown} stdout
 * @returns {Record<string, unknown>[]}
 */
export function parseNdjson(stdout: unknown): Record<string, unknown>[] {
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
function shellQuote(value: unknown): string {
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
export function inferMode(input: unknown): AutoIterateMode | string {
  const text = String(input || "");
  if (/验收|检查.*(?:是否|完成|满足)|验证.*(?:PRD|prd|文档|是否)|不要修改|不能改代码|不修改代码|Verify-only/i.test(text)) {
    return "verify";
  }
  if (/只规划|先规划|不要写代码|不写代码|Plan-only/i.test(text)) {
    return "plan";
  }
  if (/优化|性能|重构/.test(text)) {
    return "optimize";
  }
  if (/诊断|复现|debug|调试|一直修|修到通过|(?:npm\s+test|测试|构建|类型检查|typecheck).{0,12}失败|失败.{0,12}(?:测试|构建|类型检查|typecheck)/i.test(text)) {
    return "diagnose";
  }
  if (/原型|试试看|快速验证/.test(text)) {
    return "prototype";
  }
  return /全部|完整|端到端|PRD|prd|文档|docs/.test(text) ? "strict" : "quick";
}

/**
 * @param {unknown} input
 * @returns {boolean}
 */
export function inferNoRun(input: unknown): boolean {
  return /手动模式|当前对话里执行|不要\s*spawn\s*worker|不用子\s*Agent|不走\s*CLI\s*驱动|不要走.*CLI.*流水线|固定\s*CLI\s*流水线|用老路径|旧模式|fallback\s*模式|无\s*CLI\s*fallback|不要自动迭代流水线|不要\s*--run|生成大\s*prompt|你直接改|只遵从.*协议|协议规范执行|不按固定流程/i.test(String(input || ""));
}

/**
 * @param {unknown} input
 * @param {string} mode
 * @returns {string}
 */
export function inferSession(input: unknown, mode: string): string {
  const text = String(input || "");
  const explicit = text.match(/(?:session|会话)\s*(?:叫|是|为|=|:|：)?\s*([a-zA-Z0-9_-]+)/i);
  if (explicit) {
    return explicit[1];
  }
  const suffix = mode === "diagnose" ? "diagnose" :
    mode === "optimize" ? "optimize" :
      mode === "prototype" ? "prototype" :
        mode === "verify" ? "verify" :
          mode === "plan" ? "plan" : "autopilot";
  return `${mode}-${suffix}`;
}

/**
 * @param {unknown} input
 * @returns {string | null}
 */
function extractFromPath(input: unknown): string | null {
  const match = String(input || "").match(/(?:docs|\.\/docs|[a-zA-Z]:\\[^\s"'，。]+)[^\s"'，。]*(?:\.md|\.markdown|\.txt)/i);
  return match ? match[0].replace(/\\/g, "/") : null;
}

/**
 * @param {unknown} input
 * @param {import("./types").RouterRunOptions} [options]
 * @returns {string[]}
 */
function buildRunArgs(input: unknown, options: RouterRunOptions = {}): string[] {
  const mode = options.mode || inferMode(input);
  const session = options.session || inferSession(input, mode);
  const fromPath = options.from || extractFromPath(input);
  const args = ["auto-iterate", "--run"];
  if (mode === "plan" || mode === "verify") {
    args.push("--once");
  } else {
    args.push("--autopilot");
  }
  args.push("--json-progress", "--session", session);
  if (mode === "diagnose") {
    args.push("--diagnose");
  } else if (mode === "optimize") {
    args.push("--optimize");
  } else if (mode === "prototype") {
    args.push("--prototype");
  } else if (mode === "verify") {
    args.push("--verify");
  } else if (mode === "plan") {
    args.push("--plan-only");
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
 * @param {import("./types").RouterRunOptions} [options]
 * @returns {string[]}
 */
export function buildFallbackArgs(input: unknown, options: RouterRunOptions = {}): string[] {
  const mode = options.mode || inferMode(input);
  const session = options.session || inferSession(input, mode);
  const fromPath = options.from || extractFromPath(input);
  const args = ["auto-iterate"];
  if (mode === "diagnose") {
    args.push("--diagnose");
  } else if (mode === "optimize") {
    args.push("--optimize");
  } else if (mode === "prototype") {
    args.push("--prototype");
  } else if (mode === "verify") {
    args.push("--verify");
  } else if (mode === "plan") {
    args.push("--plan-only");
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
  args.push("--session", session, "--yes", "--no-run");
  return args;
}

/**
 * @param {unknown} input
 * @param {Record<string, unknown> | null | undefined} checkEvent
 * @param {import("./types").RouterPlanOptions} [options]
 * @returns {import("./types").RouterPlan}
 */
export function buildRouterPlan(
  input: unknown,
  checkEvent: Record<string, unknown> | null | undefined,
  options: RouterPlanOptions = {},
): RouterPlan {
  const eventRecord = asRecord(checkEvent);
  const workers = asArray(eventRecord.workers_available);
  const commands: string[][] = [["fastcar-cli", "auto-iterate", "--check", "--json-progress"]];
  if (workers.length === 0 || options.noRun || inferNoRun(input)) {
    const fallbackArgs = buildFallbackArgs(input, options);
    commands.push(["fastcar-cli", ...fallbackArgs]);
    const routeValidation = validateRoutableCommand(commands[1]);
    return {
      mode: "fallback",
      commands,
      userMessage: workers.length === 0
        ? "本机未安装 Worker CLI，本次由我在当前会话里代跑 CLI fallback。"
        : "用户要求手动协议模式，本次不启动 --run Worker 流水线。",
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
export function formatCommand(command: string[]): string {
  return command.map(shellQuote).join(" ");
}

/**
 * @param {Record<string, unknown> | null | undefined} event
 * @returns {string}
 */
export function summarizeProgress(event: Record<string, unknown> | null | undefined): string {
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
function buildResumeCommandFromDecision(event: Record<string, unknown>, answer: string): string[] {
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
export function handleNeedDecision(
  exitCode: number,
  events: Record<string, unknown>[],
  answer?: string,
): NeedDecisionResume | null {
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
export function buildResumeFromList(listEvent: Record<string, unknown>): string[] | null {
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
export function containsForbiddenManualInstruction(text: unknown): boolean {
  return /请你然后运行|请复制下面 prompt|请手动运行|你自己运行\s+(?:npm|fastcar-cli|node)/i.test(String(text || ""));
}

