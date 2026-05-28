// @ts-check

const { runTemplateAdapterAsync } = require("./template");
const { runKimiAdapter } = require("./kimi");
const { runCodexAdapter } = require("./codex");
const { runClaudeAdapter } = require("./claude");
const { runGeminiAdapter } = require("./gemini");
const { runCursorAdapter } = require("./cursor");

/**
 * @param {(options: any) => Promise<import("../pipeline/types").PipelineWorkerBaseResult> | import("../pipeline/types").PipelineWorkerBaseResult} runNative
 * @returns {(options: import("../pipeline/types").PipelineWorkerAdapterOptions) => Promise<import("../pipeline/types").PipelineWorkerBaseResult> | import("../pipeline/types").PipelineWorkerBaseResult}
 */
function asAdapterRun(runNative) {
  return runNative;
}

/** @type {Record<string, import("../pipeline/types").AdapterConfig>} */
const ADAPTERS = {
  kimi: {
    label: "Kimi Code",
    env: "AUTO_ITERATE_KIMI_CMD",
    fallbackCommand: "kimi",
    runNative: asAdapterRun(runKimiAdapter),
  },
  codex: {
    label: "Codex",
    env: "AUTO_ITERATE_CODEX_CMD",
    fallbackCommand: "codex",
    runNative: asAdapterRun(runCodexAdapter),
  },
  claude: {
    label: "Claude Code",
    env: "AUTO_ITERATE_CLAUDE_CMD",
    fallbackCommand: "claude",
    runNative: asAdapterRun(runClaudeAdapter),
  },
  gemini: {
    label: "Gemini CLI",
    env: "AUTO_ITERATE_GEMINI_CMD",
    fallbackCommand: "gemini",
    runNative: asAdapterRun(runGeminiAdapter),
  },
  cursor: {
    label: "Cursor",
    env: "AUTO_ITERATE_CURSOR_CMD",
    fallbackCommand: "cursor",
    runNative: asAdapterRun(runCursorAdapter),
  },
};

/**
 * @param {string} agent
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {import("../pipeline/types").PipelineWorkerAdapter & import("../pipeline/types").AdapterConfig & { id: string; commandTemplate?: string }}
 */
function getAdapter(agent, env = process.env) {
  const key = ADAPTERS[agent] ? agent : "codex";
  const config = ADAPTERS[key];
  const commandTemplate = env[config.env];
  return {
    id: key,
    ...config,
    commandTemplate,
    async run(options) {
      if (commandTemplate) {
        return runTemplateAdapterAsync({
          ...options,
          commandTemplate,
        });
      }
      if (config.runNative) {
        return await config.runNative(options);
      }
      return {
        command: null,
        status: 1,
        signal: null,
        error: `未设置 ${config.env}`,
        stdout: "",
        stderr: "",
        timedOut: false,
      };
    },
  };
}

module.exports = {
  ADAPTERS,
  getAdapter,
};
