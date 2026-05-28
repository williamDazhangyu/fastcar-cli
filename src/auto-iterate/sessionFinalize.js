// @ts-check
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeAutoIterateSession = finalizeAutoIterateSession;
const deliveryDocs_1 = require("../pipeline/deliveryDocs");
const pipelineFinalization_1 = require("../pipeline/pipelineFinalization");
const sessionPaths_1 = require("./sessionPaths");
const stateIO_1 = require("./stateIO");
const sessionStateValidation_1 = require("./sessionStateValidation");
const skillCapture_1 = require("./skillCapture");
async function finalizeAutoIterateSession(sessionName, options = {}, dependencies) {
    const previousExitCode = process.exitCode;
    process.exitCode = 0;
    const stateInfo = await (0, sessionStateValidation_1.resolveStateFileForValidation)(sessionName);
    const session = stateInfo.session || (stateInfo.current && stateInfo.current.session);
    if (!session || session === "unknown") {
        console.log("❌ 无法确定 session，请传入 --finalize <session>");
        process.exitCode = 1;
        return;
    }
    console.log(`🏁 正在执行迭代结束门禁: ${session}`);
    await (0, skillCapture_1.captureSkills)(session, { yes: options.yes !== false });
    if (process.exitCode && process.exitCode !== 0) {
        console.log("❌ finalize 已停止：Skill Capture / 技能沉淀失败。");
        return;
    }
    const sessionPaths = (0, sessionPaths_1.getSessionPaths)(session);
    const stateJson = await (0, stateIO_1.readJsonFile)(sessionPaths.sessionStateJsonPath);
    if (!stateJson) {
        console.log("❌ finalize 已停止：无法读取 state.json 生成交付文档。");
        process.exitCode = 1;
        return;
    }
    const finalized = (0, pipelineFinalization_1.finalizeDeliveryState)(stateJson, { session, mode: stateJson.mode && stateJson.mode.mode, reason: "finalize" });
    if (finalized.changed) {
        await (0, stateIO_1.writeJsonFileAtomic)(sessionPaths.sessionStateJsonPath, finalized.state);
        Object.keys(stateJson).forEach((key) => delete stateJson[key]);
        Object.assign(stateJson, finalized.state);
        console.log("✅ 已收敛交付门禁状态。");
    }
    const preDocsValidation = await dependencies.validateState(session, { strict: true });
    if (!preDocsValidation || !preDocsValidation.ok) {
        console.log("❌ finalize 未通过：strict state 门禁失败。");
        process.exitCode = 1;
        return;
    }
    stateJson.deliveryDocs = await (0, deliveryDocs_1.generateDeliveryDocs)({
        state: stateJson,
        sessionDir: sessionPaths.sessionDir,
        stateJsonPath: sessionPaths.sessionStateJsonPath,
    });
    stateJson.updatedAt = new Date().toISOString();
    await (0, stateIO_1.writeJsonFileAtomic)(sessionPaths.sessionStateJsonPath, stateJson);
    console.log(`📚 已生成交付文档: ${stateJson.deliveryDocs.files.join(", ")}`);
    const postDocsValidation = await dependencies.validateState(session, { strict: true });
    if (!postDocsValidation || !postDocsValidation.ok) {
        console.log("❌ finalize 未通过：strict state 门禁失败。");
        process.exitCode = 1;
        return;
    }
    process.exitCode = previousExitCode || 0;
    console.log("✅ finalize 完成：已执行技能沉淀并通过 strict state 门禁。");
}
