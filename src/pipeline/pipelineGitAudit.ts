import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  spawnSync,
  type SpawnSyncReturns,
} from "child_process";
import { normalizeRelativePath } from "./resultSchema";
import type { GitStatusSnapshot } from "./types";


const DIRECTORY_SIGNATURE_MAX_FILES = 1000;
const DIRECTORY_SIGNATURE_MAX_BYTES = 5 * 1024 * 1024;
const INTERNAL_AGENT_STATE_PREFIX = ".agent-state/";

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {import("child_process").SpawnSyncReturns<string>}
 */
export function runGit(args: string[], cwd: string): SpawnSyncReturns<string> {
  const safeDirectory = path.resolve(cwd).replace(/\\/g, "/");
  return spawnSync("git", ["-c", `safe.directory=${safeDirectory}`, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
}

/**
 * @param {string} root
 * @param {string} absolute
 * @param {string} status
 * @returns {string}
 */
export function getDirectorySignature(root: string, absolute: string, status: string): string {
  const rootResolved = path.resolve(root);
  const entries: string[] = [];
  const metadataHash = crypto.createHash("sha256");
  let fileCount = 0;
  let totalBytes = 0;
  let contentHashEnabled = true;
  let entriesBounded = true;
  const fileEntries: Array<{ filePath: string; index: number; baseEntry: string }> = [];
  const appendEntry = (entry: string) => {
    if (entriesBounded) {
      entries.push(entry);
    } else {
      metadataHash.update(entry).update("\n");
    }
  };
  const disableEntryStorage = () => {
    if (!entriesBounded) {
      return;
    }
    entriesBounded = false;
    for (const entry of entries) {
      metadataHash.update(entry).update("\n");
    }
    entries.length = 0;
  };

  /**
   * @param {string} current
   * @returns {void}
   */
  function walk(current: string): void {
    const names = fs.readdirSync(current).sort();
    for (const name of names) {
      const filePath = path.join(current, name);
      const stat = fs.lstatSync(filePath);
      const relativePath = path.relative(rootResolved, filePath).replace(/\\/g, "/");
      if (stat.isDirectory()) {
        appendEntry(`dir:${relativePath}`);
        walk(filePath);
      } else if (stat.isSymbolicLink()) {
        appendEntry(`symlink:${relativePath}:${fs.readlinkSync(filePath)}`);
      } else if (stat.isFile()) {
        fileCount += 1;
        totalBytes += stat.size;
        const baseEntry = `file:${relativePath}:${stat.size}:${stat.mtimeMs}`;
        if (fileCount > DIRECTORY_SIGNATURE_MAX_FILES || totalBytes > DIRECTORY_SIGNATURE_MAX_BYTES) {
          contentHashEnabled = false;
          fileEntries.length = 0;
          appendEntry(baseEntry);
          disableEntryStorage();
        } else if (contentHashEnabled) {
          entries.push(baseEntry);
          fileEntries.push({ filePath, index: entries.length - 1, baseEntry });
        } else {
          appendEntry(baseEntry);
        }
      } else {
        appendEntry(`other:${relativePath}:${stat.size}:${stat.mtimeMs}`);
      }
    }
  }

  walk(absolute);
  if (contentHashEnabled) {
    for (const item of fileEntries) {
      const hash = crypto.createHash("sha256")
        .update(fs.readFileSync(item.filePath))
        .digest("hex");
      entries[item.index] = `${item.baseEntry}:${hash}`;
    }
  }
  const entryCount = entriesBounded ? entries.length : null;
  const digest = entriesBounded
    ? crypto.createHash("sha256")
      .update(entries.join("\n"))
      .digest("hex")
    : metadataHash.digest("hex");
  return `${status}:directory:${entryCount === null ? "bounded" : entryCount}:${fileCount}:${totalBytes}:${contentHashEnabled ? "content" : "metadata"}:${digest}`;
}

/**
 * @param {string} cwd
 * @param {string} file
 * @param {string} status
 * @returns {string}
 */
export function getFileSignature(cwd: string, file: string, status: string): string {
  const normalized = file.replace(/\\/g, "/");
  const absolute = path.resolve(cwd, normalized);
  try {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      return `${status}:symlink:${fs.readlinkSync(absolute)}`;
    }
    if (stat.isDirectory()) {
      if (String(status || "").trim() === "!!") {
        return getDirectorySignature(cwd, absolute, status);
      }
      return `${status}:directory`;
    }
    if (stat.isFile()) {
      const hash = crypto.createHash("sha256")
        .update(fs.readFileSync(absolute))
        .digest("hex");
      return `${status}:file:${stat.size}:${hash}`;
    }
    return `${status}:other:${stat.size}:${stat.mtimeMs}`;
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") {
      return `${status}:missing`;
    }
    return `${status}:error:${fileError.code || "unknown"}`;
  }
}

/**
 * Git collapses ignored directories such as `.agent-state/auto-iterate/` into a
 * single directory entry. Expand the internal state tree so write guard can
 * distinguish allowed per-iteration files from accidental cross-session writes.
 *
 * @param {string} cwd
 * @param {string} directory
 * @param {string} status
 * @param {Map<string, string>} files
 * @returns {void}
 */
