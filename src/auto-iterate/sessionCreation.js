// @ts-check
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathExists = pathExists;
exports.readChecklistFile = readChecklistFile;
exports.withSessionDefaults = withSessionDefaults;
exports.createAutoIterateSession = createAutoIterateSession;
exports.resolveMode = resolveMode;
exports.ensurePipelineSession = ensurePipelineSession;
const inquirer_1 = __importDefault(require("inquirer"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const sessionPaths_1 = require("./sessionPaths");
const stateIO_1 = require("./stateIO");
const sessionStateModel_1 = require("./sessionStateModel");
const sessionStateContent_1 = require("./sessionStateContent");
const sessionPromptContent_1 = require("./sessionPromptContent");
const sessionConfig_1 = require("./sessionConfig");
const sessionPromptConfig_1 = require("./sessionPromptConfig");
const sessionManager_1 = require("./sessionManager");
async function pathExists(filePath) {
    try {
        await fs_1.promises.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function readChecklistFile(filePath) {
    const resolvedPath = path_1.default.resolve(process.cwd(), filePath);
    const stat = await fs_1.promises.stat(resolvedPath);
    if (!stat.isFile()) {
        throw new Error(`清单路径不是文件: ${resolvedPath}`);
    }
    return {
        path: resolvedPath,
        content: await fs_1.promises.readFile(resolvedPath, "utf8"),
    };
}
function withSessionDefaults(answers, sessionPaths) {
    return {
        ...answers,
        session: sessionPaths.session,
        sessionStateJsonFile: (0, sessionPaths_1.toRelative)(sessionPaths.sessionStateJsonPath),
        sessionStateFile: (0, sessionPaths_1.toRelative)(sessionPaths.sessionStatePath),
        sessionPromptFile: (0, sessionPaths_1.toRelative)(sessionPaths.sessionPromptPath),
        currentFile: (0, sessionPaths_1.toRelative)(sessionPaths.currentPath),
    };
}
async function createAutoIterateSession(options, mode, source, dependencies) {
    const rawAnswers = options.yes || options.run
        ? (0, sessionConfig_1.buildNonInteractiveConfig)(mode, options, source)
        : source
            ? await (0, sessionPromptConfig_1.promptAutoIterateConfigFromFile)(source, mode, options)
            : await (0, sessionPromptConfig_1.promptAutoIterateConfig)(mode, options);
    const sessionName = options.session
        ? (0, sessionPaths_1.slugifySessionName)(options.session)
        : await (0, sessionPaths_1.makeUniqueSessionName)((0, sessionPaths_1.buildDefaultSessionName)(rawAnswers));
    const sessionPaths = (0, sessionPaths_1.getSessionPaths)(sessionName);
    const answers = withSessionDefaults(rawAnswers, sessionPaths);
    if (await pathExists(sessionPaths.sessionDir)) {
        if (options.yes || options.run) {
            throw new Error(`session 已存在，非交互模式不会覆盖: ${sessionPaths.session}`);
        }
        const { overwrite } = await inquirer_1.default.prompt([
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
    await fs_1.promises.mkdir(sessionPaths.sessionDir, { recursive: true });
    await fs_1.promises.mkdir(sessionPaths.stateDir, { recursive: true });
    const stateModel = (0, sessionStateModel_1.buildStateModel)(answers);
    const stateModelIssues = dependencies.validateStateJsonModel(stateModel, {
        session: sessionPaths.session,
    });
    if (stateModelIssues.some((issue) => issue.severity === "error")) {
        const message = stateModelIssues
            .map((issue) => `${issue.severity.toUpperCase()}: ${issue.message}`)
            .join("\n");
        throw new Error(`生成 state.json 失败，结构化状态未通过校验:\n${message}`);
    }
    const promptContent = (0, sessionPromptContent_1.buildPromptContent)(answers);
    await (0, stateIO_1.writeJsonFileAtomic)(sessionPaths.sessionStateJsonPath, stateModel);
    await fs_1.promises.writeFile(sessionPaths.sessionStatePath, (0, sessionStateContent_1.buildStateContent)(answers), "utf8");
    await fs_1.promises.writeFile(sessionPaths.sessionPromptPath, promptContent, "utf8");
    await (0, sessionManager_1.writeCurrentFile)(sessionPaths, answers);
    return {
        sessionPaths,
        answers,
        promptContent,
    };
}
async function resolveMode(options) {
    if (options.mode) {
        return options.mode;
    }
    if (options.from) {
        return "strict";
    }
    if (options.run || options.yes) {
        return "quick";
    }
    return String(await (0, sessionPromptConfig_1.promptMode)("strict"));
}
async function ensurePipelineSession(options, dependencies) {
    if (options.resumeSession) {
        const sessionPaths = (0, sessionPaths_1.getSessionPaths)(options.resumeSession);
        if (!(await pathExists(sessionPaths.sessionStateJsonPath))) {
            throw new Error(`未找到可恢复的 pipeline session: ${sessionPaths.session}`);
        }
        const answerResult = await (0, sessionManager_1.applyDecisionAnswer)(sessionPaths, options.answer, dependencies.validateStateJsonModel);
        if (answerResult && answerResult.ok === false) {
            const error = new Error(answerResult.message || "无效的 --answer");
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
        const stateJson = await (0, stateIO_1.readJsonFile)(sessionPaths.sessionStateJsonPath);
        await (0, sessionManager_1.writeCurrentFile)(sessionPaths, {
            mode: stateJson && stateJson.mode ? stateJson.mode.mode : "unknown",
            modeLabel: stateJson && stateJson.mode ? stateJson.mode.label : "unknown",
        });
        return sessionPaths;
    }
    const mode = await resolveMode(options);
    if (!mode || !sessionConfig_1.MODE_CONFIGS[mode]) {
        throw new Error("无效启动模式，请使用 strict / quick / diagnose / verify / plan / optimize / prototype");
    }
    const source = options.from ? await readChecklistFile(options.from) : null;
    const created = await createAutoIterateSession(options, mode, source, dependencies);
    if (!created) {
        return null;
    }
    return created.sessionPaths;
}
