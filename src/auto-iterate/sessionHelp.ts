import { DISPATCH_AGENT_CONFIGS } from "./dispatch";
import { listFlagHelpByKind } from "../pipeline/flags";
import { writeLine } from "../cliOutput";

function renderFlagLines(kind: Parameters<typeof listFlagHelpByKind>[0]): string {
  return listFlagHelpByKind(kind)
    .map((line) => `  ${line}`)
    .join("\n");
}

export function buildAutoIterateHelp(): string {
  const supportedAgents = Object.keys(DISPATCH_AGENT_CONFIGS).join("|");
  const modeFlags = renderFlagLines("mode").replace(/\n/g, " |").replace(/ \|  /g, " | ");
  const sessionFlags = renderFlagLines("session");
  const pipelineFlags = renderFlagLines("pipeline");
  const skillFlags = renderFlagLines("skill");
  const inputFlags = renderFlagLines("input");
  const legacyFlags = renderFlagLines("legacy");
  const compatFlags = renderFlagLines("compat");
  const otherFlags = renderFlagLines("other");
  return `Usage: fastcar-cli auto-iterate [options]

Default Router flow:
  fastcar-cli auto-iterate --check --json-progress
  fastcar-cli auto-iterate --run --autopilot --quick --goal "<goal>" --session <session> --json-progress

Manual/fallback flow:
  fastcar-cli auto-iterate --quick --goal "<goal>" --session <session> --yes --no-run

Modes:
${modeFlags}

Session:
${sessionFlags}

Dispatch:
  --dispatch <session> --agent <${supportedAgents}> --task <text> --files <glob[,glob]> [--verify-command|--verify-cmd <cmd>] [--timeout <seconds>] [--dry-run]

Pipeline:
  --run --once [--json-progress]
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
