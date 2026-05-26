const { runTemplateAdapterAsync } = require("./template");
const { runKimiAdapter } = require("./kimi");
const { runCodexAdapter } = require("./codex");
const { runClaudeAdapter } = require("./claude");
const { runGeminiAdapter } = require("./gemini");
const { runCursorAdapter } = require("./cursor");

const ADAPTERS = {
  kimi: {
    label: "Kimi Code",
    env: "AUTO_ITERATE_KIMI_CMD",
    fallbackCommand: "kimi",
    runNative: runKimiAdapter,
  },
  codex: {
    label: "Codex",
    env: "AUTO_ITERATE_CODEX_CMD",
    fallbackCommand: "codex",
    runNative: runCodexAdapter,
  },
  claude: {
    label: "Claude Code",
    env: "AUTO_ITERATE_CLAUDE_CMD",
    fallbackCommand: "claude",
    runNative: runClaudeAdapter,
  },
  gemini: {
    label: "Gemini CLI",
    env: "AUTO_ITERATE_GEMINI_CMD",
    fallbackCommand: "gemini",
    runNative: runGeminiAdapter,
  },
  cursor: {
    label: "Cursor",
    env: "AUTO_ITERATE_CURSOR_CMD",
    fallbackCommand: "cursor",
    runNative: runCursorAdapter,
  },
};

function getAdapter(agent, env = process.env) {
  const key = ADAPTERS[agent] ? agent : "codex";
  const config = ADAPTERS[key];
  const commandTemplate = env[config.env];
  return {
    id: key,
    ...config,
    commandTemplate,
    run(options) {
      if (commandTemplate) {
        return runTemplateAdapterAsync({
          ...options,
          commandTemplate,
        });
      }
      if (config.runNative) {
        return config.runNative(options);
      }
      if (!commandTemplate) {
        return {
          command: null,
          status: 1,
          signal: null,
          error: `未设置 ${config.env}`,
          stdout: "",
          stderr: "",
          timedOut: false,
        };
      }
    },
  };
}

module.exports = {
  ADAPTERS,
  getAdapter,
};
