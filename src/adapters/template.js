// @ts-check

const { runShellCommand, runShellCommandAsync } = require("./commandResolver");
const { buildRunOptions } = require("./runOptions");

/**
 * @param {string} template
 * @param {Record<string, unknown>} values
 * @returns {string}
 */
function fillTemplate(template, values) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    return values[key] === undefined || values[key] === null ? "" : String(values[key]);
  });
}

/**
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions & { commandTemplate: string }} options
 * @returns {import("../pipeline/types").PipelineWorkerBaseResult}
 */
function runTemplateAdapter(options) {
  const command = fillTemplate(options.commandTemplate, {
    prompt: options.promptPath,
    result: options.resultPath,
    session: options.session,
    iteration: options.iteration,
  });
  return runShellCommand(command, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });
}

/**
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions & { commandTemplate: string }} options
 * @returns {Promise<import("../pipeline/types").PipelineWorkerBaseResult>}
 */
function runTemplateAdapterAsync(options) {
  const command = fillTemplate(options.commandTemplate, {
    prompt: options.promptPath,
    result: options.resultPath,
    session: options.session,
    iteration: options.iteration,
  });
  return runShellCommandAsync(command, buildRunOptions(options));
}

module.exports = {
  fillTemplate,
  runTemplateAdapter,
  runTemplateAdapterAsync,
};
