import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { emitProgress } from "./progress";
import { runGit } from "./pipelineGitAudit";
import type {
  CollectUntrackedWorktreeFilesResult,
  IsolatedWorktreeApplyResult,
  IsolatedWorktreeCreateResult,
  IsolatedWorktreeOperationResult,
  IsolatedWorktreeOptions,
  UntrackedWorktreeFile,
} from "./types";


/**
 * @param {string} projectRoot
 * @returns {boolean}
 */
export function ensureGitWorktree(projectRoot: string): boolean {
  const result = runGit(["rev-parse", "--is-inside-work-tree"], projectRoot);
  return result.status === 0 && String(result.stdout).trim() === "true";
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeWorktreeName(value: unknown): string {
  const safe = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || "session";
}

/**
 * @param {string} projectRoot
 * @param {string} session
 * @param {number} iteration
 * @returns {import("./types").IsolatedWorktreeCreateResult}
 */
export function makeIsolatedWorktree(
  projectRoot: string,
  session: string,
  iteration: number,
): IsolatedWorktreeCreateResult {
  const tmpRoot = path.join(path.dirname(projectRoot), ".auto-iterate-worktrees");
  const worktreeName = `${sanitizeWorktreeName(session)}-${iteration}-${Date.now()}`;
  const worktreePath = path.join(tmpRoot, worktreeName);
  fs.mkdirSync(tmpRoot, { recursive: true });
  const result = runGit(["worktree", "add", "--detach", worktreePath, "HEAD"], projectRoot);
  if (result.status !== 0) {
    return {
      ok: false,
      worktreePath,
      error: result.stderr || result.stdout || "git worktree add failed",
    };
  }
  return {
    ok: true,
    worktreePath,
  };
}

/**
 * @param {string} projectRoot
 * @param {string} worktreePath
 * @param {import("./types").IsolatedWorktreeOptions} [options]
 * @returns {import("./types").IsolatedWorktreeOperationResult}
 */
export function cleanupIsolatedWorktree(
  projectRoot: string,
  worktreePath: string,
  options: IsolatedWorktreeOptions = {},
): IsolatedWorktreeOperationResult {
  if (typeof options.cleanupIsolatedWorktreeImpl === "function") {
    return options.cleanupIsolatedWorktreeImpl(projectRoot, worktreePath);
  }
  const remove = runGit(["worktree", "remove", "--force", worktreePath], projectRoot);
  if (remove.status !== 0) {
    return {
      ok: false,
      error: remove.stderr || remove.stdout || "git worktree remove failed",
    };
  }
  return { ok: true };
}

/**
 * @param {string} projectRoot
 * @param {string | null} worktreePath
 * @param {number} iteration
 * @param {import("./types").IsolatedWorktreeOptions} options
 * @param {boolean} [emitCleaned]
 * @returns {import("./types").IsolatedWorktreeOperationResult}
 */
export function cleanupIsolatedWorktreeForExit(
  projectRoot: string,
  worktreePath: string | null,
  iteration: number,
  options: IsolatedWorktreeOptions,
  emitCleaned = true,
): IsolatedWorktreeOperationResult {
  if (!worktreePath) {
    return { ok: true };
  }
  const cleanup = cleanupIsolatedWorktree(projectRoot, worktreePath, options);
  if (!cleanup.ok) {
    emitProgress({ event: "error", iter: iteration, reason: "worktree_cleanup_failed", detail: cleanup.error }, options);
    return cleanup;
  }
  if (emitCleaned) {
    emitProgress({ event: "worktree_cleaned", iter: iteration }, options);
  }
  return cleanup;
}

/**
 * @param {string} projectRoot
 * @param {string} worktreePath
 * @returns {import("./types").IsolatedWorktreeApplyResult}
 */
export function applyIsolatedWorktreeDiff(projectRoot: string, worktreePath: string): IsolatedWorktreeApplyResult {
  const diff = runGit(["diff", "--binary", "HEAD"], worktreePath);
  if (diff.status !== 0) {
    return {
      ok: false,
      skipped: false,
      error: diff.stderr || diff.stdout || "git diff failed",
    };
  }
  const untracked = collectUntrackedWorktreeFiles(projectRoot, worktreePath);
  if (!untracked.ok) {
    return untracked;
  }
  if (!String(diff.stdout || "").trim()) {
    const preflight = preflightUntrackedWorktreeFiles(untracked.files);
    if (!preflight.ok) {
      return preflight;
    }
    const copied = copyUntrackedWorktreeFiles(untracked.files);
    if (!copied.ok) {
      return copied;
    }
    return {
      ok: true,
      skipped: copied.copiedFiles.length === 0,
      copiedFiles: copied.copiedFiles,
      reversePatch: "",
    };
  }
  const preflight = preflightUntrackedWorktreeFiles(untracked.files);
  if (!preflight.ok) {
    return preflight;
  }
  const apply = spawnSync("git", ["apply", "--binary", "--whitespace=nowarn"], {
    cwd: projectRoot,
    input: diff.stdout,
    encoding: "utf8",
    shell: false,
  });
  if (apply.status !== 0) {
    return {
      ok: false,
      skipped: false,
      error: apply.stderr || apply.stdout || "git apply failed",
    };
  }
  const copied = copyUntrackedWorktreeFiles(untracked.files);
  if (!copied.ok) {
    return copied;
  }
  return {
    ok: true,
    skipped: false,
    copiedFiles: copied.copiedFiles,
    reversePatch: diff.stdout,
  };
}

/**
 * @param {string} projectRoot
 * @param {import("./types").IsolatedWorktreeApplyResult | null | undefined} applied
 * @returns {import("./types").IsolatedWorktreeOperationResult}
 */
export function rollbackAppliedIsolatedWorktreeDiff(
  projectRoot: string,
  applied: IsolatedWorktreeApplyResult | null | undefined,
): IsolatedWorktreeOperationResult {
  const appliedPatch = applied && applied.ok === true ? applied : null;
  const copiedFiles = appliedPatch && Array.isArray(appliedPatch.copiedFiles) ? appliedPatch.copiedFiles : [];
  for (const relativePath of copiedFiles.slice().reverse()) {
    const target = path.resolve(projectRoot, relativePath);
    const projectRootResolved = path.resolve(projectRoot);
    if (!target.startsWith(`${projectRootResolved}${path.sep}`)) {
      return {
        ok: false,
        error: `unsafe rollback path: ${relativePath}`,
      };
    }
    try {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const reversePatch = appliedPatch && typeof appliedPatch.reversePatch === "string" ? appliedPatch.reversePatch : "";
  if (reversePatch.trim()) {
    const rollback = spawnSync("git", ["apply", "--reverse", "--binary", "--whitespace=nowarn"], {
      cwd: projectRoot,
      input: reversePatch,
      encoding: "utf8",
      shell: false,
    });
    if (rollback.status !== 0) {
      return {
        ok: false,
        error: rollback.stderr || rollback.stdout || "git apply --reverse rollback failed",
      };
    }
  }
  return { ok: true };
}

/**
 * @param {string} projectRoot
 * @param {string} worktreePath
 * @returns {import("./types").CollectUntrackedWorktreeFilesResult}
 */
export function collectUntrackedWorktreeFiles(
  projectRoot: string,
  worktreePath: string,
): CollectUntrackedWorktreeFilesResult {
  const untracked = runGit(["ls-files", "--others", "--exclude-standard", "-z"], worktreePath);
  if (untracked.status !== 0) {
    return {
      ok: false,
      skipped: false,
      error: untracked.stderr || untracked.stdout || "git ls-files untracked failed",
    };
  }
  const ignored = runGit(["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], worktreePath);
  if (ignored.status !== 0) {
    return {
      ok: false,
      skipped: false,
      error: ignored.stderr || ignored.stdout || "git ls-files ignored failed",
    };
  }
  const relativePaths = Array.from(new Set([
    ...String(untracked.stdout || "")
      .split("\0")
      .filter(Boolean),
    ...String(ignored.stdout || "")
      .split("\0")
      .filter(Boolean),
  ]))
    .sort();
  const files: UntrackedWorktreeFile[] = [];
  for (const relativePath of relativePaths) {
    const source = path.resolve(worktreePath, relativePath);
    const target = path.resolve(projectRoot, relativePath);
    const worktreeRoot = path.resolve(worktreePath);
    const projectRootResolved = path.resolve(projectRoot);
    if (!source.startsWith(`${worktreeRoot}${path.sep}`) || !target.startsWith(`${projectRootResolved}${path.sep}`)) {
      return {
        ok: false,
        skipped: false,
        error: `unsafe untracked path: ${relativePath}`,
      };
    }
    const sourceStat = fs.lstatSync(source);
    if (!sourceStat.isFile()) {
      return {
        ok: false,
        skipped: false,
        error: `unsupported untracked file type: ${relativePath}`,
      };
    }
    files.push({ relativePath, source, target });
  }
  return {
    ok: true,
    files,
  };
}

/**
 * @param {import("./types").UntrackedWorktreeFile[]} files
 * @returns {import("./types").IsolatedWorktreeApplyResult}
 */
export function preflightUntrackedWorktreeFiles(files: UntrackedWorktreeFile[]): IsolatedWorktreeApplyResult {
  for (const file of files) {
    if (fs.existsSync(file.target)) {
      return {
        ok: false,
        skipped: false,
        error: `untracked file already exists in main worktree: ${file.relativePath}`,
      };
    }
  }
  return { ok: true, skipped: false, copiedFiles: [] };
}

/**
 * @param {import("./types").UntrackedWorktreeFile[]} files
 * @returns {import("./types").IsolatedWorktreeApplyResult}
 */
export function copyUntrackedWorktreeFiles(files: UntrackedWorktreeFile[]): IsolatedWorktreeApplyResult {
  const copiedFiles: string[] = [];
  for (const file of files) {
    const { relativePath, source, target } = file;
    if (fs.existsSync(target)) {
      return {
        ok: false,
        skipped: false,
        error: `untracked file already exists in main worktree: ${relativePath}`,
      };
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    copiedFiles.push(relativePath);
  }
  return {
    ok: true,
    skipped: false,
    copiedFiles,
  };
}

