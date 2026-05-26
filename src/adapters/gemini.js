const { runNativeCommand } = require("./commandResolver");

function runGeminiAdapter(options) {
  const args = ["-p", `@${options.promptPath}`];
  return runNativeCommand("gemini", args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });
}

module.exports = {
  runGeminiAdapter,
};
