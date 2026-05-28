// @ts-check

const fs = require("fs");
const {
  getSessionPaths,
  getStatePaths,
  toRelative,
} = require("./sessionPaths");
const { readJsonFile, writeJsonFileAtomic } = require("./stateIO");

/**
 * @typedef {import("./sessionPaths").SessionPaths} SessionPaths
 * @typedef {import("./stateValidationPrimitives").ValidationIssue} ValidationIssue
 * @typedef {Record<string, any>} StateObject
 * @typedef {{ mode?: string, modeLabel?: string }} CurrentFileAnswers
 * @typedef {{ ok: boolean, applied: boolean, reason: string, message?: string, issues?: ValidationIssue[] }} DecisionAnswerResult
 * @typedef {(session: string, options: { strict: true, allowMissingStateJson: true }) => Promise<{ ok: boolean, degraded?: boolean } | null | undefined>} ValidateStateForResume
 * @typedef {(state: StateObject, expected?: { session?: string }) => ValidationIssue[]} ValidateStateJsonModel
 */

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} content
 * @param {RegExp} pattern
 * @param {string} [fallback]
 * @returns {string}
 */
function extractStateField(content, pattern, fallback = "unknown") {
  const match = content.match(pattern);
  return match && match[1] ? match[1].trim() : fallback;
}

/**
 * @param {SessionPaths} sessionPaths
 * @param {CurrentFileAnswers} answers
 * @returns {Promise<StateObject>}
 */
async function writeCurrentFile(sessionPaths, answers) {
  const current = {
    session: sessionPaths.session,
    mode: answers.mode,
    modeLabel: answers.modeLabel,
    status: "in_progress",
    stateJsonFile: toRelative(sessionPaths.sessionStateJsonPath),
    stateFile: toRelative(sessionPaths.sessionStatePath),
    promptFile: toRelative(sessionPaths.sessionPromptPath),
    updatedAt: new Date().toISOString(),
  };

  await writeJsonFileAtomic(sessionPaths.currentPath, current);
  return current;
}

async function getSessionSummaries() {
  const paths = getStatePaths();
  const current = await readJsonFile(paths.currentPath);
  let entries = [];
  try {
    entries = await fs.promises.readdir(paths.sessionRoot, {
      withFileTypes: true,
    });
  } catch {
    return { current, sessions: [] };
  }

  const sessions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sessionPaths = getSessionPaths(entry.name);
    let content = "";
    try {
      content = await fs.promises.readFile(sessionPaths.sessionStatePath, "utf8");
    } catch {
      // Keep broken sessions visible for cleanup/recovery.
    }

    sessions.push({
      session: entry.name,
      mode: extractStateField(content, /模式：([^\n]+)/),
      phase: extractStateField(content, /当前阶段：([^\n]+)/),
      status: extractStateField(content, /整体完成状态：([^\n]+)/),
      stateJsonFile: toRelative(sessionPaths.sessionStateJsonPath),
      stateFile: toRelative(sessionPaths.sessionStatePath),
      promptFile: toRelative(sessionPaths.sessionPromptPath),
      current: Boolean(current && current.session === entry.name),
    });
  }

  sessions.sort((a, b) => a.session.localeCompare(b.session));
  return { current, sessions };
}

async function listSessions() {
  const { sessions } = await getSessionSummaries();
  if (sessions.length === 0) {
    console.log("暂无 auto-iterate sessions。");
    return;
  }

  console.log("Session                         Mode                  Current  Status       State");
  sessions.forEach((item) => {
    const session = item.session.padEnd(30, " ");
    const mode = item.mode.padEnd(21, " ");
    const current = (item.current ? "*" : "").padEnd(8, " ");
    const status = item.status.padEnd(12, " ");
    console.log(`${session}${mode}${current}${status}${item.stateFile}`);
  });
}

/**
 * @param {string} sessionName
 * @param {"switch" | "resume"} [action]
 * @param {ValidateStateForResume} validateState
 * @returns {Promise<void>}
 */
