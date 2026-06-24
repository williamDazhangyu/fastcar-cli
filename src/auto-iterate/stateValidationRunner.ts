import { promises as fsPromises } from "fs";
import path from "path";
import { toRelative } from "./sessionPaths";
import { readJsonFileWithError } from "./stateIO";
import { resolveStateFileForValidation } from "./sessionStateValidation";
import { validateSessionStateBaseline } from "./sessionBaselineValidation";
import { validateNativeSubAgentWorkflowArtifacts } from "./nativeSubAgentWorkflowValidation";
import { pathExists } from "../fsUtils";
import { setExitCode, writeLine } from "../cliOutput";
import { buildBloatReport, buildIncrementalBloatIssues } from "./bloatCheck";

type ValidationIssue = {
  severity: "error" | "warning";
  message: string;
};

type StateLike = Record<string, unknown>;

type JsonReadError = {
  message?: string;
};

async function listIterationDirs(stateJsonFile: string): Promise<string[]> {
  const iterationsDir = path.join(path.dirname(stateJsonFile), "iterations");
  if (!(await pathExists(iterationsDir))) {
    return [];
  }
  const entries = await fsPromises.readdir(iterationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(iterationsDir, entry.name));
}

function hasExecutedCommandEvidence(content: string): boolean {
  const hasExitCode = /(?:^|\n)exit_code:\s*(?:0|[1-9]\d*)\b/.test(content);
  const durationMatches = Array.from(content.matchAll(/(?:^|\n)duration_ms:\s*(\d+)\b/g));
  return hasExitCode && durationMatches.some((match) => Number(match[1]) > 0);
}

async function validateValidationLogEvidence(stateJsonFile: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const iterationDirs = await listIterationDirs(stateJsonFile);
  for (const iterationDir of iterationDirs) {
    const resultPath = path.join(iterationDir, "result.json");
    if (!(await pathExists(resultPath))) {
      continue;
    }
    const validationLogPath = path.join(iterationDir, "validation.log");
    if (!(await pathExists(validationLogPath))) {
      issues.push({
        severity: "error",
        message: `缺少裁判验证日志: ${toRelative(validationLogPath)}；有 result.json 的实现轮次必须写 validation.log`,
      });
      continue;
    }
    const content = await fsPromises.readFile(validationLogPath, "utf8");
    if (/status:\s*not_run|validation skipped/i.test(content)) {
      issues.push({
        severity: "warning",
        message: `裁判验证日志未执行真实验证: ${toRelative(validationLogPath)}`,
      });
      continue;
    }
    if (!hasExecutedCommandEvidence(content)) {
      issues.push({
        severity: "error",
        message: `裁判验证日志缺少 exit_code 或 duration_ms>0 证据: ${toRelative(validationLogPath)}`,
      });
    }
  }
  return issues;
}

export interface ValidateStateOptions {
  strict?: boolean;
  silent?: boolean;
  allowMissingStateJson?: boolean;
}

export interface ValidateStateResult {
  ok: boolean;
  degraded: boolean;
  issues: ValidationIssue[];
}

export type ValidateStateJsonModel = (
  state: StateLike,
  expected?: { session?: string | null },
) => ValidationIssue[];

function applyStrictWarningEscalation(issues: ValidationIssue[]): void {
  issues.forEach((issue) => {
    if (issue.severity === "warning" &&
      !issue.message.includes("当前活动 session 是") &&
      !issue.message.includes("按旧 state.md-only session 降级恢复") &&
      !issue.message.includes("delivery_verifiability=unknown") &&
      !issue.message.includes("DoD.交付可验证性=unknown") &&
      !issue.message.includes("历史膨胀债务未恶化") &&
      !issue.message.includes("缺少 bloatBaseline")) {
      issue.severity = "error";
      issue.message = `strict: ${issue.message}`;
    }
  });
}

