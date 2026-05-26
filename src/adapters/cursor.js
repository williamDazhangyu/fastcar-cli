const fs = require("fs");
const { resolveCommand, runNativeCommand } = require("./commandResolver");

function resolveCursorCommand() {
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

function runCursorAdapter(options) {
  const cursor = resolveCursorCommand();
  const prompt = fs.readFileSync(options.promptPath, "utf8");
  const args = cursor.command === "cursor"
    ? ["agent", "--prompt", `@${options.promptPath}`]
    : ["--print", "--output-format", "text", "--trust", "--workspace", options.cwd, prompt];
  return runNativeCommand(cursor.command, args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });
}

module.exports = {
  resolveCursorCommand,
  runCursorAdapter,
};
