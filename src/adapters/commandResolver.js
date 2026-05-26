const crossSpawn = require("cross-spawn");
const treeKill = require("tree-kill");
const which = require("which");

function resolveCommand(command) {
  try {
    return which.sync(command);
  } catch {
    return command;
  }
}

function runNativeCommand(command, args, options) {
  const resolved = resolveCommand(command);
  const timeoutMs = options.timeoutMs || options.timeout || 0;
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
    timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
  };
}

function runShellCommand(command, options) {
  const timeoutMs = options.timeoutMs || options.timeout || 0;
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
    timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
  };
}

function runShellCommandAsync(command, options) {
  const timeoutMs = options.timeoutMs || options.timeout || 0;
  const killOnTimeout = options.killOnTimeout !== false;
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let child;

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve({
        command,
        status: result.status,
        signal: result.signal || null,
        error: result.error || null,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    }

    const timer = timeoutMs
      ? setTimeout(() => {
        timedOut = true;
        finish({ status: 1, signal: "SIGTERM", error: "process timed out" });
        if (killOnTimeout && child && child.pid) {
          killProcessTree(child.pid);
        }
      }, timeoutMs)
      : null;
    if (timer) {
      timer.unref();
    }

    try {
      child = crossSpawn(command, {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        shell: true,
        windowsHide: true,
      });
    } catch (error) {
      finish({ status: 1, error: error.message });
      return;
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      finish({ status: 1, error: error.message });
    });
    child.on("close", (code, signal) => {
      finish({
        status: timedOut ? 1 : (code === null ? 1 : code),
        signal,
        error: timedOut ? "process timed out" : null,
      });
    });
    if (options.input) {
      child.stdin.end(options.input, "utf8");
    } else {
      child.stdin.end();
    }
  });
}


function killProcessTree(pid) {
  if (!pid) {
    return;
  }
  treeKill(pid, "SIGTERM", () => {
    // Process may already have exited after timeout resolution.
  });
}

function runNativeCommandAsync(command, args, options) {
  const resolved = resolveCommand(command);
  const timeoutMs = options.timeoutMs || options.timeout || 0;
  const detached = Boolean(options.detached);
  const killOnTimeout = options.killOnTimeout !== false;
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let child;

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve({
        command: `${resolved} ${args.join(" ")}`,
        status: result.status,
        signal: result.signal || null,
        error: result.error || null,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    }

    const timer = timeoutMs
      ? setTimeout(() => {
        timedOut = true;
        finish({ status: 1, signal: "SIGTERM", error: "process timed out" });
        if (killOnTimeout && child && child.pid) {
          killProcessTree(child.pid);
        }
      }, timeoutMs)
      : null;
    if (timer) {
      timer.unref();
    }

    try {
      child = crossSpawn(resolved, args, {
        cwd: options.cwd,
        detached,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      finish({ status: 1, error: error.message });
      return;
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      finish({ status: 1, error: error.message });
    });
    child.on("close", (code, signal) => {
      finish({
        status: timedOut ? 1 : (code === null ? 1 : code),
        signal,
        error: timedOut ? "process timed out" : null,
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
