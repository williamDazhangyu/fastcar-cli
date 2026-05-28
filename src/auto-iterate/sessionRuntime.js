// @ts-check
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateState = validateState;
exports.validateStateJsonModel = validateStateJsonModel;
exports.activateSession = activateSession;
exports.initAutoIterate = initAutoIterate;
const runPipeline_1 = require("../pipeline/runPipeline");
const envCheck_1 = require("../pipeline/envCheck");
const progress_1 = require("../pipeline/progress");
const validationCommands_1 = require("../pipeline/validationCommands");
const args_1 = require("./args");
const sessionStateModel_1 = require("./sessionStateModel");
const sessionConfig_1 = require("./sessionConfig");
const sessionCreation_1 = require("./sessionCreation");
const stateSchemaCoreValidators_1 = require("./stateSchemaCoreValidators");
const stateValidationRunner_1 = require("./stateValidationRunner");
const sessionFinalize_1 = require("./sessionFinalize");
const sessionHelp_1 = require("./sessionHelp");
const sessionManager_1 = require("./sessionManager");
const skillCapture_1 = require("./skillCapture");
const naturalLanguageExamples_1 = require("./naturalLanguageExamples");
const dispatch_1 = require("./dispatch");
async function validateState(target, options = {}) {
    return (0, stateValidationRunner_1.validateState)(target, options, validateStateJsonModel);
}
function validateStateJsonModel(state, expected = {}) {
    return (0, stateSchemaCoreValidators_1.validateStateJsonModelCore)(state, {
        expected,
        schemaVersion: sessionStateModel_1.STATE_SCHEMA_VERSION,
        validModes: Object.keys(sessionConfig_1.MODE_CONFIGS),
        isValidationHistoryEntry: validationCommands_1.isValidationHistoryEntry,
    });
}
async function activateSession(sessionName, action = "switch") {
    await (0, sessionManager_1.activateSession)(sessionName, action, validateState);
}
async function initAutoIterate(args = []) {
    const options = (0, args_1.parseArgs)(args);
    if (options.help) {
        (0, sessionHelp_1.showAutoIterateHelp)();
        return;
    }
    if (options.examples) {
        (0, naturalLanguageExamples_1.showNaturalLanguageExamples)(options.query);
        return;
    }
    if (options.check) {
        const report = (0, envCheck_1.checkEnvironment)();
        if (options.jsonProgress) {
            (0, progress_1.emitProgress)(report, { jsonProgress: true });
        }
        else {
            console.log("auto-iterate 环境检查");
            console.log(`usable: ${report.usable}`);
            console.log(`recommended: ${report.recommended || "none"}`);
            console.log(`workers_available: ${report.workers_available.map((item) => item.id).join(", ") || "none"}`);
            console.log(`workers_unavailable: ${report.workers_unavailable.map((item) => `${item.id}:${item.reason}`).join(", ") || "none"}`);
            if (report.issues.length > 0) {
                console.log(`issues: ${report.issues.join(", ")}`);
            }
        }
        return;
    }
    if (options.list) {
        await (0, sessionManager_1.listSessions)();
        return;
    }
    if (options.switchSession) {
        await activateSession(options.switchSession, "switch");
        return;
    }
    if (options.resumeSession && (!options.run || options.noRun)) {
        await activateSession(options.resumeSession, "resume");
        return;
    }
    if (options.run && !options.noRun) {
        if (options.validateState || options.dispatchSession || options.finalizeSession || options.captureSkillsSession) {
            const message = "--run 不能与 --validate-state / --dispatch / --finalize / --capture-skills 组合使用。";
            if (options.jsonProgress) {
                (0, progress_1.emitProgress)({ event: "error", reason: "invalid_run_flag_combination", detail: message }, { jsonProgress: true });
            }
            else {
                console.log(`❌ ${message}`);
            }
            process.exitCode = 1;
            return;
        }
        try {
            const sessionPaths = await (0, sessionCreation_1.ensurePipelineSession)({
                ...options,
                yes: true,
            }, {
                validateState,
                validateStateJsonModel,
            });
            if (!sessionPaths) {
                return;
            }
            await (0, runPipeline_1.runPipeline)({
                session: sessionPaths.session,
                stateJsonPath: sessionPaths.sessionStateJsonPath,
                mode: options.mode,
                agent: options.agent,
                once: options.once,
                jsonProgress: options.jsonProgress,
                stepTimeoutSeconds: options.stepTimeoutSeconds,
                inactivityTimeoutSeconds: options.inactivityTimeoutSeconds,
                validationTimeoutSeconds: options.validationTimeoutSeconds,
                progressIntervalSeconds: options.progressIntervalSeconds,
                maxSteps: options.maxSteps,
                autopilotRun: options.autopilotRun,
                autopilotMaxIterations: options.autopilotMaxIterations,
                validateCommand: options.validateCommand.length > 0 ? options.validateCommand : options.verifyCommand,
                noValidate: options.noValidate,
                focus: options.focus,
                validateStateModel: validateStateJsonModel,
                scope: options.scope,
                isolate: options.isolate,
                allowModify: options.allowModify,
            });
        }
        catch (rawError) {
            const error = rawError;
            if (options.jsonProgress) {
                (0, progress_1.emitProgress)({ event: "error", reason: error.reason || "pipeline_start_failed", detail: error.message }, { jsonProgress: true });
            }
            else {
                console.log(`❌ ${error.message}`);
            }
            process.exitCode = 1;
        }
        return;
    }
    if (options.validateState) {
        await validateState(options.validateState, { strict: options.strictState });
        return;
    }
    if (options.finalizeSession) {
        await (0, sessionFinalize_1.finalizeAutoIterateSession)(options.finalizeSession, { yes: options.yes }, {
            validateState,
        });
        return;
    }
    if (options.dispatchSession) {
        await (0, dispatch_1.initDispatch)(options);
        return;
    }
    if (options.captureSkillsSession) {
        await (0, skillCapture_1.captureSkills)(options.captureSkillsSession, { yes: options.yes });
        return;
    }
    console.log("🚀 初始化 auto-iterate-coding 启动文件");
    console.log("可选择严格启动、快速启动、Diagnose、Verify-only、Plan-only、Optimization-only 或 Prototype-only。");
    console.log("也可以使用: fastcar-cli auto-iterate --from <清单文档路径>\n");
    const mode = await (0, sessionCreation_1.resolveMode)(options);
    if (!mode || !sessionConfig_1.MODE_CONFIGS[mode]) {
        console.log("❌ 无效启动模式，请使用 strict / quick / diagnose / verify / plan / optimize / prototype");
        return;
    }
    const source = options.from ? await (0, sessionCreation_1.readChecklistFile)(options.from) : null;
    try {
        const created = await (0, sessionCreation_1.createAutoIterateSession)(options, mode, source, {
            validateStateJsonModel,
        });
        if (!created) {
            console.log("已取消生成，未修改现有 session。");
            return;
        }
        console.log(created.promptContent);
    }
    catch (rawError) {
        const error = rawError;
        console.log(`❌ ${error.message}`);
        if (error.message.includes("session 已存在，非交互模式不会覆盖")) {
            console.log("   请换一个 --session，或先使用 --resume / --switch。");
            return;
        }
        process.exitCode = 1;
    }
}
