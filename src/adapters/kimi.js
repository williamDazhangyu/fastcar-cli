// @ts-check

const path = require("path");
const fs = require("fs");
const { runNativeCommandAsync } = require("./commandResolver");
const { buildRunOptions } = require("./runOptions");

/**
 * @param {string} prompt
 * @param {string} name
 * @returns {string}
 */
function extractPromptField(prompt, name) {
  const pattern = new RegExp(`^${name}:\\s*(.+)$`, "m");
  const match = String(prompt || "").match(pattern);
  return match ? match[1].trim() : "";
}

/**
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions & { promptPath: string; resultPath: string }} options
 * @returns {string}
 */
function buildKimiPrompt(options) {
  const source = fs.readFileSync(options.promptPath, "utf8");
  const focus = extractPromptField(source, "Focus") || "implement_req";
  const focusSummary = extractPromptField(source, "Focus summary") || "complete this focus";
  const mode = extractPromptField(source, "Mode") || "quick";
  const reqId = focus.includes(":") ? focus.split(":").slice(1).join(":") : "REQ-BOOTSTRAP";
  return [
    "You are a restricted single-step auto-iterate Worker.",
    "Do not inspect the repository. Do not read AGENTS.md. Do not run validation.",
    "Write exactly one JSON file to the result path, then stop immediately.",
    "",
    `Mode: ${mode}`,
    `Focus: ${focus}`,
    `Focus summary: ${focusSummary}`,
    `Result path: ${options.resultPath}`,
    "",
    "Use this JSON shape:",
    JSON.stringify({
      status: "completed",
      summary: `Completed focus ${focus}: ${focusSummary}`,
      files_changed: [],
      requirements: [{
        id: reqId || "REQ-BOOTSTRAP",
        summary: focusSummary,
        type: "验证",
        status: "implemented",
        relatedFiles: [],
        evidence: "Kimi restricted Worker produced a structured iteration result; CLI validation is authoritative.",
        blockedReason: "无",
        nextStep: "由 CLI 选择下一轮 focus",
      }],
      state_patch: {
        currentState: {
          currentTask: focus,
        },
      },
      risks: "受限 Kimi Worker 未做仓库探索；需求 passed 必须以后续 CLI 验证和后续 focus 为准。",
      blocked_reason: "",
    }, null, 2),
  ].join("\n");
}

/**
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions & { promptPath: string; resultPath: string; cwd: string }} options
 * @returns {Promise<import("../pipeline/types").PipelineWorkerBaseResult>}
 */
function runKimiAdapter(options) {
  const agentFile = options.agentFile || path.join(__dirname, "kimi-worker-agent.yaml");
  const kimiPromptPath = path.join(path.dirname(options.promptPath), "kimi-prompt.md");
  fs.writeFileSync(kimiPromptPath, buildKimiPrompt(options), "utf8");
  const args = [
    "--quiet",
    "--afk",
    "--no-thinking",
    "--max-steps-per-turn",
    String(options.maxStepsPerTurn || 8),
    "--max-ralph-iterations",
    "0",
    "--agent-file",
    agentFile,
    "--work-dir",
    options.cwd,
    "-p",
    `@${kimiPromptPath}`,
  ];
  return runNativeCommandAsync("kimi", args, buildRunOptions(options, {
    env: {
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
    },
  }));
}

module.exports = {
  buildKimiPrompt,
  runKimiAdapter,
};
