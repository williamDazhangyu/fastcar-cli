const { runShellCommand, runShellCommandAsync } = require("./commandResolver");

function fillTemplate(template, values) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    return values[key] === undefined || values[key] === null ? "" : String(values[key]);
  });
}

function runTemplateAdapter(options) {
  const command = fillTemplate(options.commandTemplate, {
    prompt: options.promptPath,
    result: options.resultPath,
    session: options.session,
    iteration: options.iteration,
  });
  return runShellCommand(command, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });
}

function runTemplateAdapterAsync(options) {
  const command = fillTemplate(options.commandTemplate, {
    prompt: options.promptPath,
    result: options.resultPath,
    session: options.session,
    iteration: options.iteration,
  });
  return runShellCommandAsync(command, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });
}

module.exports = {
  fillTemplate,
  runTemplateAdapter,
  runTemplateAdapterAsync,
};
