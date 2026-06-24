import inquirer from "inquirer";
import path from "path";
import { promises as fsPromises } from "fs";
import { pathExists } from "../fsUtils";
import { colorize, visualLine } from "../cliOutput";
import {
  buildDefaultSessionName,
  getSessionPaths,
  makeUniqueSessionName,
  slugifySessionName,
  toRelative,
  type SessionPaths,
} from "./sessionPaths";
import { readJsonFile, writeJsonFileAtomic } from "./stateIO";
import { buildStateModel } from "./sessionStateModel";
import { buildStateContent } from "./sessionStateContent";
import { buildPromptContent } from "./sessionPromptContent";
import {
  MODE_CONFIGS,
  buildNonInteractiveConfig,
} from "./sessionConfig";
import {
  promptAutoIterateConfig,
  promptAutoIterateConfigFromFile,
  promptMode,
} from "./sessionPromptConfig";
import {
  applyDecisionAnswer,
  writeCurrentFile,
} from "./sessionManager";
import { captureBloatBaseline } from "./bloatCheck";

type StateObject = Record<string, any>;

export interface SourceChecklist {
  path: string;
  content: string;
}

export interface AutoIterateSessionOptions extends StateObject {
  answer?: string | null;
  from?: string | null;
  mode?: string | null;
  resumeSession?: string | null;
  run?: boolean;
  session?: string | null;
  yes?: boolean;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
}

export type ValidateStateJsonModel = (
  state: StateObject,
  expected?: { session?: string },
) => ValidationIssue[];

export type ValidateState = (
  target: string,
  options?: StateObject,
) => Promise<{ ok: boolean; issues?: ValidationIssue[] } | null | undefined>;

export interface SessionCreationDependencies {
  validateState: ValidateState;
  validateStateJsonModel: ValidateStateJsonModel;
}

export interface CreatedAutoIterateSession {
  sessionPaths: SessionPaths;
  answers: StateObject;
  promptContent: string;
  outputSummary: string;
}

export async function readChecklistFile(filePath: string): Promise<SourceChecklist> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const stat = await fsPromises.stat(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`清单路径不是文件: ${resolvedPath}`);
  }

  return {
    path: resolvedPath,
    content: await fsPromises.readFile(resolvedPath, "utf8"),
  };
}

export function withSessionDefaults(
  answers: StateObject,
  sessionPaths: SessionPaths,
): StateObject {
  return {
    ...answers,
    session: sessionPaths.session,
    sessionStateJsonFile: toRelative(sessionPaths.sessionStateJsonPath),
    sessionStateFile: toRelative(sessionPaths.sessionStatePath),
    sessionPromptFile: toRelative(sessionPaths.sessionPromptPath),
    currentFile: toRelative(sessionPaths.currentPath),
    bloatBaseline: answers.bloatBaseline || captureBloatBaseline(process.cwd()),
  };
}

export function renderCreatedSessionSummary(
  answers: StateObject,
  sessionPaths: SessionPaths,
): string {
  const sessionStateJsonFile = answers.sessionStateJsonFile || toRelative(sessionPaths.sessionStateJsonPath);
  const sessionStateFile = answers.sessionStateFile || toRelative(sessionPaths.sessionStatePath);
  const sessionPromptFile = answers.sessionPromptFile || toRelative(sessionPaths.sessionPromptPath);
  const currentFile = answers.currentFile || toRelative(sessionPaths.currentPath);
  const modeLabel = answers.modeLabel ? ` / ${answers.modeLabel}` : "";
  const executionMode = answers.executionMode || "native_subagent";
  const goal = answers.goal || "未指定";

  return [
    colorize("✓ auto-iterate session 已生成", "green"),
    "",
    visualLine("🎯", "目标", goal, "cyan"),
    visualLine("📊", "进度", `session=${sessionPaths.session}；mode=${answers.mode || "unknown"}${modeLabel}；execution=${executionMode}`, "blue"),
    visualLine("🧭", "执行", `读取 ${sessionPromptFile} 和 ${sessionStateJsonFile} 后开始；终端只显示关键进展`, "magenta"),
    visualLine("✅", "结果", `state.md=${sessionStateFile}；current=${currentFile}；详细证据保留在状态文件和验证日志`, "green"),
  ].join("\n");
}

export async function createAutoIterateSession(
  options: AutoIterateSessionOptions,
  mode: string,
  source: SourceChecklist | null,
  dependencies: Pick<SessionCreationDependencies, "validateStateJsonModel">,
): Promise<CreatedAutoIterateSession | null> {
  const rawAnswers = options.yes || options.run
    ? buildNonInteractiveConfig(mode, options, source)
    : source
      ? await promptAutoIterateConfigFromFile(source, mode, options)
      : await promptAutoIterateConfig(mode, options);
  const sessionName = options.session
    ? slugifySessionName(options.session)
    : await makeUniqueSessionName(buildDefaultSessionName(rawAnswers));
  const sessionPaths = getSessionPaths(sessionName);
  const answers = withSessionDefaults(rawAnswers, sessionPaths);

  if (await pathExists(sessionPaths.sessionDir)) {
    if (options.yes || options.run) {
      throw new Error(`session 已存在，非交互模式不会覆盖: ${sessionPaths.session}`);
    }

    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: `检测到已存在的 auto-iterate session "${sessionPaths.session}"，是否覆盖?`,
        default: false,
      },
    ]);

    if (!overwrite) {
      return null;
    }
  }

  await fsPromises.mkdir(sessionPaths.sessionDir, { recursive: true });
  await fsPromises.mkdir(sessionPaths.stateDir, { recursive: true });
  const stateModel = buildStateModel(answers);
  const stateModelIssues = dependencies.validateStateJsonModel(stateModel, {
    session: sessionPaths.session,
  });
  if (stateModelIssues.some((issue) => issue.severity === "error")) {
    const message = stateModelIssues
      .map((issue) => `${issue.severity.toUpperCase()}: ${issue.message}`)
      .join("\n");
    throw new Error(`生成 state.json 失败，结构化状态未通过校验:\n${message}`);
  }
  const promptContent = buildPromptContent(answers);
  await writeJsonFileAtomic(sessionPaths.sessionStateJsonPath, stateModel);
  await fsPromises.writeFile(
    sessionPaths.sessionStatePath,
    buildStateContent(answers),
    "utf8",
  );
  await fsPromises.writeFile(
    sessionPaths.sessionPromptPath,
    promptContent,
    "utf8",
  );
  await writeCurrentFile(sessionPaths, answers);

  return {
    sessionPaths,
    answers,
    promptContent,
    outputSummary: renderCreatedSessionSummary(answers, sessionPaths),
  };
}

export async function resolveMode(
  options: AutoIterateSessionOptions,
): Promise<string | null> {
  if (options.mode) {
    return options.mode;
  }

  if (options.from) {
    return "strict";
  }

  if (options.run || options.yes) {
    return "quick";
  }

  return String(await promptMode("strict"));
}