async function activateSession(sessionName, action = "switch", validateState) {
  const sessionPaths = getSessionPaths(sessionName);
  if (!(await pathExists(sessionPaths.sessionStatePath))) {
    console.log(`❌ 未找到 session: ${sessionPaths.session}`);
    console.log(`   期望状态文件: ${toRelative(sessionPaths.sessionStatePath)}`);
    return;
  }
  if (action === "resume") {
    const previousExitCode = process.exitCode;
    process.exitCode = 0;
    const validationResult = await validateState(sessionPaths.session, {
      strict: true,
      allowMissingStateJson: true,
    });
    if (!validationResult || !validationResult.ok) {
      console.log("❌ resume 已被 strict state 门禁阻止。请先修正 state.json/state.md 后再恢复。");
      process.exitCode = 1;
      return;
    }
    process.exitCode = previousExitCode;
    if (validationResult.degraded) {
      console.log("⚠️  当前 session 缺少 state.json，已按旧 state.md-only session 降级恢复；建议恢复后生成 state.json。");
    }
  }

  const stateContent = await fs.promises.readFile(sessionPaths.sessionStatePath, "utf8");
  const answers = {
    mode: extractStateField(stateContent, /模式：([^/\n]+)/, "unknown"),
    modeLabel: extractStateField(stateContent, /模式：[^/\n]+\/\s*([^\n]+)/, "unknown"),
  };

  await fs.promises.mkdir(sessionPaths.stateDir, { recursive: true });
  await writeCurrentFile(sessionPaths, answers);

  console.log(action === "resume" ? "✅ 已准备恢复 session:" : "✅ 已切换当前 session:");
  console.log(`   Session: ${sessionPaths.session}`);
  console.log(`   模式: ${answers.mode} / ${answers.modeLabel}`);
  console.log(`   状态文件: ${toRelative(sessionPaths.sessionStatePath)}`);
  console.log(`   启动提示: ${toRelative(sessionPaths.sessionPromptPath)}`);
  console.log("\n下一步:");
  console.log(`   将 ${toRelative(sessionPaths.sessionPromptPath)} 的内容发给 Agent`);
}

/**
 * @param {unknown} option
 * @returns {string | null}
 */
function getDecisionOptionId(option) {
  if (typeof option === "string") {
    return option;
  }
  if (option && typeof option === "object" && typeof option.id === "string") {
    return option.id;
  }
  return null;
}

function validateDecisionAnswer(decisionRequest, answer) {
  const options = Array.isArray(decisionRequest && decisionRequest.options)
    ? decisionRequest.options
    : [];
  const optionIds = options
    .map(getDecisionOptionId)
    .filter((id) => id !== null && id !== "");
  if (optionIds.length === 0 || optionIds.includes(answer)) {
    return { ok: true, optionIds };
  }
  return { ok: false, optionIds };
}

/**
 * @param {SessionPaths} sessionPaths
 * @param {string | null | undefined} answer
 * @param {ValidateStateJsonModel} validateStateJsonModel
 * @returns {Promise<DecisionAnswerResult>}
 */
async function applyDecisionAnswer(sessionPaths, answer, validateStateJsonModel) {
  if (!answer) {
    return { ok: true, applied: false, reason: "no_answer" };
  }
  const stateJson = await readJsonFile(sessionPaths.sessionStateJsonPath);
  if (!stateJson) {
    return { ok: true, applied: false, reason: "missing_state" };
  }
  if (!stateJson.decisionRequest || stateJson.decisionRequest.status !== "pending") {
    return { ok: true, applied: false, reason: "no_pending_decision" };
  }
  const answerValidation = validateDecisionAnswer(stateJson.decisionRequest, answer);
  if (!answerValidation.ok) {
    const optionSummary = answerValidation.optionIds.join(", ");
    return {
      ok: false,
      applied: false,
      reason: "invalid_decision_answer",
      message: `--answer ${answer} 不在当前 pending decision 的 options 中${optionSummary ? `: ${optionSummary}` : ""}`,
    };
  }
  stateJson.decisionRequest = {
    ...(stateJson.decisionRequest || {}),
    status: "approved",
    answer,
  };
  const targetField = stateJson.decisionRequest && stateJson.decisionRequest.targetField;
  stateJson.decisions = {
    ...(stateJson.decisions || {}),
    lastAnswer: answer,
    ...(targetField ? { [targetField]: answer } : {}),
  };
  stateJson.watchdog = {
    ...(stateJson.watchdog || {}),
    triggered: false,
    requiredAction: "continue",
  };
  stateJson.updatedAt = new Date().toISOString();
  const issues = validateStateJsonModel(stateJson, { session: sessionPaths.session });
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    return {
      ok: false,
      applied: false,
      reason: "state_schema_failed",
      message: `--answer 后 state.json 未通过 schema 校验: ${errors.slice(0, 3).map((issue) => issue.message).join("; ")}`,
      issues,
    };
  }
  await writeJsonFileAtomic(sessionPaths.sessionStateJsonPath, stateJson);
  return { ok: true, applied: true, reason: "applied" };
}

module.exports = {
  activateSession,
  applyDecisionAnswer,
  getSessionSummaries,
  listSessions,
  writeCurrentFile,
};
