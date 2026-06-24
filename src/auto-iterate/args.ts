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
  dashboardSession: string | null;
  noRun: boolean;
  maxIterations: number | null;
  autopilotMaxIterations: number | null;
  yes: boolean;
  examples: boolean;
  query: string | null;
  help: boolean;
  captureSkillsSession?: string;
  checkBloat?: boolean;
  nextSession?: string;
  mergeSession?: string;
  mergeRound?: number;
  deprecatedFlag?: string | null;
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
  "--query",
  "--dashboard",
  "--max-iterations",
  "--autopilot-max-iterations",
  "--capture-skills",
  "--next",
  "--merge",
  "--round",
]);

const DEPRECATED_LOOP_FLAGS = new Set([
  "--run",
  "--check",
  "--dispatch",
]);

const OPTIONS_WITH_OPTIONAL_VALUE = new Set([
  "--examples",
  "--validate-state",
  "--finalize",
  "--dashboard",
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

function normalizeFlagToken(value: string): string {
  const eqIndex = value.indexOf("=");
  return eqIndex >= 0 ? value.slice(0, eqIndex) : value;
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
    dashboardSession: null,
    noRun: false,
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

    if (arg === "--check-bloat") {
      options.checkBloat = true;
      return;
    }

    const flagToken = normalizeFlagToken(arg);
    if (DEPRECATED_LOOP_FLAGS.has(flagToken)) {
      options.deprecatedFlag = flagToken;
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

    if (arg === "--dashboard") {
      options.dashboardSession = args[index + 1] && !args[index + 1].startsWith("-")
        ? args[index + 1]
        : "__current__";
      return;
    }

    if (arg.startsWith("--dashboard=")) {
      options.dashboardSession = arg.slice("--dashboard=".length) || "__current__";
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

    if (arg === "--next" && args[index + 1] && !args[index + 1].startsWith("-")) {
      options.nextSession = args[index + 1];
      return;
    }

    if (arg.startsWith("--next=")) {
      options.nextSession = arg.slice("--next=".length);
      return;
    }

    if (arg === "--merge" && args[index + 1] && !args[index + 1].startsWith("-")) {
      options.mergeSession = args[index + 1];
      return;
    }

    if (arg.startsWith("--merge=")) {
      options.mergeSession = arg.slice("--merge=".length);
      return;
    }

    if (arg === "--round" && args[index + 1]) {
      const n = Number(args[index + 1]);
      if (Number.isInteger(n) && n > 0) {
        options.mergeRound = n;
      }
      return;
    }

    if (arg.startsWith("--round=")) {
      const n = Number(arg.slice("--round=".length));
      if (Number.isInteger(n) && n > 0) {
        options.mergeRound = n;
      }
      return;
    }

    if (arg === "--no-run") {
      options.noRun = true;
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
