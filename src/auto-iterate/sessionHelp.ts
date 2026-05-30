import { DISPATCH_AGENT_CONFIGS } from "./dispatch";

export function buildAutoIterateHelp(): string {
  const supportedAgents = Object.keys(DISPATCH_AGENT_CONFIGS).join("|");
  return `Usage: fastcar-cli auto-iterate [options]

Default Router flow:
  fastcar-cli auto-iterate --check --json-progress
  fastcar-cli auto-iterate --run --autopilot --quick --goal "<goal>" --session <session> --json-progress

Manual/fallback flow:
  fastcar-cli auto-iterate --quick --goal "<goal>" --session <session> --yes --no-run

Modes:
  --strict | --quick | --diagnose | --verify | --plan-only | --optimize | --prototype

Session:
  --session <name>
  --list
  --switch <name>
  --resume <name>
  --validate-state [session|state.md|state.json]
  --strict-state
  --finalize [session]

Dispatch:
  --dispatch <session> --agent <${supportedAgents}> --task <text> --files <glob[,glob]> [--verify-command <cmd>] [--timeout <seconds>] [--dry-run]

Pipeline:
  --run --once [--json-progress]
  --autopilot
  --check
  --step-timeout <seconds>
  --inactivity-timeout <seconds>
  --validation-timeout <seconds>
  --progress-interval <seconds>
  --max-steps <n>
  --validate-cmd <cmd>
  --focus <type:id>
  --scope <glob[,glob]>
  --answer <id>
  --isolate
  --allow-modify
  --no-validate
  --no-run  force manual/fallback generation; do not enter Worker pipeline

Skill Capture:
  --capture-skills <session> [--yes]

Other:
  --goal <text>
  --from <file>
  --max-iterations <n>
  --autopilot-max-iterations <n>
  --yes  non-interactive generation for manual/fallback; --run routing does not need it
  --examples [keyword]
`;
}

export function showAutoIterateHelp(): void {
  console.log(buildAutoIterateHelp());
}
