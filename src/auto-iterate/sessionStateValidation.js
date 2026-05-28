// @ts-check

const path = require("path");
const fs = require("fs");
const {
  getSessionPaths,
  getStatePaths,
  toRelative,
} = require("./sessionPaths");
const { readJsonFile } = require("./stateIO");
const {
  addError,
  normalizeRelativePathForCompare,
} = require("./stateValidationPrimitives");

/**
 * @typedef {import("./stateValidationPrimitives").ValidationIssue} ValidationIssue
 * @typedef {{ session?: string, stateFile?: string, stateJsonFile?: string, promptFile?: string, [key: string]: unknown }} CurrentPointer
 * @typedef {{
 *   stateFile: string,
 *   stateJsonFile: string,
 *   current: CurrentPointer | null,
 *   currentPath: string,
 *   session: string | null,
 *   targetType: "current" | "path" | "session",
 * }} StateFileValidationTarget
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
 * @param {ValidationIssue[]} issues
 * @param {CurrentPointer} current
 * @param {string} expectedSession
 * @param {string} expectedStatePath
 * @param {string} expectedPromptPath
 * @param {string} stateFileInState
 * @param {string} promptFileInState
 * @returns {void}
 */
function compareCurrentPointerToExpected(
  issues,
  current,
  expectedSession,
  expectedStatePath,
  expectedPromptPath,
  stateFileInState,
  promptFileInState,
) {
  const currentStateFile = normalizeRelativePathForCompare(current.stateFile);
  const currentPromptFile = normalizeRelativePathForCompare(current.promptFile);
  if (currentStateFile !== expectedStatePath) {
    addError(issues, `auto-iterate-current.json.stateFile=${current.stateFile}，未指向 ${expectedStatePath}`);
  }
  if (currentPromptFile !== expectedPromptPath) {
    addError(issues, `auto-iterate-current.json.promptFile=${current.promptFile}，未指向 ${expectedPromptPath}`);
  }
  if (stateFileInState && currentStateFile !== normalizeRelativePathForCompare(stateFileInState)) {
    addError(issues, `auto-iterate-current.json.stateFile=${current.stateFile}，与 Session.状态文件=${stateFileInState} 不一致`);
  }
  if (promptFileInState && currentPromptFile !== normalizeRelativePathForCompare(promptFileInState)) {
    addError(issues, `auto-iterate-current.json.promptFile=${current.promptFile}，与 Session.启动提示=${promptFileInState} 不一致`);
  }
  if (current.session !== expectedSession) {
    addError(issues, `current.session=${current.session || "unknown"} 与 state.md session=${expectedSession} 不一致`);
  }
}

/**
 * @param {string | null | undefined} target
 * @returns {Promise<StateFileValidationTarget>}
 */
async function resolveStateFileForValidation(target) {
  const paths = getStatePaths();
  if (!target || target === "__current__") {
    const current = await readJsonFile(paths.currentPath);
    if (!current || !current.stateFile) {
      throw new Error("未找到 current 指针，请传入 --validate-state <session|state.md>");
    }
    return {
      stateFile: path.resolve(process.cwd(), current.stateFile),
      stateJsonFile: current.stateJsonFile
        ? path.resolve(process.cwd(), current.stateJsonFile)
        : path.resolve(process.cwd(), current.stateFile).replace(/state\.md$/, "state.json"),
      current,
      currentPath: paths.currentPath,
      session: current.session || "unknown",
      targetType: "current",
    };
  }

  if (target.endsWith(".md") || target.endsWith(".json") || target.includes("/") || target.includes("\\")) {
    const resolved = path.resolve(process.cwd(), target);
    const stateFile = target.endsWith(".json")
      ? resolved.replace(/state\.json$/, "state.md")
      : resolved;
    const stateJsonFile = target.endsWith(".json")
      ? resolved
      : resolved.replace(/state\.md$/, "state.json");
    return {
      stateFile,
      stateJsonFile,
      current: await readJsonFile(paths.currentPath),
      currentPath: paths.currentPath,
      session: null,
      targetType: "path",
    };
  }

  const sessionPaths = getSessionPaths(target);
  if (!(await pathExists(sessionPaths.sessionStatePath))) {
    throw new Error(`未找到 session state: ${sessionPaths.session} (${toRelative(sessionPaths.sessionStatePath)})`);
  }
  return {
    stateFile: sessionPaths.sessionStatePath,
    stateJsonFile: sessionPaths.sessionStateJsonPath,
    current: await readJsonFile(paths.currentPath),
    currentPath: paths.currentPath,
    session: sessionPaths.session,
    targetType: "session",
  };
}

module.exports = {
  compareCurrentPointerToExpected,
  resolveStateFileForValidation,
};
