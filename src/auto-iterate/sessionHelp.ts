import { listFlagHelpByKind } from "../pipeline/flags";
import { writeLine } from "../cliOutput";

export const LEGACY_DISPATCH_AGENTS = [
  "codex",
  "claude",
  "gemini",
  "kimi",
  "cursor",
  "windsurf",
  "copilot",
  "jules",
  "devin",
  "openhands",
  "replit",
];

function renderFlagLines(kind: Parameters<typeof listFlagHelpByKind>[0]): string {
  return listFlagHelpByKind(kind)
    .map((line) => `  ${line}`)
    .join("\n");
}

export function buildAutoIterateHelp(): string {
  const supportedAgents = LEGACY_DISPATCH_AGENTS.join("|");
  const modeFlags = renderFlagLines("mode").replace(/\n/g, " |").replace(/ \|  /g, " | ");
  const sessionFlags = renderFlagLines("session");
  const pipelineFlags = renderFlagLines("pipeline");
  const skillFlags = renderFlagLines("skill");
  const inputFlags = renderFlagLines("input");
  const legacyFlags = renderFlagLines("legacy");
  const compatFlags = renderFlagLines("compat");
  const otherFlags = renderFlagLines("other");
  return `Usage: fastcar-cli auto-iterate [options]

Native sub-agent flow (default):
  Main Agent reads the auto-iterate skill/state, dispatches Agent(subagent_type="coder"),
  validates the result with deterministic Node runner facts, then merges state.
  CLI can optionally create a resumable session skeleton for this flow.

Protocol-only LLM flow:
  fastcar-cli auto-iterate --quick --goal "<goal>" --session <session> --yes --no-run
  The current LLM follows auto-iterate techniques without dispatching native subagents.

Modes:
${modeFlags}

Session:
${sessionFlags}

Legacy dispatch (deprecated):
  --dispatch <session> --agent <${supportedAgents}> --task <text> --files <glob[,glob]> [--verify-command|--verify-cmd <cmd>] [--timeout <seconds>] [--dry-run]

Legacy CLI pipeline (deprecated):
  --run --once [--json-progress] (legacy compatibility only)
${pipelineFlags}

Skill Capture:
${skillFlags}

Other:
${inputFlags}
${legacyFlags}
${compatFlags}
${otherFlags}
`;
}

export function showAutoIterateHelp(): void {
  writeLine(buildAutoIterateHelp());
}
