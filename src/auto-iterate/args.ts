export interface AutoIterateArgs {
  from: string | null;
  mode: string | null;
  goal: string | null;
  session: string | null;
  list: boolean;
  switchSession: string | null;
  resumeSession: string | null;
  validateState: string | null;
  strictState: boolean;
  finalizeSession: string | null;
  dispatchSession: string | null;
  agent: string;
  task: string | null;
  files: string | null;
  verifyCommand: string | null;
  validateCommand: string[];
  timeoutSeconds: number;
  stepTimeoutSeconds: number;
  inactivityTimeoutSeconds: number;
  validationTimeoutSeconds: number;
  progressIntervalSeconds: number;
  dryRun: boolean;
  run: boolean;
  once: boolean;
  autopilotRun: boolean;
  jsonProgress: boolean;
  noRun: boolean;
  noValidate: boolean;
  check: boolean;
  isolate: boolean;
  allowModify: boolean;
  maxSteps: number | null;
  focus: string | null;
  scope: string | null;
  answer: string | null;
  maxIterations: number | null;
  autopilotMaxIterations: number | null;
  yes: boolean;
  examples: boolean;
  query: string | null;
  help: boolean;
  captureSkillsSession?: string;
}

const MODE_ALIASES: Record<string, string> = {
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
  "--validate-cmd",
  "--timeout",
  "--step-timeout",
  "--inactivity-timeout",
  "--validation-timeout",
  "--max-steps",
  "--focus",
  "--scope",
  "--answer",
  "--capture-skills",
]);

const OPTIONS_WITH_OPTIONAL_VALUE = new Set([
  "--dispatch",
  "--examples",
  "--validate-state",
  "--finalize",
]);

function normalizeMode(value: string | number | null | undefined): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return MODE_ALIASES[normalized] || null;
}

