import { promises as fsPromises } from "fs";
import { toRelative } from "./sessionPaths";
import { readJsonFileWithError } from "./stateIO";
import { resolveStateFileForValidation } from "./sessionStateValidation";
import { validateSessionStateBaseline } from "./sessionBaselineValidation";
import { validateSubAgentDispatchState } from "./subAgentDispatchValidation";
import { pathExists } from "../fsUtils";
import { setExitCode, writeLine } from "../cliOutput";

type ValidationIssue = {
  severity: "error" | "warning";
  message: string;
};

type StateLike = Record<string, unknown>;

type JsonReadError = {
  message?: string;
};

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
      !issue.message.includes("DoD.交付可验证性=unknown")) {
      issue.severity = "error";
      issue.message = `strict: ${issue.message}`;
    }
  });
}

export async function validateState(
  target: string | null | undefined,
  options: ValidateStateOptions = {},
  validateStateJsonModel: ValidateStateJsonModel,
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
  const subAgentValidation = validateSubAgentDispatchState(content);
  const issues = [...stateJsonIssues, ...sessionValidation.issues, ...subAgentValidation.issues];
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
      writeLine("✅ sub-agent state 校验通过");
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
    if (subAgentValidation.issues.length === 0) {
      writeLine("✅ sub-agent state 校验通过");
    } else {
      const hasSubAgentError = subAgentValidation.issues.some((issue) => issue.severity === "error");
      writeLine(hasSubAgentError ? "❌ sub-agent state 校验发现错误:" : "⚠️ sub-agent state 校验发现警告:");
    }
    issues.forEach((issue) => {
      const prefix = issue.severity === "error" ? "ERROR" : "WARN";
      writeLine(`- ${prefix}: ${issue.message}`);
    });
    writeLine(
      hasError
        ? "下一步: 先修正 state.json / state.md 中的 session 指针、预算/看门狗或 Sub-Agent Dispatch / Decisions，再重新运行 --validate-state。"
        : "下一步: 建议在下一轮 dispatch、迭代或交付前同步这些 session 状态字段。",
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
