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
  "--run": { stage: "routable", kind: "pipeline", stable: false },
  "--once": { stage: "routable", kind: "pipeline", stable: false },
  "--json-progress": { stage: "routable", kind: "pipeline", stable: false },
  "--check": { stage: "routable", kind: "pipeline", stable: false },
  "--validate-cmd": { stage: "routable", kind: "pipeline", stable: false },
  "--max-steps": { stage: "implemented", kind: "pipeline", stable: false },
  "--step-timeout": { stage: "implemented", kind: "pipeline", stable: false },
  "--inactivity-timeout": { stage: "implemented", kind: "pipeline", stable: false },
  "--validation-timeout": { stage: "implemented", kind: "pipeline", stable: false },
  "--progress-interval": { stage: "implemented", kind: "pipeline", stable: false },
  "--focus": { stage: "implemented", kind: "pipeline", stable: false },
  "--answer": { stage: "routable", kind: "pipeline", stable: false },
  "--isolate": { stage: "implemented", kind: "pipeline", stable: false },
  "--allow-modify": { stage: "implemented", kind: "pipeline", stable: false },
  "--scope": { stage: "routable", kind: "pipeline", stable: false },
  "--no-validate": { stage: "implemented", kind: "pipeline", stable: false },
  "--no-run": { stage: "routable", kind: "pipeline", stable: false },
  "--autopilot": { stage: "routable", kind: "pipeline", stable: false, stability: "not_stable" },

  "--quick": { stage: "stable", kind: "legacy", stable: true },
  "--strict": { stage: "stable", kind: "legacy", stable: true },
  "--diagnose": { stage: "routable", kind: "mode", stable: false },
  "--verify": { stage: "routable", kind: "mode", stable: false },
  "--plan-only": { stage: "routable", kind: "mode", stable: false },
  "--optimize": { stage: "routable", kind: "mode", stable: false },
  "--prototype": { stage: "routable", kind: "mode", stable: false },
  "--from": { stage: "stable", kind: "input", stable: true },
  "--goal": { stage: "stable", kind: "input", stable: true },
  "--session": { stage: "stable", kind: "session", stable: true },
  "--yes": { stage: "stable", kind: "compat", stable: true },
  "--list": { stage: "stable", kind: "session", stable: true },
  "--resume": { stage: "routable", kind: "session", stable: false },
  "--switch": { stage: "stable", kind: "session", stable: true },
  "--validate-state": { stage: "stable", kind: "session", stable: true },
  "--strict-state": { stage: "stable", kind: "session", stable: true },
};

function stageRank(stage: FlagStage): number {
  return FLAG_STAGES.indexOf(stage);
}

export function getFlagInfo(flag: string): FlagInfo | null {
  return FLAG_REGISTRY[flag] || null;
}

export function isFlagAtLeast(flag: string, minimumStage: FlagStage): boolean {
  const info = getFlagInfo(flag);
  if (!info) {
    return false;
  }
  return stageRank(info.stage) >= stageRank(minimumStage);
}

export function listFlagsByStage(minimumStage: FlagStage): string[] {
  return Object.keys(FLAG_REGISTRY)
    .filter((flag) => isFlagAtLeast(flag, minimumStage))
    .sort();
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
