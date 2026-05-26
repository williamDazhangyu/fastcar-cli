const path = require("path");

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function splitScope(scope) {
  return String(scope || "")
    .split(/[,，;\s]+/)
    .map((item) => normalizePath(item.trim()))
    .filter(Boolean);
}

function modeAllowsWrites(mode, options = {}) {
  if (mode === "verify") {
    return Boolean(options.allowModify);
  }
  if (mode === "plan") {
    return false;
  }
  return true;
}

function isInsideScope(filePath, scopes) {
  const normalized = normalizePath(filePath);
  return scopes.some((scope) => {
    if (scope.endsWith("/**")) {
      return normalized.startsWith(scope.slice(0, -3));
    }
    if (scope.endsWith("/")) {
      return normalized.startsWith(scope);
    }
    return normalized === scope || normalized.startsWith(`${scope}/`);
  });
}

function evaluateWriteGuard(report, ctx = {}) {
  const filesChanged = Array.isArray(report && report.files_changed) ? report.files_changed : [];
  const normalizedFiles = filesChanged.map(normalizePath).filter(Boolean);
  const allowedInternalWrites = new Set(
    (Array.isArray(ctx.allowedInternalWrites) ? ctx.allowedInternalWrites : [])
      .map(normalizePath)
      .filter(Boolean),
  );
  const guardedFiles = normalizedFiles.filter((file) => !allowedInternalWrites.has(file));
  const mode = ctx.mode || "strict";
  const issues = [];

  if (!modeAllowsWrites(mode, ctx) && guardedFiles.length > 0) {
    issues.push({
      reason: "mode_write_forbidden",
      files: guardedFiles,
    });
  }

  const scopes = splitScope(ctx.scope);
  if (scopes.length > 0) {
    const outOfScope = guardedFiles.filter((file) => !isInsideScope(file, scopes));
    if (outOfScope.length > 0) {
      issues.push({
        reason: "scope_violation",
        files: outOfScope,
      });
    }
  }

  const agentStateWrites = guardedFiles.filter((file) => file === ".agent-state" || file.startsWith(".agent-state/"));
  if (agentStateWrites.length > 0) {
    issues.push({
      reason: "agent_state_write_forbidden",
      files: agentStateWrites,
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    filesChanged: normalizedFiles,
  };
}

function resolveWorktreePath(projectRoot, relativePath) {
  return path.resolve(projectRoot, relativePath);
}

module.exports = {
  evaluateWriteGuard,
  modeAllowsWrites,
  resolveWorktreePath,
};
