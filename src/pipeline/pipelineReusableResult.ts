import fs from "fs";
import { parseAndValidateIterationResult } from "./resultSchema";
import type {
  ParsedIterationResult,
  PipelineFocus,
  PipelineStateLike,
  ValidParsedIterationResult,
} from "./types";

export function resultMatchesFocus(
  parsed: ParsedIterationResult | null | undefined,
  focus: PipelineFocus | null | undefined,
): boolean {
  const rawResult = parsed && parsed.result && parsed.result.raw && typeof parsed.result.raw === "object"
    ? parsed.result.raw as { focus?: unknown }
    : {};
  const resultFocus = rawResult.focus;
  const expectedType = focus && focus.type ? focus.type : null;
  const expectedReqId = focus && focus.req_id ? focus.req_id : null;
  if (!resultFocus || typeof resultFocus !== "object") {
    return expectedType === "extract_requirements" && expectedReqId === "REQ-BOOTSTRAP";
  }
  const normalizedFocus = resultFocus as { type?: unknown; req_id?: unknown; reqId?: unknown };
  const actualType = typeof normalizedFocus.type === "string" ? normalizedFocus.type : null;
  const actualReqId = typeof normalizedFocus.req_id === "string"
    ? normalizedFocus.req_id
    : (typeof normalizedFocus.reqId === "string" ? normalizedFocus.reqId : null);
  return actualType === expectedType && actualReqId === expectedReqId;
}

export function resultHasPromptEvidence(resultPath: string, promptPath: string): boolean {
  if (!fs.existsSync(resultPath) || !fs.existsSync(promptPath)) {
    return false;
  }
  const resultStat = fs.statSync(resultPath);
  const promptStat = fs.statSync(promptPath);
  return resultStat.mtimeMs >= promptStat.mtimeMs;
}

export async function readReusableIterationResult(
  resultPath: string,
  promptPath: string,
  focus: PipelineFocus | null | undefined,
): Promise<ValidParsedIterationResult | null> {
  if (!resultHasPromptEvidence(resultPath, promptPath)) {
    return null;
  }
  let parsed: ParsedIterationResult;
  try {
    parsed = parseAndValidateIterationResult(await fs.promises.readFile(resultPath, "utf8"));
  } catch {
    return null;
  }
  if (!parsed.valid || !resultMatchesFocus(parsed, focus)) {
    return null;
  }
  return parsed;
}

export function hasMergedIteration(
  state: PipelineStateLike | null | undefined,
  iteration: number,
): boolean {
  const traceability = state && state.traceability && typeof state.traceability === "object"
    ? state.traceability as { iterations?: unknown }
    : {};
  const iterations = Array.isArray(traceability.iterations) ? traceability.iterations : [];
  return iterations.some((item) => {
    const entry = item && typeof item === "object" ? item as { iteration?: unknown } : {};
    return entry.iteration === iteration;
  });
}
