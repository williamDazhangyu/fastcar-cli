const { runNativeCommand } = require("./commandResolver");

function runClaudeAdapter(options) {
  const args = ["-p", `@${options.promptPath}`];
  return runNativeCommand("claude", args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });
}

module.exports = {
  runClaudeAdapter,
};
