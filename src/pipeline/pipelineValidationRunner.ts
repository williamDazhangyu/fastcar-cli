import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import treeKill from "tree-kill";

import { getLanguageText } from "./language";
import { validationConfigCommands } from "./validationCommands";
import type {
  PipelineStateLike,
  PipelineValidationOptions,
  ValidationCommandResult,
  ValidationResult,
} from "./types";

type ValidationCommandWithOutput = ValidationCommandResult & {
  stdout: string;
  stderr: string;
};

function tail(value: unknown, max = 4096): string {
  const text = String(value || "");
  return text.length > max ? text.slice(text.length - max) : text;
}

function isTruthyString(item: unknown): item is string {
  return typeof item === "string" && Boolean(item);
}

function killValidationProcessTree(pid: number | undefined | null): Promise<void> {
  if (!pid) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    treeKill(pid, "SIGTERM", () => resolve());
  });
}

function runValidationCommand(
  command: string,
  projectRoot: string,
  timeoutMs: number,
): Promise<ValidationCommandWithOutput> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;

    function finish(result: Partial<ValidationCommandResult>): void {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve({
        command,
        status: result.status || "failed",
        exitCode: result.exitCode === undefined ? 1 : result.exitCode,
        signal: result.signal || "none",
        error: result.error || "none",
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    }

    const child = spawn(command, {
      cwd: projectRoot,
      shell: true,
      windowsHide: true,
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: Error) => {
      finish({ status: "failed", exitCode: 1, error: error.message });
    });
    child.on("close", (code: number | null, signal: string | null) => {
      finish({
        status: code === 0 && !timedOut ? "passed" : "failed",
        exitCode: code === null ? (timedOut ? 1 : 1) : code,
        signal: signal || (timedOut ? "SIGTERM" : "none"),
        error: timedOut ? "process timed out" : "none",
      });
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killValidationProcessTree(child.pid).then(() => {
          finish({
            status: "failed",
            exitCode: 1,
            signal: "SIGTERM",
            error: "process timed out",
          });
        });
      }, timeoutMs);
      if (timer.unref) {
        timer.unref();
      }
    }
  });
}

export function parseValidationCommands(
  state: PipelineStateLike | null | undefined,
  explicit: unknown,
): string[] {
  if (explicit) {
    return (Array.isArray(explicit) ? explicit : [explicit]).filter(isTruthyString);
  }
  const validation = state && state.validation && typeof state.validation === "object" ? state.validation : {};
  const commands = Array.isArray(validation.commands) ? validation.commands : [];
  return validationConfigCommands(commands)
    .filter((item) => {
      const normalized = String(item).trim();
      if (/^由 Agent 自动识别/.test(normalized)) {
        return false;
      }
      if (/^由 Agent 从/.test(normalized)) {
        return false;
      }
      if (/^一个原型运行命令/.test(normalized)) {
        return false;
      }
      return ![
        "由 Agent 补充",
        "缺失",
        "not_run",
        "未指定",
        "一个原型运行命令",
      ].some((placeholder) => normalized.toLowerCase() === placeholder.toLowerCase());
    });
}

export async function runValidationCommands(
  commands: string[],
  projectRoot: string,
  iterationDir: string,
  language: unknown,
  options: PipelineValidationOptions = {},
): Promise<ValidationResult> {
  const logFileName = options.logFileName || "validation.log";
  if (commands.length === 0) {
    const summary = getLanguageText(language).validationNotConfigured;
    await fs.promises.writeFile(
      path.join(iterationDir, logFileName),
      [
        "status: not_run",
        "command: none",
        `reason: ${summary}`,
        "",
      ].join("\n"),
      "utf8",
    );
    return {
      status: "not_run",
      command: null,
      exitCode: null,
      summary,
    };
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 10 * 60 * 1000;
  const results: ValidationCommandWithOutput[] = [];
  for (const command of commands) {
    const result = await runValidationCommand(command, projectRoot, timeoutMs);
    results.push(result);
    if (result.status !== "passed") {
      break;
    }
  }
  const log = results.map((item) => [
    `command: ${item.command}`,
    `exit_code: ${item.exitCode}`,
    `signal: ${item.signal}`,
    `error: ${item.error}`,
    `duration_ms: ${item.durationMs}`,
    "stdout:",
    item.stdout,
    "stderr:",
    item.stderr,
  ].join("\n")).join("\n\n---\n\n");
  await fs.promises.writeFile(path.join(iterationDir, logFileName), log, "utf8");
  const failed = results.find((item) => item.status === "failed");
  const last = failed || results[results.length - 1];
  const outputSummary = tail(`${last.stdout || ""}\n${last.stderr || ""}`.trim());
  const fallbackSummary = [
    last.error && last.error !== "none" ? `error=${last.error}` : "",
    last.signal && last.signal !== "none" ? `signal=${last.signal}` : "",
    last.exitCode !== undefined && last.exitCode !== null ? `exit_code=${last.exitCode}` : "",
  ].filter(Boolean).join(" ");
  return {
    status: failed ? "failed" : "passed",
    command: commands.join(" && "),
    exitCode: last.exitCode,
    durationMs: results.reduce((total, item) => total + (item.durationMs || 0), 0),
    summary: outputSummary || fallbackSummary || (failed ? "validation command failed without output" : ""),
    results: results.map(({ stdout, stderr, ...item }) => ({
      ...item,
      stdoutTail: tail(stdout),
      stderrTail: tail(stderr),
    })),
  };
}

export async function skipValidation(
  iterationDir: string,
  reason: string,
  options: PipelineValidationOptions = {},
): Promise<ValidationResult> {
  const logFileName = options.logFileName || "validation.log";
  await fs.promises.writeFile(
    path.join(iterationDir, logFileName),
    `validation skipped: ${reason}\n`,
    "utf8",
  );
  return {
    status: "skipped",
    command: null,
    exitCode: null,
    summary: reason,
  };
}
