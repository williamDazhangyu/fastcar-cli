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
  // Mode flags
  "--quick": { stage: "stable", kind: "mode", stable: true, help: "--quick" },
  "--strict": { stage: "stable", kind: "mode", stable: true, help: "--strict" },
  "--diagnose": { stage: "routable", kind: "mode", stable: false, aliases: ["--debug"], help: "--diagnose|--debug" },
  "--verify": { stage: "routable", kind: "mode", stable: false, help: "--verify" },
  "--plan-only": { stage: "routable", kind: "mode", stable: false, help: "--plan-only" },
  "--optimize": { stage: "routable", kind: "mode", stable: false, aliases: ["--optimise"], help: "--optimize|--optimise" },
  "--prototype": { stage: "routable", kind: "mode", stable: false, aliases: ["--proto"], help: "--prototype|--proto" },

  // Input flags
  "--from": { stage: "stable", kind: "input", stable: true, aliases: ["-f"], help: "-f, --from <file>" },
  "--goal": { stage: "stable", kind: "input", stable: true, help: "--goal <text>" },

  // Session flags
  "--session": { stage: "stable", kind: "session", stable: true, help: "--session <name>" },
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
  "--dashboard": { stage: "stable", kind: "session", stable: true, help: "--dashboard [session]" },

  // Skill flags
  "--capture-skills": { stage: "stable", kind: "skill", stable: true, help: "--capture-skills <session> [--yes]" },
  "--check-bloat": { stage: "stable", kind: "other", stable: true, help: "--check-bloat  检查技能/测试膨胀，输出诊断报告" },
  "--next": { stage: "stable", kind: "other", stable: true, help: "--next <session>  下一轮前检查：shouldStop+pickFocus+validation.log防偷懒" },
  "--merge": { stage: "stable", kind: "other", stable: true, help: "--merge <session> [--round <N>]  合并本轮result+validation到state" },

  // Other flags
  "--no-run": {
    stage: "stable",
    kind: "other",
    stable: true,
    help: "--no-run  protocol-only LLM execution; do not dispatch native subagent",
  },
  "--yes": {
    stage: "stable",
    kind: "other",
    stable: true,
    aliases: ["-y", "--non-interactive"],
    help: "--yes|-y|--non-interactive  non-interactive session creation",
  },
  "--max-iterations": { stage: "stable", kind: "other", stable: true, aliases: ["--max"], help: "--max-iterations|--max <n>" },
  "--autopilot-max-iterations": {
    stage: "stable",
    kind: "other",
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
