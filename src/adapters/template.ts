import type {
  PipelineWorkerAdapterOptions,
  PipelineWorkerBaseResult,
} from "../pipeline/types";
import { runShellCommand, runShellCommandAsync } from "./commandResolver";
import { buildRunOptions } from "./runOptions";

export function fillTemplate(template: string, values: Record<string, unknown>): string {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    return values[key] === undefined || values[key] === null ? "" : String(values[key]);
  });
}

export function runTemplateAdapter(
  options: PipelineWorkerAdapterOptions & { commandTemplate: string },
): PipelineWorkerBaseResult {
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

export function runTemplateAdapterAsync(
  options: PipelineWorkerAdapterOptions & { commandTemplate: string },
): Promise<PipelineWorkerBaseResult> {
  const command = fillTemplate(options.commandTemplate, {
    prompt: options.promptPath,
    result: options.resultPath,
    session: options.session,
    iteration: options.iteration,
  });
  return runShellCommandAsync(command, buildRunOptions(options));
}
