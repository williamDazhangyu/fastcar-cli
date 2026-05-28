// @ts-check

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { getLanguageText } = require("./language");
const { validationConfigCommands } = require("./validationCommands");

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
function tail(value, max = 4096) {
  const text = String(value || "");
  return text.length > max ? text.slice(text.length - max) : text;
}

/**
 * @param {unknown} item
 * @returns {item is string}
 */
function isTruthyString(item) {
  return typeof item === "string" && Boolean(item);
}

/**
 * @param {import("./types").PipelineStateLike | null | undefined} state
 * @param {unknown} explicit
 * @returns {string[]}
 */
function parseValidationCommands(state, explicit) {
  if (explicit) {
    return (Array.isArray(explicit) ? explicit : [explicit]).filter(isTruthyString);
  }
  const validation = state && state.validation && typeof state.validation === "object" ? state.validation : {};
  const commands = Array.isArray(validation.commands) ? validation.commands : [];
  return validationConfigCommands(commands)
    .filter((item) => {
      const normalized = String(item).trim();
      if (/^由 Agent 自动识别/.test(normalized)) {
        return false;
      }
      if (/^由 Agent 从/.test(normalized)) {
        return false;
      }
      if (/^一个原型运行命令/.test(normalized)) {
        return false;
      }
      return ![
        "由 Agent 补充",
        "缺失",
        "not_run",
        "未指定",
        "一个原型运行命令",
      ].some((placeholder) => normalized.toLowerCase() === placeholder.toLowerCase());
    });
}

/**
 * @param {string[]} commands
 * @param {string} projectRoot
 * @param {string} iterationDir
 * @param {unknown} language
 * @param {import("./types").PipelineValidationOptions} [options]
 * @returns {Promise<import("./types").ValidationResult>}
 */
async function runValidationCommands(commands, projectRoot, iterationDir, language, options = {}) {
  const logFileName = options.logFileName || "validation.log";
  if (commands.length === 0) {
    const summary = getLanguageText(language).validationNotConfigured;
    await fs.promises.writeFile(
      path.join(iterationDir, logFileName),
      [
        "status: not_run",
        "command: none",
        `reason: ${summary}`,
        "",
      ].join("\n"),
      "utf8",
    );
    return {
      status: "not_run",
      command: null,
      exitCode: null,
      summary,
    };
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 10 * 60 * 1000;
  /** @type {Array<import("./types").ValidationCommandResult & { stdout: string; stderr: string }>} */
  const results = [];
  for (const command of commands) {
    const startedAt = Date.now();
    const result = spawnSync(command, {
      cwd: projectRoot,
      encoding: "utf8",
      shell: true,
      timeout: timeoutMs,
    });
    results.push({
      command,
      status: result.status === 0 ? "passed" : "failed",
      exitCode: result.status === null ? 1 : result.status,
      signal: result.signal || "none",
      error: result.error ? result.error.message : "none",
      durationMs: Date.now() - startedAt,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    });
    if (result.status !== 0) {
      break;
    }
  }
  const log = results.map((item) => [
    `command: ${item.command}`,
    `exit_code: ${item.exitCode}`,
    `signal: ${item.signal}`,
    `error: ${item.error}`,
    `duration_ms: ${item.durationMs}`,
    "stdout:",
    item.stdout,
    "stderr:",
    item.stderr,
  ].join("\n")).join("\n\n---\n\n");
  await fs.promises.writeFile(path.join(iterationDir, logFileName), log, "utf8");
  const failed = results.find((item) => item.status === "failed");
  const last = failed || results[results.length - 1];
  const outputSummary = tail(`${last.stdout || ""}\n${last.stderr || ""}`.trim());
  const fallbackSummary = [
    last.error && last.error !== "none" ? `error=${last.error}` : "",
    last.signal && last.signal !== "none" ? `signal=${last.signal}` : "",
    last.exitCode !== undefined && last.exitCode !== null ? `exit_code=${last.exitCode}` : "",
  ].filter(Boolean).join(" ");
  return {
    status: failed ? "failed" : "passed",
    command: commands.join(" && "),
    exitCode: last.exitCode,
    durationMs: results.reduce((total, item) => total + (item.durationMs || 0), 0),
    summary: outputSummary || fallbackSummary || (failed ? "validation command failed without output" : ""),
    results: results.map(({ stdout, stderr, ...item }) => ({
      ...item,
      stdoutTail: tail(stdout),
      stderrTail: tail(stderr),
    })),
  };
}

/**
 * @param {string} iterationDir
 * @param {string} reason
 * @param {import("./types").PipelineValidationOptions} [options]
 * @returns {Promise<import("./types").ValidationResult>}
 */
async function skipValidation(iterationDir, reason, options = {}) {
  const logFileName = options.logFileName || "validation.log";
  await fs.promises.writeFile(
    path.join(iterationDir, logFileName),
    `validation skipped: ${reason}\n`,
    "utf8",
  );
  return {
    status: "skipped",
    command: null,
    exitCode: null,
    summary: reason,
  };
}

module.exports = {
  parseValidationCommands,
  runValidationCommands,
  skipValidation,
};
