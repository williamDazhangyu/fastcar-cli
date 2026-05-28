// @ts-check

/** @type {readonly import("./types").FlagStage[]} */
const FLAG_STAGES = ["documented", "parsed", "implemented", "routable", "stable"];

/** @type {Record<string, import("./types").FlagInfo>} */
const FLAG_REGISTRY = {
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

/**
 * @param {import("./types").FlagStage} stage
 * @returns {number}
 */
function stageRank(stage) {
  return FLAG_STAGES.indexOf(stage);
}

/**
 * @param {string} flag
 * @returns {import("./types").FlagInfo | null}
 */
function getFlagInfo(flag) {
  return FLAG_REGISTRY[flag] || null;
}

/**
 * @param {string} flag
 * @param {import("./types").FlagStage} minimumStage
 * @returns {boolean}
 */
function isFlagAtLeast(flag, minimumStage) {
  const info = getFlagInfo(flag);
  if (!info) {
    return false;
  }
  return stageRank(info.stage) >= stageRank(minimumStage);
}

/**
 * @param {import("./types").FlagStage} minimumStage
 * @returns {string[]}
 */
function listFlagsByStage(minimumStage) {
  return Object.keys(FLAG_REGISTRY)
    .filter((flag) => isFlagAtLeast(flag, minimumStage))
    .sort();
}

/**
 * @param {unknown} item
 * @returns {item is string}
 */
function isFlagToken(item) {
  return typeof item === "string" && item.startsWith("--");
}

/**
 * @param {unknown[]} command
 * @returns {string[]}
 */
function extractFlags(command) {
  return command.filter(isFlagToken);
}

/**
 * @param {unknown[]} command
 * @returns {import("./types").FlagValidationResult}
 */
function validateRoutableCommand(command) {
  /** @type {import("./types").FlagIssue[]} */
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
