import type {
  PipelineWorkerAdapterOptions,
  PipelineWorkerBaseResult,
} from "../pipeline/types";
import { runNativeCommandAsync } from "./commandResolver";
import { buildRunOptions } from "./runOptions";
import { ensureResultFromWorkerOutput } from "./resultRecovery";

export function runClaudeAdapter(
  options: PipelineWorkerAdapterOptions & { promptPath: string; resultPath: string },
): Promise<PipelineWorkerBaseResult> {
  const args = ["-p", `@${options.promptPath}`];
  return runNativeCommandAsync("claude", args, buildRunOptions(options))
    .then((result) => ensureResultFromWorkerOutput(result, options.resultPath, { label: "Claude output" }));
}
