import type {
  PipelineWorkerAdapterOptions,
  PipelineWorkerBaseResult,
} from "../pipeline/types";
import { runNativeCommandAsync } from "./commandResolver";
import { buildRunOptions } from "./runOptions";
import { ensureResultFromWorkerOutput } from "./resultRecovery";

export function runGeminiAdapter(
  options: PipelineWorkerAdapterOptions & { promptPath: string; resultPath: string },
): Promise<PipelineWorkerBaseResult> {
  const args = ["-p", `@${options.promptPath}`];
  return runNativeCommandAsync("gemini", args, buildRunOptions(options))
    .then((result) => ensureResultFromWorkerOutput(result, options.resultPath, { label: "Gemini output" }));
}
