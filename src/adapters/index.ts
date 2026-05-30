import type {
  AdapterConfig,
  PipelineWorkerAdapter,
  PipelineWorkerAdapterOptions,
  PipelineWorkerBaseResult,
} from "../pipeline/types";
import { runTemplateAdapterAsync } from "./template";
import { runKimiAdapter } from "./kimi";
import { runCodexAdapter } from "./codex";
import { runClaudeAdapter } from "./claude";
import { runGeminiAdapter } from "./gemini";
import { runCursorAdapter } from "./cursor";

type RequiredWorkerPathOptions = PipelineWorkerAdapterOptions & {
  cwd: string;
  promptPath: string;
  resultPath: string;
};

type StrictAdapterRun = (
  options: RequiredWorkerPathOptions,
) => Promise<PipelineWorkerBaseResult> | PipelineWorkerBaseResult;

export type ResolvedAdapter = PipelineWorkerAdapter & AdapterConfig & {
  id: string;
  commandTemplate?: string;
};

function asAdapterRun(runNative: StrictAdapterRun): AdapterConfig["runNative"] {
  return (options: PipelineWorkerAdapterOptions) => runNative(requireWorkerPaths(options));
}

function requireWorkerPaths(options: PipelineWorkerAdapterOptions): PipelineWorkerAdapterOptions & {
  cwd: string;
  promptPath: string;
  resultPath: string;
} {
  return options as RequiredWorkerPathOptions;
}

export const ADAPTERS: Record<string, AdapterConfig> = {
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

export function getAdapter(agent: string, env: NodeJS.ProcessEnv = process.env): ResolvedAdapter {
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
