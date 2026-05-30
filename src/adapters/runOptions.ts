import type { PipelineWorkerAdapterOptions } from "../pipeline/types";

export function buildRunOptions(
  options: PipelineWorkerAdapterOptions,
  extra: Partial<PipelineWorkerAdapterOptions> = {},
): PipelineWorkerAdapterOptions {
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
