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
import { generateDashboard } from "./sessionDashboard";
import { showAutoIterateHelp } from "./sessionHelp";
import {
  activateSession as activateSessionCore,
  listSessions,
} from "./sessionManager";
import { captureSkills } from "./skillCapture";
import { showNaturalLanguageExamples } from "./naturalLanguageExamples";

type StateObject = Record<string, any>;

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

  if (options.deprecatedFlags.length > 0) {
    console.log("❌ 旧 CLI Worker/pipeline 入口已废弃，当前不会执行这些参数。");
    console.log(`   废弃参数: ${options.deprecatedFlags.join(", ")}`);
    console.log("   当前 CLI 仅保留 session 管理、state 校验、finalize、dashboard 和 protocol-only session 生成。");
    console.log("   默认自动模式应由主 Agent 直接管理 coder subagent；手动模式请使用 --no-run。");
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    showAutoIterateHelp();
    return;
  }

  if (options.examples) {
    showNaturalLanguageExamples(options.query);
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

  if (options.resumeSession) {
    await activateSession(options.resumeSession, "resume");
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

  if (options.dashboardSession) {
    await generateDashboard(options.dashboardSession);
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
