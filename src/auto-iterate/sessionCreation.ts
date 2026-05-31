import inquirer from "inquirer";
import path from "path";
import { promises as fsPromises } from "fs";
import { pathExists } from "../fsUtils";
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
  };
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

export async function ensurePipelineSession(
  options: AutoIterateSessionOptions,
  dependencies: SessionCreationDependencies,
): Promise<SessionPaths | null> {
  if (options.resumeSession) {
    const sessionPaths = getSessionPaths(options.resumeSession);
    if (!(await pathExists(sessionPaths.sessionStateJsonPath))) {
      throw new Error(`未找到可恢复的 pipeline session: ${sessionPaths.session}`);
    }
    const answerResult = await applyDecisionAnswer(
      sessionPaths,
      options.answer,
      dependencies.validateStateJsonModel,
    );
    if (answerResult && answerResult.ok === false) {
      const error = new Error(answerResult.message || "无效的 --answer") as Error & {
        reason?: string;
      };
      error.reason = answerResult.reason || "invalid_decision_answer";
      throw error;
    }
    const previousExitCode = process.exitCode;
    process.exitCode = 0;
    const validationResult = await dependencies.validateState(sessionPaths.session, {
      strict: true,
      silent: true,
    });
    if (!validationResult || !validationResult.ok) {
      process.exitCode = previousExitCode;
      const issueSummary = validationResult && Array.isArray(validationResult.issues)
        ? validationResult.issues
          .filter((issue) => issue.severity === "error")
          .slice(0, 3)
          .map((issue) => issue.message)
          .join("; ")
        : "";
      throw new Error(`resume 已被 strict state 门禁阻止。请先修正 state.json/state.md 后再恢复。${issueSummary ? ` ${issueSummary}` : ""}`);
    }
    process.exitCode = previousExitCode;
    const stateJson = await readJsonFile(sessionPaths.sessionStateJsonPath) as StateObject | null;
    await writeCurrentFile(sessionPaths, {
      mode: stateJson && stateJson.mode ? stateJson.mode.mode : "unknown",
      modeLabel: stateJson && stateJson.mode ? stateJson.mode.label : "unknown",
    });
    return sessionPaths;
  }

  const mode = await resolveMode(options);
  if (!mode || !MODE_CONFIGS[mode]) {
    throw new Error("无效启动模式，请使用 strict / quick / diagnose / verify / plan / optimize / prototype");
  }
  const source = options.from ? await readChecklistFile(options.from) : null;
  const created = await createAutoIterateSession(
    options,
    mode,
    source,
    dependencies,
  );
  if (!created) {
    return null;
  }
  return created.sessionPaths;
}
