// @ts-check

const fs = require("fs");
const path = require("path");

const STATE_DIR = ".agent-state";
const SESSION_ROOT_DIR = "auto-iterate";
const CURRENT_FILE = "auto-iterate-current.json";
const SESSION_STATE_JSON_FILE = "state.json";
const SESSION_STATE_FILE = "state.md";
const SESSION_PROMPT_FILE = "start-prompt.md";

/**
 * @typedef {Object} StatePaths
 * @property {string} stateDir
 * @property {string} sessionRoot
 * @property {string} currentPath
 */

/**
 * @typedef {StatePaths & {
 *   session: string,
 *   sessionDir: string,
 *   sessionStateJsonPath: string,
 *   sessionStatePath: string,
 *   sessionPromptPath: string,
 * }} SessionPaths
 */

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function toRelative(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function toRelativeSourcePath(filePath) {
  return toRelative(filePath);
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
function slugifySessionName(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "session";
}

/**
 * @param {{ goal?: string | null, mode?: string | null }} answers
 * @returns {string}
 */
function buildDefaultSessionName(answers) {
  const goalPart = slugifySessionName(answers.goal || "task")
    .split("-")
    .filter(Boolean)
    .slice(0, 6)
    .join("-");
  return slugifySessionName(`${answers.mode || "strict"}-${goalPart || "task"}`);
}

/**
 * @returns {StatePaths}
 */
function getStatePaths() {
  const stateDir = path.join(process.cwd(), STATE_DIR);
  const sessionRoot = path.join(stateDir, SESSION_ROOT_DIR);
  return {
    stateDir,
    sessionRoot,
    currentPath: path.join(stateDir, CURRENT_FILE),
  };
}

/**
 * @param {string | null | undefined} sessionName
 * @returns {SessionPaths}
 */
function getSessionPaths(sessionName) {
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
 * @param {string} sessionRoot
 * @param {string | null | undefined} sessionName
 * @returns {string}
 */
function resolveExistingSessionName(sessionRoot, sessionName) {
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

/**
 * @param {string | null | undefined} baseName
 * @returns {Promise<string>}
 */
async function makeUniqueSessionName(baseName) {
  const base = slugifySessionName(baseName);
  let candidate = base;
  let index = 2;
  while (await pathExists(getSessionPaths(candidate).sessionDir)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

module.exports = {
  buildDefaultSessionName,
  getSessionPaths,
  getStatePaths,
  makeUniqueSessionName,
  resolveExistingSessionName,
  slugifySessionName,
  toRelative,
  toRelativeSourcePath,
};
