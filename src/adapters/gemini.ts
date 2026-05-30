import type {
  PipelineWorkerAdapterOptions,
  PipelineWorkerBaseResult,
} from "../pipeline/types";
import { runNativeCommandAsync } from "./commandResolver";
import { buildRunOptions } from "./runOptions";

export function runGeminiAdapter(
  options: PipelineWorkerAdapterOptions & { promptPath: string },
): Promise<PipelineWorkerBaseResult> {
  const args = ["-p", `@${options.promptPath}`];
  return runNativeCommandAsync("gemini", args, buildRunOptions(options));
}
