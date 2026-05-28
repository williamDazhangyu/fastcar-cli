// @ts-check

const fs = require("fs");
const path = require("path");
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
 * @param {string} prompt
 * @returns {string}
 */
function extractResultPath(prompt) {
  return extractPromptField(prompt, "Result path");
}

/**
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions & { promptPath: string; resultPath: string }} options
 * @returns {string}
 */
function buildCodexWorkerPrompt(options) {
  const source = fs.readFileSync(options.promptPath, "utf8");
  const focus = extractPromptField(source, "Focus") || "implement_req";
  const focusSummary = extractPromptField(source, "Focus summary") || "complete this focus";
  const mode = extractPromptField(source, "Mode") || "quick";
  const resultPath = extractResultPath(source) || options.resultPath;
  const reqId = focus.includes(":") ? focus.split(":").slice(1).join(":") : "REQ-BOOTSTRAP";
  return [
    "You are a restricted single-step auto-iterate Worker, not the Router.",
    "Do not read AGENTS.md, skills, project docs, or repository files unless the focus explicitly names a non-state file.",
    "Do not run commands. Do not validate. Do not continue the auto-iterate protocol.",
    "Write exactly one JSON file to the result path, then stop immediately.",
    "You may write only that result file under .agent-state; do not read or modify any other .agent-state file.",
    "",
    `Mode: ${mode}`,
    `Focus: ${focus}`,
    `Focus summary: ${focusSummary}`,
    `Result path: ${resultPath}`,
    "",
    "Write this JSON object, adjusting only human-readable summary/evidence text if needed:",
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
        evidence: "Codex restricted Worker produced a structured iteration result; CLI validation remains authoritative.",
        blockedReason: "无",
        nextStep: "由 CLI 选择下一轮 focus",
      }],
      state_patch: {
        currentState: {
          currentTask: focus,
        },
      },
      trace: {
        rationaleSummary: "Restricted Codex Worker completed the requested single focus without taking Router ownership.",
        decisions: [{
          topic: "Worker boundary",
          reason: "The CLI owns state merge, validation, budgets, and stop decisions.",
          impact: "Only result.json is written by this Worker.",
        }],
        evidence: [{
          source: resultPath,
          detail: "Structured Worker result written for CLI merge.",
        }],
      },
      documentation: {
        apiChanges: [],
        architectureNotes: ["CLI/Worker boundary preserved."],
        implementationNotes: ["Codex ran as a restricted one-shot Worker."],
        changelogEntries: [],
      },
      risks: "受限 Codex Worker 不直接验证；需求 passed 必须由 CLI 验证和后续 focus 决定。",
      blocked_reason: "",
    }, null, 2),
  ].join("\n");
}

/**
 * @param {string} text
 * @returns {string | null}
 */
function extractJsonObject(text) {
  const value = String(text || "").trim().replace(/^\uFEFF/, "");
  if (!value) {
    return null;
  }
  try {
    JSON.parse(value);
    return value;
  } catch {
    // Try fenced JSON or prose-wrapped JSON produced by the agent.
  }
  const fence = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const fenced = fence[1].trim();
    try {
      JSON.parse(fenced);
      return fenced;
    } catch {
      // Fall through to brace scan.
    }
  }
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = value.slice(start, end + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {import("../pipeline/types").PipelineWorkerBaseResult} result
 * @param {string} outputPath
 * @param {string} resultPath
 * @returns {import("../pipeline/types").PipelineWorkerBaseResult}
 */
function ensureResultFromCodexOutput(result, outputPath, resultPath) {
  if (fs.existsSync(resultPath)) {
    return result;
  }
  let output = result.stdout || "";
  try {
    output = `${output}\n${fs.readFileSync(outputPath, "utf8")}`;
  } catch {
    // output-last-message is best-effort.
  }
  const json = extractJsonObject(output);
  if (!json) {
    return result;
  }
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${json.trim()}\n`, "utf8");
  return {
    ...result,
    stdout: `${result.stdout || ""}\n[fastcar-cli] wrote result.json from Codex final output\n`,
  };
}

/**
 * @returns {string | null}
 */
function getCodexTargetTriple() {
  if (process.platform !== "win32") {
    return null;
  }
  if (process.arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (process.arch === "arm64") {
    return "aarch64-pc-windows-msvc";
  }
  return null;
}

/**
 * @returns {string | null}
 */
function resolveWindowsNativeCodex() {
  const targetTriple = getCodexTargetTriple();
  if (!targetTriple) {
    return null;
  }
  const roots = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((item) => path.join(item, "node_modules", "@openai", "codex"))
    .filter((item, index, list) => list.indexOf(item) === index);
  for (const root of roots) {
    const candidates = [
      path.join(root, "node_modules", `@openai/codex-win32-${process.arch === "arm64" ? "arm64" : "x64"}`, "vendor", targetTriple, "bin", "codex.exe"),
      path.join(root, "vendor", targetTriple, "bin", "codex.exe"),
      path.join(root, "vendor", targetTriple, "codex", "codex.exe"),
    ];
    const found = candidates.find((item) => fs.existsSync(item));
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * @param {import("../pipeline/types").PipelineWorkerAdapterOptions & { promptPath: string; resultPath: string; cwd: string }} options
 * @returns {Promise<import("../pipeline/types").PipelineWorkerBaseResult>}
 */
function runCodexAdapter(options) {
  const prompt = buildCodexWorkerPrompt(options);
  const codexPromptPath = path.join(path.dirname(options.promptPath), "codex-prompt.md");
  const outputPath = path.join(path.dirname(options.promptPath), "codex-last-message.txt");
  fs.writeFileSync(codexPromptPath, prompt, "utf8");
  const args = [
    "exec",
    "--cd",
    options.cwd,
    "--sandbox",
    "danger-full-access",
    "--skip-git-repo-check",
    "--output-last-message",
    outputPath,
    "-",
  ];
  return runNativeCommandAsync(resolveWindowsNativeCodex() || "codex", args, buildRunOptions(options, {
    input: prompt,
  })).then((result) => ensureResultFromCodexOutput(result, outputPath, options.resultPath));
}

module.exports = {
  buildCodexWorkerPrompt,
  extractJsonObject,
  resolveWindowsNativeCodex,
  runCodexAdapter,
};
