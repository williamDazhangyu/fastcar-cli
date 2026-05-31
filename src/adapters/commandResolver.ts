import fs from "fs";
import path from "path";
import crossSpawn from "cross-spawn";
import treeKill from "tree-kill";
import which from "which";
import type {
  PipelineWorkerAdapterOptions,
  PipelineWorkerBaseResult,
  ProgressPayload,
} from "../pipeline/types";

const DEFAULT_TIMEOUT_WARN_BEFORE_MS = 30000;
const DEFAULT_GRACE_KILL_MS = 5000;

type FinishInput = {
  status: number;
  signal?: string | null;
  error?: string | null;
};

function resolveTimeoutMs(options: { timeoutMs?: unknown; timeout?: unknown } = {}): number {
  if (typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs)) {
    return Math.max(0, options.timeoutMs);
  }
  if (typeof options.timeout === "number" && Number.isFinite(options.timeout)) {
    return Math.max(0, options.timeout);
  }
  return 0;
}

export function resolveCommand(command: string): string {
  try {
    return which.sync(command);
  } catch {
    return command;
  }
}

export function runNativeCommand(
  command: string,
  args: string[],
  options: PipelineWorkerAdapterOptions,
): PipelineWorkerBaseResult {
  const resolved = resolveCommand(command);
  const timeoutMs = resolveTimeoutMs(options);
  const result = crossSpawn.sync(resolved, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    input: options.input,
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
  });
  const error = result.error as NodeJS.ErrnoException | undefined;
  return {
    command: `${resolved} ${args.join(" ")}`,
    status: result.status,
    signal: result.signal,
    error: error ? error.message : null,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    timedOut: Boolean(error && error.code === "ETIMEDOUT"),
  };
}

export function runShellCommand(
  command: string,
  options: PipelineWorkerAdapterOptions,
): PipelineWorkerBaseResult {
  const timeoutMs = resolveTimeoutMs(options);
  const result = crossSpawn.sync(command, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    input: options.input,
    encoding: "utf8",
    shell: true,
    timeout: timeoutMs,
    windowsHide: true,
  });
  const error = result.error as NodeJS.ErrnoException | undefined;
  return {
    command,
    status: result.status,
    signal: result.signal,
    error: error ? error.message : null,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    timedOut: Boolean(error && error.code === "ETIMEDOUT"),
  };
}

export function runShellCommandAsync(
  command: string,
  options: PipelineWorkerAdapterOptions,
): Promise<PipelineWorkerBaseResult> {
  return runCommandAsync(command, [], {
    ...options,
    shell: true,
    commandLabel: command,
  });
}

function killProcessTree(pid: number | undefined | null, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  if (!pid) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    treeKill(pid, signal, () => {
      resolve();
    });
  });
}

export function runNativeCommandAsync(
  command: string,
  args: string[],
  options: PipelineWorkerAdapterOptions,
): Promise<PipelineWorkerBaseResult> {
  const resolved = resolveCommand(command);
  return runCommandAsync(resolved, args, {
    ...options,
    shell: false,
    commandLabel: `${resolved} ${args.join(" ")}`,
  });
}

function writeTimeoutWarning(filePath: string | undefined, payload: unknown): void {
  if (!filePath) {
    return;
  }
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch {
    // Timeout warnings are best-effort; failing to write them must not mask the timeout itself.
  }
}

