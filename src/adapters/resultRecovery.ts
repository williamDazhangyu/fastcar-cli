import fs from "fs";
import path from "path";
import type { PipelineWorkerBaseResult } from "../pipeline/types";

export function extractJsonObject(text: string): string | null {
  const value = String(text || "").trim().replace(/^\uFEFF/, "");
  if (!value) {
    return null;
  }
  try {
    JSON.parse(value);
    return value;
  } catch {
    // Try fenced JSON or prose-wrapped JSON produced by the agent.
  }
  const fence = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const fenced = fence[1].trim();
    try {
      JSON.parse(fenced);
      return fenced;
    } catch {
      // Fall through to brace scan.
    }
  }
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = value.slice(start, end + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      return null;
    }
  }
  return null;
}

export function ensureResultFromWorkerOutput(
  result: PipelineWorkerBaseResult,
  resultPath: string,
  options: { extraOutputPaths?: string[]; label?: string } = {},
): PipelineWorkerBaseResult {
  if (fs.existsSync(resultPath)) {
    return result;
  }
  let output = result.stdout || "";
  for (const outputPath of options.extraOutputPaths || []) {
    try {
      output = `${output}\n${fs.readFileSync(outputPath, "utf8")}`;
    } catch {
      // Supplemental output files are best-effort.
    }
  }
  const json = extractJsonObject(output);
  if (!json) {
    return result;
  }
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${json.trim()}\n`, "utf8");
  return {
    ...result,
    stdout: `${result.stdout || ""}\n[fastcar-cli] wrote result.json from ${options.label || "worker output"}\n`,
  };
}
