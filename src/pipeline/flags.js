const FLAG_STAGES = ["documented", "parsed", "implemented", "routable", "stable"];

const FLAG_REGISTRY = {
  "--run": { stage: "routable", kind: "pipeline", stable: false },
  "--once": { stage: "routable", kind: "pipeline", stable: false },
  "--json-progress": { stage: "routable", kind: "pipeline", stable: false },
  "--check": { stage: "routable", kind: "pipeline", stable: false },
  "--validate-cmd": { stage: "routable", kind: "pipeline", stable: false },
  "--max-steps": { stage: "implemented", kind: "pipeline", stable: false },
  "--step-timeout": { stage: "implemented", kind: "pipeline", stable: false },
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

function stageRank(stage) {
  return FLAG_STAGES.indexOf(stage);
}

function getFlagInfo(flag) {
  return FLAG_REGISTRY[flag] || null;
}

function isFlagAtLeast(flag, minimumStage) {
  const info = getFlagInfo(flag);
  if (!info) {
    return false;
  }
  return stageRank(info.stage) >= stageRank(minimumStage);
}

function listFlagsByStage(minimumStage) {
  return Object.keys(FLAG_REGISTRY)
    .filter((flag) => isFlagAtLeast(flag, minimumStage))
    .sort();
}

function extractFlags(command) {
  return command.filter((item) => typeof item === "string" && item.startsWith("--"));
}

function validateRoutableCommand(command) {
  const issues = [];
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

module.exports = {
  FLAG_REGISTRY,
  FLAG_STAGES,
  extractFlags,
  getFlagInfo,
  isFlagAtLeast,
  listFlagsByStage,
  validateRoutableCommand,
};
