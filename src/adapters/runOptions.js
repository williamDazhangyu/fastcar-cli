// @ts-check

/**
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions} options
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions} [extra]
 * @returns {import("../pipeline/types").PipelineWorkerAdapterOptions}
 */
function buildRunOptions(options, extra = {}) {
  return {
    cwd: options.cwd,
    promptPath: options.promptPath,
    resultPath: options.resultPath,
    timeoutMs: options.timeoutMs,
    inactivityTimeoutMs: options.inactivityTimeoutMs,
    warnBeforeMs: options.warnBeforeMs,
    graceKillMs: options.graceKillMs,
    timeoutWarningPath: options.timeoutWarningPath,
    stopWhenResultValid: options.stopWhenResultValid,
    onOutput: options.onOutput,
    ...extra,
  };
}

module.exports = {
  buildRunOptions,
};
