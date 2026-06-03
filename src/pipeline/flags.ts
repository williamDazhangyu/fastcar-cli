import type {
  FlagInfo,
  FlagIssue,
  FlagStage,
  FlagValidationResult,
} from "./types";

export const FLAG_STAGES: readonly FlagStage[] = [
  "documented",
  "parsed",
  "implemented",
  "routable",
  "stable",
];

export const FLAG_REGISTRY: Record<string, FlagInfo> = {
  "--run": { stage: "routable", kind: "pipeline", stable: false, help: "--run  legacy/deprecated external Worker pipeline; disabled by default" },
  "--once": { stage: "routable", kind: "pipeline", stable: false, help: "--once  legacy/deprecated pipeline option" },
  "--json-progress": { stage: "routable", kind: "pipeline", stable: false, help: "--json-progress  legacy/deprecated pipeline output option" },
  "--check": { stage: "routable", kind: "pipeline", stable: false, help: "--check  legacy/deprecated Worker CLI environment check; disabled by default" },
  "--validate-cmd": {
    stage: "routable",
    kind: "pipeline",
    stable: false,
    help: "--validate-cmd <cmd>  legacy/deprecated pipeline 独立验证命令，可重复传入；不同于 dispatch 的 --verify-command/--verify-cmd",
  },
  "--max-steps": { stage: "implemented", kind: "pipeline", stable: false, help: "--max-steps <n>" },
  "--step-timeout": { stage: "implemented", kind: "pipeline", stable: false, help: "--step-timeout <seconds>" },
  "--inactivity-timeout": { stage: "implemented", kind: "pipeline", stable: false, help: "--inactivity-timeout <seconds>" },
  "--validation-timeout": { stage: "implemented", kind: "pipeline", stable: false, help: "--validation-timeout <seconds>" },
  "--progress-interval": { stage: "implemented", kind: "pipeline", stable: false, help: "--progress-interval <seconds>" },
  "--focus": { stage: "implemented", kind: "pipeline", stable: false, help: "--focus <type:id>" },
  "--answer": { stage: "routable", kind: "pipeline", stable: false, help: "--answer <id>" },
  "--isolate": { stage: "implemented", kind: "pipeline", stable: false, help: "--isolate" },
  "--allow-modify": { stage: "implemented", kind: "pipeline", stable: false, help: "--allow-modify" },
  "--scope": { stage: "routable", kind: "pipeline", stable: false, help: "--scope <glob[,glob]>" },
  "--no-validate": { stage: "implemented", kind: "pipeline", stable: false, help: "--no-validate" },
  "--no-run": {
    stage: "routable",
    kind: "pipeline",
    stable: false,
    help: "--no-run  protocol-only LLM execution; do not dispatch native subagent or legacy Worker pipeline",
  },
  "--autopilot": { stage: "routable", kind: "pipeline", stable: false, stability: "not_stable", help: "--autopilot" },

  "--quick": { stage: "stable", kind: "mode", stable: true, help: "--quick" },
  "--strict": { stage: "stable", kind: "mode", stable: true, help: "--strict" },
  "--diagnose": { stage: "routable", kind: "mode", stable: false, aliases: ["--debug"], help: "--diagnose|--debug" },
  "--verify": { stage: "routable", kind: "mode", stable: false, help: "--verify" },
  "--plan-only": { stage: "routable", kind: "mode", stable: false, help: "--plan-only" },
  "--optimize": { stage: "routable", kind: "mode", stable: false, aliases: ["--optimise"], help: "--optimize|--optimise" },
  "--prototype": { stage: "routable", kind: "mode", stable: false, aliases: ["--proto"], help: "--prototype|--proto" },
  "--from": { stage: "stable", kind: "input", stable: true, aliases: ["-f"], help: "-f, --from <file>" },
  "--goal": { stage: "stable", kind: "input", stable: true, help: "--goal <text>" },
  "--session": { stage: "stable", kind: "session", stable: true, help: "--session <name>" },
  "--yes": {
    stage: "stable",
    kind: "compat",
    stable: true,
    aliases: ["-y", "--non-interactive"],
    help: "--yes|-y|--non-interactive  non-interactive session creation",
  },
  "--list": { stage: "stable", kind: "session", stable: true, help: "--list" },
  "--resume": { stage: "routable", kind: "session", stable: false, help: "--resume <name>" },
  "--switch": { stage: "stable", kind: "session", stable: true, help: "--switch <name>" },
  "--validate-state": { stage: "stable", kind: "session", stable: true, help: "--validate-state [session|state.md|state.json]" },
  "--strict-state": {
    stage: "stable",
    kind: "session",
    stable: true,
    aliases: ["--strict-validate", "--strict-validation"],
    help: "--strict-state|--strict-validate|--strict-validation",
  },
  "--finalize": { stage: "stable", kind: "session", stable: true, help: "--finalize [session]" },
  "--dispatch": { stage: "stable", kind: "dispatch", stable: true },
  "--agent": { stage: "stable", kind: "dispatch", stable: true },
  "--task": { stage: "stable", kind: "dispatch", stable: true },
  "--files": { stage: "stable", kind: "dispatch", stable: true },
  "--verify-command": { stage: "stable", kind: "dispatch", stable: true, aliases: ["--verify-cmd"] },
  "--timeout": { stage: "stable", kind: "dispatch", stable: true },
  "--dry-run": { stage: "stable", kind: "dispatch", stable: true },
  "--capture-skills": { stage: "stable", kind: "skill", stable: true, help: "--capture-skills <session> [--yes]" },
  "--max-iterations": { stage: "stable", kind: "legacy", stable: true, aliases: ["--max"], help: "--max-iterations|--max <n>" },
  "--autopilot-max-iterations": {
    stage: "stable",
    kind: "legacy",
    stable: true,
    aliases: ["--autopilot-max"],
    help: "--autopilot-max-iterations|--autopilot-max <n>",
  },
  "--examples": { stage: "stable", kind: "other", stable: true, help: "--examples [keyword]" },
  "--query": { stage: "stable", kind: "other", stable: true, help: "--query <keyword>" },
};

