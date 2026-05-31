import type {
  PipelineWorkerAdapterOptions,
  PipelineWorkerBaseResult,
} from "../pipeline/types";
import { resolveCommand, runNativeCommandAsync } from "./commandResolver";
import { buildRunOptions } from "./runOptions";
import { readPromptFile } from "./promptFile";
import { ensureResultFromWorkerOutput } from "./resultRecovery";

export interface ResolvedCursorCommand {
  command: string;
  resolved: string;
}

export function resolveCursorCommand(): ResolvedCursorCommand {
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

export function runCursorAdapter(
  options: PipelineWorkerAdapterOptions & { promptPath: string; resultPath: string; cwd: string },
): Promise<PipelineWorkerBaseResult> {
  const cursor = resolveCursorCommand();
  const prompt = readPromptFile(options.promptPath);
  const args = cursor.command === "cursor"
    ? ["agent", "--prompt", `@${options.promptPath}`]
    : ["--print", "--output-format", "text", "--trust", "--workspace", options.cwd, prompt];
  return runNativeCommandAsync(cursor.command, args, buildRunOptions(options))
    .then((result) => ensureResultFromWorkerOutput(result, options.resultPath, { label: "Cursor output" }));
}
