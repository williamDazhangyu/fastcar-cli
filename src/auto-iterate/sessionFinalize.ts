import { generateDeliveryDocs } from "../pipeline/deliveryDocs";
import { finalizeDeliveryState } from "../pipeline/pipelineFinalization";
import { getSessionPaths } from "./sessionPaths";
import { readJsonFile, writeJsonFileAtomic } from "./stateIO";
import { resolveStateFileForValidation } from "./sessionStateValidation";
import { captureSkills } from "./skillCapture";
import * as path from "path";
import type { ValidateState } from "./sessionCreation";

type StateObject = Record<string, any>;

export interface FinalizeOptions {
  yes?: boolean;
}

export interface FinalizeDependencies {
  validateState: ValidateState;
}

export async function finalizeAutoIterateSession(
  sessionName: string,
  options: FinalizeOptions = {},
  dependencies: FinalizeDependencies,
): Promise<void> {
  const previousExitCode = process.exitCode;
  process.exitCode = 0;

  const stateInfo = await resolveStateFileForValidation(sessionName);
  const session = stateInfo.session || (stateInfo.current && stateInfo.current.session);
  if (!session || session === "unknown") {
    console.log("❌ 无法确定 session，请传入 --finalize <session>");
    process.exitCode = 1;
    return;
  }

  console.log(`🏁 正在执行迭代结束门禁: ${session}`);
  await captureSkills(session, { yes: options.yes !== false });
  if (process.exitCode && process.exitCode !== 0) {
    console.log("❌ finalize 已停止：Skill Capture / 技能沉淀失败。");
    return;
  }

  const sessionPaths = getSessionPaths(session);
  const stateJson = await readJsonFile(sessionPaths.sessionStateJsonPath) as StateObject | null;
  if (!stateJson) {
    console.log("❌ finalize 已停止：无法读取 state.json 生成交付文档。");
    process.exitCode = 1;
    return;
  }

  const finalized = finalizeDeliveryState(stateJson, { session, mode: stateJson.mode && stateJson.mode.mode, reason: "finalize" });
  if (finalized.changed) {
    await writeJsonFileAtomic(sessionPaths.sessionStateJsonPath, finalized.state);
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

  stateJson.deliveryDocs = await generateDeliveryDocs({
    state: stateJson,
    sessionDir: sessionPaths.sessionDir,
    stateJsonPath: sessionPaths.sessionStateJsonPath,
  });
  stateJson.updatedAt = new Date().toISOString();
  await writeJsonFileAtomic(sessionPaths.sessionStateJsonPath, stateJson);
  console.log(`📚 已生成交付文档: ${stateJson.deliveryDocs.files.join(", ")}`);

  const postDocsValidation = await dependencies.validateState(session, { strict: true });
  if (!postDocsValidation || !postDocsValidation.ok) {
    // 清理已生成的不完整交付文档
    const docsDir = path.join(sessionPaths.sessionDir, "docs");
    try {
      const { promises: fsPromises } = await import("fs");
      await fsPromises.rm(docsDir, { recursive: true, force: true });
    } catch {
      // cleanup failure is non-fatal
    }
    console.log("❌ finalize 未通过：strict state 门禁失败。已清理不完整交付文档。");
    process.exitCode = 1;
    return;
  }

  process.exitCode = previousExitCode || 0;
  console.log("✅ finalize 完成：已执行技能沉淀并通过 strict state 门禁。");
}