function stageRank(stage: FlagStage): number {
  return FLAG_STAGES.indexOf(stage);
}

export function getFlagInfo(flag: string): FlagInfo | null {
  if (FLAG_REGISTRY[flag]) {
    return FLAG_REGISTRY[flag];
  }
  return Object.values(FLAG_REGISTRY).find((info) => (info.aliases || []).includes(flag)) || null;
}

export function isFlagAtLeast(flag: string, minimumStage: FlagStage): boolean {
  const info = getFlagInfo(flag);
  if (!info) {
    return false;
  }
  return stageRank(info.stage) >= stageRank(minimumStage);
}

export function listFlagsByStage(minimumStage: FlagStage): string[] {
  return Object.entries(FLAG_REGISTRY)
    .flatMap(([flag, info]) => [flag, ...(info.aliases || [])])
    .filter((flag) => isFlagAtLeast(flag, minimumStage))
    .sort();
}

export function listFlagHelpByKind(kind: FlagInfo["kind"]): string[] {
  return Object.values(FLAG_REGISTRY)
    .filter((info) => info.kind === kind && Boolean(info.help))
    .map((info) => String(info.help));
}

function isFlagToken(item: unknown): item is string {
  return typeof item === "string" && item.startsWith("--");
}

export function extractFlags(command: unknown[]): string[] {
  return command.filter(isFlagToken);
}

export function validateRoutableCommand(command: unknown[]): FlagValidationResult {
  const issues: FlagIssue[] = [];
  for (const flag of extractFlags(command)) {
    const info = getFlagInfo(flag);
    if (!info) {
      issues.push({ flag, reason: "unknown_flag" });
      continue;
    }
    if (!isFlagAtLeast(flag, "routable")) {
      issues.push({ flag, reason: `stage_${info.stage}_below_routable` });
    }
  }
  return {
    ok: issues.length === 0,
    issues,
  };
}
