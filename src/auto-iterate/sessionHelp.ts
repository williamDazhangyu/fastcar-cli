import { listFlagHelpByKind } from "../pipeline/flags";
import { writeLine } from "../cliOutput";

function renderFlagLines(kind: Parameters<typeof listFlagHelpByKind>[0]): string {
  return listFlagHelpByKind(kind)
    .map((line) => `  ${line}`)
    .join("\n");
}

export function buildAutoIterateHelp(): string {
  const modeFlags = renderFlagLines("mode").replace(/\n/g, " |").replace(/ \|  /g, " | ");
  const sessionFlags = renderFlagLines("session");
  const skillFlags = renderFlagLines("skill");
  const inputFlags = renderFlagLines("input");
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

Skill Capture:
${skillFlags}

Other:
${inputFlags}
${otherFlags}
`;
}

export function showAutoIterateHelp(): void {
  writeLine(buildAutoIterateHelp());
}
