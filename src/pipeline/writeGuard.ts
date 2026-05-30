import path from "path";
import type {
  WriteGuardContext,
  WriteGuardIssue,
  WriteGuardReport,
  WriteGuardResult,
} from "./types";

function normalizePath(value: unknown): string {
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

function splitScope(scope: unknown): string[] {
  return String(scope || "")
    .split(/[,，;]+/)
    .map((item) => normalizePath(item.trim()))
    .filter(Boolean);
}

function escapeRegExp(value: unknown): string {
  return String(value).replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(scope: string): RegExp {
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

function compileScopeMatcher(scope: string): (filePath: string) => boolean {
  if (scope.includes("*") || scope.includes("?")) {
    const pattern = globToRegExp(scope);
    return (filePath) => pattern.test(filePath);
  }
  if (scope.endsWith("/")) {
    return (filePath) => filePath.startsWith(scope);
  }
  return (filePath) => filePath === scope || filePath.startsWith(`${scope}/`);
}

function compileScopeMatchers(scope: unknown): Array<(filePath: string) => boolean> {
  return splitScope(scope).map(compileScopeMatcher);
}

export function modeAllowsWrites(
  mode: string | undefined,
  options: { allowModify?: boolean } = {},
): boolean {
  if (mode === "verify") {
    return Boolean(options.allowModify);
  }
  if (mode === "plan") {
    return false;
  }
  return true;
}

export function isInsideScope(filePath: unknown, scopes: unknown[]): boolean {
  const normalized = normalizePath(filePath);
  if (!normalized) {
    return false;
  }
  const matchers = scopes.map((scope) => compileScopeMatcher(normalizePath(scope)));
  return matchers.some((matcher) => matcher(normalized));
}

export function evaluateWriteGuard(
  report: WriteGuardReport | null | undefined,
  ctx: WriteGuardContext = {},
): WriteGuardResult {
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
  const issues: WriteGuardIssue[] = [];

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

export function resolveWorktreePath(projectRoot: string, relativePath: string): string {
  return path.resolve(projectRoot, relativePath);
}
