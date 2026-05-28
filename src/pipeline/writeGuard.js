// @ts-check

const path = require("path");

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizePath(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return "";
  }
  if (normalized.split("/").includes("..")) {
    return "";
  }
  return normalized;
}

/**
 * @param {unknown} scope
 * @returns {string[]}
 */
function splitScope(scope) {
  return String(scope || "")
    .split(/[,，;]+/)
    .map((item) => normalizePath(item.trim()))
    .filter(Boolean);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

/**
 * @param {string} scope
 * @returns {RegExp}
 */
function globToRegExp(scope) {
  let pattern = "";
  for (let index = 0; index < scope.length; index += 1) {
    const char = scope[index];
    if (char === "*") {
      if (scope[index + 1] === "*") {
        const next = scope[index + 2];
        if (next === "/") {
          pattern += "(?:.*\\/)?";
          index += 2;
        } else {
          pattern += ".*";
          index += 1;
        }
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += escapeRegExp(char);
    }
  }
  return new RegExp(`^${pattern}$`);
}

/**
 * @param {string} scope
 * @returns {(filePath: string) => boolean}
 */
function compileScopeMatcher(scope) {
  if (scope.includes("*") || scope.includes("?")) {
    const pattern = globToRegExp(scope);
    return (filePath) => pattern.test(filePath);
  }
  if (scope.endsWith("/")) {
    return (filePath) => filePath.startsWith(scope);
  }
  return (filePath) => filePath === scope || filePath.startsWith(`${scope}/`);
}

/**
 * @param {unknown} scope
 * @returns {Array<(filePath: string) => boolean>}
 */
function compileScopeMatchers(scope) {
  return splitScope(scope).map(compileScopeMatcher);
}

/**
 * @param {string | undefined} mode
 * @param {{ allowModify?: boolean }} [options]
 * @returns {boolean}
 */
function modeAllowsWrites(mode, options = {}) {
  if (mode === "verify") {
    return Boolean(options.allowModify);
  }
  if (mode === "plan") {
    return false;
  }
  return true;
}

/**
 * @param {unknown} filePath
 * @param {unknown[]} scopes
 * @returns {boolean}
 */
function isInsideScope(filePath, scopes) {
  const normalized = normalizePath(filePath);
  if (!normalized) {
    return false;
  }
  const matchers = scopes.map((scope) => compileScopeMatcher(normalizePath(scope)));
  return matchers.some((matcher) => matcher(normalized));
}

/**
 * @param {import("./types").WriteGuardReport | null | undefined} report
 * @param {import("./types").WriteGuardContext} [ctx]
 * @returns {import("./types").WriteGuardResult}
 */
function evaluateWriteGuard(report, ctx = {}) {
  const rawFilesChanged = report ? report.files_changed : null;
  const filesChanged = Array.isArray(rawFilesChanged) ? rawFilesChanged : [];
  const normalizedFiles = [];
  const invalidFiles = [];
  for (const file of filesChanged) {
    const normalized = normalizePath(file);
    if (!normalized) {
      invalidFiles.push(String(file || ""));
      continue;
    }
    normalizedFiles.push(normalized);
  }
  const allowedInternalWrites = new Set(
    (Array.isArray(ctx.allowedInternalWrites) ? ctx.allowedInternalWrites : [])
      .map(normalizePath)
      .filter(Boolean),
  );
  const guardedFiles = normalizedFiles.filter((file) => !allowedInternalWrites.has(file));
  const mode = ctx.mode || "strict";
  /** @type {import("./types").WriteGuardIssue[]} */
  const issues = [];

  if (invalidFiles.length > 0) {
    issues.push({
      reason: "invalid_path",
      files: invalidFiles,
    });
  }

  if (!modeAllowsWrites(mode, ctx) && guardedFiles.length > 0) {
    issues.push({
      reason: "mode_write_forbidden",
      files: guardedFiles,
    });
  }

  const scopeMatchers = compileScopeMatchers(ctx.scope);
  if (scopeMatchers.length > 0) {
    const outOfScope = guardedFiles.filter((file) => !scopeMatchers.some((matcher) => matcher(file)));
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

/**
 * @param {string} projectRoot
 * @param {string} relativePath
 * @returns {string}
 */
function resolveWorktreePath(projectRoot, relativePath) {
  return path.resolve(projectRoot, relativePath);
}

module.exports = {
  evaluateWriteGuard,
  isInsideScope,
  modeAllowsWrites,
  resolveWorktreePath,
};
