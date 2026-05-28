// @ts-check

const fs = require("fs");
const { resolveCommand, runNativeCommandAsync } = require("./commandResolver");
const { buildRunOptions } = require("./runOptions");

/**
 * @returns {{ command: string; resolved: string }}
 */
function resolveCursorCommand() {
  const candidates = ["cursor", "agent", "cursor-agent"];
  for (const candidate of candidates) {
    const resolved = resolveCommand(candidate);
    if (resolved !== candidate) {
      return {
        command: candidate,
        resolved,
      };
    }
  }
  return {
    command: "cursor",
    resolved: "cursor",
  };
}

/**
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions & { promptPath: string; cwd: string }} options
 * @returns {Promise<import("../pipeline/types").PipelineWorkerBaseResult>}
 */
function runCursorAdapter(options) {
  const cursor = resolveCursorCommand();
  const prompt = fs.readFileSync(options.promptPath, "utf8");
  const args = cursor.command === "cursor"
    ? ["agent", "--prompt", `@${options.promptPath}`]
    : ["--print", "--output-format", "text", "--trust", "--workspace", options.cwd, prompt];
  return runNativeCommandAsync(cursor.command, args, buildRunOptions(options));
}

module.exports = {
  resolveCursorCommand,
  runCursorAdapter,
};
