// @ts-check

const { runNativeCommandAsync } = require("./commandResolver");
const { buildRunOptions } = require("./runOptions");

/**
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions & { promptPath: string }} options
 * @returns {Promise<import("../pipeline/types").PipelineWorkerBaseResult>}
 */
function runGeminiAdapter(options) {
  const args = ["-p", `@${options.promptPath}`];
  return runNativeCommandAsync("gemini", args, buildRunOptions(options));
}

module.exports = {
  runGeminiAdapter,
};