export async function validateState(
  target: string | null | undefined,
  options: ValidateStateOptions = {},
  validateStateJsonModel: ValidateStateJsonModel,
  projectDir?: string,
): Promise<ValidateStateResult> {
  const silent = options.silent === true;
  let stateInfo;
  try {
    stateInfo = await resolveStateFileForValidation(target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!silent) {
      writeLine(`❌ ${message}`);
    }
    return {
      ok: false,
      degraded: false,
      issues: [{ severity: "error", message }],
    };
  }

  let content;
  try {
    content = await fsPromises.readFile(stateInfo.stateFile, "utf8");
  } catch (error) {
    const message = `无法读取 state 文件: ${stateInfo.stateFile}`;
    const errorMessage = error instanceof Error && error.message
      ? `${message} (${error.message})`
      : message;
    if (!silent) {
      writeLine(`❌ ${message}`);
    }
    return {
      ok: false,
      degraded: false,
      issues: [{ severity: "error", message: errorMessage }],
    };
  }

  const stateJsonRead = await readJsonFileWithError(stateInfo.stateJsonFile);
  const stateJson = stateJsonRead.data as StateLike | null;
  const stateJsonExists = await pathExists(stateInfo.stateJsonFile);
  const missingStateJsonAllowed = options.allowMissingStateJson && !stateJsonExists;
  const stateJsonIssues: ValidationIssue[] = stateJson
    ? validateStateJsonModel(stateJson, { session: stateInfo.session })
    : [{
        severity: options.strict && !missingStateJsonAllowed ? "error" : "warning",
        message: stateJsonExists
          ? `无法解析机器权威 state.json: ${toRelative(stateInfo.stateJsonFile)} (${(stateJsonRead.error as JsonReadError | null)?.message})`
          : missingStateJsonAllowed
            ? `缺少机器权威 state.json: ${toRelative(stateInfo.stateJsonFile)}；按旧 state.md-only session 降级恢复`
            : `缺少机器权威 state.json: ${toRelative(stateInfo.stateJsonFile)}`,
      }];
  const sessionValidation = await validateSessionStateBaseline(content, stateInfo);
  const nativeWorkflowValidation = await validateNativeSubAgentWorkflowArtifacts(stateInfo.stateJsonFile);
  const validationLogEvidence = await validateValidationLogEvidence(stateInfo.stateJsonFile);
  const bloatIssues: ValidationIssue[] = [];
  if (options.strict && projectDir) {
    const bloatReport = buildBloatReport(projectDir);
    for (const issue of buildIncrementalBloatIssues(bloatReport, stateJson ? stateJson.bloatBaseline : null)) {
      bloatIssues.push({ severity: issue.severity === "error" ? "error" : "warning", message: issue.message });
    }
  }
  const issues = [
    ...stateJsonIssues,
    ...sessionValidation.issues,
    ...nativeWorkflowValidation.issues,
    ...validationLogEvidence,
    ...bloatIssues,
  ];
  if (options.strict) {
    applyStrictWarningEscalation(issues);
  }
  if (!silent) {
    writeLine(`State: ${toRelative(stateInfo.stateFile)}`);
    writeLine(`State JSON: ${toRelative(stateInfo.stateJsonFile)}`);
  }
  if (issues.length === 0) {
    if (!silent) {
      writeLine("✅ state.json 强约束校验通过");
      writeLine("✅ auto-iterate session state 校验通过");
      writeLine("✅ LLM 原生严格工作流产物校验通过");
    }
    return { ok: true, degraded: false, issues: [] };
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  if (!silent) {
    writeLine(hasError ? "❌ auto-iterate session state 校验发现错误:" : "⚠️ auto-iterate session state 校验发现警告:");
    if (stateJsonIssues.length === 0) {
      writeLine("✅ state.json 强约束校验通过");
    } else {
      const hasStateJsonError = stateJsonIssues.some((issue) => issue.severity === "error");
      writeLine(hasStateJsonError ? "❌ state.json 强约束校验发现错误:" : "⚠️ state.json 强约束校验发现警告:");
    }
    if (nativeWorkflowValidation.issues.length === 0) {
      writeLine("✅ LLM 原生严格工作流产物校验通过");
    } else {
      const hasNativeWorkflowError = nativeWorkflowValidation.issues.some((issue) => issue.severity === "error");
      writeLine(hasNativeWorkflowError
        ? "❌ LLM 原生严格工作流产物校验发现错误:"
        : "⚠️ LLM 原生严格工作流产物校验发现警告:");
    }
    if (validationLogEvidence.length === 0) {
      writeLine("✅ validation.log 裁判证据校验通过");
    } else {
      const hasValidationLogError = validationLogEvidence.some((issue) => issue.severity === "error");
      writeLine(hasValidationLogError
        ? "❌ validation.log 裁判证据校验发现错误:"
        : "⚠️ validation.log 裁判证据校验发现警告:");
    }
    issues.forEach((issue) => {
      const prefix = issue.severity === "error" ? "ERROR" : "WARN";
      writeLine(`- ${prefix}: ${issue.message}`);
    });
    writeLine(
      hasError
        ? "下一步: 先修正 state.json / state.md 中的 session 指针、预算/看门狗或原生 sub-agent 工作流产物，再重新运行 --validate-state。"
        : "下一步: 建议在下一轮迭代或交付前同步这些 session 状态字段。",
    );
  }
  if (hasError && !silent) {
    setExitCode(1);
  }
  return {
    ok: !hasError,
    degraded: stateJsonIssues.some((issue) => issue.message.includes("按旧 state.md-only session 降级恢复")),
    issues,
  };
}