function addInternalAgentStateChildren(
  cwd: string,
  directory: string,
  status: string,
  files: Map<string, string>,
): void {
  const normalizedDirectory = directory.replace(/\\/g, "/").replace(/\/?$/, "/");
  if (normalizedDirectory !== ".agent-state/" && !normalizedDirectory.startsWith(INTERNAL_AGENT_STATE_PREFIX)) {
    return;
  }
  const absoluteDirectory = path.resolve(cwd, normalizedDirectory);
  if (!fs.existsSync(absoluteDirectory) || !fs.lstatSync(absoluteDirectory).isDirectory()) {
    return;
  }

  function walk(current: string): void {
    for (const name of fs.readdirSync(current).sort()) {
      const child = path.join(current, name);
      const relativePath = path.relative(cwd, child).replace(/\\/g, "/");
      const stat = fs.lstatSync(child);
      if (stat.isDirectory()) {
        walk(child);
      } else {
        files.set(relativePath, getFileSignature(cwd, relativePath, status));
      }
    }
  }

  walk(absoluteDirectory);
}

/**
 * @param {string} cwd
 * @param {ReadonlySet<string> | ReadonlyMap<string, string> | null} [signaturePaths]
 * @returns {import("./types").GitStatusSnapshot}
 */
export function getGitStatusSnapshot(
  cwd: string,
  signaturePaths: ReadonlySet<string> | ReadonlyMap<string, string> | null = null,
): GitStatusSnapshot {
  const result = runGit(["status", "--porcelain=v1", "-z", "-uall", "--ignored=matching"], cwd);
  if (result.status !== 0) {
    return {
      ok: false,
      files: new Map(),
      error: result.stderr || result.stdout || "git status failed",
    };
  }
  const files = new Map<string, string>();
  const addFile = (file: string, status: string) => {
    const normalized = file.replace(/\\/g, "/");
    const shouldReadFile = !signaturePaths || signaturePaths.has(normalized);
    files.set(normalized, shouldReadFile ? getFileSignature(cwd, normalized, status) : `${status}:present`);
    if (status === "!!") {
      addInternalAgentStateChildren(cwd, normalized, status, files);
    }
  };
  const entries = String(result.stdout || "")
    .split("\0")
    .filter(Boolean);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const status = entry.slice(0, 2);
    const rawPath = entry.slice(3);
    if (!rawPath) {
      continue;
    }
    addFile(rawPath, status);
    if (status[0] === "R" || status[0] === "C") {
      const oldPath = entries[index + 1];
      if (oldPath) {
        addFile(oldPath, status);
        index += 1;
      }
    }
  }
  return {
    ok: true,
    files,
  };
}

/**
 * @param {import("./types").GitStatusSnapshot | null | undefined} before
 * @param {import("./types").GitStatusSnapshot | null | undefined} after
 * @returns {string[]}
 */
export function diffStatusSnapshots(
  before: GitStatusSnapshot | null | undefined,
  after: GitStatusSnapshot | null | undefined,
): string[] {
  if (!before || !after || !before.ok || !after.ok) {
    return [];
  }
  return Array.from(new Set([
    ...before.files.keys(),
    ...after.files.keys(),
  ]))
    .filter((file) => before.files.get(file) !== after.files.get(file))
    .sort();
}

/**
 * @template {{ files_changed?: unknown[] }} T
 * @param {T} result
 * @param {string[]} actualFiles
 * @returns {T | (T & { files_changed: string[] })}
 */
export function mergeActualFilesChanged<T extends { files_changed?: unknown[] }>(
  result: T,
  actualFiles: string[],
): T | (T & { files_changed: string[] }) {
  if (!Array.isArray(actualFiles) || actualFiles.length === 0) {
    return result;
  }
  const reportedFiles = Array.isArray(result.files_changed) ? result.files_changed.map(String) : [];
  const files = new Set<string>([
    ...reportedFiles,
    ...actualFiles,
  ]);
  return {
    ...result,
    files_changed: Array.from(files),
  };
}

/**
 * @param {string} file
 * @param {ReadonlySet<string>} allowedInternalWrites
 * @returns {boolean}
 */
function isAllowedInternalActualWrite(file: string, allowedInternalWrites: ReadonlySet<string>): boolean {
  if (allowedInternalWrites.has(file)) {
    return true;
  }
  if (file === ".agent-state" || file.startsWith(".agent-state/")) {
    const directory = file.endsWith("/") ? file : `${file}/`;
    return Array.from(allowedInternalWrites).some((allowed) => allowed.startsWith(directory));
  }
  return false;
}

/**
 * @param {unknown} files
 * @param {ReadonlySet<string>} allowedInternalWrites
 * @returns {string[]}
 */
export function normalizeActualFilesChanged(files: unknown, allowedInternalWrites: ReadonlySet<string>): string[] {
  const normalizedFiles: string[] = [];
  for (const file of Array.isArray(files) ? files : []) {
    const normalized = normalizeRelativePath(file);
    if (normalized && !isAllowedInternalActualWrite(normalized, allowedInternalWrites)) {
      normalizedFiles.push(normalized);
    }
  }
  return Array.from(new Set(normalizedFiles)).sort();
}

