// @ts-check

const fs = require("fs");
const path = require("path");
const crossSpawn = require("cross-spawn");
const treeKill = require("tree-kill");
const which = require("which");

const DEFAULT_TIMEOUT_WARN_BEFORE_MS = 30000;
const DEFAULT_GRACE_KILL_MS = 5000;

/**
 * @param {{ timeoutMs?: unknown; timeout?: unknown }} [options]
 * @returns {number}
 */
function resolveTimeoutMs(options = {}) {
  if (typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs)) {
    return Math.max(0, options.timeoutMs);
  }
  if (typeof options.timeout === "number" && Number.isFinite(options.timeout)) {
    return Math.max(0, options.timeout);
  }
  return 0;
}

/**
 * @param {string} command
 * @returns {string}
 */
function resolveCommand(command) {
  try {
    return which.sync(command);
  } catch {
    return command;
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions} options
 * @returns {import("../pipeline/types").PipelineWorkerBaseResult}
 */
function runNativeCommand(command, args, options) {
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
  return {
    command: `${resolved} ${args.join(" ")}`,
    status: result.status,
    signal: result.signal,
    error: result.error ? result.error.message : null,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    timedOut: Boolean(result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === "ETIMEDOUT"),
  };
}

/**
 * @param {string} command
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions} options
 * @returns {import("../pipeline/types").PipelineWorkerBaseResult}
 */
function runShellCommand(command, options) {
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
  return {
    command,
    status: result.status,
    signal: result.signal,
    error: result.error ? result.error.message : null,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    timedOut: Boolean(result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === "ETIMEDOUT"),
  };
}

/**
 * @param {string} command
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions} options
 * @returns {Promise<import("../pipeline/types").PipelineWorkerBaseResult>}
 */
function runShellCommandAsync(command, options) {
  return runCommandAsync(command, [], {
    ...options,
    shell: true,
    commandLabel: command,
  });
}


/**
 * @param {number | undefined | null} pid
 * @param {NodeJS.Signals} [signal]
 * @returns {Promise<void>}
 */
function killProcessTree(pid, signal = "SIGTERM") {
  if (!pid) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    treeKill(pid, signal, () => {
      resolve();
    });
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions} options
 * @returns {Promise<import("../pipeline/types").PipelineWorkerBaseResult>}
 */
function runNativeCommandAsync(command, args, options) {
  const resolved = resolveCommand(command);
  return runCommandAsync(resolved, args, {
    ...options,
    shell: false,
    commandLabel: `${resolved} ${args.join(" ")}`,
  });
}

/**
 * @param {string | undefined} filePath
 * @param {unknown} payload
 * @returns {void}
 */
function writeTimeoutWarning(filePath, payload) {
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

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions} options
 * @returns {Promise<import("../pipeline/types").PipelineWorkerBaseResult>}
 */
function runCommandAsync(command, args, options) {
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
    /** @type {string | null} */
    let timeoutReason = null;
    let settled = false;
    let terminating = false;
    let stoppedAfterResult = false;
    /** @type {import("child_process").ChildProcess | null} */
    let child = null;
    let lastActivityAt = Date.now();
    let warningEmitted = false;

    /**
     * @param {{ status: number; signal?: string | null; error?: string | null }} result
     */
    function finish(result) {
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

    /**
     * @returns {void}
     */
    function stopIfResultReady() {
      if (settled || terminating || !child || !child.pid || typeof options.stopWhenResultValid !== "function") {
        return;
      }
      let ready = false;
      try {
        ready = options.stopWhenResultValid(options.resultPath);
      } catch (error) {
        ready = false;
      }
      if (!ready) {
        return;
      }
      terminating = true;
      stoppedAfterResult = true;
      killProcessTree(child.pid, "SIGTERM");
      finish({ status: 0, signal: "SIGTERM", error: null });
    }

    /**
     * @param {string} reason
     * @returns {Promise<void>}
     */
    async function timeoutAndKill(reason) {
      if (settled || terminating) {
        return;
      }
      terminating = true;
      timedOut = true;
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
        killProcessTree(child.pid, "SIGTERM");
        await new Promise((resolveGrace) => setTimeout(resolveGrace, graceKillMs));
        if (!settled && child && child.pid) {
          await Promise.race([
            killProcessTree(child.pid, "SIGKILL"),
            new Promise((resolveKill) => setTimeout(resolveKill, 1000)),
          ]);
        }
      }
      finish({ status: 1, signal: "SIGTERM", error: reason });
    }

    /**
     * @param {string} reason
     * @param {number | null} remainingMs
     * @param {number} idleMs
     * @returns {void}
     */
    function emitTimeoutWarning(reason, remainingMs, idleMs) {
      if (warningEmitted) {
        return;
      }
      warningEmitted = true;
      const payload = {
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
        const idleMs = Date.now() - lastActivityAt;
        const inactivityWarnWindowMs = Math.min(warnBeforeMs, Math.floor(inactivityTimeoutMs / 2));
        if (inactivityWarnWindowMs > 0 && idleMs >= inactivityTimeoutMs - inactivityWarnWindowMs) {
          emitTimeoutWarning("inactivity timeout imminent", null, idleMs);
        }
        if (idleMs >= inactivityTimeoutMs) {
          timeoutAndKill("process inactive timed out");
        }
      }, Math.min(5000, Math.max(100, Math.floor(inactivityTimeoutMs / 4))))
      : null;
    if (inactivityTimer && inactivityTimer.unref) {
      inactivityTimer.unref();
    }

    const timer = timeoutMs
      ? setInterval(() => {
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = timeoutMs - elapsedMs;
        const wallWarnWindowMs = Math.min(warnBeforeMs, Math.floor(timeoutMs / 2));
        if (wallWarnWindowMs > 0 && remainingMs <= wallWarnWindowMs) {
          emitTimeoutWarning("wall timeout imminent", Math.max(0, remainingMs), Date.now() - lastActivityAt);
        }
        if (elapsedMs >= timeoutMs) {
          timeoutAndKill("process timed out");
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
      const spawnOptions = {
        cwd: options.cwd,
        detached,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        shell: options.shell === true,
        windowsHide: true,
      };
      child = crossSpawn(command, args, spawnOptions);
      stopIfResultReady();
    } catch (error) {
      finish({ status: 1, error: error instanceof Error ? error.message : String(error) });
      return;
    }

    if (!child.stdout || !child.stderr || !child.stdin) {
      finish({ status: 1, error: "failed to open child stdio" });
      return;
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      lastActivityAt = Date.now();
      if (typeof options.onOutput === "function") {
        options.onOutput({ stream: "stdout", chunk: text });
      }
      stopIfResultReady();
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      lastActivityAt = Date.now();
      if (typeof options.onOutput === "function") {
        options.onOutput({ stream: "stderr", chunk: text });
      }
      stopIfResultReady();
    });
    child.on("error", (error) => {
      finish({ status: 1, error: error.message });
    });
    child.on("close", (code, signal) => {
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

module.exports = {
  resolveCommand,
  runNativeCommand,
  runNativeCommandAsync,
  runShellCommand,
  runShellCommandAsync,
};
