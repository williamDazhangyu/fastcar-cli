// @ts-check

const { runNativeCommandAsync } = require("./commandResolver");
const { buildRunOptions } = require("./runOptions");

/**
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions & { promptPath: string }} options
 * @returns {Promise<import("../pipeline/types").PipelineWorkerBaseResult>}
 */
function runClaudeAdapter(options) {
  const args = ["-p", `@${options.promptPath}`];
  return runNativeCommandAsync("claude", args, buildRunOptions(options));
}

module.exports = {
  runClaudeAdapter,
};
