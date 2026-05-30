import path from "path";
import type { IterationPaths } from "./types";

export function buildIterationPaths(stateJsonPath: string, iteration: number): IterationPaths {
  const iterationDir = path.join(
    path.dirname(stateJsonPath),
    "iterations",
    String(iteration),
  );
  return {
    iterationDir,
    promptPath: path.join(iterationDir, "prompt.md"),
    resultPath: path.join(iterationDir, "result.json"),
    workerLogPath: path.join(iterationDir, "worker.log"),
    validationLogPath: path.join(iterationDir, "validation.log"),
  };
}
