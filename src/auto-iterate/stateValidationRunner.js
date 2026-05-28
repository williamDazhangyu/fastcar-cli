// @ts-check

const fs = require("fs");
const { toRelative } = require("./sessionPaths");
const { readJsonFileWithError } = require("./stateIO");
const { resolveStateFileForValidation } = require("./sessionStateValidation");
const { validateSessionStateBaseline } = require("./sessionBaselineValidation");
const { validateSubAgentDispatchState } = require("./subAgentDispatchValidation");

/**
 * @typedef {import("./stateValidationPrimitives").ValidationIssue} ValidationIssue
 * @typedef {Record<string, unknown>} StateLike
 * @typedef {{ strict?: boolean, silent?: boolean, allowMissingStateJson?: boolean }} ValidateStateOptions
 * @typedef {{ ok: boolean, degraded: boolean, issues: ValidationIssue[] }} ValidateStateResult
 * @typedef {(state: StateLike, expected?: { session?: string | null }) => ValidationIssue[]} ValidateStateJsonModel
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
 * @param {ValidationIssue[]} issues
 * @returns {void}
 */
function applyStrictWarningEscalation(issues) {
  issues.forEach((issue) => {
    if (issue.severity === "warning" &&
      !issue.message.includes("当前活动 session 是") &&
      !issue.message.includes("按旧 state.md-only session 降级恢复") &&
      !issue.message.includes("delivery_verifiability=unknown") &&
      !issue.message.includes("DoD.交付可验证性=unknown")) {
      issue.severity = "error";
      issue.message = `strict: ${issue.message}`;
    }
  });
}

/**
 * @param {string | null | undefined} target
 * @param {ValidateStateOptions} [options]
 * @param {ValidateStateJsonModel} validateStateJsonModel
 * @returns {Promise<ValidateStateResult>}
 */
async function validateState(target, options = {}, validateStateJsonModel) {
  const silent = options.silent === true;
  let stateInfo;
  try {
    stateInfo = await resolveStateFileForValidation(target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!silent) {
      console.log(`❌ ${message}`);
    }
    return {
      ok: false,
      degraded: false,
      issues: [{ severity: "error", message }],
    };
  }

  let content;
  try {
    content = await fs.promises.readFile(stateInfo.stateFile, "utf8");
  } catch (error) {
    const message = `无法读取 state 文件: ${stateInfo.stateFile}`;
    const errorMessage = error instanceof Error && error.message
      ? `${message} (${error.message})`
      : message;
    if (!silent) {
      console.log(`❌ ${message}`);
    }
    return {
      ok: false,
      degraded: false,
      issues: [{ severity: "error", message: errorMessage }],
    };
  }

  const stateJsonRead = await readJsonFileWithError(stateInfo.stateJsonFile);
  const stateJson = stateJsonRead.data;
  const stateJsonExists = await pathExists(stateInfo.stateJsonFile);
  const missingStateJsonAllowed = options.allowMissingStateJson && !stateJsonExists;
  const stateJsonIssues = stateJson
    ? validateStateJsonModel(stateJson, { session: stateInfo.session })
    : [{
        severity: options.strict && !missingStateJsonAllowed ? "error" : "warning",
        message: stateJsonExists
          ? `无法解析机器权威 state.json: ${toRelative(stateInfo.stateJsonFile)} (${stateJsonRead.error && stateJsonRead.error.message})`
          : missingStateJsonAllowed
            ? `缺少机器权威 state.json: ${toRelative(stateInfo.stateJsonFile)}；按旧 state.md-only session 降级恢复`
            : `缺少机器权威 state.json: ${toRelative(stateInfo.stateJsonFile)}`,
      }];
  const sessionValidation = await validateSessionStateBaseline(content, stateInfo);
  const subAgentValidation = validateSubAgentDispatchState(content);
  const issues = [...stateJsonIssues, ...sessionValidation.issues, ...subAgentValidation.issues];
  if (options.strict) {
    applyStrictWarningEscalation(issues);
  }
  if (!silent) {
    console.log(`State: ${toRelative(stateInfo.stateFile)}`);
    console.log(`State JSON: ${toRelative(stateInfo.stateJsonFile)}`);
  }
  if (issues.length === 0) {
    if (!silent) {
      console.log("✅ state.json 强约束校验通过");
      console.log("✅ auto-iterate session state 校验通过");
      console.log("✅ sub-agent state 校验通过");
    }
    return { ok: true, degraded: false, issues: [] };
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  if (!silent) {
    console.log(hasError ? "❌ auto-iterate session state 校验发现错误:" : "⚠️ auto-iterate session state 校验发现警告:");
    if (stateJsonIssues.length === 0) {
      console.log("✅ state.json 强约束校验通过");
    } else {
      const hasStateJsonError = stateJsonIssues.some((issue) => issue.severity === "error");
      console.log(hasStateJsonError ? "❌ state.json 强约束校验发现错误:" : "⚠️ state.json 强约束校验发现警告:");
    }
    if (subAgentValidation.issues.length === 0) {
      console.log("✅ sub-agent state 校验通过");
    } else {
      const hasSubAgentError = subAgentValidation.issues.some((issue) => issue.severity === "error");
      console.log(hasSubAgentError ? "❌ sub-agent state 校验发现错误:" : "⚠️ sub-agent state 校验发现警告:");
    }
    issues.forEach((issue) => {
      const prefix = issue.severity === "error" ? "ERROR" : "WARN";
      console.log(`- ${prefix}: ${issue.message}`);
    });
    console.log(
      hasError
        ? "下一步: 先修正 state.json / state.md 中的 session 指针、预算/看门狗或 Sub-Agent Dispatch / Decisions，再重新运行 --validate-state。"
        : "下一步: 建议在下一轮 dispatch、迭代或交付前同步这些 session 状态字段。",
    );
  }
  if (hasError && !silent) {
    process.exitCode = 1;
  }
  return {
    ok: !hasError,
    degraded: stateJsonIssues.some((issue) => issue.message.includes("按旧 state.md-only session 降级恢复")),
    issues,
  };
}

module.exports = {
  validateState,
};
