import { runPipeline } from "../pipeline/runPipeline";
import { checkEnvironment } from "../pipeline/envCheck";
import { emitProgress } from "../pipeline/progress";
import { isValidationHistoryEntry } from "../pipeline/validationCommands";
import { parseArgs } from "./args";
import { STATE_SCHEMA_VERSION } from "./sessionStateModel";
import { MODE_CONFIGS } from "./sessionConfig";
import {
  createAutoIterateSession,
  ensurePipelineSession,
  readChecklistFile,
  resolveMode,
} from "./sessionCreation";
import { validateStateJsonModelCore } from "./stateSchemaCoreValidators";
import { validateState as validateStateRunner } from "./stateValidationRunner";
import { finalizeAutoIterateSession } from "./sessionFinalize";
import { showAutoIterateHelp } from "./sessionHelp";
import {
  activateSession as activateSessionCore,
  listSessions,
} from "./sessionManager";
import { captureSkills } from "./skillCapture";
import { showNaturalLanguageExamples } from "./naturalLanguageExamples";
import { initDispatch } from "./dispatch";

type StateObject = Record<string, any>;

type RuntimeError = Error & {
  reason?: string;
};

export async function validateState(target: string, options: StateObject = {}) {
  return validateStateRunner(target, options, validateStateJsonModel);
}

export function validateStateJsonModel(state: StateObject, expected: StateObject = {}) {
  return validateStateJsonModelCore(state, {
    expected,
    schemaVersion: STATE_SCHEMA_VERSION,
    validModes: Object.keys(MODE_CONFIGS),
    isValidationHistoryEntry,
  });
}

export async function activateSession(
  sessionName: string,
  action: "switch" | "resume" = "switch",
): Promise<void> {
  await activateSessionCore(sessionName, action, validateState);
}

export async function initAutoIterate(args: string[] = []): Promise<void> {
  const options = parseArgs(args);

  if (options.help) {
    showAutoIterateHelp();
    return;
  }

  if (options.examples) {
    showNaturalLanguageExamples(options.query);
    return;
  }

  if (options.check) {
    const report = checkEnvironment();
    if (options.jsonProgress) {
      emitProgress(report as StateObject, { jsonProgress: true });
    } else {
      console.log("auto-iterate 环境检查");
      console.log(`usable: ${report.usable}`);
      console.log(`recommended: ${report.recommended || "none"}`);
      console.log(`workers_available: ${report.workers_available.map((item: StateObject) => item.id).join(", ") || "none"}`);
      console.log(`workers_unavailable: ${report.workers_unavailable.map((item: StateObject) => `${item.id}:${item.reason}`).join(", ") || "none"}`);
      if (report.issues.length > 0) {
        console.log(`issues: ${report.issues.join(", ")}`);
      }
    }
    return;
  }

  if (options.list) {
    await listSessions();
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
        emitProgress({ event: "error", reason: "invalid_run_flag_combination", detail: message }, { jsonProgress: true });
      } else {
        console.log(`❌ ${message}`);
      }
      process.exitCode = 1;
      return;
    }
    try {
      const sessionPaths = await ensurePipelineSession({
        ...options,
        yes: true,
      }, {
        validateState,
        validateStateJsonModel,
      });
      if (!sessionPaths) {
        return;
      }
      await runPipeline({
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
        validateCommand: options.validateCommand.length > 0
          ? options.validateCommand
          : (options.verifyCommand ? [options.verifyCommand] : []),
        noValidate: options.noValidate,
        focus: options.focus as any,
        validateStateModel: validateStateJsonModel,
        scope: options.scope,
        isolate: options.isolate,
        allowModify: options.allowModify,
      });
    } catch (rawError) {
      const error = rawError as RuntimeError;
      if (options.jsonProgress) {
        emitProgress({ event: "error", reason: error.reason || "pipeline_start_failed", detail: error.message }, { jsonProgress: true });
      } else {
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
    await finalizeAutoIterateSession(options.finalizeSession, { yes: options.yes }, {
      validateState,
    });
    return;
  }

  if (options.dispatchSession) {
    await initDispatch(options);
    return;
  }

  if (options.captureSkillsSession) {
    await captureSkills(options.captureSkillsSession, { yes: options.yes });
    return;
  }

  console.log("🚀 初始化 auto-iterate-coding 启动文件");
  console.log("可选择严格启动、快速启动、Diagnose、Verify-only、Plan-only、Optimization-only 或 Prototype-only。");
  console.log("CLI 驱动默认路径: fastcar-cli auto-iterate --check --json-progress 后接 --run --json-progress");
  console.log("手动/fallback 路径示例: fastcar-cli auto-iterate --strict --from <清单文档路径> --session <session> --yes --no-run\n");

  const mode = await resolveMode(options);
  if (!mode || !MODE_CONFIGS[mode]) {
    console.log("❌ 无效启动模式，请使用 strict / quick / diagnose / verify / plan / optimize / prototype");
    return;
  }

  const source = options.from ? await readChecklistFile(options.from) : null;
  try {
    const created = await createAutoIterateSession(options, mode, source, {
      validateStateJsonModel,
    });
    if (!created) {
      console.log("已取消生成，未修改现有 session。");
      return;
    }
    console.log(created.promptContent);
  } catch (rawError) {
    const error = rawError as Error;
    console.log(`❌ ${error.message}`);
    if (error.message.includes("session 已存在，非交互模式不会覆盖")) {
      console.log("   请换一个 --session，或先使用 --resume / --switch。");
      return;
    }
    process.exitCode = 1;
  }
}