function formatNumber<T extends number | null>(
  value: string | number | null | undefined,
  fallback: T,
): number | T {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatNonNegativeNumber(
  value: string | number | null | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Returns true when a positional token belongs to the previous option rather
 * than the free-form goal. This preserves natural-language goal inference.
 */
function isConsumedOptionValue(args: string[], index: number): boolean {
  if (index <= 0 || String(args[index] || "").startsWith("-")) {
    return false;
  }

  const previous = String(args[index - 1] || "");
  if (previous === "--capture-skills" || previous === "--finalize") {
    return true;
  }
  return OPTIONS_WITH_REQUIRED_VALUE.has(previous) || OPTIONS_WITH_OPTIONAL_VALUE.has(previous);
}

export function normalizeGoalText(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .replace(/^(goal|目标|用户目标)\s*[:：]\s*/i, "")
    .trim();
}

export function inferGoalFromPositionals(args: string[]): string | null {
  const positionals = args.filter((arg, index) => {
    const value = String(arg || "").trim();
    return value && !value.startsWith("-") && !isConsumedOptionValue(args, index);
  });

  return positionals.length > 0 ? normalizeGoalText(positionals.join(" ")) : null;
}

export function parseArgs(args: string[] = []): AutoIterateArgs {
  const options: AutoIterateArgs = {
    from: null,
    mode: null,
    goal: null,
    session: null,
    list: false,
    switchSession: null,
    resumeSession: null,
    validateState: null,
    strictState: false,
    finalizeSession: null,
    dispatchSession: null,
    agent: "codex",
    task: null,
    files: null,
    verifyCommand: null,
    validateCommand: [],
    timeoutSeconds: 300,
    stepTimeoutSeconds: 300,
    inactivityTimeoutSeconds: 120,
    validationTimeoutSeconds: 600,
    progressIntervalSeconds: 15,
    dryRun: false,
    run: false,
    once: false,
    autopilotRun: false,
    jsonProgress: false,
    noRun: false,
    noValidate: false,
    check: false,
    isolate: false,
    allowModify: false,
    maxSteps: null,
    focus: null,
    scope: null,
    answer: null,
    maxIterations: null,
    autopilotMaxIterations: null,
    yes: false,
    examples: false,
    query: null,
    help: false,
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

    if (arg === "--finalize") {
      options.finalizeSession = args[index + 1] && !args[index + 1].startsWith("-")
        ? args[index + 1]
        : "__current__";
      return;
    }

    if (arg.startsWith("--finalize=")) {
      options.finalizeSession = arg.slice("--finalize=".length) || "__current__";
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

    if (arg === "--capture-skills" && args[index + 1]) {
      options.captureSkillsSession = args[index + 1];
      return;
    }

    if (arg.startsWith("--capture-skills=")) {
      options.captureSkillsSession = arg.slice("--capture-skills=".length);
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

    if (arg === "--validate-cmd" && args[index + 1]) {
      options.validateCommand.push(args[index + 1]);
      return;
    }

    if (arg.startsWith("--validate-cmd=")) {
      options.validateCommand.push(arg.slice("--validate-cmd=".length));
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

    if (arg === "--step-timeout" && args[index + 1]) {
      options.stepTimeoutSeconds = formatNonNegativeNumber(args[index + 1], 300);
      return;
    }

    if (arg.startsWith("--step-timeout=")) {
      options.stepTimeoutSeconds = formatNonNegativeNumber(arg.slice("--step-timeout=".length), 300);
      return;
    }

    if (arg === "--inactivity-timeout" && args[index + 1]) {
      options.inactivityTimeoutSeconds = formatNonNegativeNumber(args[index + 1], 120);
      return;
    }

    if (arg.startsWith("--inactivity-timeout=")) {
      options.inactivityTimeoutSeconds = formatNonNegativeNumber(arg.slice("--inactivity-timeout=".length), 120);
      return;
    }

    if (arg === "--validation-timeout" && args[index + 1]) {
      options.validationTimeoutSeconds = formatNonNegativeNumber(args[index + 1], 600);
      return;
    }

    if (arg.startsWith("--validation-timeout=")) {
      options.validationTimeoutSeconds = formatNonNegativeNumber(arg.slice("--validation-timeout=".length), 600);
      return;
    }

    if (arg === "--progress-interval" && args[index + 1]) {
      options.progressIntervalSeconds = formatNumber(args[index + 1], 15);
      return;
    }

    if (arg.startsWith("--progress-interval=")) {
      options.progressIntervalSeconds = formatNumber(arg.slice("--progress-interval=".length), 15);
      return;
    }

    if (arg === "--max-steps" && args[index + 1]) {
      options.maxSteps = formatNonNegativeNumber(args[index + 1], 0);
      return;
    }

    if (arg.startsWith("--max-steps=")) {
      options.maxSteps = formatNonNegativeNumber(arg.slice("--max-steps=".length), 0);
      return;
    }

    if (arg === "--focus" && args[index + 1]) {
      options.focus = args[index + 1];
      return;
    }

    if (arg.startsWith("--focus=")) {
      options.focus = arg.slice("--focus=".length);
      return;
    }

    if (arg === "--scope" && args[index + 1]) {
      options.scope = args[index + 1];
      return;
    }

    if (arg.startsWith("--scope=")) {
      options.scope = arg.slice("--scope=".length);
      return;
    }

    if (arg === "--answer" && args[index + 1]) {
      options.answer = args[index + 1];
      return;
    }

    if (arg.startsWith("--answer=")) {
      options.answer = arg.slice("--answer=".length);
      return;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      return;
    }

    if (arg === "--run") {
      options.run = true;
      return;
    }

    if (arg === "--once") {
      options.once = true;
      return;
    }

    if (arg === "--autopilot") {
      options.autopilotRun = true;
      return;
    }

    if (arg === "--json-progress") {
      options.jsonProgress = true;
      return;
    }

    if (arg === "--no-run") {
      options.noRun = true;
      return;
    }

    if (arg === "--no-validate") {
      options.noValidate = true;
      return;
    }

    if (arg === "--check") {
      options.check = true;
      return;
    }

    if (arg === "--isolate") {
      options.isolate = true;
      return;
    }

    if (arg === "--allow-modify") {
      options.allowModify = true;
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
      options.autopilotMaxIterations = formatNonNegativeNumber(args[index + 1], 0);
      return;
    }

    if (arg.startsWith("--autopilot-max-iterations=")) {
      options.autopilotMaxIterations = formatNonNegativeNumber(
        arg.slice("--autopilot-max-iterations=".length),
        0,
      );
      return;
    }

    if (arg.startsWith("--autopilot-max=")) {
      options.autopilotMaxIterations = formatNonNegativeNumber(
        arg.slice("--autopilot-max=".length),
        0,
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
