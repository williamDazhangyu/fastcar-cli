import { promises as fsPromises } from "fs";
import fs from "fs";
import path from "path";
import { pathExists } from "../fsUtils";

const STATE_DIR = ".agent-state";
const SESSION_ROOT_DIR = "auto-iterate";
const CURRENT_FILE = "auto-iterate-current.json";
const SESSION_STATE_JSON_FILE = "state.json";
const SESSION_STATE_FILE = "state.md";
const SESSION_PROMPT_FILE = "start-prompt.md";

export interface StatePaths {
  stateDir: string;
  sessionRoot: string;
  currentPath: string;
}

export interface SessionPaths extends StatePaths {
  session: string;
  sessionDir: string;
  sessionStateJsonPath: string;
  sessionStatePath: string;
  sessionPromptPath: string;
}

export function toRelative(filePath: string): string {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

export function toRelativeSourcePath(filePath: string): string {
  return toRelative(filePath);
}

export function slugifySessionName(value: string | null | undefined): string {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "session";
}

export function buildDefaultSessionName(answers: { goal?: string | null; mode?: string | null }): string {
  const goalPart = slugifySessionName(answers.goal || "task")
    .split("-")
    .filter(Boolean)
    .slice(0, 6)
    .join("-");
  return slugifySessionName(`${answers.mode || "strict"}-${goalPart || "task"}`);
}

export function getStatePaths(): StatePaths {
  const stateDir = path.join(process.cwd(), STATE_DIR);
  const sessionRoot = path.join(stateDir, SESSION_ROOT_DIR);
  return {
    stateDir,
    sessionRoot,
    currentPath: path.join(stateDir, CURRENT_FILE),
  };
}

export function getSessionPaths(sessionName: string | null | undefined): SessionPaths {
  const paths = getStatePaths();
  const session = resolveExistingSessionName(paths.sessionRoot, sessionName);
  const sessionDir = path.join(paths.sessionRoot, session);
  return {
    ...paths,
    session,
    sessionDir,
    sessionStateJsonPath: path.join(sessionDir, SESSION_STATE_JSON_FILE),
    sessionStatePath: path.join(sessionDir, SESSION_STATE_FILE),
    sessionPromptPath: path.join(sessionDir, SESSION_PROMPT_FILE),
  };
}

/**
 * Existing sessions may predate slug normalization or differ only by case; use
 * the on-disk directory first so resume/switch keeps backward compatibility.
 */
export function resolveExistingSessionName(
  sessionRoot: string,
  sessionName: string | null | undefined,
): string {
  const rawSession = String(sessionName || "");
  const slug = slugifySessionName(rawSession);
  try {
    const entries = fs.readdirSync(sessionRoot, { withFileTypes: true });
    const direct = entries.find((entry) => entry.isDirectory() && entry.name === rawSession);
    if (direct) {
      return direct.name;
    }
    const folded = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === slug.toLowerCase());
    if (folded) {
      return folded.name;
    }
  } catch {
    // New sessions use canonical slug names when the root does not exist yet.
  }
  return slug;
}

export async function makeUniqueSessionName(baseName: string | null | undefined): Promise<string> {
  const base = slugifySessionName(baseName);
  let candidate = base;
  let index = 2;
  while (await pathExists(getSessionPaths(candidate).sessionDir)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}
