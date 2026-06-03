import { emitProgress } from "../pipeline/progress";
import { isValidationHistoryEntry } from "../pipeline/validationCommands";
import { parseArgs } from "./args";
import { STATE_SCHEMA_VERSION } from "./sessionStateModel";
import { MODE_CONFIGS } from "./sessionConfig";
import {
  createAutoIterateSession,
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

type StateObject = Record<string, any>;

const LEGACY_AUTOMATION_DETAIL = "旧 CLI Worker/pipeline 路径已废弃。当前架构默认由主 Agent 直接管理 coder subagent；CLI 仅保留 session 管理、state 校验、finalize 和 protocol-only session 生成。";

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

function emitDeprecatedAutomationPath(
  options: { jsonProgress?: boolean },
  command: "--run" | "--check" | "--dispatch",
): void {
  const detail = `${command} 属于已废弃的外部 Worker/pipeline 入口。${LEGACY_AUTOMATION_DETAIL}`;
  if (options.jsonProgress) {
    emitProgress({
      event: "error",
      reason: "legacy_auto_iterate_pipeline_deprecated",
      command,
      detail,
    }, { jsonProgress: true });
  } else {
    console.log(`❌ ${detail}`);
  }
  process.exitCode = 1;
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
    emitDeprecatedAutomationPath(options, "--check");
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
    emitDeprecatedAutomationPath(options, "--run");
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
    emitDeprecatedAutomationPath(options, "--dispatch");
    return;
  }

  if (options.captureSkillsSession) {
    await captureSkills(options.captureSkillsSession, { yes: options.yes });
    return;
  }

  console.log("初始化 auto-iterate session。");
  console.log("CLI 将生成 state.json、state.md、start-prompt.md 和 current 指针；终端只显示关键摘要，完整执行协议保存在 start-prompt.md。\n");

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
    console.log(created.outputSummary);
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