function runCommandAsync(
  command: string,
  args: string[],
  options: PipelineWorkerAdapterOptions,
): Promise<PipelineWorkerBaseResult> {
  const timeoutMs = resolveTimeoutMs(options);
  const inactivityTimeoutMs = options.inactivityTimeoutMs || 0;
  const warnBeforeMs = typeof options.warnBeforeMs === "number" && Number.isFinite(options.warnBeforeMs)
    ? Math.max(0, options.warnBeforeMs)
    : DEFAULT_TIMEOUT_WARN_BEFORE_MS;
  const graceKillMs = typeof options.graceKillMs === "number" && Number.isFinite(options.graceKillMs)
    ? Math.max(0, options.graceKillMs)
    : DEFAULT_GRACE_KILL_MS;
  const detached = Boolean(options.detached);
  const killOnTimeout = options.killOnTimeout !== false;
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutRequested = false;
    let timeoutReason: string | null = null;
    let settled = false;
    let terminating = false;
    let stoppedAfterResult = false;
    let child: ReturnType<typeof crossSpawn> | null = null;
    let lastActivityAt = Date.now();
    let warningEmitted = false;

    function finish(result: FinishInput): void {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearInterval(timer);
      }
      if (inactivityTimer) {
        clearInterval(inactivityTimer);
      }
      if (resultReadyTimer) {
        clearInterval(resultReadyTimer);
      }
      resolve({
        command: options.commandLabel || command,
        status: result.status,
        signal: result.signal || null,
        error: stoppedAfterResult ? null : (timedOut ? timeoutReason || result.error || "process timed out" : result.error || null),
        stdout,
        stderr,
        timedOut: stoppedAfterResult ? false : timedOut,
        timeoutReason: stoppedAfterResult ? null : timeoutReason,
        durationMs: Date.now() - startedAt,
      });
    }

    function stopIfResultReady(): void {
      if (settled || terminating || !child || !child.pid || typeof options.stopWhenResultValid !== "function") {
        return;
      }
      let ready = false;
      try {
        ready = options.stopWhenResultValid(options.resultPath);
      } catch {
        ready = false;
      }
      if (!ready) {
        return;
      }
      terminating = true;
      stoppedAfterResult = true;
      if (timer) {
        clearInterval(timer);
      }
      if (inactivityTimer) {
        clearInterval(inactivityTimer);
      }
      if (resultReadyTimer) {
        clearInterval(resultReadyTimer);
      }
      void killProcessTree(child.pid, "SIGTERM");
      finish({ status: 0, signal: "SIGTERM", error: null });
    }

    async function timeoutAndKill(reason: string): Promise<void> {
      if (settled || terminating) {
        return;
      }
      terminating = true;
      timeoutRequested = true;
      timeoutReason = reason;
      if (killOnTimeout && child && child.pid) {
        writeTimeoutWarning(options.timeoutWarningPath, {
          event: "timeout_kill",
          command: options.commandLabel || command,
          reason,
          pid: child.pid,
          startedAt: new Date(startedAt).toISOString(),
          elapsedMs: Date.now() - startedAt,
          lastActivityMs: Date.now() - lastActivityAt,
        });
        void killProcessTree(child.pid, "SIGTERM");
        await new Promise((resolveGrace) => setTimeout(resolveGrace, graceKillMs));
        if (!settled && child && child.pid) {
          timedOut = true;
          await Promise.race([
            killProcessTree(child.pid, "SIGKILL"),
            new Promise((resolveKill) => setTimeout(resolveKill, 1000)),
          ]);
        }
      }
      timedOut = true;
      finish({ status: 1, signal: "SIGTERM", error: reason });
    }

    function emitTimeoutWarning(reason: string, remainingMs: number | null, idleMs: number): void {
      if (warningEmitted) {
        return;
      }
      warningEmitted = true;
      const payload: ProgressPayload = {
        stream: "timeout",
        chunk: `worker timeout warning: ${reason}`,
        event: "worker_timeout_warning",
        reason,
        remainingMs,
        idleMs,
      };
      writeTimeoutWarning(options.timeoutWarningPath, {
        event: "timeout_warning",
        command: options.commandLabel || command,
        reason,
        pid: child && child.pid ? child.pid : null,
        startedAt: new Date(startedAt).toISOString(),
        elapsedMs: Date.now() - startedAt,
        remainingMs,
        idleMs,
      });
      if (typeof options.onOutput === "function") {
        options.onOutput(payload);
      }
    }

    const inactivityTimer = inactivityTimeoutMs
      ? setInterval(() => {
        stopIfResultReady();
        if (settled || terminating) {
          return;
        }
        const idleMs = Date.now() - lastActivityAt;
        const inactivityWarnWindowMs = Math.min(warnBeforeMs, Math.floor(inactivityTimeoutMs / 2));
        if (inactivityWarnWindowMs > 0 && idleMs >= inactivityTimeoutMs - inactivityWarnWindowMs) {
          emitTimeoutWarning("inactivity timeout imminent", null, idleMs);
        }
        if (idleMs >= inactivityTimeoutMs) {
          void timeoutAndKill("process inactive timed out");
        }
      }, Math.min(5000, Math.max(100, Math.floor(inactivityTimeoutMs / 4))))
      : null;
    if (inactivityTimer && inactivityTimer.unref) {
      inactivityTimer.unref();
    }

    const timer = timeoutMs
      ? setInterval(() => {
        stopIfResultReady();
        if (settled || terminating) {
          return;
        }
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = timeoutMs - elapsedMs;
        const wallWarnWindowMs = Math.min(warnBeforeMs, Math.floor(timeoutMs / 2));
        if (wallWarnWindowMs > 0 && remainingMs <= wallWarnWindowMs) {
          emitTimeoutWarning("wall timeout imminent", Math.max(0, remainingMs), Date.now() - lastActivityAt);
        }
        if (elapsedMs >= timeoutMs) {
          void timeoutAndKill("process timed out");
        }
      }, Math.min(5000, Math.max(100, Math.floor(timeoutMs / 4))))
      : null;
    if (timer && timer.unref) {
      timer.unref();
    }

    const resultReadyTimer = typeof options.stopWhenResultValid === "function"
      ? setInterval(stopIfResultReady, 250)
      : null;
    if (resultReadyTimer && resultReadyTimer.unref) {
      resultReadyTimer.unref();
    }

    try {
      child = crossSpawn(command, args, {
        cwd: options.cwd,
        detached,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        shell: options.shell === true,
        windowsHide: true,
      });
      stopIfResultReady();
    } catch (error) {
      finish({ status: 1, error: error instanceof Error ? error.message : String(error) });
      return;
    }

    if (!child.stdout || !child.stderr || !child.stdin) {
      finish({ status: 1, error: "failed to open child stdio" });
      return;
    }

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      lastActivityAt = Date.now();
      if (typeof options.onOutput === "function") {
        options.onOutput({ stream: "stdout", chunk: text });
      }
      stopIfResultReady();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      lastActivityAt = Date.now();
      if (typeof options.onOutput === "function") {
        options.onOutput({ stream: "stderr", chunk: text });
      }
      stopIfResultReady();
    });
    child.on("error", (error: Error) => {
      if (timeoutRequested) {
        timedOut = true;
        finish({ status: 1, signal: "SIGTERM", error: timeoutReason || error.message || "process timed out" });
        return;
      }
      finish({ status: 1, error: error.message });
    });
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (options.allowGracefulTimeoutExit === true && timeoutRequested && !timedOut && code === 0) {
        finish({
          status: 0,
          signal,
          error: null,
        });
        return;
      }
      if (timeoutRequested && !timedOut) {
        timedOut = true;
      }
      finish({
        status: timedOut ? 1 : (code === null ? 1 : code),
        signal,
        error: timedOut ? timeoutReason || "process timed out" : null,
      });
    });
    if (options.input) {
      child.stdin.end(options.input, "utf8");
    } else {
      child.stdin.end();
    }
  });
}
