import path from "path";
import {
  getSessionPaths,
  getStatePaths,
  toRelative,
} from "./sessionPaths";
import { readJsonFile } from "./stateIO";
import { pathExists } from "../fsUtils";
import {
  addError,
  normalizeRelativePathForCompare,
} from "./stateValidationPrimitives";

type ValidationIssue = {
  severity: "error" | "warning";
  message: string;
};

export interface CurrentPointer {
  session?: string;
  stateFile?: string;
  stateJsonFile?: string;
  promptFile?: string;
  [key: string]: unknown;
}

export interface StateFileValidationTarget {
  stateFile: string;
  stateJsonFile: string;
  current: CurrentPointer | null;
  currentPath: string;
  session: string | null;
  targetType: "current" | "path" | "session";
}

export function compareCurrentPointerToExpected(
  issues: ValidationIssue[],
  current: CurrentPointer,
  expectedSession: string,
  expectedStatePath: string,
  expectedPromptPath: string,
  stateFileInState: string,
  promptFileInState: string,
): void {
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

export async function resolveStateFileForValidation(
  target?: string | null,
): Promise<StateFileValidationTarget> {
  const paths = getStatePaths();
  if (!target || target === "__current__") {
    const current = await readJsonFile(paths.currentPath) as CurrentPointer | null;
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
      current: await readJsonFile(paths.currentPath) as CurrentPointer | null,
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
    current: await readJsonFile(paths.currentPath) as CurrentPointer | null,
    currentPath: paths.currentPath,
    session: sessionPaths.session,
    targetType: "session",
  };
}
